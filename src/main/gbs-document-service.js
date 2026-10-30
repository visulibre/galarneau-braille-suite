const fs = require("node:fs/promises");
const path = require("node:path");
const { dialog } = require("electron");
const JSZip = require("jszip");
const pdfParse = require("pdf-parse");
const WordExtractor = require("word-extractor");

const GBS_DOCUMENT_FORMAT = "galarneau-braille-suite-document";
const GBS_DOCUMENT_FORMAT_VERSION = 2;
const LEGACY_GBS_DOCUMENT_FORMAT_VERSION = 1;
const DOCUMENT_TYPE_NORMAL = "normal";
const DOCUMENT_TYPE_BRAILLE = "braille";
const LEGACY_GBS_EXTENSION = ".gbs";
const DOCUMENT_EXTENSION_BY_TYPE = Object.freeze({
  [DOCUMENT_TYPE_NORMAL]: ".gnp",
  [DOCUMENT_TYPE_BRAILLE]: ".gnb",
});
const INTERNAL_DOCUMENT_EXTENSIONS = new Set([
  DOCUMENT_EXTENSION_BY_TYPE[DOCUMENT_TYPE_NORMAL],
  DOCUMENT_EXTENSION_BY_TYPE[DOCUMENT_TYPE_BRAILLE],
  LEGACY_GBS_EXTENSION,
]);
const IMPORTABLE_DOCUMENT_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".odf",
  ".odt",
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".rtf",
]);
const PAGE_NUMBER_POSITIONS = new Set(["top", "bottom"]);
const DEFAULT_PAGE_LAYOUT = Object.freeze({
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
  splitIntoVolumes: false,
  pagesPerVolume: 120,
});
const DEFAULT_IMPORT_OPTIONS = Object.freeze({
  table: "fr-bfu-g2.ctb",
  tableLabel: "Francais BFU grade 2",
  linesPerPage: 25,
  charactersPerLine: 40,
  pageLayout: DEFAULT_PAGE_LAYOUT,
});
const SUPPORTED_DIRECTIONS = new Set(["text-to-braille", "braille-to-text"]);
const INPUT_MODE_TEXT = "text";
const INPUT_MODE_BRAILLE = "braille-eight-key";
const LEGACY_INPUT_MODE_BRAILLE = "braille-six-key";
const SUPPORTED_INPUT_MODES = new Set([
  INPUT_MODE_TEXT,
  INPUT_MODE_BRAILLE,
  LEGACY_INPUT_MODE_BRAILLE,
]);
const BOOLEAN_FALSE_VALUES = new Set(["0", "false", "off", "no", "none", "nil"]);
const IMPORT_CENTERED_LINE_MARKER = "\u0001GBS_CENTERED_LINE\u0001";
const RTF_IGNORABLE_DESTINATION_KEYWORDS = new Set([
  "annotation",
  "atnauthor",
  "atndate",
  "atnparent",
  "atnref",
  "author",
  "colortbl",
  "comment",
  "company",
  "creatim",
  "doccomm",
  "fonttbl",
  "footer",
  "footerf",
  "footerl",
  "footerr",
  "footnote",
  "fchars",
  "fldinst",
  "generator",
  "header",
  "headerf",
  "headerl",
  "headerr",
  "info",
  "keywords",
  "operator",
  "pict",
  "private",
  "revtim",
  "stylesheet",
  "subject",
  "tc",
  "title",
]);

function ensureObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(message);
  }
}

function ensureBoundedInteger(value, label, min, max) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label}: la valeur doit etre un entier.`);
  }

  if (value < min || value > max) {
    throw new RangeError(`${label}: la valeur doit etre entre ${min} et ${max}.`);
  }
}

function ensureString(value, message) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(message);
  }
}

function normalizeDocumentType(value) {
  return value === DOCUMENT_TYPE_BRAILLE ? DOCUMENT_TYPE_BRAILLE : DOCUMENT_TYPE_NORMAL;
}

function getExtensionForType(documentType) {
  return DOCUMENT_EXTENSION_BY_TYPE[normalizeDocumentType(documentType)];
}

function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

function inferDocumentTypeFromPath(filePath) {
  const extension = getFileExtension(filePath);
  if (extension === DOCUMENT_EXTENSION_BY_TYPE[DOCUMENT_TYPE_BRAILLE]) {
    return DOCUMENT_TYPE_BRAILLE;
  }

  return DOCUMENT_TYPE_NORMAL;
}

function hasSupportedDocumentExtension(filePath) {
  const extension = getFileExtension(filePath);
  return (
    INTERNAL_DOCUMENT_EXTENSIONS.has(extension) ||
    IMPORTABLE_DOCUMENT_EXTENSIONS.has(extension)
  );
}

function isInternalDocumentExtension(filePath) {
  const extension = getFileExtension(filePath);
  return INTERNAL_DOCUMENT_EXTENSIONS.has(extension);
}

function ensureDocumentExtension(filePath, documentType) {
  const expectedExtension = getExtensionForType(documentType);
  const currentExtension = getFileExtension(filePath);

  if (currentExtension === expectedExtension) {
    return filePath;
  }

  if (currentExtension.length === 0) {
    return `${filePath}${expectedExtension}`;
  }

  const parsedPath = path.parse(filePath);
  return path.join(parsedPath.dir, `${parsedPath.name}${expectedExtension}`);
}

function clampBoundedInteger(value, fallbackValue, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    return fallbackValue;
  }

  return value;
}

function normalizeBooleanOption(value, fallbackValue) {
  return typeof value === "boolean" ? value : fallbackValue;
}

function normalizePageNumberPosition(value, fallbackValue) {
  if (typeof value !== "string") {
    return fallbackValue;
  }

  const normalizedValue = value.trim().toLowerCase();
  return PAGE_NUMBER_POSITIONS.has(normalizedValue)
    ? normalizedValue
    : fallbackValue;
}

function normalizePageLayoutConfig(pageLayoutValue) {
  const source =
    pageLayoutValue && typeof pageLayoutValue === "object" && !Array.isArray(pageLayoutValue)
      ? pageLayoutValue
      : {};

  const beginningPageNumberCandidate = Number.isInteger(source.beginningPageNumber)
    ? source.beginningPageNumber
    : Number.parseInt(source.beginningPageNumber ?? "", 10);

  return {
    printPages: normalizeBooleanOption(source.printPages, DEFAULT_PAGE_LAYOUT.printPages),
    braillePages: normalizeBooleanOption(source.braillePages, DEFAULT_PAGE_LAYOUT.braillePages),
    numberBraillePages: normalizeBooleanOption(
      source.numberBraillePages,
      DEFAULT_PAGE_LAYOUT.numberBraillePages,
    ),
    continuePages: normalizeBooleanOption(
      source.continuePages,
      DEFAULT_PAGE_LAYOUT.continuePages,
    ),
    pageSeparator: normalizeBooleanOption(
      source.pageSeparator,
      DEFAULT_PAGE_LAYOUT.pageSeparator,
    ),
    pageSeparatorNumber: normalizeBooleanOption(
      source.pageSeparatorNumber,
      DEFAULT_PAGE_LAYOUT.pageSeparatorNumber,
    ),
    printPageNumberAt: normalizePageNumberPosition(
      source.printPageNumberAt,
      DEFAULT_PAGE_LAYOUT.printPageNumberAt,
    ),
    braillePageNumberAt: normalizePageNumberPosition(
      source.braillePageNumberAt,
      DEFAULT_PAGE_LAYOUT.braillePageNumberAt,
    ),
    beginningPageNumber: clampBoundedInteger(
      beginningPageNumberCandidate,
      DEFAULT_PAGE_LAYOUT.beginningPageNumber,
      1,
      9999,
    ),
    contents: normalizeBooleanOption(source.contents, DEFAULT_PAGE_LAYOUT.contents),
    printPageNumbersInContents: normalizeBooleanOption(
      source.printPageNumbersInContents,
      DEFAULT_PAGE_LAYOUT.printPageNumbersInContents,
    ),
    braillePageNumbersInContents: normalizeBooleanOption(
      source.braillePageNumbersInContents,
      DEFAULT_PAGE_LAYOUT.braillePageNumbersInContents,
    ),
    splitIntoVolumes: normalizeBooleanOption(
      source.splitIntoVolumes,
      DEFAULT_PAGE_LAYOUT.splitIntoVolumes,
    ),
    pagesPerVolume: clampBoundedInteger(
      Number.isInteger(source.pagesPerVolume)
        ? source.pagesPerVolume
        : Number.parseInt(source.pagesPerVolume ?? "", 10),
      DEFAULT_PAGE_LAYOUT.pagesPerVolume,
      1,
      9999,
    ),
  };
}

function normalizeImportOptions(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ...DEFAULT_IMPORT_OPTIONS };
  }

  const rawImportOptions = payload.importOptions;
  if (
    !rawImportOptions ||
    typeof rawImportOptions !== "object" ||
    Array.isArray(rawImportOptions)
  ) {
    return { ...DEFAULT_IMPORT_OPTIONS };
  }

  const table =
    typeof rawImportOptions.table === "string" && rawImportOptions.table.trim().length > 0
      ? rawImportOptions.table.trim()
      : DEFAULT_IMPORT_OPTIONS.table;
  const tableLabel =
    typeof rawImportOptions.tableLabel === "string" &&
    rawImportOptions.tableLabel.trim().length > 0
      ? rawImportOptions.tableLabel.trim()
      : DEFAULT_IMPORT_OPTIONS.tableLabel;

  const linesPerPage = clampBoundedInteger(
    rawImportOptions.linesPerPage,
    DEFAULT_IMPORT_OPTIONS.linesPerPage,
    1,
    60,
  );
  const charactersPerLine = clampBoundedInteger(
    rawImportOptions.charactersPerLine,
    DEFAULT_IMPORT_OPTIONS.charactersPerLine,
    1,
    120,
  );
  const pageLayout = normalizePageLayoutConfig(rawImportOptions.pageLayout);

  return {
    table,
    tableLabel,
    linesPerPage,
    charactersPerLine,
    pageLayout,
  };
}

function decodeNumericCodePoint(rawValue, radix, fallback) {
  const parsedCodePoint = Number.parseInt(rawValue, radix);
  if (!Number.isInteger(parsedCodePoint) || parsedCodePoint < 0) {
    return fallback;
  }

  try {
    return String.fromCodePoint(parsedCodePoint);
  } catch {
    return fallback;
  }
}

function decodeXmlEntities(inputText) {
  if (typeof inputText !== "string") {
    return "";
  }

  return inputText
    .replace(/&#x([0-9a-f]+);/giu, (match, rawHex) =>
      decodeNumericCodePoint(rawHex, 16, match),
    )
    .replace(/&#([0-9]+);/gu, (match, rawInteger) =>
      decodeNumericCodePoint(rawInteger, 10, match),
    )
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'");
}

function normalizeExtractedText(inputText) {
  const safeText = typeof inputText === "string" ? inputText : "";
  return safeText
    .replace(/\u0000/gu, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/\u00a0/gu, " ")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function stripBfuStyleTags(inputText) {
  if (typeof inputText !== "string") {
    return "";
  }

  return inputText.replace(/<\/?(?:b|i|u)>/giu, "");
}

function markTextLinesAsCentered(inputText) {
  if (typeof inputText !== "string" || inputText.length === 0) {
    return "";
  }

  return inputText
    .split("\n")
    .map((lineValue) => `${IMPORT_CENTERED_LINE_MARKER}${lineValue}`)
    .join("\n");
}

function buildCenteredImportedLineValue(lineValue, lineWidth) {
  const trimmedLineValue = typeof lineValue === "string" ? lineValue.trim() : "";
  if (trimmedLineValue.length === 0) {
    return "";
  }

  const visibleLineLength = stripBfuStyleTags(trimmedLineValue).length;
  if (visibleLineLength === 0 || visibleLineLength >= lineWidth) {
    return trimmedLineValue;
  }

  const leftPaddingLength = Math.floor((lineWidth - visibleLineLength) / 2);
  return `${" ".repeat(leftPaddingLength)}${trimmedLineValue}`;
}

function applyImportedCenterMarkers(inputText, lineWidth) {
  if (typeof inputText !== "string" || inputText.length === 0) {
    return "";
  }

  if (!inputText.includes(IMPORT_CENTERED_LINE_MARKER)) {
    return inputText;
  }

  return inputText
    .split("\n")
    .map((lineValue) => {
      let normalizedLineValue = lineValue;
      let isCentered = false;
      while (normalizedLineValue.startsWith(IMPORT_CENTERED_LINE_MARKER)) {
        isCentered = true;
        normalizedLineValue = normalizedLineValue.slice(IMPORT_CENTERED_LINE_MARKER.length);
      }

      return isCentered
        ? buildCenteredImportedLineValue(normalizedLineValue, lineWidth)
        : normalizedLineValue;
    })
    .join("\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function readXmlAttributeValue(inputText, attributeName) {
  if (typeof inputText !== "string" || typeof attributeName !== "string") {
    return null;
  }

  const attributeMatcher = new RegExp(
    `${escapeRegExp(attributeName)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`,
    "iu",
  );
  const match = inputText.match(attributeMatcher);
  return match ? match[2] : null;
}

function isFalseLikeValue(rawValue) {
  if (typeof rawValue !== "string") {
    return false;
  }

  return BOOLEAN_FALSE_VALUES.has(rawValue.trim().toLowerCase());
}

function cloneInlineStyleState(styleState) {
  return {
    bold: styleState?.bold === true,
    italic: styleState?.italic === true,
    underline: styleState?.underline === true,
  };
}

function cloneOptionalInlineStyleState(styleState) {
  return {
    bold: typeof styleState?.bold === "boolean" ? styleState.bold : null,
    italic: typeof styleState?.italic === "boolean" ? styleState.italic : null,
    underline: typeof styleState?.underline === "boolean" ? styleState.underline : null,
  };
}

function buildStyleOpenTags(styleState) {
  let tags = "";
  if (styleState.bold) {
    tags += "<b>";
  }
  if (styleState.italic) {
    tags += "<i>";
  }
  if (styleState.underline) {
    tags += "<u>";
  }
  return tags;
}

function buildStyleCloseTags(styleState) {
  let tags = "";
  if (styleState.underline) {
    tags += "</u>";
  }
  if (styleState.italic) {
    tags += "</i>";
  }
  if (styleState.bold) {
    tags += "</b>";
  }
  return tags;
}

function wrapTextWithBfuStyleTags(textValue, styleState) {
  if (typeof textValue !== "string" || textValue.length === 0) {
    return "";
  }

  const normalizedStyle = cloneInlineStyleState(styleState);
  if (!normalizedStyle.bold && !normalizedStyle.italic && !normalizedStyle.underline) {
    return textValue;
  }

  if (!/[^\s]/u.test(textValue)) {
    return textValue;
  }

  return `${buildStyleOpenTags(normalizedStyle)}${textValue}${buildStyleCloseTags(normalizedStyle)}`;
}

function buildInlineStyleTransitionTags(fromStyleState, toStyleState) {
  const fromStyle = cloneInlineStyleState(fromStyleState);
  const toStyle = cloneInlineStyleState(toStyleState);

  let closeTags = "";
  if (fromStyle.underline && !toStyle.underline) {
    closeTags += "</u>";
  }
  if (fromStyle.italic && !toStyle.italic) {
    closeTags += "</i>";
  }
  if (fromStyle.bold && !toStyle.bold) {
    closeTags += "</b>";
  }

  let openTags = "";
  if (!fromStyle.bold && toStyle.bold) {
    openTags += "<b>";
  }
  if (!fromStyle.italic && toStyle.italic) {
    openTags += "<i>";
  }
  if (!fromStyle.underline && toStyle.underline) {
    openTags += "<u>";
  }

  return { closeTags, openTags };
}

const CP1252_SPECIAL_CHAR_BY_CODE_POINT = Object.freeze({
  0x80: "\u20ac",
  0x82: "\u201a",
  0x83: "\u0192",
  0x84: "\u201e",
  0x85: "\u2026",
  0x86: "\u2020",
  0x87: "\u2021",
  0x88: "\u02c6",
  0x89: "\u2030",
  0x8a: "\u0160",
  0x8b: "\u2039",
  0x8c: "\u0152",
  0x8e: "\u017d",
  0x91: "\u2018",
  0x92: "\u2019",
  0x93: "\u201c",
  0x94: "\u201d",
  0x95: "\u2022",
  0x96: "\u2013",
  0x97: "\u2014",
  0x98: "\u02dc",
  0x99: "\u2122",
  0x9a: "\u0161",
  0x9b: "\u203a",
  0x9c: "\u0153",
  0x9e: "\u017e",
  0x9f: "\u0178",
});

function decodeCp1252HexByte(rawHex) {
  const parsedValue = Number.parseInt(rawHex, 16);
  if (!Number.isInteger(parsedValue) || parsedValue < 0 || parsedValue > 255) {
    return "";
  }

  if (Object.hasOwn(CP1252_SPECIAL_CHAR_BY_CODE_POINT, parsedValue)) {
    return CP1252_SPECIAL_CHAR_BY_CODE_POINT[parsedValue];
  }

  return String.fromCodePoint(parsedValue);
}

function decodeRtfUnicodeCodePoint(rawCodePoint) {
  const parsedValue = Number.parseInt(rawCodePoint, 10);
  if (!Number.isInteger(parsedValue)) {
    return "";
  }

  const normalizedValue = parsedValue < 0 ? 65536 + parsedValue : parsedValue;
  if (normalizedValue < 0 || normalizedValue > 0x10ffff) {
    return "";
  }

  try {
    return String.fromCodePoint(normalizedValue);
  } catch {
    return "";
  }
}

function setInlineStyleState(targetStyleState, sourceStyleState) {
  targetStyleState.bold = sourceStyleState.bold === true;
  targetStyleState.italic = sourceStyleState.italic === true;
  targetStyleState.underline = sourceStyleState.underline === true;
}

function applyInlineStyleTransition(
  outputChunks,
  activeStyleState,
  nextStyleState,
  appendChunk = null,
) {
  const normalizedNextStyleState = cloneInlineStyleState(nextStyleState);
  const append =
    typeof appendChunk === "function"
      ? appendChunk
      : (chunkValue) => {
          outputChunks.push(chunkValue);
        };

  if (activeStyleState.underline && !normalizedNextStyleState.underline) {
    append("</u>");
  }
  if (activeStyleState.italic && !normalizedNextStyleState.italic) {
    append("</i>");
  }
  if (activeStyleState.bold && !normalizedNextStyleState.bold) {
    append("</b>");
  }

  if (!activeStyleState.bold && normalizedNextStyleState.bold) {
    append("<b>");
  }
  if (!activeStyleState.italic && normalizedNextStyleState.italic) {
    append("<i>");
  }
  if (!activeStyleState.underline && normalizedNextStyleState.underline) {
    append("<u>");
  }

  setInlineStyleState(activeStyleState, normalizedNextStyleState);
}

function extractRtfTextFromContent(rtfContent) {
  if (typeof rtfContent !== "string" || rtfContent.length === 0) {
    return "";
  }

  const outputChunks = [];
  const activeStyleState = { bold: false, italic: false, underline: false };
  let currentParagraphCentered = false;
  const groupStack = [
    {
      savedStyle: cloneInlineStyleState(activeStyleState),
      savedParagraphCentered: currentParagraphCentered,
      ignore: false,
    },
  ];

  let unicodeSkipCount = 1;
  let pendingUnicodeFallbackCharacters = 0;
  let isAtLineStart = true;

  const isIgnoringCurrentGroup = () => groupStack[groupStack.length - 1]?.ignore === true;

  const appendOutputChunk = (chunkValue) => {
    if (typeof chunkValue !== "string" || chunkValue.length === 0) {
      return;
    }

    if (isAtLineStart && currentParagraphCentered) {
      outputChunks.push(IMPORT_CENTERED_LINE_MARKER);
      isAtLineStart = false;
    }

    outputChunks.push(chunkValue);
  };

  const appendNewLine = () => {
    outputChunks.push("\n");
    isAtLineStart = true;
    pendingUnicodeFallbackCharacters = 0;
  };

  const appendDecodedCharacter = (character) => {
    if (typeof character !== "string" || character.length === 0) {
      return;
    }

    if (pendingUnicodeFallbackCharacters > 0) {
      pendingUnicodeFallbackCharacters -= 1;
      return;
    }

    if (isIgnoringCurrentGroup()) {
      return;
    }

    appendOutputChunk(character);
  };

  for (let index = 0; index < rtfContent.length; index += 1) {
    const currentCharacter = rtfContent[index];

    if (currentCharacter === "{") {
      groupStack.push({
        savedStyle: cloneInlineStyleState(activeStyleState),
        savedParagraphCentered: currentParagraphCentered,
        ignore: isIgnoringCurrentGroup(),
      });
      continue;
    }

    if (currentCharacter === "}") {
      if (groupStack.length === 1) {
        continue;
      }

      const closedGroup = groupStack.pop();
      if (!isIgnoringCurrentGroup()) {
        applyInlineStyleTransition(
          outputChunks,
          activeStyleState,
          closedGroup.savedStyle,
          appendOutputChunk,
        );
      } else {
        setInlineStyleState(activeStyleState, closedGroup.savedStyle);
      }
      currentParagraphCentered = closedGroup.savedParagraphCentered === true;
      pendingUnicodeFallbackCharacters = 0;
      continue;
    }

    if (currentCharacter !== "\\") {
      appendDecodedCharacter(currentCharacter);
      continue;
    }

    const controlStartIndex = index + 1;
    if (controlStartIndex >= rtfContent.length) {
      break;
    }

    const controlStartCharacter = rtfContent[controlStartIndex];

    if (controlStartCharacter === "'" && controlStartIndex + 2 < rtfContent.length) {
      const rawHexByte = rtfContent.slice(controlStartIndex + 1, controlStartIndex + 3);
      appendDecodedCharacter(decodeCp1252HexByte(rawHexByte));
      index = controlStartIndex + 2;
      continue;
    }

    if (controlStartCharacter === "\\" || controlStartCharacter === "{" || controlStartCharacter === "}") {
      appendDecodedCharacter(controlStartCharacter);
      index = controlStartIndex;
      continue;
    }

    if (controlStartCharacter === "*") {
      if (groupStack.length > 0) {
        groupStack[groupStack.length - 1].ignore = true;
      }
      index = controlStartIndex;
      continue;
    }

    let cursor = controlStartIndex;
    let controlWord = "";
    while (cursor < rtfContent.length && /[A-Za-z]/u.test(rtfContent[cursor])) {
      controlWord += rtfContent[cursor];
      cursor += 1;
    }

    if (controlWord.length === 0) {
      let replacementCharacter = "";
      if (controlStartCharacter === "~") {
        replacementCharacter = " ";
      } else if (controlStartCharacter === "_") {
        replacementCharacter = "-";
      } else if (controlStartCharacter === "-") {
        replacementCharacter = "-";
      }

      appendDecodedCharacter(replacementCharacter);
      index = controlStartIndex;
      continue;
    }

    let sign = 1;
    if (cursor < rtfContent.length && (rtfContent[cursor] === "-" || rtfContent[cursor] === "+")) {
      if (rtfContent[cursor] === "-") {
        sign = -1;
      }
      cursor += 1;
    }

    const numberStartIndex = cursor;
    while (cursor < rtfContent.length && /\d/u.test(rtfContent[cursor])) {
      cursor += 1;
    }

    const hasNumericValue = cursor > numberStartIndex;
    const numericValue = hasNumericValue
      ? sign * Number.parseInt(rtfContent.slice(numberStartIndex, cursor), 10)
      : null;

    if (cursor < rtfContent.length && rtfContent[cursor] === " ") {
      cursor += 1;
    }

    index = cursor - 1;

    const normalizedControlWord = controlWord.toLowerCase();
    if (
      !isIgnoringCurrentGroup() &&
      RTF_IGNORABLE_DESTINATION_KEYWORDS.has(normalizedControlWord)
    ) {
      groupStack[groupStack.length - 1].ignore = true;
      continue;
    }

    if (normalizedControlWord === "uc" && hasNumericValue) {
      unicodeSkipCount = Math.max(0, numericValue);
      continue;
    }

    if (isIgnoringCurrentGroup()) {
      continue;
    }

    if (normalizedControlWord === "u" && hasNumericValue) {
      appendDecodedCharacter(decodeRtfUnicodeCodePoint(String(numericValue)));
      pendingUnicodeFallbackCharacters = unicodeSkipCount;
      continue;
    }

    if (normalizedControlWord === "par" || normalizedControlWord === "line") {
      appendNewLine();
      continue;
    }

    if (normalizedControlWord === "tab") {
      appendOutputChunk("\t");
      continue;
    }

    if (normalizedControlWord === "plain") {
      applyInlineStyleTransition(
        outputChunks,
        activeStyleState,
        {
          bold: false,
          italic: false,
          underline: false,
        },
        appendOutputChunk,
      );
      continue;
    }

    if (normalizedControlWord === "pard") {
      currentParagraphCentered = false;
      continue;
    }

    if (normalizedControlWord === "qc") {
      currentParagraphCentered = true;
      continue;
    }

    if (
      normalizedControlWord === "ql" ||
      normalizedControlWord === "qr" ||
      normalizedControlWord === "qj"
    ) {
      currentParagraphCentered = false;
      continue;
    }

    if (normalizedControlWord === "b") {
      applyInlineStyleTransition(
        outputChunks,
        activeStyleState,
        {
          ...activeStyleState,
          bold: !(hasNumericValue && numericValue === 0),
        },
        appendOutputChunk,
      );
      continue;
    }

    if (normalizedControlWord === "i") {
      applyInlineStyleTransition(
        outputChunks,
        activeStyleState,
        {
          ...activeStyleState,
          italic: !(hasNumericValue && numericValue === 0),
        },
        appendOutputChunk,
      );
      continue;
    }

    if (normalizedControlWord === "ulnone" || normalizedControlWord === "ul0") {
      applyInlineStyleTransition(
        outputChunks,
        activeStyleState,
        {
          ...activeStyleState,
          underline: false,
        },
        appendOutputChunk,
      );
      continue;
    }

    if (normalizedControlWord.startsWith("ul")) {
      applyInlineStyleTransition(
        outputChunks,
        activeStyleState,
        {
          ...activeStyleState,
          underline: !(hasNumericValue && numericValue === 0),
        },
        appendOutputChunk,
      );
    }
  }

  applyInlineStyleTransition(
    outputChunks,
    activeStyleState,
    {
      bold: false,
      italic: false,
      underline: false,
    },
    appendOutputChunk,
  );

  return outputChunks.join("");
}

function extractDocxRunStyleState(runXml) {
  const styleState = { bold: false, italic: false, underline: false };
  if (typeof runXml !== "string" || runXml.length === 0) {
    return styleState;
  }

  const runPropertiesMatch = runXml.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/iu);
  if (!runPropertiesMatch) {
    return styleState;
  }

  const runProperties = runPropertiesMatch[0];

  const boldMatch = runProperties.match(/<w:b(?:Cs)?\b[^>]*\/?>(?:<\/w:b(?:Cs)?>)?/iu);
  if (boldMatch) {
    const boldValue = readXmlAttributeValue(boldMatch[0], "w:val");
    styleState.bold = boldValue === null ? true : !isFalseLikeValue(boldValue);
  }

  const italicMatch = runProperties.match(/<w:i(?:Cs)?\b[^>]*\/?>(?:<\/w:i(?:Cs)?>)?/iu);
  if (italicMatch) {
    const italicValue = readXmlAttributeValue(italicMatch[0], "w:val");
    styleState.italic = italicValue === null ? true : !isFalseLikeValue(italicValue);
  }

  const underlineMatch = runProperties.match(/<w:u\b[^>]*\/?>(?:<\/w:u>)?/iu);
  if (underlineMatch) {
    const underlineValue = readXmlAttributeValue(underlineMatch[0], "w:val");
    styleState.underline =
      underlineValue === null
        ? true
        : !isFalseLikeValue(underlineValue) && underlineValue.trim().toLowerCase() !== "none";
  }

  return styleState;
}

function extractDocxRunText(runXml) {
  if (typeof runXml !== "string" || runXml.length === 0) {
    return "";
  }

  let output = "";
  const tokenMatcher =
    /<w:t\b[^>]*>[\s\S]*?<\/w:t>|<w:tab\b[^/>]*\/>|<w:(?:br|cr)\b[^/>]*\/>|<w:noBreakHyphen\b[^/>]*\/>|<w:softHyphen\b[^/>]*\/>/giu;
  let tokenMatch;

  while ((tokenMatch = tokenMatcher.exec(runXml)) !== null) {
    const token = tokenMatch[0];

    if (/^<w:tab\b/iu.test(token)) {
      output += "\t";
      continue;
    }

    if (/^<w:(?:br|cr)\b/iu.test(token)) {
      output += "\n";
      continue;
    }

    if (/^<w:noBreakHyphen\b/iu.test(token)) {
      output += "\u2011";
      continue;
    }

    if (/^<w:softHyphen\b/iu.test(token)) {
      output += "\u00ad";
      continue;
    }

    const textMatch = token.match(/^<w:t\b[^>]*>([\s\S]*?)<\/w:t>$/iu);
    if (textMatch) {
      output += decodeXmlEntities(textMatch[1]);
    }
  }

  return output;
}

function parseDocxParagraphAlignmentAsCentered(rawAlignmentValue) {
  if (typeof rawAlignmentValue !== "string") {
    return null;
  }

  const normalizedValue = rawAlignmentValue.trim().toLowerCase();
  if (normalizedValue.length === 0) {
    return null;
  }

  if (normalizedValue === "center") {
    return true;
  }

  return false;
}

function extractDocxParagraphCenterFromProperties(paragraphPropertiesXml) {
  if (typeof paragraphPropertiesXml !== "string" || paragraphPropertiesXml.length === 0) {
    return null;
  }

  const justificationMatch = paragraphPropertiesXml.match(
    /<w:jc\b[^>]*\/?>(?:<\/w:jc>)?/iu,
  );
  if (!justificationMatch) {
    return null;
  }

  return parseDocxParagraphAlignmentAsCentered(
    readXmlAttributeValue(justificationMatch[0], "w:val"),
  );
}

function buildDocxParagraphCenterStyleMap(stylesXmlContent) {
  if (typeof stylesXmlContent !== "string" || stylesXmlContent.length === 0) {
    return new Map();
  }

  const styleDefinitionById = new Map();
  const styleMatcher = /<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/giu;
  let styleMatch;
  while ((styleMatch = styleMatcher.exec(stylesXmlContent)) !== null) {
    const styleAttributes = styleMatch[1] ?? "";
    const styleBody = styleMatch[2] ?? "";
    const styleType = readXmlAttributeValue(styleAttributes, "w:type");
    const styleId = readXmlAttributeValue(styleAttributes, "w:styleId");

    if (styleType !== "paragraph" || !styleId) {
      continue;
    }

    const basedOnMatch = styleBody.match(/<w:basedOn\b[^>]*\/?>(?:<\/w:basedOn>)?/iu);
    const paragraphPropertiesMatch = styleBody.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/iu);
    styleDefinitionById.set(styleId, {
      basedOnStyleId: basedOnMatch ? readXmlAttributeValue(basedOnMatch[0], "w:val") : null,
      ownParagraphCentered: paragraphPropertiesMatch
        ? extractDocxParagraphCenterFromProperties(paragraphPropertiesMatch[0])
        : null,
    });
  }

  const resolvedCenterByStyleId = new Map();
  const resolveStyleCenter = (styleId, resolvingIds = new Set()) => {
    if (resolvedCenterByStyleId.has(styleId)) {
      return resolvedCenterByStyleId.get(styleId);
    }

    if (resolvingIds.has(styleId)) {
      return null;
    }

    const styleDefinition = styleDefinitionById.get(styleId);
    if (!styleDefinition) {
      return null;
    }

    resolvingIds.add(styleId);

    let resolvedCenter = null;
    if (styleDefinition.basedOnStyleId && styleDefinitionById.has(styleDefinition.basedOnStyleId)) {
      resolvedCenter = resolveStyleCenter(styleDefinition.basedOnStyleId, resolvingIds);
    }

    if (typeof styleDefinition.ownParagraphCentered === "boolean") {
      resolvedCenter = styleDefinition.ownParagraphCentered;
    }

    resolvingIds.delete(styleId);
    resolvedCenterByStyleId.set(styleId, resolvedCenter);
    return resolvedCenter;
  };

  styleDefinitionById.forEach((_definition, styleId) => {
    resolveStyleCenter(styleId);
  });

  return resolvedCenterByStyleId;
}

function isDocxParagraphCentered(paragraphXml, paragraphCenterByStyleId = null) {
  if (typeof paragraphXml !== "string" || paragraphXml.length === 0) {
    return false;
  }

  const paragraphPropertiesMatch = paragraphXml.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/iu);
  if (!paragraphPropertiesMatch) {
    return false;
  }

  const paragraphProperties = paragraphPropertiesMatch[0];
  const directParagraphCenter = extractDocxParagraphCenterFromProperties(paragraphProperties);
  if (typeof directParagraphCenter === "boolean") {
    return directParagraphCenter;
  }

  if (paragraphCenterByStyleId instanceof Map) {
    const paragraphStyleMatch = paragraphProperties.match(
      /<w:pStyle\b[^>]*\/?>(?:<\/w:pStyle>)?/iu,
    );
    if (!paragraphStyleMatch) {
      return false;
    }

    const paragraphStyleId = readXmlAttributeValue(paragraphStyleMatch[0], "w:val");
    return paragraphStyleId
      ? paragraphCenterByStyleId.get(paragraphStyleId) === true
      : false;
  }

  return false;
}

function extractDocxParagraphText(paragraphXml) {
  if (typeof paragraphXml !== "string" || paragraphXml.length === 0) {
    return "";
  }

  let output = "";
  const runMatcher = /<w:r\b[\s\S]*?<\/w:r>/giu;
  let runMatch;
  let hasRun = false;

  while ((runMatch = runMatcher.exec(paragraphXml)) !== null) {
    hasRun = true;
    const runXml = runMatch[0];
    const runText = extractDocxRunText(runXml);
    const runStyleState = extractDocxRunStyleState(runXml);
    output += wrapTextWithBfuStyleTags(runText, runStyleState);
  }

  if (hasRun) {
    return output;
  }

  return decodeXmlEntities(paragraphXml.replace(/<[^>]+>/gu, ""));
}

function extractDocxTextFromXml(xmlContent, paragraphCenterByStyleId = null) {
  if (typeof xmlContent !== "string" || xmlContent.length === 0) {
    return "";
  }

  const paragraphs = [];
  const paragraphMatcher = /<w:p\b[\s\S]*?<\/w:p>/giu;
  let paragraphMatch;

  while ((paragraphMatch = paragraphMatcher.exec(xmlContent)) !== null) {
    const paragraphXml = paragraphMatch[0];
    const paragraphText = extractDocxParagraphText(paragraphXml);
    paragraphs.push(
      isDocxParagraphCentered(paragraphXml, paragraphCenterByStyleId)
        ? markTextLinesAsCentered(paragraphText)
        : paragraphText,
    );
  }

  if (paragraphs.length > 0) {
    return paragraphs.join("\n");
  }

  const rawText = xmlContent
    .replace(/<w:tab\b[^/>]*\/>/giu, "\t")
    .replace(/<w:(?:br|cr)\b[^/>]*\/>/giu, "\n")
    .replace(/<\/w:p>/giu, "\n")
    .replace(/<\/w:tr>/giu, "\n")
    .replace(/<[^>]+>/gu, "");

  return decodeXmlEntities(rawText);
}

function parseWeightAsBold(weightValue) {
  if (typeof weightValue !== "string") {
    return null;
  }

  const normalizedValue = weightValue.trim().toLowerCase();
  if (normalizedValue.length === 0) {
    return null;
  }

  if (normalizedValue === "normal") {
    return false;
  }

  if (normalizedValue.includes("bold")) {
    return true;
  }

  if (/^\d+$/u.test(normalizedValue)) {
    return Number.parseInt(normalizedValue, 10) >= 600;
  }

  return null;
}

function parseStyleAsItalic(fontStyleValue) {
  if (typeof fontStyleValue !== "string") {
    return null;
  }

  const normalizedValue = fontStyleValue.trim().toLowerCase();
  if (normalizedValue.length === 0) {
    return null;
  }

  if (normalizedValue === "normal") {
    return false;
  }

  if (normalizedValue.includes("italic") || normalizedValue.includes("oblique")) {
    return true;
  }

  return null;
}

function parseUnderlineAsEnabled(underlineValue) {
  if (typeof underlineValue !== "string") {
    return null;
  }

  const normalizedValue = underlineValue.trim().toLowerCase();
  if (normalizedValue.length === 0) {
    return null;
  }

  if (normalizedValue === "none" || isFalseLikeValue(normalizedValue)) {
    return false;
  }

  return true;
}

function parseParagraphAlignmentAsCentered(textAlignValue) {
  if (typeof textAlignValue !== "string") {
    return null;
  }

  const normalizedValue = textAlignValue.trim().toLowerCase();
  if (normalizedValue.length === 0) {
    return null;
  }

  if (normalizedValue === "center") {
    return true;
  }

  return false;
}

function extractOdfOwnStyleState(styleBodyXml) {
  const ownStyleState = { bold: null, italic: null, underline: null };
  if (typeof styleBodyXml !== "string" || styleBodyXml.length === 0) {
    return ownStyleState;
  }

  const textPropertiesMatch = styleBodyXml.match(/<style:text-properties\b([^>]*)\/?>(?:<\/style:text-properties>)?/iu);
  if (!textPropertiesMatch) {
    return ownStyleState;
  }

  const textPropertiesAttributes = textPropertiesMatch[1] ?? "";
  const weightCandidates = [
    readXmlAttributeValue(textPropertiesAttributes, "fo:font-weight"),
    readXmlAttributeValue(textPropertiesAttributes, "style:font-weight-asian"),
    readXmlAttributeValue(textPropertiesAttributes, "style:font-weight-complex"),
  ];
  for (const weightCandidate of weightCandidates) {
    const weightAsBold = parseWeightAsBold(weightCandidate);
    if (typeof weightAsBold === "boolean") {
      ownStyleState.bold = weightAsBold;
      break;
    }
  }

  const italicCandidates = [
    readXmlAttributeValue(textPropertiesAttributes, "fo:font-style"),
    readXmlAttributeValue(textPropertiesAttributes, "style:font-style-asian"),
    readXmlAttributeValue(textPropertiesAttributes, "style:font-style-complex"),
  ];
  for (const italicCandidate of italicCandidates) {
    const styleAsItalic = parseStyleAsItalic(italicCandidate);
    if (typeof styleAsItalic === "boolean") {
      ownStyleState.italic = styleAsItalic;
      break;
    }
  }

  const underlineCandidates = [
    readXmlAttributeValue(textPropertiesAttributes, "style:text-underline-style"),
    readXmlAttributeValue(textPropertiesAttributes, "style:text-underline-type"),
  ];
  for (const underlineCandidate of underlineCandidates) {
    const underlineEnabled = parseUnderlineAsEnabled(underlineCandidate);
    if (typeof underlineEnabled === "boolean") {
      ownStyleState.underline = underlineEnabled;
      break;
    }
  }

  return ownStyleState;
}

function extractOdfOwnParagraphCentered(styleBodyXml) {
  if (typeof styleBodyXml !== "string" || styleBodyXml.length === 0) {
    return null;
  }

  const paragraphPropertiesMatch = styleBodyXml.match(
    /<style:paragraph-properties\b([^>]*)\/?>(?:<\/style:paragraph-properties>)?/iu,
  );
  if (!paragraphPropertiesMatch) {
    return null;
  }

  const paragraphPropertiesAttributes = paragraphPropertiesMatch[1] ?? "";
  return parseParagraphAlignmentAsCentered(
    readXmlAttributeValue(paragraphPropertiesAttributes, "fo:text-align"),
  );
}

function resolveOdfStyleState(styleName, definitionsByName, cacheByName, resolvingNames) {
  if (cacheByName.has(styleName)) {
    return cacheByName.get(styleName);
  }

  if (resolvingNames.has(styleName)) {
    return { bold: null, italic: null, underline: null, paragraphCentered: null };
  }

  resolvingNames.add(styleName);

  const definition = definitionsByName.get(styleName);
  let resolvedStyleState = {
    bold: null,
    italic: null,
    underline: null,
    paragraphCentered: null,
  };

  if (definition?.parentStyleName && definitionsByName.has(definition.parentStyleName)) {
    const parentStyleState = resolveOdfStyleState(
      definition.parentStyleName,
      definitionsByName,
      cacheByName,
      resolvingNames,
    );
    resolvedStyleState = {
      bold: typeof parentStyleState.bold === "boolean" ? parentStyleState.bold : null,
      italic: typeof parentStyleState.italic === "boolean" ? parentStyleState.italic : null,
      underline:
        typeof parentStyleState.underline === "boolean" ? parentStyleState.underline : null,
      paragraphCentered:
        typeof parentStyleState.paragraphCentered === "boolean"
          ? parentStyleState.paragraphCentered
          : null,
    };
  }

  if (definition?.ownStyleState) {
    if (typeof definition.ownStyleState.bold === "boolean") {
      resolvedStyleState.bold = definition.ownStyleState.bold;
    }
    if (typeof definition.ownStyleState.italic === "boolean") {
      resolvedStyleState.italic = definition.ownStyleState.italic;
    }
    if (typeof definition.ownStyleState.underline === "boolean") {
      resolvedStyleState.underline = definition.ownStyleState.underline;
    }
  }

  if (typeof definition?.ownParagraphCentered === "boolean") {
    resolvedStyleState.paragraphCentered = definition.ownParagraphCentered;
  }

  resolvingNames.delete(styleName);
  cacheByName.set(styleName, resolvedStyleState);
  return resolvedStyleState;
}

function buildOdfStyleStateMap(xmlContent) {
  const definitionsByName = new Map();
  const cacheByName = new Map();

  const styleMatcher = /<style:style\b([^>]*)>([\s\S]*?)<\/style:style>/giu;
  let styleMatch;
  while ((styleMatch = styleMatcher.exec(xmlContent)) !== null) {
    const styleAttributes = styleMatch[1] ?? "";
    const styleBody = styleMatch[2] ?? "";
    const styleName = readXmlAttributeValue(styleAttributes, "style:name");
    if (!styleName) {
      continue;
    }

    definitionsByName.set(styleName, {
      parentStyleName: readXmlAttributeValue(styleAttributes, "style:parent-style-name"),
      ownStyleState: extractOdfOwnStyleState(styleBody),
      ownParagraphCentered: extractOdfOwnParagraphCentered(styleBody),
    });
  }

  definitionsByName.forEach((_definition, styleName) => {
    resolveOdfStyleState(styleName, definitionsByName, cacheByName, new Set());
  });

  return cacheByName;
}

function extractOdfTextFromXml(xmlContent) {
  if (typeof xmlContent !== "string" || xmlContent.length === 0) {
    return "";
  }

  const bodyMatch = xmlContent.match(/<office:body\b[\s\S]*<\/office:body>/iu);
  const bodyXml = bodyMatch ? bodyMatch[0] : xmlContent;
  const styleStateByName = buildOdfStyleStateMap(xmlContent);
  const openSpanStack = [];
  const paragraphCenteredStack = [];
  let currentStyleState = { bold: false, italic: false, underline: false };
  const isCurrentParagraphCentered = () =>
    paragraphCenteredStack.length > 0 && paragraphCenteredStack[paragraphCenteredStack.length - 1] === true;

  let output = "";
  const tokenMatcher = /<[^>]+>|[^<]+/gu;
  let tokenMatch;
  while ((tokenMatch = tokenMatcher.exec(bodyXml)) !== null) {
    const token = tokenMatch[0];

    if (token.startsWith("<")) {
      if (/^<text:tab\b[^/>]*\/>/iu.test(token)) {
        output += "\t";
        continue;
      }

      if (/^<text:line-break\b[^/>]*\/>/iu.test(token)) {
        output += "\n";
        if (isCurrentParagraphCentered()) {
          output += IMPORT_CENTERED_LINE_MARKER;
        }
        continue;
      }

      if (/^<text:s\b[^/>]*\/>/iu.test(token)) {
        const spacesCountRaw = readXmlAttributeValue(token, "text:c");
        const spacesCount = Number.parseInt(spacesCountRaw ?? "1", 10);
        output += " ".repeat(Number.isInteger(spacesCount) && spacesCount > 0 ? spacesCount : 1);
        continue;
      }

      if (/^<text:(?:h|p)\b/iu.test(token)) {
        if (/\/>\s*$/u.test(token)) {
          output += "\n";
          continue;
        }

        const styleName = readXmlAttributeValue(token, "text:style-name");
        const paragraphCentered =
          styleName && styleStateByName.get(styleName)?.paragraphCentered === true;
        paragraphCenteredStack.push(paragraphCentered);
        if (paragraphCentered) {
          output += IMPORT_CENTERED_LINE_MARKER;
        }
        continue;
      }

      if (/^<\/text:(?:h|p)\b/iu.test(token)) {
        if (paragraphCenteredStack.length > 0) {
          paragraphCenteredStack.pop();
        }
        output += "\n";
        continue;
      }

      if (/^<\/text:list-item\b/iu.test(token) || /^<\/table:table-row\b/iu.test(token)) {
        output += "\n";
        continue;
      }

      if (/^<text:span\b/iu.test(token)) {
        if (/\/>\s*$/u.test(token)) {
          continue;
        }

        const parentStyleState = cloneInlineStyleState(currentStyleState);
        const styleName = readXmlAttributeValue(token, "text:style-name");
        const declaredStyleState = styleName
          ? cloneOptionalInlineStyleState(styleStateByName.get(styleName) ?? {})
          : { bold: null, italic: null, underline: null };
        const effectiveStyleState = {
          bold:
            typeof declaredStyleState.bold === "boolean"
              ? declaredStyleState.bold
              : parentStyleState.bold,
          italic:
            typeof declaredStyleState.italic === "boolean"
              ? declaredStyleState.italic
              : parentStyleState.italic,
          underline:
            typeof declaredStyleState.underline === "boolean"
              ? declaredStyleState.underline
              : parentStyleState.underline,
        };

        const enterTransition = buildInlineStyleTransitionTags(
          parentStyleState,
          effectiveStyleState,
        );
        const leaveTransition = buildInlineStyleTransitionTags(
          effectiveStyleState,
          parentStyleState,
        );

        output += `${enterTransition.closeTags}${enterTransition.openTags}`;
        openSpanStack.push({
          returnTags: `${leaveTransition.closeTags}${leaveTransition.openTags}`,
          parentStyleState,
        });
        currentStyleState = effectiveStyleState;
        continue;
      }

      if (/^<\/text:span\b/iu.test(token)) {
        const closedSpan = openSpanStack.pop();
        if (closedSpan) {
          output += closedSpan.returnTags;
          currentStyleState = closedSpan.parentStyleState;
        }
      }

      continue;
    }

    output += decodeXmlEntities(token);
  }

  while (openSpanStack.length > 0) {
    const closedSpan = openSpanStack.pop();
    output += closedSpan.returnTags;
    currentStyleState = closedSpan.parentStyleState;
  }

  return output;
}

async function extractTextFromDocxFile(filePath) {
  const archiveBuffer = await fs.readFile(filePath);
  let archive;

  try {
    archive = await JSZip.loadAsync(archiveBuffer);
  } catch {
    throw new Error("Le fichier DOCX est corrompu ou non supporte.");
  }

  const documentEntry = archive.file("word/document.xml");
  if (!documentEntry) {
    throw new Error("Le fichier DOCX ne contient pas de contenu lisible.");
  }

  let paragraphCenterByStyleId = new Map();
  const stylesEntry = archive.file("word/styles.xml");
  if (stylesEntry) {
    const stylesXmlContent = await stylesEntry.async("string");
    paragraphCenterByStyleId = buildDocxParagraphCenterStyleMap(stylesXmlContent);
  }

  const xmlContent = await documentEntry.async("string");
  return extractDocxTextFromXml(xmlContent, paragraphCenterByStyleId);
}

async function extractTextFromOdfFile(filePath) {
  const archiveBuffer = await fs.readFile(filePath);
  let archive;

  try {
    archive = await JSZip.loadAsync(archiveBuffer);
  } catch {
    throw new Error("Le fichier ODF/ODT est corrompu ou non supporte.");
  }

  const contentEntry = archive.file("content.xml");
  if (!contentEntry) {
    throw new Error("Le fichier ODF/ODT ne contient pas content.xml.");
  }

  const xmlContent = await contentEntry.async("string");
  return extractOdfTextFromXml(xmlContent);
}

async function extractTextFromDocFile(filePath) {
  const extractor = new WordExtractor();
  const extractedDocument = await extractor.extract(filePath);
  if (!extractedDocument || typeof extractedDocument.getBody !== "function") {
    throw new Error("Le fichier DOC ne peut pas etre analyse.");
  }

  return extractedDocument.getBody();
}

async function extractTextFromPdfFile(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const parser = new pdfParse.PDFParse({ data: fileBuffer });

  try {
    const parsedPdf = await parser.getText();
    if (!parsedPdf || typeof parsedPdf.text !== "string") {
      throw new Error("Le fichier PDF ne contient pas de texte extractible.");
    }

    return parsedPdf.text;
  } finally {
    if (typeof parser.destroy === "function") {
      await parser.destroy();
    }
  }
}

async function extractTextFromRtfFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return extractRtfTextFromContent(content);
}

async function extractTextFromExternalDocument(filePath) {
  const extension = getFileExtension(filePath);

  switch (extension) {
    case ".doc":
      return extractTextFromDocFile(filePath);
    case ".docx":
      return extractTextFromDocxFile(filePath);
    case ".odf":
    case ".odt":
      return extractTextFromOdfFile(filePath);
    case ".pdf":
      return extractTextFromPdfFile(filePath);
    case ".txt":
    case ".md":
    case ".markdown":
      return fs.readFile(filePath, "utf8");
    case ".rtf":
      return extractTextFromRtfFile(filePath);
    default:
      throw new TypeError("Le format de fichier selectionne n'est pas supporte.");
  }
}

function buildPagesFromLines(lines, linesPerPage) {
  const safeLines = Array.isArray(lines) && lines.length > 0 ? lines : [""];
  const pages = [];

  for (let lineIndex = 0; lineIndex < safeLines.length; lineIndex += linesPerPage) {
    const page = safeLines.slice(lineIndex, lineIndex + linesPerPage);
    while (page.length < linesPerPage) {
      page.push("");
    }
    pages.push(page);
  }

  return pages;
}

function buildImportedDocumentFromText(inputText, importOptions) {
  const normalizedText = normalizeExtractedText(inputText);
  const centeredText = applyImportedCenterMarkers(
    normalizedText,
    importOptions.charactersPerLine,
  );
  if (centeredText.length === 0) {
    throw new Error("Le fichier ne contient pas de texte exploitable.");
  }

  const lines = centeredText.split("\n");
  const pages = buildPagesFromLines(lines, importOptions.linesPerPage);
  const now = new Date().toISOString();

  return {
    format: GBS_DOCUMENT_FORMAT,
    formatVersion: GBS_DOCUMENT_FORMAT_VERSION,
    appName: "Galarneau Braille Suite",
    documentType: DOCUMENT_TYPE_NORMAL,
    createdAt: now,
    updatedAt: now,
    defaultDirection: "text-to-braille",
    inputMode: INPUT_MODE_TEXT,
    realtimeTranslationEnabled: true,
    showSpaceMarkersEnabled: false,
    documentConfig: {
      table: importOptions.table,
      tableLabel: importOptions.tableLabel,
      linesPerPage: importOptions.linesPerPage,
      charactersPerLine: importOptions.charactersPerLine,
      pageLayout: normalizePageLayoutConfig(importOptions.pageLayout),
    },
    pages,
  };
}

function normalizeDocument(documentPayload, options = {}) {
  ensureObject(documentPayload, "Le document est invalide.");

  if (documentPayload.format !== GBS_DOCUMENT_FORMAT) {
    throw new TypeError("Le format du document est invalide.");
  }

  const formatVersion = documentPayload.formatVersion;
  const isCurrentFormat = formatVersion === GBS_DOCUMENT_FORMAT_VERSION;
  const isLegacyFormat = formatVersion === LEGACY_GBS_DOCUMENT_FORMAT_VERSION;
  if (!isCurrentFormat && !isLegacyFormat) {
    throw new TypeError("La version du format de document n'est pas supportee.");
  }

  ensureObject(
    documentPayload.documentConfig,
    "La configuration initiale du document est invalide.",
  );

  const table = documentPayload.documentConfig.table;
  ensureString(table, "La table braille du document est invalide.");

  const tableLabel =
    typeof documentPayload.documentConfig.tableLabel === "string"
      ? documentPayload.documentConfig.tableLabel
      : "";

  const linesPerPage = documentPayload.documentConfig.linesPerPage;
  const charactersPerLine = documentPayload.documentConfig.charactersPerLine;
  ensureBoundedInteger(linesPerPage, "Nombre de lignes par page", 1, 60);
  ensureBoundedInteger(charactersPerLine, "Nombre de caracteres par ligne", 1, 120);
  const pageLayout = normalizePageLayoutConfig(documentPayload.documentConfig.pageLayout);

  const fallbackDocumentType = normalizeDocumentType(options.fallbackDocumentType);
  const documentType = isCurrentFormat
    ? normalizeDocumentType(documentPayload.documentType)
    : fallbackDocumentType;
  const validatePageLength = documentType === DOCUMENT_TYPE_BRAILLE;
  const validateLineLength = documentType === DOCUMENT_TYPE_BRAILLE;

  if (!Array.isArray(documentPayload.pages) || documentPayload.pages.length === 0) {
    throw new TypeError("Le document doit contenir au moins une page.");
  }

  const normalizedPages = documentPayload.pages.map((page, pageIndex) => {
    if (!Array.isArray(page)) {
      throw new TypeError(`La page ${pageIndex + 1} du document est invalide.`);
    }

    if (validatePageLength && page.length !== linesPerPage) {
      throw new RangeError(
        `La page ${pageIndex + 1} doit contenir exactement ${linesPerPage} lignes.`,
      );
    }

    if (!validatePageLength && page.length === 0) {
      throw new RangeError(`La page ${pageIndex + 1} doit contenir au moins une ligne.`);
    }

    return page.map((line, lineIndex) => {
      if (typeof line !== "string") {
        throw new TypeError(
          `La ligne ${lineIndex + 1} de la page ${pageIndex + 1} est invalide.`,
        );
      }

      if (validateLineLength && line.length > charactersPerLine) {
        throw new RangeError(
          `La ligne ${lineIndex + 1} de la page ${pageIndex + 1} depasse ` +
            `${charactersPerLine} caracteres.`,
        );
      }

      return line;
    });
  });

  const createdAt =
    typeof documentPayload.createdAt === "string"
      ? documentPayload.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof documentPayload.updatedAt === "string"
      ? documentPayload.updatedAt
      : createdAt;
  const appName =
    typeof documentPayload.appName === "string"
      ? documentPayload.appName
      : "Galarneau Braille Suite";
  const defaultDirection = SUPPORTED_DIRECTIONS.has(documentPayload.defaultDirection)
    ? documentPayload.defaultDirection
    : "text-to-braille";
  const inputMode = SUPPORTED_INPUT_MODES.has(documentPayload.inputMode)
    ? documentPayload.inputMode === LEGACY_INPUT_MODE_BRAILLE
      ? INPUT_MODE_BRAILLE
      : documentPayload.inputMode
    : INPUT_MODE_TEXT;
  const realtimeTranslationEnabled = documentPayload.realtimeTranslationEnabled !== false;
  const showSpaceMarkersEnabled = documentPayload.showSpaceMarkersEnabled === true;

  return {
    format: GBS_DOCUMENT_FORMAT,
    formatVersion: GBS_DOCUMENT_FORMAT_VERSION,
    appName,
    documentType,
    createdAt,
    updatedAt,
    defaultDirection,
    inputMode,
    realtimeTranslationEnabled,
    showSpaceMarkersEnabled,
    documentConfig: {
      table,
      tableLabel,
      linesPerPage,
      charactersPerLine,
      pageLayout,
    },
    pages: normalizedPages,
  };
}

function ensureSavePayload(payload) {
  ensureObject(payload, "La requete d'enregistrement est invalide.");
  ensureObject(payload.document, "Le contenu du document a enregistrer est invalide.");

  if (payload.filePath !== undefined && payload.filePath !== null) {
    ensureString(payload.filePath, "Le chemin de fichier fourni est invalide.");
  }
}

function buildSaveDialogOptions(documentType) {
  const normalizedType = normalizeDocumentType(documentType);
  const isBraille = normalizedType === DOCUMENT_TYPE_BRAILLE;
  return {
    title: "Enregistrer le document Galarneau Braille Suite",
    defaultPath: `document${getExtensionForType(normalizedType)}`,
    filters: [
      {
        name: isBraille ? "Document braille Galarneau (.gnb)" : "Document normal Galarneau (.gnp)",
        extensions: [isBraille ? "gnb" : "gnp"],
      },
    ],
    showOverwriteConfirmation: true,
    createDirectory: true,
  };
}

async function saveDocument(payload, browserWindow) {
  ensureSavePayload(payload);
  const fallbackType =
    payload.filePath && typeof payload.filePath === "string"
      ? inferDocumentTypeFromPath(payload.filePath)
      : DOCUMENT_TYPE_NORMAL;
  const normalizedDocument = normalizeDocument(payload.document, {
    fallbackDocumentType: fallbackType,
  });

  let targetPath = payload.filePath ?? null;
  if (targetPath === null) {
    const saveOptions = buildSaveDialogOptions(normalizedDocument.documentType);
    const dialogResult = browserWindow
      ? await dialog.showSaveDialog(browserWindow, saveOptions)
      : await dialog.showSaveDialog(saveOptions);

    if (dialogResult.canceled || !dialogResult.filePath) {
      return { canceled: true };
    }

    targetPath = dialogResult.filePath;
  }

  ensureString(targetPath, "Le chemin du document est invalide.");
  const normalizedPath = ensureDocumentExtension(targetPath, normalizedDocument.documentType);
  const serializedDocument = `${JSON.stringify(normalizedDocument, null, 2)}\n`;
  await fs.writeFile(normalizedPath, serializedDocument, "utf8");

  return {
    canceled: false,
    filePath: normalizedPath,
  };
}

async function openDocument(payload, browserWindow) {
  const openOptions = {
    title: "Ouvrir un document Galarneau Braille Suite",
    filters: [
      {
        name: "Tous les formats supportes",
        extensions: [
          "gnp",
          "gnb",
          "gbs",
          "doc",
          "docx",
          "odf",
          "odt",
          "pdf",
          "rtf",
          "txt",
          "md",
          "markdown",
        ],
      },
      { name: "Document normal Galarneau", extensions: ["gnp"] },
      { name: "Document braille Galarneau", extensions: ["gnb"] },
      { name: "Document Galarneau legacy", extensions: ["gbs"] },
      { name: "Documents bureautiques", extensions: ["doc", "docx", "odf", "odt", "pdf", "rtf"] },
      { name: "Documents texte", extensions: ["txt", "md", "markdown"] },
    ],
    properties: ["openFile"],
  };
  const dialogResult = browserWindow
    ? await dialog.showOpenDialog(browserWindow, openOptions)
    : await dialog.showOpenDialog(openOptions);

  if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
    return { canceled: true };
  }

  const selectedPath = dialogResult.filePaths[0];
  ensureString(selectedPath, "Le chemin du fichier selectionne est invalide.");
  const selectedExtension = getFileExtension(selectedPath);

  if (!hasSupportedDocumentExtension(selectedPath)) {
    throw new TypeError(
      "Le fichier selectionne doit etre un .gnp, .gnb, .gbs, .doc, .docx, .odf, .odt, .pdf, .rtf, .txt, .md ou .markdown.",
    );
  }

  if (!isInternalDocumentExtension(selectedPath)) {
    const importOptions = normalizeImportOptions(payload);
    const extractedText = await extractTextFromExternalDocument(selectedPath);
    const importedDocumentPayload = buildImportedDocumentFromText(extractedText, importOptions);
    const importedDocument = normalizeDocument(importedDocumentPayload, {
      fallbackDocumentType: DOCUMENT_TYPE_NORMAL,
    });
    const warning =
      selectedExtension === ".doc"
        ? "Import .doc: la recuperation du gras/italique/soulignement depend des donnees disponibles dans ce format legacy."
        : null;

    return {
      canceled: false,
      filePath: selectedPath,
      imported: true,
      warning,
      document: importedDocument,
    };
  }

  const content = await fs.readFile(selectedPath, "utf8");
  let parsedDocument;

  try {
    parsedDocument = JSON.parse(content);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Le document est illisible: ${reason}`);
  }

  const inferredDocumentType = inferDocumentTypeFromPath(selectedPath);
  const normalizedDocument = normalizeDocument(parsedDocument, {
    fallbackDocumentType: inferredDocumentType,
  });
  if (selectedExtension !== LEGACY_GBS_EXTENSION) {
    const expectedExtension = getExtensionForType(normalizedDocument.documentType);
    if (selectedExtension !== expectedExtension) {
      throw new TypeError(
        `Le type du document ne correspond pas a l'extension attendue (${expectedExtension}).`,
      );
    }
  }

  return {
    canceled: false,
    filePath: selectedPath,
    imported: false,
    document: normalizedDocument,
  };
}

module.exports = {
  saveDocument,
  openDocument,
  GBS_DOCUMENT_FORMAT,
  GBS_DOCUMENT_FORMAT_VERSION,
};
