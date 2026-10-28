const fs = require("node:fs/promises");
const path = require("node:path");
const { dialog } = require("electron");

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
    extension === DOCUMENT_EXTENSION_BY_TYPE[DOCUMENT_TYPE_NORMAL] ||
    extension === DOCUMENT_EXTENSION_BY_TYPE[DOCUMENT_TYPE_BRAILLE] ||
    extension === LEGACY_GBS_EXTENSION
  );
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

  if (!Array.isArray(documentPayload.pages) || documentPayload.pages.length === 0) {
    throw new TypeError("Le document doit contenir au moins une page.");
  }

  const normalizedPages = documentPayload.pages.map((page, pageIndex) => {
    if (!Array.isArray(page)) {
      throw new TypeError(`La page ${pageIndex + 1} du document est invalide.`);
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

  const fallbackDocumentType = normalizeDocumentType(options.fallbackDocumentType);
  const documentType = isCurrentFormat
    ? normalizeDocumentType(documentPayload.documentType)
    : fallbackDocumentType;

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

async function openDocument(browserWindow) {
  const openOptions = {
    title: "Ouvrir un document Galarneau Braille Suite",
    filters: [
      { name: "Document normal Galarneau", extensions: ["gnp"] },
      { name: "Document braille Galarneau", extensions: ["gnb"] },
      { name: "Document Galarneau legacy", extensions: ["gbs"] },
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
    throw new TypeError("Le fichier selectionne doit etre un .gnp, .gnb ou .gbs.");
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
    document: normalizedDocument,
  };
}

module.exports = {
  saveDocument,
  openDocument,
  GBS_DOCUMENT_FORMAT,
  GBS_DOCUMENT_FORMAT_VERSION,
};
