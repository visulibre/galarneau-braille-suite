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
const DEFAULT_IMPORT_OPTIONS = Object.freeze({
  table: "fr-bfu-g2.ctb",
  tableLabel: "Francais BFU grade 2",
  linesPerPage: 25,
  charactersPerLine: 40,
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

  return {
    table,
    tableLabel,
    linesPerPage,
    charactersPerLine,
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

function extractRtfTextFromContent(rtfContent) {
  if (typeof rtfContent !== "string" || rtfContent.length === 0) {
    return "";
  }

  return rtfContent
    .replace(/\\'([0-9a-f]{2})/giu, (_match, rawHex) => decodeCp1252HexByte(rawHex))
    .replace(/\\u(-?\d+)\??/giu, (_match, rawCodePoint) =>
      decodeRtfUnicodeCodePoint(rawCodePoint),
    )
    .replace(/\\par[d]?\b/giu, "\n")
    .replace(/\\line\b/giu, "\n")
    .replace(/\\tab\b/giu, "\t")
    .replace(/\\~|\\_|\\-/gu, " ")
    .replace(/\\([{}\\])/gu, "$1")
    .replace(/\\[a-z]+-?\d*\s?/giu, "")
    .replace(/\\\*/gu, "")
    .replace(/[{}]/gu, "");
}

function extractDocxTextFromXml(xmlContent) {
  if (typeof xmlContent !== "string" || xmlContent.length === 0) {
    return "";
  }

  const rawText = xmlContent
    .replace(/<w:tab\b[^/>]*\/>/giu, "\t")
    .replace(/<w:(?:br|cr)\b[^/>]*\/>/giu, "\n")
    .replace(/<\/w:p>/giu, "\n")
    .replace(/<\/w:tr>/giu, "\n")
    .replace(/<[^>]+>/gu, "");

  return decodeXmlEntities(rawText);
}

function extractOdfTextFromXml(xmlContent) {
  if (typeof xmlContent !== "string" || xmlContent.length === 0) {
    return "";
  }

  const rawText = xmlContent
    .replace(/<text:tab\b[^/>]*\/>/giu, "\t")
    .replace(/<text:line-break\b[^/>]*\/>/giu, "\n")
    .replace(/<\/text:(?:h|p|list-item)>/giu, "\n")
    .replace(/<\/table:table-row>/giu, "\n")
    .replace(/<[^>]+>/gu, "");

  return decodeXmlEntities(rawText);
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

  const xmlContent = await documentEntry.async("string");
  return extractDocxTextFromXml(xmlContent);
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
  if (normalizedText.length === 0) {
    throw new Error("Le fichier ne contient pas de texte exploitable.");
  }

  const lines = normalizedText.split("\n");
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

    return {
      canceled: false,
      filePath: selectedPath,
      imported: true,
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
  const selectedExtension = getFileExtension(selectedPath);
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
