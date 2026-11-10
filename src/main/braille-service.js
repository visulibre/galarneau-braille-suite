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
const TYPOGRAPHIC_APOSTROPHE_PATTERN = /[\u2018\u2019\u02bc]/gu;
const BRAILLE_COLUMN_BLOCK_TAG_NAME = "cb";
const BRAILLE_COLUMN_BLOCK_MAX_INDENT = 120;
const BRAILLE_PARAGRAPH_TAG_NAME = "par";
const BRAILLE_PARAGRAPH_BRAILLE_INDENT = 2;
const BRAILLE_ANCHOR_TAG_NAME = "anc";
const BRAILLE_ANCHOR_TAG_MAX_OFFSET = 240;
const BRAILLE_TABLE_DELIMITER_CHARACTER = String.fromCodePoint(0x283f); // dots 1-2-3-4-5-6
const BRAILLE_TABLE_HEADER_FILL_CHARACTER = String.fromCodePoint(0x281b); // dots 1-2-4-5
const BRAILLE_TABLE_ROW_SEPARATOR_FILL_CHARACTER = String.fromCodePoint(0x2836); // dots 2-3-5-6
const BRAILLE_FRAME_OPEN_CHARACTER = String.fromCodePoint(0x2836); // dots 2-3-5-6
const BRAILLE_FRAME_CLOSE_CHARACTER = String.fromCodePoint(0x281b); // dots 1-2-4-5
const BOX_DRAWING_TOP_LEFT = "┌";
const BOX_DRAWING_TOP_RIGHT = "┐";
const BOX_DRAWING_BOTTOM_LEFT = "└";
const BOX_DRAWING_BOTTOM_RIGHT = "┘";
const BOX_DRAWING_HORIZONTAL = "─";
const BOX_DRAWING_VERTICAL = "│";
const BRAILLE_CAPITAL_INDICATOR = String.fromCodePoint(0x2828); // dots 4-6
const BRAILLE_CAPITAL_PASSAGE_START = String.fromCodePoint(0x2812); // dots 2-5
const BRAILLE_EMPHASIS_INDICATOR = String.fromCodePoint(0x2838); // dots 4-5-6
const BRAILLE_EMPHASIS_PASSAGE_START = String.fromCodePoint(0x2812); // dots 2-5
const FALLBACK_PAGE_SEPARATOR_CHARACTER = "-";
const FALLBACK_PAGE_NUMBER_FIELD_WIDTH = 3;

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
    printPageNumber:
      Number.isInteger(source.printPageNumber) &&
      source.printPageNumber >= 1 &&
      source.printPageNumber <= 9999
        ? source.printPageNumber
        : null,
    printPageBreakAfterSegment: source.printPageBreakAfterSegment === true,
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

function normalizeTextToBrailleInput(inputText) {
  if (typeof inputText !== "string" || inputText.length === 0) {
    return "";
  }

  return inputText.replace(TYPOGRAPHIC_APOSTROPHE_PATTERN, "'");
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

function parseColumnBlockTagAt(inputText, startIndex) {
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

  if (rawTagContent === BRAILLE_COLUMN_BLOCK_TAG_NAME || rawTagContent === `/${BRAILLE_COLUMN_BLOCK_TAG_NAME}`) {
    return {
      isClosingTag: true,
      indentSize: 0,
      length: closingBracketIndex - startIndex + 1,
    };
  }

  const openTagMatch = /^cb\s*(\d{1,3})$/u.exec(rawTagContent);
  if (!openTagMatch) {
    return null;
  }

  const requestedIndent = Number.parseInt(openTagMatch[1], 10);
  const safeIndent = Math.max(0, Math.min(requestedIndent, BRAILLE_COLUMN_BLOCK_MAX_INDENT));

  return {
    isClosingTag: false,
    indentSize: safeIndent,
    length: closingBracketIndex - startIndex + 1,
  };
}

function parseParagraphTagAt(inputText, startIndex) {
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

  if (rawTagContent === BRAILLE_PARAGRAPH_TAG_NAME || rawTagContent === `${BRAILLE_PARAGRAPH_TAG_NAME}/`) {
    return {
      applyIndent: true,
      length: closingBracketIndex - startIndex + 1,
    };
  }

  if (rawTagContent === `/${BRAILLE_PARAGRAPH_TAG_NAME}`) {
    return {
      applyIndent: false,
      length: closingBracketIndex - startIndex + 1,
    };
  }

  return null;
}

function parseAnchorTagAt(inputText, startIndex) {
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

  const openTagMatch = /^anc(?:\s*(\d{1,3}))?$/u.exec(rawTagContent);
  if (!openTagMatch) {
    return null;
  }

  const requestedOffset =
    openTagMatch[1] === undefined ? null : Number.parseInt(openTagMatch[1], 10);
  const safeOffset =
    Number.isInteger(requestedOffset)
      ? Math.max(1, Math.min(requestedOffset, BRAILLE_ANCHOR_TAG_MAX_OFFSET))
      : null;

  return {
    minEndColumn: safeOffset === null ? null : safeOffset + 1,
    length: closingBracketIndex - startIndex + 1,
  };
}

function appendComputedCharacter(characters, styleFlags, character, activeStyleDepth) {
  characters.push(character);

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
  styleFlags.push(internalFlags);
}

function appendColumnIndentPadding(characters, styleFlags, lineColumnIndex, targetIndentSize) {
  let nextLineColumnIndex = lineColumnIndex;

  if (!Number.isInteger(targetIndentSize) || targetIndentSize <= nextLineColumnIndex) {
    return nextLineColumnIndex;
  }

  const paddingSize = targetIndentSize - nextLineColumnIndex;
  for (let offset = 0; offset < paddingSize; offset += 1) {
    characters.push(" ");
    styleFlags.push(0);
    nextLineColumnIndex += 1;
  }

  return nextLineColumnIndex;
}

function getOrCreateLineFrameConfig(lineFrameConfigs, lineIndex) {
  if (!Array.isArray(lineFrameConfigs)) {
    return null;
  }

  while (lineFrameConfigs.length <= lineIndex) {
    lineFrameConfigs.push({
      enabled: false,
      minEndColumn: null,
      closeWithTableEndLine: true,
    });
  }

  return lineFrameConfigs[lineIndex];
}

function applyAnchorFrameToBrailleLine(lineValue, minEndColumn = null) {
  const safeLine = typeof lineValue === "string" ? lineValue : "";
  const requestedFrameLength =
    Number.isInteger(minEndColumn) && minEndColumn > 0 ? minEndColumn : 0;
  const minimumFrameLength = 3;
  const naturalFrameLength = Math.max(minimumFrameLength, safeLine.length + 2);
  const resolvedFrameLength = Math.max(naturalFrameLength, requestedFrameLength);
  const contentWidth = Math.max(1, resolvedFrameLength - 2);
  const framedContent = safeLine.padEnd(contentWidth, " ");

  return {
    framedContent,
    frameLength: contentWidth + 2,
  };
}

function buildUnicodeAnchorFrameTopLine(frameLength) {
  const safeFrameLength = Number.isInteger(frameLength) ? Math.max(3, frameLength) : 3;
  const innerWidth = Math.max(1, safeFrameLength - 2);
  return `${BOX_DRAWING_TOP_LEFT}${BOX_DRAWING_HORIZONTAL.repeat(innerWidth)}${BOX_DRAWING_TOP_RIGHT}`;
}

function buildUnicodeAnchorFrameContentLine(framedContent) {
  const safeContent = typeof framedContent === "string" ? framedContent : "";
  return `${BOX_DRAWING_VERTICAL}${safeContent}${BOX_DRAWING_VERTICAL}`;
}

function buildUnicodeAnchorFrameBottomLine(frameLength) {
  const safeFrameLength = Number.isInteger(frameLength) ? Math.max(3, frameLength) : 3;
  const innerWidth = Math.max(1, safeFrameLength - 2);
  return `${BOX_DRAWING_BOTTOM_LEFT}${BOX_DRAWING_HORIZONTAL.repeat(innerWidth)}${BOX_DRAWING_BOTTOM_RIGHT}`;
}

function convertUnicodeAnchorFrameLineToSixDot(lineValue, lineKind) {
  const safeLine = typeof lineValue === "string" ? lineValue : "";

  if (safeLine.length <= 0) {
    return BRAILLE_TABLE_DELIMITER_CHARACTER;
  }

  if (lineKind === "content") {
    if (safeLine.length === 1) {
      return BRAILLE_TABLE_DELIMITER_CHARACTER;
    }

    return (
      BRAILLE_TABLE_DELIMITER_CHARACTER +
      safeLine.slice(1, -1) +
      BRAILLE_TABLE_DELIMITER_CHARACTER
    );
  }

  const borderFillCharacter =
    lineKind === "top"
      ? BRAILLE_FRAME_OPEN_CHARACTER
      : BRAILLE_FRAME_CLOSE_CHARACTER;

  if (safeLine.length === 1) {
    return BRAILLE_TABLE_DELIMITER_CHARACTER;
  }

  return (
    BRAILLE_TABLE_DELIMITER_CHARACTER +
    borderFillCharacter.repeat(Math.max(0, safeLine.length - 2)) +
    BRAILLE_TABLE_DELIMITER_CHARACTER
  );
}

function applyAnchorFramesToBrailleText(outputText, lineFrameConfigs) {
  if (!Array.isArray(lineFrameConfigs) || lineFrameConfigs.length === 0) {
    return outputText;
  }

  const lines = (typeof outputText === "string" ? outputText : "").split("\n");

  let insertedLineOffset = 0;
  lineFrameConfigs.forEach((lineFrameConfig, lineIndex) => {
    if (!lineFrameConfig?.enabled) {
      return;
    }

    const targetLineIndex = lineIndex + insertedLineOffset;

    while (targetLineIndex >= lines.length) {
      lines.push("");
    }

    const frameDescriptor = applyAnchorFrameToBrailleLine(
      lines[targetLineIndex],
      lineFrameConfig.minEndColumn,
    );

    const unicodeTopLine = buildUnicodeAnchorFrameTopLine(frameDescriptor.frameLength);
    const unicodeContentLine = buildUnicodeAnchorFrameContentLine(frameDescriptor.framedContent);
    const unicodeBottomLine = buildUnicodeAnchorFrameBottomLine(frameDescriptor.frameLength);

    const replacementLines = [
      convertUnicodeAnchorFrameLineToSixDot(unicodeTopLine, "top"),
      convertUnicodeAnchorFrameLineToSixDot(unicodeContentLine, "content"),
    ];

    if (lineFrameConfig.closeWithTableEndLine !== false) {
      replacementLines.push(convertUnicodeAnchorFrameLineToSixDot(unicodeBottomLine, "bottom"));
    }

    if (targetLineIndex > 0 && lines[targetLineIndex - 1] !== "") {
      replacementLines.unshift("");
    }

    if (
      targetLineIndex + 1 < lines.length &&
      lines[targetLineIndex + 1] !== ""
    ) {
      replacementLines.push("");
    }

    lines.splice(targetLineIndex, 1, ...replacementLines);
    insertedLineOffset += replacementLines.length - 1;
  });

  return lines.join("\n");
}

function parseSemanticBlockMarkers(inputText) {
  const normalizedInputText =
    typeof inputText === "string"
      ? inputText.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n")
      : "";
  const semanticTagByLine = [];
  let hasSemanticMarkers = false;
  const plainText = normalizedInputText
    .split("\n")
    .map((line, lineIndex) => {
      const match = /^<(h1|h2|p)>(.*)<\/\1>$/u.exec(line);
      if (!match) {
        return line;
      }

      semanticTagByLine[lineIndex] = match[1];
      hasSemanticMarkers = true;
      return match[2];
    })
    .join("\n");

  return {
    plainText,
    semanticTagByLine,
    hasSemanticMarkers,
  };
}

function escapeXmlText(text) {
  return text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

function buildSemanticXhtml(parsedInput) {
  const semanticTags = parsedInput.semanticTagByLine;
  const content = parsedInput.plainText
    .split("\n")
    .map((line, lineIndex) => {
      const tagName = semanticTags[lineIndex] ?? "p";
      return `<${tagName}>${escapeXmlText(line)}</${tagName}>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?><html><body>${content}</body></html>`;
}

function parseTextWithBfuStyleMarkers(inputText) {
  const semanticMarkup = parseSemanticBlockMarkers(inputText);
  const normalizedInputText = semanticMarkup.plainText;
  const plainTextCharacters = [];
  const internalStyleFlagsByChar = [];
  const activeStyleDepth = {
    italic: 0,
    underline: 0,
    bold: 0,
  };
  let activeColumnIndent = null;
  let currentLineColumnIndex = 0;
  let currentLineIndex = 0;
  const lineFrameConfigs = [];

  let hasBfuStyleMarkers = false;
  let hasColumnIndentMarkers = false;
  let hasAnchorFrameMarkers = false;

  for (let index = 0; index < normalizedInputText.length; index += 1) {
    const columnIndentTag = parseColumnBlockTagAt(normalizedInputText, index);
    if (columnIndentTag) {
      hasColumnIndentMarkers = true;
      if (columnIndentTag.isClosingTag) {
        activeColumnIndent = null;
      } else {
        activeColumnIndent = columnIndentTag.indentSize;
        currentLineColumnIndex = appendColumnIndentPadding(
          plainTextCharacters,
          internalStyleFlagsByChar,
          currentLineColumnIndex,
          activeColumnIndent,
        );
      }

      index += columnIndentTag.length - 1;
      continue;
    }

    const paragraphTag = parseParagraphTagAt(normalizedInputText, index);
    if (paragraphTag) {
      hasColumnIndentMarkers = true;

      if (paragraphTag.applyIndent) {
        currentLineColumnIndex = appendColumnIndentPadding(
          plainTextCharacters,
          internalStyleFlagsByChar,
          currentLineColumnIndex,
          BRAILLE_PARAGRAPH_BRAILLE_INDENT,
        );
      }

      index += paragraphTag.length - 1;
      continue;
    }

    const anchorTag = parseAnchorTagAt(normalizedInputText, index);
    if (anchorTag) {
      hasAnchorFrameMarkers = true;
      const lineFrameConfig = getOrCreateLineFrameConfig(lineFrameConfigs, currentLineIndex);
      if (lineFrameConfig) {
        lineFrameConfig.enabled = true;
        lineFrameConfig.minEndColumn = anchorTag.minEndColumn;
      }

      index += anchorTag.length - 1;
      continue;
    }

    const styleTag = parseMarkupTagAt(normalizedInputText, index);
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

    const currentCharacter = normalizedInputText[index];
    appendComputedCharacter(
      plainTextCharacters,
      internalStyleFlagsByChar,
      currentCharacter,
      activeStyleDepth,
    );

    if (currentCharacter === "\n") {
      currentLineColumnIndex = 0;
      currentLineIndex += 1;
      if (activeColumnIndent !== null) {
        currentLineColumnIndex = appendColumnIndentPadding(
          plainTextCharacters,
          internalStyleFlagsByChar,
          currentLineColumnIndex,
          activeColumnIndent,
        );
      }
    } else {
      currentLineColumnIndex += 1;
    }
  }

  return {
    plainText: plainTextCharacters.join(""),
    internalStyleFlagsByChar,
    hasBfuStyleMarkers,
    hasColumnIndentMarkers,
    hasAnchorFrameMarkers,
    hasSemanticMarkers: semanticMarkup.hasSemanticMarkers,
    semanticTagByLine: semanticMarkup.semanticTagByLine,
    lineFrameConfigs,
  };
}

function translateBfuTextLines(table, parsedInput) {
  const lines = parsedInput.plainText.split("\n");
  const typeformMasks = parsedInput.hasBfuStyleMarkers
    ? getBfuTypeformMasksForTable(table)
    : null;
  let sourceOffset = 0;

  const outputLines = lines.map((line) => {
    const lineStyleFlags = parsedInput.internalStyleFlagsByChar.slice(
      sourceOffset,
      sourceOffset + line.length,
    );
    sourceOffset += line.length + 1;

    if (!typeformMasks || !lineStyleFlags.some((flags) => flags > 0)) {
      return translateTextToBrailleNative(table, line);
    }

    const typeformValues = buildTypeformValues(lineStyleFlags, typeformMasks);
    if (!typeformValues.some((maskValue) => maskValue > 0)) {
      return translateTextToBrailleNative(table, line);
    }

    try {
      const translatedLine = translateStringWithOptionalTypeforms(table, line, typeformValues);
      if (typeof translatedLine === "string") {
        return translatedLine;
      }
    } catch (_error) {
      // Fallback handled below.
    }

    return liblouis.translateString(table, line);
  });

  return outputLines.join("\n");
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

function safeFreeLiblouisPointer(capi, pointer) {
  if (!pointer) {
    return;
  }

  try {
    capi._free(pointer);
  } catch (_error) {
    // Ignore frees rejected after a runtime abort.
  }
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

  let inputPointer = 0;
  let outputPointer = 0;
  let outputLengthPointer = 0;
  let inputLengthPointer = 0;
  let typeformPointer = 0;

  const hasTypeforms = Array.isArray(typeformValues);
  const charSize = typeof liblouis.charSize === "function" ? liblouis.charSize() : 2;
  const outputCapacityChars = Math.max(inputText.length * 8, 256);
  // liblouis expects a formtype* array; formtype is an unsigned short (16 bits).

  try {
    inputPointer = mem.transfer(capi, inputText);
    outputPointer = capi._malloc((outputCapacityChars + 1) * charSize);
    outputLengthPointer = capi._malloc(4);
    inputLengthPointer = capi._malloc(4);
    typeformPointer = hasTypeforms ? capi._malloc((inputText.length + 1) * 2) : 0;

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
  } catch (_error) {
    return null;
  } finally {
    safeFreeLiblouisPointer(capi, typeformPointer);
    safeFreeLiblouisPointer(capi, inputLengthPointer);
    safeFreeLiblouisPointer(capi, outputLengthPointer);
    safeFreeLiblouisPointer(capi, outputPointer);
    safeFreeLiblouisPointer(capi, inputPointer);
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
  try {
    const outputText = translateStringWithOptionalTypeforms(table, inputText, null);
    if (typeof outputText === "string") {
      return outputText;
    }
  } catch (_error) {
    // Fallback handled below.
  }

  return liblouis.translateString(table, inputText);
}

function translateTextToBrailleWithBfuStyles(table, inputText) {
  const parsedInput = parseTextWithBfuStyleMarkers(inputText);
  const outputText = translateBfuTextLines(table, parsedInput);
  return applyAnchorFramesToBrailleText(outputText, parsedInput.lineFrameConfigs);
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

function normalizeBrailleOutputTextLineEndings(outputText) {
  if (typeof outputText !== "string") {
    return "";
  }

  return outputText.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n");
}

function truncateBrailleLineToWidth(lineValue, lineWidth) {
  const safeLine = typeof lineValue === "string" ? lineValue : "";
  if (!Number.isInteger(lineWidth) || lineWidth <= 0 || safeLine.length <= lineWidth) {
    return safeLine;
  }

  return safeLine.slice(0, lineWidth);
}

function wrapBrailleLineToWidth(lineValue, lineWidth) {
  const safeLine = typeof lineValue === "string" ? lineValue : "";
  const safeWidth = Number.isInteger(lineWidth) && lineWidth > 0 ? lineWidth : 40;
  if (safeLine.length <= safeWidth) {
    return [safeLine];
  }

  const wrappedLines = [];
  let remaining = safeLine;

  while (remaining.length > safeWidth) {
    let splitIndex = remaining.lastIndexOf(" ", safeWidth);
    if (splitIndex <= 0) {
      splitIndex = safeWidth;
    }

    const chunk = remaining.slice(0, splitIndex).trimEnd();
    wrappedLines.push(chunk.length > 0 ? chunk : remaining.slice(0, safeWidth));

    if (splitIndex === safeWidth) {
      remaining = remaining.slice(safeWidth);
    } else {
      remaining = remaining.slice(splitIndex + 1);
    }
  }

  wrappedLines.push(remaining);
  return wrappedLines;
}

function wrapBrailleOutputLines(outputText, lineWidth) {
  const sourceLines = normalizeBrailleOutputTextLineEndings(outputText).split("\n");
  const wrappedLines = [];

  sourceLines.forEach((sourceLine) => {
    if (sourceLine.length === 0) {
      wrappedLines.push("");
      return;
    }

    wrappedLines.push(...wrapBrailleLineToWidth(sourceLine, lineWidth));
  });

  while (wrappedLines.length > 1 && wrappedLines[wrappedLines.length - 1] === "") {
    wrappedLines.pop();
  }

  return wrappedLines.length > 0 ? wrappedLines : [""];
}

function buildFallbackPageSeparatorLine(pageNumber, lineWidth, includePageNumber) {
  const safeWidth = Number.isInteger(lineWidth) && lineWidth > 0 ? lineWidth : 1;
  if (!includePageNumber) {
    return FALLBACK_PAGE_SEPARATOR_CHARACTER.repeat(safeWidth);
  }

  const pageLabel = ` ${pageNumber} `;
  if (pageLabel.length >= safeWidth) {
    return pageLabel.slice(0, safeWidth);
  }

  const fillerLength = safeWidth - pageLabel.length;
  const leftFillerLength = Math.floor(fillerLength / 2);
  const rightFillerLength = fillerLength - leftFillerLength;

  return (
    FALLBACK_PAGE_SEPARATOR_CHARACTER.repeat(leftFillerLength) +
    pageLabel +
    FALLBACK_PAGE_SEPARATOR_CHARACTER.repeat(rightFillerLength)
  );
}

function buildFallbackBraillePageNumberLine(table, pageNumber, pageNumberCache) {
  if (pageNumberCache.has(pageNumber)) {
    return pageNumberCache.get(pageNumber);
  }

  const rawBrailleNumberLine = translateTextToBrailleNative(table, String(pageNumber));
  const brailleNumberLine =
    normalizeBrailleOutputTextLineEndings(rawBrailleNumberLine).split("\n")[0] ?? String(pageNumber);

  pageNumberCache.set(pageNumber, brailleNumberLine);
  return brailleNumberLine;
}

function buildFallbackRightAlignedPageNumberLine(lineWidth, rawPageNumberToken) {
  const safeLineWidth = Number.isInteger(lineWidth) && lineWidth > 0 ? lineWidth : 1;
  const fieldWidth = Math.min(FALLBACK_PAGE_NUMBER_FIELD_WIDTH, safeLineWidth);
  const normalizedToken =
    typeof rawPageNumberToken === "string"
      ? rawPageNumberToken.trim()
      : String(rawPageNumberToken ?? "");
  const tokenInField =
    normalizedToken.length <= fieldWidth
      ? normalizedToken.padStart(fieldWidth, " ")
      : normalizedToken.slice(-fieldWidth);

  return `${" ".repeat(safeLineWidth - fieldWidth)}${tokenInField}`;
}

function buildFallbackPageHeaderLines(
  table,
  printPageNumber,
  braillePageNumber,
  pageLayout,
  pageNumberCache,
  lineWidth,
) {
  const headerLines = [];

  if (pageLayout.printPages && pageLayout.printPageNumberAt === "top") {
    headerLines.push(
      buildFallbackRightAlignedPageNumberLine(lineWidth, String(printPageNumber)),
    );
  }

  if (pageLayout.braillePages && pageLayout.numberBraillePages && pageLayout.braillePageNumberAt === "top") {
    headerLines.push(
      buildFallbackRightAlignedPageNumberLine(
        lineWidth,
        buildFallbackBraillePageNumberLine(table, braillePageNumber, pageNumberCache),
      ),
    );
  }

  return headerLines;
}

function buildFallbackPageFooterLines(
  table,
  printPageNumber,
  braillePageNumber,
  pageLayout,
  lineWidth,
  pageNumberCache,
  includeSeparator,
) {
  const footerLines = [];

  if (includeSeparator) {
    footerLines.push(
      buildFallbackPageSeparatorLine(
        printPageNumber,
        lineWidth,
        pageLayout.pageSeparatorNumber,
      ),
    );
  }

  if (pageLayout.printPages && pageLayout.printPageNumberAt === "bottom") {
    footerLines.push(
      buildFallbackRightAlignedPageNumberLine(lineWidth, String(printPageNumber)),
    );
  }

  if (
    pageLayout.braillePages &&
    pageLayout.numberBraillePages &&
    pageLayout.braillePageNumberAt === "bottom"
  ) {
    footerLines.push(
      buildFallbackRightAlignedPageNumberLine(
        lineWidth,
        buildFallbackBraillePageNumberLine(table, braillePageNumber, pageNumberCache),
      ),
    );
  }

  return footerLines;
}

function applyFallbackProductionPageLayout(table, payload, outputText) {
  const nativeFormatting = resolveNativeFormatting(payload);
  const linesPerPage = nativeFormatting.linesPerPage;
  const lineWidth = nativeFormatting.charactersPerLine;
  const pageLayout = nativeFormatting.pageLayout;
  const requiresVisualPageLayout =
    pageLayout.printPages === true ||
    (pageLayout.braillePages === true && pageLayout.numberBraillePages === true) ||
    (pageLayout.printPages === true && pageLayout.pageSeparator === true);

  if (!requiresVisualPageLayout) {
    return normalizeBrailleOutputTextLineEndings(outputText);
  }

  const wrappedLines = wrapBrailleOutputLines(outputText, lineWidth);
  const pageSegments = [];
  const pageNumberCache = new Map();
  const fixedPrintPageNumber =
    Number.isInteger(pageLayout.printPageNumber) && pageLayout.printPageNumber >= 1
      ? pageLayout.printPageNumber
      : null;
  const shouldInsertPrintSeparatorAtSegmentEnd = pageLayout.printPageBreakAfterSegment === true;

  let contentLineIndex = 0;
  let braillePageNumber = pageLayout.beginningPageNumber;
  let printPageNumber =
    fixedPrintPageNumber === null ? pageLayout.beginningPageNumber : fixedPrintPageNumber;

  const buildFallbackPageSlice = (includeSeparator) => {
    let headerLines = buildFallbackPageHeaderLines(
      table,
      printPageNumber,
      braillePageNumber,
      pageLayout,
      pageNumberCache,
      lineWidth,
    );
    let footerLines = buildFallbackPageFooterLines(
      table,
      printPageNumber,
      braillePageNumber,
      pageLayout,
      lineWidth,
      pageNumberCache,
      includeSeparator,
    );

    if (headerLines.length + footerLines.length >= linesPerPage && includeSeparator) {
      footerLines = buildFallbackPageFooterLines(
        table,
        printPageNumber,
        braillePageNumber,
        pageLayout,
        lineWidth,
        pageNumberCache,
        false,
      );
    }

    while (headerLines.length + footerLines.length >= linesPerPage && footerLines.length > 0) {
      footerLines = footerLines.slice(0, -1);
    }

    while (headerLines.length + footerLines.length >= linesPerPage && headerLines.length > 0) {
      headerLines = headerLines.slice(0, -1);
    }

    const contentCapacity = Math.max(1, linesPerPage - headerLines.length - footerLines.length);
    const rawPageContentLines = wrappedLines.slice(contentLineIndex, contentLineIndex + contentCapacity);
    const consumedContentLineCount = rawPageContentLines.length;
    const pageContentLines = rawPageContentLines.slice();

    while (pageContentLines.length < contentCapacity) {
      pageContentLines.push("");
    }

    return {
      consumedContentLineCount,
      pageLines: [...headerLines, ...pageContentLines, ...footerLines],
    };
  };

  while (contentLineIndex < wrappedLines.length || pageSegments.length === 0) {
    const defaultIncludeSeparator =
      pageLayout.printPages === true &&
      pageLayout.pageSeparator === true &&
      fixedPrintPageNumber === null;

    let pageSlice = buildFallbackPageSlice(defaultIncludeSeparator);
    const isFinalBraillePageForSegment =
      contentLineIndex + pageSlice.consumedContentLineCount >= wrappedLines.length;
    const shouldAddPrintSeparatorForSegmentBoundary =
      fixedPrintPageNumber !== null &&
      shouldInsertPrintSeparatorAtSegmentEnd &&
      pageLayout.printPages === true &&
      pageLayout.pageSeparator === true &&
      isFinalBraillePageForSegment;

    if (shouldAddPrintSeparatorForSegmentBoundary) {
      pageSlice = buildFallbackPageSlice(true);
    }

    contentLineIndex += pageSlice.consumedContentLineCount;

    const pageLines = pageSlice.pageLines.map((lineValue) =>
      truncateBrailleLineToWidth(lineValue, lineWidth),
    );
    pageSegments.push(pageLines.join("\n"));

    braillePageNumber += 1;
    if (fixedPrintPageNumber === null) {
      printPageNumber += 1;
    }
  }

  return pageSegments.join("\f");
}

function translateWithLiblouisJavascript(table, payload) {
  if (payload.direction === "text-to-braille") {
    return translateTextToBrailleWithBfuStyles(table, payload.inputText);
  }

  return liblouis.backTranslateString(table, payload.inputText);
}

function replaceCapitalIndicators(word, capitalIndicator, replacement) {
  const parts = word.split(capitalIndicator);
  if (parts.length === 1) {
    return word;
  }

  return `${parts[0]}${replacement}${parts.slice(1).join("")}`;
}

function applyBfuEmphasisPassageIndicators(outputText) {
  const chunks = outputText.split(/(\s+)/u);
  const phraseOpeningIndicator =
    `${BRAILLE_EMPHASIS_PASSAGE_START}${BRAILLE_EMPHASIS_INDICATOR}`;
  const repeatedEmphasisIndicator =
    `${BRAILLE_EMPHASIS_INDICATOR}${BRAILLE_EMPHASIS_INDICATOR}`;

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    if (!chunks[chunkIndex].includes(repeatedEmphasisIndicator)) {
      continue;
    }

    chunks[chunkIndex] = chunks[chunkIndex].replaceAll(
      repeatedEmphasisIndicator,
      phraseOpeningIndicator,
    );

    for (let endChunkIndex = chunkIndex + 1; endChunkIndex < chunks.length; endChunkIndex += 1) {
      const endChunk = chunks[endChunkIndex];
      if (endChunk.length === 0 || /^\s+$/u.test(endChunk)) {
        continue;
      }

      if (!endChunk.includes(BRAILLE_EMPHASIS_INDICATOR)) {
        continue;
      }

      if (endChunk.includes(repeatedEmphasisIndicator)) {
        break;
      }

      if (
        endChunk.endsWith(BRAILLE_EMPHASIS_INDICATOR) &&
        !endChunk.startsWith(BRAILLE_EMPHASIS_INDICATOR)
      ) {
        chunks[endChunkIndex] = `${BRAILLE_EMPHASIS_INDICATOR}${endChunk.slice(0, -1)}`;
      }

      break;
    }
  }

  return chunks.join("");
}

function applyBfuCapitalPassageIndicators(outputText, isNativeOutput) {
  const capitalIndicator = isNativeOutput ? "¨" : BRAILLE_CAPITAL_INDICATOR;
  const capitalPassageStart = isNativeOutput
    ? `:${capitalIndicator}`
    : `${BRAILLE_CAPITAL_PASSAGE_START}${capitalIndicator}`;
  const chunks = outputText.split(/(\s+)/u);
  const wordChunkIndexes = [];

  chunks.forEach((chunk, index) => {
    if (chunk.length > 0 && !/^\s+$/u.test(chunk)) {
      wordChunkIndexes.push(index);
    }
  });

  let wordIndex = 0;
  while (wordIndex < wordChunkIndexes.length) {
    const firstWord = chunks[wordChunkIndexes[wordIndex]];
    if (!firstWord.includes(`${capitalIndicator}${capitalIndicator}`)) {
      wordIndex += 1;
      continue;
    }

    let runEnd = wordIndex + 1;
    while (runEnd < wordChunkIndexes.length) {
      const nextWord = chunks[wordChunkIndexes[runEnd]];
      if (!nextWord.includes(`${capitalIndicator}${capitalIndicator}`)) {
        break;
      }

      runEnd += 1;
    }

    if (runEnd - wordIndex >= 4) {
      const lastWordIndex = runEnd - 1;
      for (let index = wordIndex; index < runEnd; index += 1) {
        const chunkIndex = wordChunkIndexes[index];
        const replacement =
          index === wordIndex
            ? capitalPassageStart
            : index === lastWordIndex
              ? capitalIndicator
              : "";
        chunks[chunkIndex] = replaceCapitalIndicators(
          chunks[chunkIndex],
          capitalIndicator,
          replacement,
        );
      }
    }

    wordIndex = runEnd;
  }

  return chunks.join("");
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

  const parsedInput = parseTextWithBfuStyleMarkers(payload.inputText);
  if (parsedInput.hasBfuStyleMarkers || parsedInput.hasAnchorFrameMarkers) {
    const outputText = applyFallbackProductionPageLayout(
      table,
      payload,
      translateWithLiblouisJavascript(table, payload),
    );

    let warning =
      "La traduction contient des marqueurs de style BFU et reste traitee par liblouis-js " +
      "pour conserver l'emphase actuelle.";
    if (parsedInput.hasAnchorFrameMarkers && parsedInput.hasBfuStyleMarkers) {
      warning =
        "La traduction contient des marqueurs de style BFU et des balises <anc>; " +
        "elle reste traitee par liblouis-js pour conserver l'emphase et l'encadre.";
    } else if (parsedInput.hasAnchorFrameMarkers) {
      warning =
        "La traduction contient des balises <anc> et reste traitee par liblouis-js " +
        "pour appliquer l'encadre ligne par ligne.";
    }
    if (parsedInput.hasSemanticMarkers) {
      warning +=
        " Le balisage <h1>/<h2>/<p> est traduit sans mise en page sémantique " +
        "parce que les styles BFU ou les encadrés utilisent le moteur JavaScript.";
    }
    warning +=
      " La pagination (numéros de page et séparateurs) est appliquée via le moteur JavaScript.";

    return normalizeTranslationResult({
      outputText,
      engine: "liblouis-js-production-fallback",
      executionMode: "production",
      warning,
    });
  }

  if (parsedInput.hasSemanticMarkers) {
    try {
      const nativeFormatting = resolveNativeFormatting(payload);
      const outputText = nativeBrailleService.translateTextToBrailleWithNativeEngine({
        inputText: buildSemanticXhtml(parsedInput),
        semanticMarkup: true,
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
      const outputText = applyFallbackProductionPageLayout(
        table,
        payload,
        translateWithLiblouisJavascript(table, payload),
      );
      const reason = error instanceof Error ? error.message : String(error);

      return normalizeTranslationResult({
        outputText,
        engine: "liblouis-js-production-fallback",
        executionMode: "production",
        warning:
          "Le moteur natif liblouisutdml n'a pas pu appliquer les sémantiques .sem. " +
          "Bascule automatique vers liblouis-js avec pagination JavaScript. " +
          `Detail: ${reason}`,
      });
    }
  }

  try {
    const nativeFormatting = resolveNativeFormatting(payload);
    const outputText = nativeBrailleService.translateTextToBrailleWithNativeEngine({
      inputText: parsedInput.hasColumnIndentMarkers ? parsedInput.plainText : payload.inputText,
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
    const outputText = applyFallbackProductionPageLayout(
      table,
      payload,
      translateWithLiblouisJavascript(table, payload),
    );
    const reason = error instanceof Error ? error.message : String(error);

    return normalizeTranslationResult({
      outputText,
      engine: "liblouis-js-production-fallback",
      executionMode: "production",
      warning:
        "Le moteur natif liblouisutdml n'a pas pu etre utilise. " +
        "Bascule automatique vers liblouis-js avec pagination JavaScript. " +
        `Detail: ${reason}`,
    });
  }
}

function translate(payload) {
  ensureTableLoadingReady();
  ensureValidPayload(payload);

  const normalizedPayload =
    payload.direction === "text-to-braille"
      ? {
          ...payload,
          inputText: normalizeTextToBrailleInput(payload.inputText),
        }
      : payload;

  const table = resolveSupportedTable(normalizedPayload.table);
  const executionMode = normalizeExecutionMode(normalizedPayload.executionMode);
  const result =
    executionMode === "production"
      ? translateForProduction(table, normalizedPayload)
      : translateForPreview(table, normalizedPayload);

  if (typeof result.outputText !== "string") {
    throw new Error("La traduction a échoué sans message exploitable.");
  }

  const outputText =
    normalizedPayload.direction === "text-to-braille" && isFrenchBfuTable(table)
      ? applyBfuCapitalPassageIndicators(
          result.engine === "native-liblouisutdml"
            ? result.outputText
            : applyBfuEmphasisPassageIndicators(result.outputText),
          result.engine === "native-liblouisutdml",
        )
      : result.outputText;

  return {
    ...result,
    outputText,
  };
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
