const BRLAPI_TTY_DEFAULT = -1;
const BRLAPI_CURSOR_HIDDEN = 0;
const STATUS_CACHE_TTL_MS = 5000;
const WRITE_FAILURE_DISABLE_MS = 5000;
const MAX_DISPLAY_TEXT_LENGTH = 4096;
const BRLAPI_LIBRARY_CANDIDATES = [
  "libbrlapi.so.0.8",
  "libbrlapi.so.0.7",
  "libbrlapi.so",
  "brlapi",
];

let cachedStatus = null;
let cachedStatusAt = 0;
let pendingWriteText = null;
let writeLoopPromise = null;
let writeFailureCount = 0;
let writesDisabledUntil = 0;
let koffiRuntime = null;
let koffiRuntimeError = null;

function isLinuxPlatform() {
  return process.platform === "linux";
}

function buildKoffiLoadError(error, contextLabel) {
  const details = error instanceof Error ? error.message : String(error);
  return new Error(
    `${contextLabel}. Installe la dépendance optionnelle koffi et la ` +
      `bibliothèque système libbrlapi (brltty). Détail: ${details}`,
  );
}

function loadBrlapiLibrary(koffi) {
  let lastLoadError = null;
  for (const candidateName of BRLAPI_LIBRARY_CANDIDATES) {
    try {
      const library = koffi.load(candidateName);
      return {
        openConnection: library.func(
          "int brlapi_openConnection(const void *settings, void *usedSettings)",
        ),
        closeConnection: library.func("int brlapi_closeConnection(void)"),
        getDisplaySize: library.func(
          "int brlapi_getDisplaySize(_Out_ unsigned int *x, _Out_ unsigned int *y)",
        ),
        enterTtyMode: library.func("int brlapi_enterTtyMode(int tty, const char *driver)"),
        leaveTtyMode: library.func("int brlapi_leaveTtyMode(void)"),
        writeText: library.func("int brlapi_writeText(int cursor, const char *text)"),
      };
    } catch (error) {
      lastLoadError = error;
    }
  }

  throw buildKoffiLoadError(lastLoadError, "Impossible de charger libbrlapi");
}

function getKoffiRuntime() {
  if (koffiRuntime) {
    return koffiRuntime;
  }

  if (koffiRuntimeError) {
    throw koffiRuntimeError;
  }

  let koffi;
  try {
    koffi = require("koffi");
  } catch (error) {
    koffiRuntimeError = buildKoffiLoadError(error, "BRLAPI JS direct indisponible");
    throw koffiRuntimeError;
  }

  try {
    koffiRuntime = {
      lib: loadBrlapiLibrary(koffi),
    };
    return koffiRuntime;
  } catch (error) {
    koffiRuntimeError = error instanceof Error ? error : new Error(String(error));
    throw koffiRuntimeError;
  }
}

function openConnection(runtime) {
  const result = runtime.lib.openConnection(null, null);
  if (result < 0) {
    throw new Error("Connexion BRLAPI refusée (brlapi_openConnection). Vérifie que brltty est actif.");
  }
}

function closeConnection(runtime) {
  try {
    runtime.lib.closeConnection();
  } catch {
    // Ignore close failures during cleanup.
  }
}

function enterTtyMode(runtime) {
  for (const ttyCandidate of [BRLAPI_TTY_DEFAULT, 0]) {
    const result = runtime.lib.enterTtyMode(ttyCandidate, null);
    if (result >= 0) {
      return;
    }
  }

  throw new Error("Impossible d'entrer en mode TTY BRLAPI (brlapi_enterTtyMode).");
}

function leaveTtyMode(runtime) {
  try {
    runtime.lib.leaveTtyMode();
  } catch {
    // Ignore leave failures during cleanup.
  }
}

function getDisplaySize(runtime) {
  const columns = [0];
  const rows = [0];
  const result = runtime.lib.getDisplaySize(columns, rows);
  if (result < 0) {
    throw new Error("Impossible de lire la taille de l'afficheur (brlapi_getDisplaySize).");
  }

  return {
    displayColumns: Math.max(0, Number(columns[0] ?? 0)),
    displayRows: Math.max(0, Number(rows[0] ?? 0)),
  };
}

function fitTextToDisplayColumns(text, displayColumns) {
  const safeColumns = Number.isInteger(displayColumns) ? Math.max(0, displayColumns) : 0;
  if (safeColumns <= 0) {
    return text;
  }

  const characters = Array.from(text);
  if (characters.length >= safeColumns) {
    return characters.slice(0, safeColumns).join("");
  }

  return `${characters.join("")}${" ".repeat(safeColumns - characters.length)}`;
}

function writeText(runtime, text) {
  const result = runtime.lib.writeText(BRLAPI_CURSOR_HIDDEN, text);
  if (result < 0) {
    throw new Error("Échec d'écriture BRLAPI (brlapi_writeText).");
  }
}

function runWithBrlapiConnection(operation) {
  const runtime = getKoffiRuntime();
  openConnection(runtime);

  try {
    return operation(runtime);
  } finally {
    closeConnection(runtime);
  }
}

function runWithBrlapiTtySession(operation) {
  return runWithBrlapiConnection((runtime) => {
    enterTtyMode(runtime);
    try {
      return operation(runtime);
    } finally {
      leaveTtyMode(runtime);
    }
  });
}

function buildUnsupportedStatus(reason) {
  return {
    supported: false,
    available: false,
    reason,
    displayColumns: 0,
    displayRows: 0,
  };
}

function sanitizeDisplayText(inputText) {
  const normalizedText = typeof inputText === "string" ? inputText : "";
  return normalizedText
    .replace(/\u0000/gu, "")
    .replace(/\r?\n/gu, " ")
    .slice(0, MAX_DISPLAY_TEXT_LENGTH);
}

function buildAvailableStatusFromSize(displaySize) {
  return {
    supported: true,
    available: true,
    reason: null,
    displayColumns: displaySize.displayColumns,
    displayRows: displaySize.displayRows,
  };
}

function buildUnavailableStatusFromError(error) {
  return {
    supported: true,
    available: false,
    reason: error instanceof Error ? error.message : String(error),
    displayColumns: 0,
    displayRows: 0,
  };
}

async function getStatus(options = {}) {
  if (!isLinuxPlatform()) {
    return buildUnsupportedStatus("BRLAPI est disponible uniquement sous Linux.");
  }

  const forceRefresh = options.forceRefresh === true;
  const now = Date.now();
  if (!forceRefresh && cachedStatus && now - cachedStatusAt < STATUS_CACHE_TTL_MS) {
    return cachedStatus;
  }

  try {
    const displaySize = runWithBrlapiConnection((runtime) => getDisplaySize(runtime));
    cachedStatus = buildAvailableStatusFromSize(displaySize);
    cachedStatusAt = now;
    return cachedStatus;
  } catch (error) {
    cachedStatus = buildUnavailableStatusFromError(error);
    cachedStatusAt = now;
    return cachedStatus;
  }
}

async function flushWriteQueue() {
  while (pendingWriteText !== null) {
    const displayText = pendingWriteText;
    pendingWriteText = null;

    try {
      const displaySize = runWithBrlapiTtySession((runtime) => {
        const size = getDisplaySize(runtime);
        const fittedText = fitTextToDisplayColumns(displayText, size.displayColumns);
        writeText(runtime, fittedText);
        return size;
      });

      cachedStatus = buildAvailableStatusFromSize(displaySize);
      cachedStatusAt = Date.now();
      writeFailureCount = 0;
      writesDisabledUntil = 0;
    } catch (error) {
      writeFailureCount += 1;
      cachedStatus = buildUnavailableStatusFromError(error);
      cachedStatusAt = Date.now();

      if (writeFailureCount >= 3) {
        writesDisabledUntil = Date.now() + WRITE_FAILURE_DISABLE_MS;
      }

      pendingWriteText = null;
      break;
    }
  }
}

async function writeDisplay(payload) {
  if (!isLinuxPlatform()) {
    return {
      supported: false,
      available: false,
      queued: false,
      reason: "BRLAPI est disponible uniquement sous Linux.",
    };
  }

  const now = Date.now();
  if (now < writesDisabledUntil) {
    return {
      supported: true,
      available: false,
      queued: false,
      reason: "Sortie BRLAPI temporairement désactivée après erreurs répétées.",
    };
  }

  pendingWriteText = sanitizeDisplayText(payload?.text);

  if (!writeLoopPromise) {
    writeLoopPromise = flushWriteQueue().finally(() => {
      writeLoopPromise = null;
    });
  }

  return {
    supported: true,
    available: cachedStatus?.available !== false,
    queued: true,
  };
}

async function clearDisplay() {
  if (!isLinuxPlatform()) {
    return {
      supported: false,
      available: false,
      cleared: false,
      reason: "BRLAPI est disponible uniquement sous Linux.",
    };
  }

  pendingWriteText = null;

  try {
    const displaySize = runWithBrlapiTtySession((runtime) => {
      const size = getDisplaySize(runtime);
      const clearText = " ".repeat(Math.max(1, size.displayColumns));
      writeText(runtime, clearText);
      return size;
    });

    cachedStatus = buildAvailableStatusFromSize(displaySize);
    cachedStatusAt = Date.now();
    writeFailureCount = 0;
    writesDisabledUntil = 0;
    return {
      supported: true,
      available: true,
      cleared: true,
    };
  } catch (error) {
    cachedStatus = buildUnavailableStatusFromError(error);
    cachedStatusAt = Date.now();
    return {
      supported: true,
      available: false,
      cleared: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

module.exports = {
  getStatus,
  writeDisplay,
  clearDisplay,
};
