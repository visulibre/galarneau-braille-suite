const fs = require("node:fs/promises");
const path = require("node:path");
const { dialog } = require("electron");

const GBS_DOCUMENT_FORMAT = "galarneau-braille-suite-document";
const GBS_DOCUMENT_FORMAT_VERSION = 1;
const GBS_EXTENSION = ".gbs";
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
    throw new TypeError(`${label}: la valeur doit être un entier.`);
  }

  if (value < min || value > max) {
    throw new RangeError(`${label}: la valeur doit être entre ${min} et ${max}.`);
  }
}

function ensureString(value, message) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(message);
  }
}

function hasGbsExtension(filePath) {
  return path.extname(filePath).toLowerCase() === GBS_EXTENSION;
}

function ensureGbsExtension(filePath) {
  if (hasGbsExtension(filePath)) {
    return filePath;
  }

  return `${filePath}${GBS_EXTENSION}`;
}

function normalizeDocument(documentPayload) {
  ensureObject(documentPayload, "Le document .gbs est invalide.");

  if (documentPayload.format !== GBS_DOCUMENT_FORMAT) {
    throw new TypeError("Le format du document .gbs est invalide.");
  }

  if (documentPayload.formatVersion !== GBS_DOCUMENT_FORMAT_VERSION) {
    throw new TypeError("La version du format .gbs n'est pas supportée.");
  }

  ensureObject(
    documentPayload.documentConfig,
    "La configuration initiale du document .gbs est invalide.",
  );

  const table = documentPayload.documentConfig.table;
  ensureString(table, "La table braille du document .gbs est invalide.");

  const tableLabel =
    typeof documentPayload.documentConfig.tableLabel === "string"
      ? documentPayload.documentConfig.tableLabel
      : "";

  const linesPerPage = documentPayload.documentConfig.linesPerPage;
  const charactersPerLine = documentPayload.documentConfig.charactersPerLine;
  ensureBoundedInteger(linesPerPage, "Nombre de lignes par page", 1, 60);
  ensureBoundedInteger(charactersPerLine, "Nombre de caractères par ligne", 1, 120);

  if (!Array.isArray(documentPayload.pages) || documentPayload.pages.length === 0) {
    throw new TypeError("Le document .gbs doit contenir au moins une page.");
  }

  const normalizedPages = documentPayload.pages.map((page, pageIndex) => {
    if (!Array.isArray(page)) {
      throw new TypeError(`La page ${pageIndex + 1} du document .gbs est invalide.`);
    }

    if (page.length !== linesPerPage) {
      throw new RangeError(
        `La page ${pageIndex + 1} doit contenir exactement ${linesPerPage} lignes.`,
      );
    }

    return page.map((line, lineIndex) => {
      if (typeof line !== "string") {
        throw new TypeError(
          `La ligne ${lineIndex + 1} de la page ${pageIndex + 1} est invalide.`,
        );
      }

      if (line.length > charactersPerLine) {
        throw new RangeError(
          `La ligne ${lineIndex + 1} de la page ${pageIndex + 1} dépasse ` +
            `${charactersPerLine} caractères.`,
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
  ensureObject(payload, "La requête d'enregistrement est invalide.");
  ensureObject(payload.document, "Le contenu du document à enregistrer est invalide.");

  if (payload.filePath !== undefined && payload.filePath !== null) {
    ensureString(payload.filePath, "Le chemin de fichier fourni est invalide.");
  }
}

async function saveDocument(payload, browserWindow) {
  ensureSavePayload(payload);
  const normalizedDocument = normalizeDocument(payload.document);

  let targetPath = payload.filePath ?? null;
  if (targetPath === null) {
    const saveOptions = {
      title: "Enregistrer le document Galarneau Braille Suite",
      defaultPath: "document.gbs",
      filters: [{ name: "Document Galarneau Braille Suite", extensions: ["gbs"] }],
      showOverwriteConfirmation: true,
      createDirectory: true,
    };
    const dialogResult = browserWindow
      ? await dialog.showSaveDialog(browserWindow, saveOptions)
      : await dialog.showSaveDialog(saveOptions);

    if (dialogResult.canceled || !dialogResult.filePath) {
      return { canceled: true };
    }

    targetPath = dialogResult.filePath;
  }

  ensureString(targetPath, "Le chemin du document .gbs est invalide.");
  const normalizedPath = ensureGbsExtension(targetPath);
  const serializedDocument = `${JSON.stringify(normalizedDocument, null, 2)}\n`;
  await fs.writeFile(normalizedPath, serializedDocument, "utf8");

  return {
    canceled: false,
    filePath: normalizedPath,
  };
}

async function openDocument(browserWindow) {
  const openOptions = {
    title: "Ouvrir un document Galarneau Braille Suite",
    filters: [{ name: "Document Galarneau Braille Suite", extensions: ["gbs"] }],
    properties: ["openFile"],
  };
  const dialogResult = browserWindow
    ? await dialog.showOpenDialog(browserWindow, openOptions)
    : await dialog.showOpenDialog(openOptions);

  if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
    return { canceled: true };
  }

  const selectedPath = dialogResult.filePaths[0];
  ensureString(selectedPath, "Le chemin du fichier sélectionné est invalide.");

  if (!hasGbsExtension(selectedPath)) {
    throw new TypeError("Le fichier sélectionné doit avoir l'extension .gbs.");
  }

  const content = await fs.readFile(selectedPath, "utf8");
  let parsedDocument;

  try {
    parsedDocument = JSON.parse(content);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Le document .gbs est illisible: ${reason}`);
  }

  const normalizedDocument = normalizeDocument(parsedDocument);
  return {
    canceled: false,
    filePath: selectedPath,
    document: normalizedDocument,
  };
}

module.exports = {
  saveDocument,
  openDocument,
  GBS_DOCUMENT_FORMAT,
  GBS_DOCUMENT_FORMAT_VERSION,
};
