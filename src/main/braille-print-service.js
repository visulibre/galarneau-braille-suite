const { spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { dialog } = require("electron");

const BRF_DOT_MASKS = Object.freeze({
  " ": 0,
  A: 1,
  B: 3,
  C: 9,
  D: 25,
  E: 17,
  F: 11,
  G: 27,
  H: 19,
  I: 10,
  J: 26,
  K: 5,
  L: 7,
  M: 13,
  N: 29,
  O: 21,
  P: 15,
  Q: 31,
  R: 23,
  S: 14,
  T: 30,
  U: 37,
  V: 39,
  W: 58,
  X: 45,
  Y: 61,
  Z: 53,
  0: 52,
  1: 2,
  2: 6,
  3: 18,
  4: 50,
  5: 34,
  6: 22,
  7: 54,
  8: 38,
  9: 20,
  "'": 4,
  "@": 8,
  '"': 16,
  ",": 32,
  "*": 33,
  "/": 12,
  "-": 36,
  "^": 24,
  ".": 40,
  ";": 48,
  "<": 35,
  "%": 41,
  ":": 49,
  "[": 42,
  ">": 28,
  "+": 44,
  _: 56,
  $: 43,
  "\\": 51,
  "?": 57,
  "!": 46,
  "#": 60,
  "&": 47,
  "(": 55,
  "]": 59,
  ")": 62,
  "=": 63,
});
const BRF_CHARACTER_BY_DOT_MASK = new Map(
  Object.entries(BRF_DOT_MASKS).map(([character, dotMask]) => [dotMask, character]),
);

function convertCellToBrf(character, pageNumber, lineNumber, columnNumber) {
  const codePoint = character.codePointAt(0);
  if (codePoint >= 0x2800 && codePoint <= 0x28ff) {
    const dotMask = codePoint - 0x2800;
    if ((dotMask & 0xc0) !== 0) {
      throw new TypeError(
        `La cellule à la page ${pageNumber}, ligne ${lineNumber}, ` +
          `colonne ${columnNumber} utilise le point 7 ou 8, absent du BRF standard à six points.`,
      );
    }

    const brfCharacter = BRF_CHARACTER_BY_DOT_MASK.get(dotMask);
    if (typeof brfCharacter !== "string") {
      throw new TypeError(
        `La cellule à la page ${pageNumber}, ligne ${lineNumber}, ` +
          `colonne ${columnNumber} n'a pas d'équivalent BRF.`,
      );
    }
    return brfCharacter;
  }

  if (Object.hasOwn(BRF_DOT_MASKS, character)) {
    return character;
  }

  throw new TypeError(
    `Le caractère à la page ${pageNumber}, ligne ${lineNumber}, ` +
      `colonne ${columnNumber} n'est pas représentable en Braille ASCII (BRF).`,
  );
}

function createBrfBuffer(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.pages)) {
    throw new TypeError("Le contenu braille à envoyer est invalide.");
  }
  if (payload.pages.length === 0) {
    throw new TypeError("Le document braille ne contient aucune page à envoyer.");
  }

  const pageTexts = payload.pages.map((page, pageIndex) => {
    if (!Array.isArray(page)) {
      throw new TypeError(`Le contenu de la page ${pageIndex + 1} est invalide.`);
    }

    return page
      .map((line, lineIndex) => {
        if (typeof line !== "string") {
          throw new TypeError(
            `La ligne ${lineIndex + 1} de la page ${pageIndex + 1} est invalide.`,
          );
        }

        return Array.from(line, (character, columnIndex) =>
          convertCellToBrf(character, pageIndex + 1, lineIndex + 1, columnIndex + 1),
        ).join("");
      })
      .join("\r\n");
  });

  const brfBuffer = Buffer.from(pageTexts.join("\f"), "ascii");
  if (brfBuffer.length > 0xffffffff) {
    throw new RangeError("Le flux BRF dépasse la taille maximale prise en charge.");
  }
  return brfBuffer;
}

function buildBrfSaveDialogOptions(title) {
  const parsedTitle = path.parse(path.basename(title));
  const defaultName =
    parsedTitle.ext.toLowerCase() === ".brf"
      ? parsedTitle.base
      : `${parsedTitle.name || "document"}.brf`;

  return {
    title: "Exporter le document braille en BRF",
    defaultPath: defaultName,
    filters: [{ name: "Fichier Braille Ready Format (.brf)", extensions: ["brf"] }],
    showOverwriteConfirmation: true,
    createDirectory: true,
  };
}

function ensureBrfExtension(filePath) {
  const selectedExtension = path.extname(filePath);
  if (selectedExtension.toLowerCase() === ".brf") {
    return filePath;
  }
  if (selectedExtension.length === 0) {
    return `${filePath}.brf`;
  }

  return path.join(
    path.dirname(filePath),
    `${path.basename(filePath, selectedExtension)}.brf`,
  );
}

async function exportBrailleDocument(payload, parentWindow) {
  const brfBuffer = createBrfBuffer(payload);
  const title =
    typeof payload.title === "string" && payload.title.trim().length > 0
      ? payload.title.trim().replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, 200)
      : "Document braille";
  const saveOptions = buildBrfSaveDialogOptions(title);
  const dialogResult = parentWindow
    ? await dialog.showSaveDialog(parentWindow, saveOptions)
    : await dialog.showSaveDialog(saveOptions);

  if (dialogResult.canceled || !dialogResult.filePath) {
    return { canceled: true };
  }

  const filePath = ensureBrfExtension(dialogResult.filePath);

  await fs.writeFile(filePath, brfBuffer);
  return { canceled: false, filePath };
}

function loadWindowsSpooler() {
  let koffi;
  try {
    koffi = require("koffi");
  } catch (error) {
    throw new Error(
      `L'accès au spouleur Windows est indisponible: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const library = koffi.load("winspool.drv");
  const printerHandleType = koffi.pointer("void");
  const documentInfoType = koffi.struct("GBS_DOC_INFO_1", {
    pDocName: "str16",
    pOutputFile: "str16",
    pDatatype: "str16",
  });

  return {
    getDefaultPrinter: library.func(
      "__stdcall",
      "GetDefaultPrinterW",
      "int",
      ["void *", koffi.inout(koffi.pointer("uint32_t"))],
    ),
    openPrinter: library.func(
      "__stdcall",
      "OpenPrinterW",
      "int",
      ["str16", koffi.out(koffi.pointer(printerHandleType)), "void *"],
    ),
    startDocument: library.func(
      "__stdcall",
      "StartDocPrinterW",
      "uint32_t",
      ["void *", "uint32_t", koffi.pointer(documentInfoType)],
    ),
    startPage: library.func("__stdcall", "StartPagePrinter", "int", ["void *"]),
    write: library.func(
      "__stdcall",
      "WritePrinter",
      "int",
      ["void *", "void *", "uint32_t", koffi.out(koffi.pointer("uint32_t"))],
    ),
    endPage: library.func("__stdcall", "EndPagePrinter", "int", ["void *"]),
    endDocument: library.func("__stdcall", "EndDocPrinter", "int", ["void *"]),
    closePrinter: library.func("__stdcall", "ClosePrinter", "int", ["void *"]),
  };
}

function sendRawToWindowsDefaultPrinter(brfBuffer, title) {
  const spooler = loadWindowsSpooler();
  const printerNameBuffer = Buffer.alloc(1024 * 2);
  const printerNameLength = [1024];
  if (!spooler.getDefaultPrinter(printerNameBuffer, printerNameLength)) {
    throw new Error("Aucune imprimante Windows par défaut n'est configurée.");
  }

  const printerName = printerNameBuffer.toString("utf16le").split("\u0000", 1)[0];
  if (!printerName) {
    throw new Error("Le nom de l'imprimante Windows par défaut est vide.");
  }

  const printerHandle = [null];
  if (!spooler.openPrinter(printerName, printerHandle, null)) {
    throw new Error(`Impossible d'ouvrir l'imprimante par défaut « ${printerName} ».`);
  }

  const handle = printerHandle[0];
  let documentStarted = false;
  let pageStarted = false;
  let primaryError = null;
  const cleanupErrors = [];

  try {
    const jobId = spooler.startDocument(handle, 1, {
      pDocName: title,
      pOutputFile: null,
      pDatatype: "RAW",
    });
    if (jobId === 0) {
      throw new Error(`Impossible de créer un travail BRF sur « ${printerName} ».`);
    }
    documentStarted = true;

    if (!spooler.startPage(handle)) {
      throw new Error(`Impossible de commencer l'envoi BRF vers « ${printerName} ».`);
    }
    pageStarted = true;

    let offset = 0;
    while (offset < brfBuffer.length) {
      const written = [0];
      const chunk = brfBuffer.subarray(offset);
      if (!spooler.write(handle, chunk, chunk.length, written) || written[0] === 0) {
        throw new Error(`Échec d'écriture du flux BRF vers « ${printerName} ».`);
      }
      offset += written[0];
    }
  } catch (error) {
    primaryError = error;
  } finally {
    const attemptCleanup = (operation, errorMessage) => {
      try {
        if (!operation()) {
          cleanupErrors.push(errorMessage);
        }
      } catch (error) {
        cleanupErrors.push(
          `${errorMessage} ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    if (pageStarted) {
      attemptCleanup(
        () => spooler.endPage(handle),
        "Impossible de finaliser la page du travail d'impression.",
      );
    }
    if (documentStarted) {
      attemptCleanup(
        () => spooler.endDocument(handle),
        "Impossible de finaliser le travail d'impression.",
      );
    }
    attemptCleanup(
      () => spooler.closePrinter(handle),
      "Impossible de fermer la connexion à l'imprimante.",
    );
  }

  if (primaryError) {
    if (cleanupErrors.length > 0) {
      throw new Error(
        `${primaryError instanceof Error ? primaryError.message : String(primaryError)} ` +
          cleanupErrors.join(" "),
        { cause: primaryError },
      );
    }
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw new Error(cleanupErrors.join(" "));
  }
}

function sendRawToLinuxDefaultPrinter(brfBuffer, title) {
  const result = spawnSync("lp", ["-o", "raw", "-t", title], {
    input: brfBuffer,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });

  if (result.error) {
    throw new Error(
      `Impossible d'envoyer le BRF au spouleur CUPS: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    const diagnostic = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8").trim()
      : "";
    throw new Error(
      diagnostic || `CUPS a refusé le travail BRF (code ${result.status}).`,
    );
  }
}

function printBrailleDocument(payload) {
  const brfBuffer = createBrfBuffer(payload);
  const title =
    typeof payload.title === "string" && payload.title.trim().length > 0
      ? payload.title.trim().replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, 200)
      : "Document braille";

  if (process.platform === "win32") {
    sendRawToWindowsDefaultPrinter(brfBuffer, title);
  } else if (process.platform === "linux") {
    sendRawToLinuxDefaultPrinter(brfBuffer, title);
  } else {
    throw new Error("L'envoi BRF RAW est disponible uniquement sous Windows et Linux.");
  }

  return { printed: true };
}

module.exports = {
  createBrfBuffer,
  exportBrailleDocument,
  ensureBrfExtension,
  printBrailleDocument,
};
