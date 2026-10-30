const fs = require("node:fs");
const path = require("node:path");
const liblouis = require("liblouis");
const nativeBrailleService = require("./braille-native-service");

const BRAILLE_TABLES = Object.freeze([
  {
    id: "fr-fr-g1",
    label: "Français (France) — braille intégral",
    table: "tables/unicode.dis,tables/fr-fr-g1.utb",
  },
  {
    id: "fr-ca-g1",
    label: "Français (Canada) — braille intégral",
    table: "tables/unicode.dis,tables/fr-ca-g1.utb",
  },
  {
    id: "fr-bfu-g2",
    label: "Français BFU — braille abrégé",
    table: "tables/unicode.dis,tables/fr-bfu-g2.ctb",
  },
  {
    id: "en-ueb-g1",
    label: "Anglais UEB — braille intégral",
    table: "tables/unicode.dis,tables/en-ueb-g1.ctb",
  },
]);

const SUPPORTED_DIRECTIONS = Object.freeze(["text-to-braille", "braille-to-text"]);
const DEFAULT_TABLE = BRAILLE_TABLES[0].table;
const TRANSLATION_EXECUTION_MODES = Object.freeze(["preview", "production"]);
const DEFAULT_TRANSLATION_EXECUTION_MODE = "preview";
const PAGE_NUMBER_POSITION_VALUES = new Set(["top", "bottom"]);
const DEFAULT_NATIVE_PAGE_LAYOUT = Object.freeze({
  printPages: true,
  braillePages: true,
  numberBraillePages: true,
  continuePages: true,
  pageSeparator: true,
  pageSeparatorNumber: true,
  printPageNumberAt: "top",
  braillePageNumberAt: "bottom",
  beginningPageNumber: 1,
  contents: false,
  printPageNumbersInContents: true,
  braillePageNumbersInContents: true,
});
const INTERNAL_STYLE_FLAGS = Object.freeze({
  italic: 0x01,
  underline: 0x02,
  bold: 0x04,
});
const STYLE_CLASS_NAMES = Object.freeze(["italic", "underline", "bold"]);
const EMPHASIS_EFFECTIVENESS_PROBE_TEXT = "test";
const BFU_EMPHASIS_REFERENCE = Object.freeze({
  sourceTable: "tables/fr-bfu-comp6.utb",
  emphasisClasses: ["italic", "underline", "bold"],
  wordOpeningIndicator: "456",
  wordClosingIndicator: "6-3",
  phraseOpeningIndicator: "25-456",
  phraseClosingIndicator: "before 456",
  phraseWordThreshold: 4,
  noEmphasisCharacters: ",\\s",
});
const BFU_STYLE_CLASS_BY_MARKUP_TAG = Object.freeze({
  b: "bold",
  strong: "bold",
  bold: "bold",
  gras: "bold",
  i: "italic",
  em: "italic",
  italic: "italic",
  italique: "italic",
  u: "underline",
  mark: "underline",
  underline: "underline",
  souligne: "underline",
  souligner: "underline",
  soulignement: "underline",
  surligne: "underline",
  surligner: "underline",
  surlignage: "underline",
  surlignement: "underline",
});

let isTableLoadingReady = false;
let tableLoadingFailure = null;
const bfuTypeformMaskByTable = new Map();

function resolveModulePath(specifier) {
  try {
    return require.resolve(specifier);
  } catch (_error) {
    return null;
  }
}

function addCandidatePath(candidates, candidatePath) {
  if (typeof candidatePath !== "string" || candidatePath.length === 0) {
    return;
  }

  if (!candidates.includes(candidatePath)) {
    candidates.push(candidatePath);
  }
}

function collectTableFolderCandidates() {
  const candidates = [];
  const moduleSpecifiers = [
    "liblouis-build/package.json",
    "liblouis-build",
    "liblouis/node_modules/liblouis-build/package.json",
  ];

  moduleSpecifiers.forEach((specifier) => {
    const modulePath = resolveModulePath(specifier);
    if (!modulePath) {
      return;
    }

    addCandidatePath(candidates, path.resolve(path.dirname(modulePath), "tables"));
  });

  const liblouisPackagePath = resolveModulePath("liblouis/package.json");
  if (liblouisPackagePath) {
    const liblouisFolder = path.dirname(liblouisPackagePath);
    addCandidatePath(candidates, path.join(liblouisFolder, "node_modules", "liblouis-build", "tables"));
    addCandidatePath(candidates, path.join(liblouisFolder, "..", "liblouis-build", "tables"));
  }

  const appNodeModulesFolder = path.resolve(__dirname, "..", "..", "node_modules");
  addCandidatePath(candidates, path.join(appNodeModulesFolder, "liblouis-build", "tables"));
  addCandidatePath(
    candidates,
    path.join(appNodeModulesFolder, "liblouis", "node_modules", "liblouis-build", "tables"),
  );

  if (process.resourcesPath) {
    const resourceCandidates = [
      path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "liblouis-build", "tables"),
      path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "node_modules",
        "liblouis",
        "node_modules",
        "liblouis-build",
        "tables",
      ),
      path.join(process.resourcesPath, "app.asar", "node_modules", "liblouis-build", "tables"),
      path.join(
        process.resourcesPath,
        "app.asar",
        "node_modules",
        "liblouis",
        "node_modules",
        "liblouis-build",
        "tables",
      ),
    ];
    resourceCandidates.forEach((candidatePath) => addCandidatePath(candidates, candidatePath));
  }

  const asarSegment = `${path.sep}.asar${path.sep}`;
  const unpackedCandidates = candidates
    .filter((candidate) => candidate.includes(asarSegment))
    .map((candidate) => candidate.replace(asarSegment, `${path.sep}.asar.unpacked${path.sep}`));
  unpackedCandidates.forEach((candidatePath) => addCandidatePath(candidates, candidatePath));

  return candidates;
}

function isValidTableFolder(folderPath) {
  if (folderPath.includes(".asar") && !folderPath.includes(".asar.unpacked")) {
    return false;
  }

  return fs.existsSync(path.join(folderPath, "unicode.dis"));
}

function resolveTableFolder() {
  const candidates = collectTableFolderCandidates();
  const availableTableFolder = candidates.find((candidate) => isValidTableFolder(candidate));
  if (availableTableFolder) {
    return availableTableFolder;
  }

  throw new Error(
    "Impossible de localiser les tables liblouis. Chemins testés: " + candidates.join(", "),
  );
}

function ensureTableLoadingReady() {
  if (isTableLoadingReady) {
    return;
  }

  if (tableLoadingFailure) {
    throw tableLoadingFailure;
  }

  try {
    const tableFolder = resolveTableFolder();
    liblouis.enableOnDemandTableLoading(tableFolder);
    isTableLoadingReady = true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    tableLoadingFailure = new Error(
      `Impossible d'initialiser le chargement des tables liblouis: ${reason}`,
    );
    throw tableLoadingFailure;
  }
}

function listTables() {
  ensureTableLoadingReady();
  return BRAILLE_TABLES.map(({ id, label, table }) => ({ id, label, table }));
}

function resolveSupportedTable(table) {
  const normalizedTable = table ?? DEFAULT_TABLE;
  if (typeof normalizedTable !== "string" || normalizedTable.length === 0) {
    throw new TypeError("La table de traduction est invalide.");
  }

  if (!BRAILLE_TABLES.some((entry) => entry.table === normalizedTable)) {
    throw new TypeError("La table de traduction demandée n'est pas supportée.");
  }

  return normalizedTable;
}

function normalizeExecutionMode(executionMode) {
  if (executionMode === "production") {
    return "production";
  }

  return DEFAULT_TRANSLATION_EXECUTION_MODE;
}

function isValidPageNumberPosition(value) {
  return typeof value === "string" && PAGE_NUMBER_POSITION_VALUES.has(value);
}

function ensureValidNativePageLayout(pageLayout) {
  if (pageLayout === undefined) {
    return;
  }

  if (!pageLayout || typeof pageLayout !== "object" || Array.isArray(pageLayout)) {
    throw new TypeError("La structure de pagination native est invalide.");
  }

  const booleanKeys = [
    "printPages",
    "braillePages",
    "numberBraillePages",
    "continuePages",
    "pageSeparator",
    "pageSeparatorNumber",
    "contents",
    "printPageNumbersInContents",
    "braillePageNumbersInContents",
  ];
  booleanKeys.forEach((key) => {
    if (pageLayout[key] !== undefined && typeof pageLayout[key] !== "boolean") {
      throw new TypeError(`La valeur native ${key} doit etre booleenne.`);
    }
  });

  if (
    pageLayout.printPageNumberAt !== undefined &&
    !isValidPageNumberPosition(pageLayout.printPageNumberAt)
  ) {
    throw new TypeError("La position du numero de page imprimee est invalide.");
  }

  if (
    pageLayout.braillePageNumberAt !== undefined &&
    !isValidPageNumberPosition(pageLayout.braillePageNumberAt)
  ) {
    throw new TypeError("La position du numero de page braille est invalide.");
  }

  if (
    pageLayout.beginningPageNumber !== undefined &&
    (!Number.isInteger(pageLayout.beginningPageNumber) ||
      pageLayout.beginningPageNumber < 1 ||
      pageLayout.beginningPageNumber > 9999)
  ) {
    throw new TypeError("Le numero de debut de page braille est invalide.");
  }
}

function normalizeNativePageLayout(pageLayout) {
  const source = pageLayout && typeof pageLayout === "object" ? pageLayout : {};

  return {
    printPages:
      typeof source.printPages === "boolean"
        ? source.printPages
        : DEFAULT_NATIVE_PAGE_LAYOUT.printPages,
    braillePages:
      typeof source.braillePages === "boolean"
        ? source.braillePages
        : DEFAULT_NATIVE_PAGE_LAYOUT.braillePages,
    numberBraillePages:
      typeof source.numberBraillePages === "boolean"
        ? source.numberBraillePages
        : DEFAULT_NATIVE_PAGE_LAYOUT.numberBraillePages,
    continuePages:
      typeof source.continuePages === "boolean"
        ? source.continuePages
        : DEFAULT_NATIVE_PAGE_LAYOUT.continuePages,
    pageSeparator:
      typeof source.pageSeparator === "boolean"
        ? source.pageSeparator
        : DEFAULT_NATIVE_PAGE_LAYOUT.pageSeparator,
    pageSeparatorNumber:
      typeof source.pageSeparatorNumber === "boolean"
        ? source.pageSeparatorNumber
        : DEFAULT_NATIVE_PAGE_LAYOUT.pageSeparatorNumber,
    printPageNumberAt: isValidPageNumberPosition(source.printPageNumberAt)
      ? source.printPageNumberAt
      : DEFAULT_NATIVE_PAGE_LAYOUT.printPageNumberAt,
    braillePageNumberAt: isValidPageNumberPosition(source.braillePageNumberAt)
      ? source.braillePageNumberAt
      : DEFAULT_NATIVE_PAGE_LAYOUT.braillePageNumberAt,
    beginningPageNumber:
      Number.isInteger(source.beginningPageNumber) &&
      source.beginningPageNumber >= 1 &&
      source.beginningPageNumber <= 9999
        ? source.beginningPageNumber
        : DEFAULT_NATIVE_PAGE_LAYOUT.beginningPageNumber,
    contents:
      typeof source.contents === "boolean"
        ? source.contents
        : DEFAULT_NATIVE_PAGE_LAYOUT.contents,
    printPageNumbersInContents:
      typeof source.printPageNumbersInContents === "boolean"
        ? source.printPageNumbersInContents
        : DEFAULT_NATIVE_PAGE_LAYOUT.printPageNumbersInContents,
    braillePageNumbersInContents:
      typeof source.braillePageNumbersInContents === "boolean"
        ? source.braillePageNumbersInContents
        : DEFAULT_NATIVE_PAGE_LAYOUT.braillePageNumbersInContents,
  };
}

function ensureValidNativeFormatting(nativeFormatting) {
  if (nativeFormatting === undefined) {
    return;
  }

  if (!nativeFormatting || typeof nativeFormatting !== "object") {
    throw new TypeError("Les options de formatage natif sont invalides.");
  }

  if (
    nativeFormatting.linesPerPage !== undefined &&
    (!Number.isInteger(nativeFormatting.linesPerPage) ||
      nativeFormatting.linesPerPage < 1 ||
      nativeFormatting.linesPerPage > 60)
  ) {
    throw new TypeError("Le nombre de lignes par page pour le moteur natif est invalide.");
  }

  if (
    nativeFormatting.charactersPerLine !== undefined &&
    (!Number.isInteger(nativeFormatting.charactersPerLine) ||
      nativeFormatting.charactersPerLine < 1 ||
      nativeFormatting.charactersPerLine > 120)
  ) {
    throw new TypeError("Le nombre de caracteres par ligne pour le moteur natif est invalide.");
  }

  ensureValidNativePageLayout(nativeFormatting.pageLayout);
}

function ensureValidPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("La requête de traduction est invalide.");
  }

  if (!SUPPORTED_DIRECTIONS.includes(payload.direction)) {
    throw new TypeError("Le sens de traduction demandé est invalide.");
  }

  if (typeof payload.inputText !== "string") {
    throw new TypeError("Le texte d'entrée doit être une chaîne de caractères.");
  }

  if (
    payload.executionMode !== undefined &&
    !TRANSLATION_EXECUTION_MODES.includes(payload.executionMode)
  ) {
    throw new TypeError("Le mode d'execution de traduction est invalide.");
  }

  ensureValidNativeFormatting(payload.nativeFormatting);

  resolveSupportedTable(payload.table);
}

function parseMarkupTagAt(inputText, startIndex) {
  if (inputText[startIndex] !== "<") {
    return null;
  }

  const closingBracketIndex = inputText.indexOf(">", startIndex + 1);
  if (closingBracketIndex === -1) {
    return null;
  }

  const rawTagContent = inputText
    .slice(startIndex + 1, closingBracketIndex)
    .trim()
    .toLowerCase();
  if (rawTagContent.length === 0) {
    return null;
  }

  const isClosingTag = rawTagContent.startsWith("/");
  const rawTagName = isClosingTag ? rawTagContent.slice(1).trim() : rawTagContent;
  const tagParts = rawTagName.split(/\s+/u);
  const firstTagPart = tagParts.length > 0 ? tagParts[0] : "";
  const normalizedTagName = firstTagPart.replace(/\/$/u, "");
  if (normalizedTagName.length === 0) {
    return null;
  }

  const styleClass = BFU_STYLE_CLASS_BY_MARKUP_TAG[normalizedTagName];
  if (!styleClass) {
    return null;
  }

  return {
    styleClass,
    isClosingTag,
    length: closingBracketIndex - startIndex + 1,
  };
}

function parseTextWithBfuStyleMarkers(inputText) {
  const plainTextCharacters = [];
  const internalStyleFlagsByChar = [];
  const activeStyleDepth = {
    italic: 0,
    underline: 0,
    bold: 0,
  };

  let hasBfuStyleMarkers = false;

  for (let index = 0; index < inputText.length; index += 1) {
    const styleTag = parseMarkupTagAt(inputText, index);
    if (styleTag) {
      hasBfuStyleMarkers = true;
      if (styleTag.isClosingTag) {
        activeStyleDepth[styleTag.styleClass] = Math.max(
          0,
          activeStyleDepth[styleTag.styleClass] - 1,
        );
      } else {
        activeStyleDepth[styleTag.styleClass] += 1;
      }

      index += styleTag.length - 1;
      continue;
    }

    plainTextCharacters.push(inputText[index]);

    let internalFlags = 0;
    if (activeStyleDepth.italic > 0) {
      internalFlags |= INTERNAL_STYLE_FLAGS.italic;
    }
    if (activeStyleDepth.underline > 0) {
      internalFlags |= INTERNAL_STYLE_FLAGS.underline;
    }
    if (activeStyleDepth.bold > 0) {
      internalFlags |= INTERNAL_STYLE_FLAGS.bold;
    }
    internalStyleFlagsByChar.push(internalFlags);
  }

  return {
    plainText: plainTextCharacters.join(""),
    internalStyleFlagsByChar,
    hasBfuStyleMarkers,
  };
}

function readTypeformMaskForClass(table, styleClass) {
  if (!liblouis.capi || typeof liblouis.capi.ccall !== "function") {
    return 0;
  }

  try {
    const rawTypeformMask = liblouis.capi.ccall(
      "lou_getTypeformForEmphClass",
      "number",
      ["string", "string"],
      [table, styleClass],
    );

    if (!Number.isInteger(rawTypeformMask) || rawTypeformMask <= 0) {
      return 0;
    }

    return rawTypeformMask & 0xffff;
  } catch (_error) {
    return 0;
  }
}

function getBfuTypeformMasksForTable(table) {
  if (bfuTypeformMaskByTable.has(table)) {
    return bfuTypeformMaskByTable.get(table);
  }

  const masks = {
    italic: readTypeformMaskForClass(table, "italic"),
    underline: readTypeformMaskForClass(table, "underline"),
    bold: readTypeformMaskForClass(table, "bold"),
    effectiveClassFallbacks: {},
  };

  if (isFrenchBfuTable(table)) {
    const italicMask = masks.italic;
    const underlineMask = masks.underline;
    const italicEffective = isTypeformMaskEffective(table, italicMask);
    const underlineEffective = isTypeformMaskEffective(table, underlineMask);

    if (italicEffective && !underlineEffective && underlineMask > 0) {
      masks.underline = italicMask;
      masks.effectiveClassFallbacks.underline = "italic";
    }
  }

  bfuTypeformMaskByTable.set(table, masks);
  return masks;
}

function isFrenchBfuTable(table) {
  return /^tables\/unicode\.dis,tables\/fr-bfu-(g1\.utb|g2\.ctb)$/u.test(table);
}

function buildTypeformValues(internalStyleFlagsByChar, tableTypeformMasks) {
  return internalStyleFlagsByChar.map((internalFlags) => {
    let outputMask = 0;

    if ((internalFlags & INTERNAL_STYLE_FLAGS.italic) !== 0) {
      outputMask |= tableTypeformMasks.italic;
    }
    if ((internalFlags & INTERNAL_STYLE_FLAGS.underline) !== 0) {
      outputMask |= tableTypeformMasks.underline;
    }
    if ((internalFlags & INTERNAL_STYLE_FLAGS.bold) !== 0) {
      outputMask |= tableTypeformMasks.bold;
    }

    return outputMask & 0xffff;
  });
}

function translateStringWithOptionalTypeforms(table, inputText, typeformValues = null) {
  if (typeof inputText !== "string" || inputText.length === 0) {
    return "";
  }

  const capi = liblouis.capi;
  const mem = liblouis.mem;
  if (!capi || typeof capi.ccall !== "function" || !mem) {
    return null;
  }

  const inputPointer = mem.transfer(capi, inputText);
  const charSize = typeof liblouis.charSize === "function" ? liblouis.charSize() : 2;
  const outputCapacityChars = Math.max(inputText.length * 8, 256);
  const outputPointer = capi._malloc((outputCapacityChars + 1) * charSize);
  const outputLengthPointer = capi._malloc(4);
  const inputLengthPointer = capi._malloc(4);
  const hasTypeforms = Array.isArray(typeformValues);
  // liblouis expects a formtype* array; formtype is an unsigned short (16 bits).
  const typeformPointer = hasTypeforms ? capi._malloc((inputText.length + 1) * 2) : 0;

  try {
    if (hasTypeforms) {
      const typeformStartIndex = typeformPointer >> 1;
      for (let index = 0; index < inputText.length; index += 1) {
        const nextTypeformValue = Number.isInteger(typeformValues[index])
          ? typeformValues[index] & 0xffff
          : 0;
        capi.HEAPU16[typeformStartIndex + index] = nextTypeformValue;
      }
      capi.HEAPU16[typeformStartIndex + inputText.length] = 0;
    }

    capi.setValue(inputLengthPointer, inputText.length, "i32");
    capi.setValue(outputLengthPointer, outputCapacityChars, "i32");

    const success = capi.ccall(
      "lou_translateString",
      "number",
      ["string", "number", "number", "number", "number", "number", "number", "number"],
      [
        table,
        inputPointer,
        inputLengthPointer,
        outputPointer,
        outputLengthPointer,
        hasTypeforms ? typeformPointer : null,
        null,
        0,
      ],
    );

    if (!success) {
      return null;
    }

    const outputBuffer = mem.read(capi, outputPointer, outputLengthPointer);
    return mem.buffToString(outputBuffer);
  } finally {
    if (hasTypeforms) {
      capi._free(typeformPointer);
    }
    capi._free(inputLengthPointer);
    capi._free(outputLengthPointer);
    capi._free(outputPointer);
    capi._free(inputPointer);
  }
}

function isTypeformMaskEffective(table, typeformMask) {
  if (!Number.isInteger(typeformMask) || typeformMask <= 0) {
    return false;
  }

  const probeText = EMPHASIS_EFFECTIVENESS_PROBE_TEXT;
  const baselineOutput = translateStringWithOptionalTypeforms(table, probeText, null);
  if (typeof baselineOutput !== "string") {
    return false;
  }

  const probeTypeforms = new Array(probeText.length).fill(typeformMask);
  const emphasizedOutput = translateStringWithOptionalTypeforms(table, probeText, probeTypeforms);
  if (typeof emphasizedOutput !== "string") {
    return false;
  }

  return emphasizedOutput !== baselineOutput;
}

function translateTextToBrailleNative(table, inputText) {
  const outputText = translateStringWithOptionalTypeforms(table, inputText, null);
  if (typeof outputText === "string") {
    return outputText;
  }

  return liblouis.translateString(table, inputText);
}

function translateTextToBrailleWithBfuStyles(table, inputText) {
  const parsedInput = parseTextWithBfuStyleMarkers(inputText);
  if (!parsedInput.hasBfuStyleMarkers) {
    return translateTextToBrailleNative(table, inputText);
  }

  if (parsedInput.plainText.length === 0) {
    return "";
  }

  const typeformMasks = getBfuTypeformMasksForTable(table);
  const typeformValues = buildTypeformValues(parsedInput.internalStyleFlagsByChar, typeformMasks);

  const hasActiveTypeform = typeformValues.some((maskValue) => maskValue > 0);
  if (!hasActiveTypeform) {
    return translateTextToBrailleNative(table, parsedInput.plainText);
  }

  const outputText = translateStringWithOptionalTypeforms(table, parsedInput.plainText, typeformValues);

  if (typeof outputText === "string") {
    return outputText;
  }

  return translateTextToBrailleNative(table, parsedInput.plainText);
}

function hasBfuStyleMarkup(inputText) {
  if (typeof inputText !== "string" || inputText.length === 0) {
    return false;
  }

  return parseTextWithBfuStyleMarkers(inputText).hasBfuStyleMarkers;
}

function resolveNativeTableFile(table) {
  const matchingTable = BRAILLE_TABLES.find((entry) => entry.table === table);
  if (!matchingTable) {
    return "fr-fr-g1.utb";
  }

  const tableList = matchingTable.table.split(",");
  const lastTable = tableList[tableList.length - 1] ?? "";
  return lastTable.trim().replace(/^tables\//u, "");
}

function resolveNativeFormatting(payload) {
  const formatting = payload?.nativeFormatting;
  return {
    linesPerPage: Number.isInteger(formatting?.linesPerPage)
      ? formatting.linesPerPage
      : 25,
    charactersPerLine: Number.isInteger(formatting?.charactersPerLine)
      ? formatting.charactersPerLine
      : 40,
    pageLayout: normalizeNativePageLayout(formatting?.pageLayout),
  };
}

function translateWithLiblouisJavascript(table, payload) {
  if (payload.direction === "text-to-braille") {
    return translateTextToBrailleWithBfuStyles(table, payload.inputText);
  }

  return liblouis.backTranslateString(table, payload.inputText);
}

function normalizeTranslationResult({ outputText, engine, executionMode, warning = null }) {
  return {
    outputText,
    engine,
    executionMode,
    warning,
  };
}

function translateForPreview(table, payload) {
  const outputText = translateWithLiblouisJavascript(table, payload);
  return normalizeTranslationResult({
    outputText,
    engine: "liblouis-js",
    executionMode: "preview",
  });
}

function translateForProduction(table, payload) {
  if (payload.direction !== "text-to-braille") {
    const outputText = translateWithLiblouisJavascript(table, payload);
    return normalizeTranslationResult({
      outputText,
      engine: "liblouis-js-production-fallback",
      executionMode: "production",
      warning:
        "Le moteur natif liblouisutdml est reserve a la traduction texte vers braille. " +
        "La retro-traduction utilise liblouis-js.",
    });
  }

  if (hasBfuStyleMarkup(payload.inputText)) {
    const outputText = translateWithLiblouisJavascript(table, payload);
    return normalizeTranslationResult({
      outputText,
      engine: "liblouis-js-production-fallback",
      executionMode: "production",
      warning:
        "La traduction contient des marqueurs de style BFU et reste traitee par liblouis-js " +
        "pour conserver l'emphase actuelle.",
    });
  }

  try {
    const nativeFormatting = resolveNativeFormatting(payload);
    const outputText = nativeBrailleService.translateTextToBrailleWithNativeEngine({
      inputText: payload.inputText,
      tableFile: resolveNativeTableFile(table),
      linesPerPage: nativeFormatting.linesPerPage,
      charactersPerLine: nativeFormatting.charactersPerLine,
      pageLayout: nativeFormatting.pageLayout,
    });

    return normalizeTranslationResult({
      outputText,
      engine: "native-liblouisutdml",
      executionMode: "production",
    });
  } catch (error) {
    const outputText = translateWithLiblouisJavascript(table, payload);
    const reason = error instanceof Error ? error.message : String(error);

    return normalizeTranslationResult({
      outputText,
      engine: "liblouis-js-production-fallback",
      executionMode: "production",
      warning:
        "Le moteur natif liblouisutdml n'a pas pu etre utilise. Bascule automatique vers liblouis-js. " +
        `Detail: ${reason}`,
    });
  }
}

function translate(payload) {
  ensureTableLoadingReady();
  ensureValidPayload(payload);

  const table = resolveSupportedTable(payload.table);
  const executionMode = normalizeExecutionMode(payload.executionMode);
  const result =
    executionMode === "production"
      ? translateForProduction(table, payload)
      : translateForPreview(table, payload);

  if (typeof result.outputText !== "string") {
    throw new Error("La traduction a échoué sans message exploitable.");
  }

  return result;
}

function getRuntimeInfo() {
  ensureTableLoadingReady();

  return {
    previewEngine: "liblouis-js",
    productionEngine: nativeBrailleService.resolveNativeRuntime(),
  };
}

function getStyleSupport(payload = {}) {
  ensureTableLoadingReady();

  const table = resolveSupportedTable(payload.table);
  const tableTypeformMasks = getBfuTypeformMasksForTable(table);
  const emphasisClasses = STYLE_CLASS_NAMES.reduce((accumulator, styleClass) => {
    const maskValue = tableTypeformMasks[styleClass] ?? 0;
    accumulator[styleClass] = {
      supported: Number.isInteger(maskValue) && maskValue > 0,
      typeformMask: Number.isInteger(maskValue) ? maskValue : 0,
    };
    return accumulator;
  }, {});

  const allSupported = STYLE_CLASS_NAMES.every(
    (styleClass) => emphasisClasses[styleClass].supported,
  );

  return {
    table,
    emphasisClasses,
    allSupported,
    bfuReference: isFrenchBfuTable(table)
      ? {
          ...BFU_EMPHASIS_REFERENCE,
          effectiveClassFallbacks:
            tableTypeformMasks.effectiveClassFallbacks &&
            Object.keys(tableTypeformMasks.effectiveClassFallbacks).length > 0
              ? {
                  ...tableTypeformMasks.effectiveClassFallbacks,
                }
              : null,
        }
      : null,
  };
}

module.exports = {
  listTables,
  translate,
  getStyleSupport,
  getRuntimeInfo,
  DEFAULT_TABLE,
};
