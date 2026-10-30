const path = require("node:path");

const STATUS_CACHE_TTL_MS = 5000;
const WRITE_FAILURE_DISABLE_MS = 5000;
const MAX_DISPLAY_TEXT_LENGTH = 4096;

let cachedStatus = null;
let cachedStatusAt = 0;
let pendingWriteText = null;
let writeLoopPromise = null;
let writeFailureCount = 0;
let writesDisabledUntil = 0;
let koffiRuntime = null;
let koffiRuntimeError = null;

function isWindowsPlatform() {
  return process.platform === "win32";
}

function buildKoffiLoadError(error, contextLabel) {
  const details = error instanceof Error ? error.message : String(error);
  return new Error(
    `${contextLabel}. Installe la dependance optionnelle koffi et la ` +
      `DLL NVDA Controller Client. Detail: ${details}`,
  );
}

function buildNvdaDllCandidates() {
  const candidates = [];

  const envOverride = process.env.NVDA_CONTROLLER_CLIENT_DLL;
  if (typeof envOverride === "string" && envOverride.trim().length > 0) {
    candidates.push(envOverride.trim());
  }

  const resourceRoots = [];
  if (typeof process.cwd === "function") {
    resourceRoots.push(process.cwd());
  }
  if (typeof process.resourcesPath === "string" && process.resourcesPath.length > 0) {
    resourceRoots.push(process.resourcesPath);
  }

  for (const root of resourceRoots) {
    candidates.push(path.join(root, "native", "nvda", "nvdaControllerClient64.dll"));
    candidates.push(path.join(root, "native", "nvda", "nvdaControllerClient.dll"));
    candidates.push(path.join(root, "native", "nvda", "nvdaclient64.dll"));
    candidates.push(path.join(root, "native", "nvda", "nvdaclient.dll"));
  }

  candidates.push("nvdaControllerClient64.dll");
  candidates.push("nvdaControllerClient.dll");
  candidates.push("nvdaclient64.dll");
  candidates.push("nvdaclient.dll");

  const unique = new Set();
  const deduplicated = [];
  for (const candidate of candidates) {
    if (!candidate || unique.has(candidate)) {
      continue;
    }

    unique.add(candidate);
    deduplicated.push(candidate);
  }

  return deduplicated;
}

function loadNvdaLibrary(koffi) {
  let lastLoadError = null;
  for (const candidateName of buildNvdaDllCandidates()) {
    try {
      const library = koffi.load(candidateName);
      return {
        testIfRunning: library.func("__stdcall", "nvdaController_testIfRunning", "int", []),
        brailleMessage: library.func(
          "__stdcall",
          "nvdaController_brailleMessage",
          "int",
          ["str16"],
        ),
      };
    } catch (error) {
      lastLoadError = error;
    }
  }

  throw buildKoffiLoadError(lastLoadError, "Impossible de charger la DLL NVDA Controller Client");
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
    koffiRuntimeError = buildKoffiLoadError(error, "Client NVDA JS direct indisponible");
    throw koffiRuntimeError;
  }

  try {
    koffiRuntime = {
      lib: loadNvdaLibrary(koffi),
    };
    return koffiRuntime;
  } catch (error) {
    koffiRuntimeError = error instanceof Error ? error : new Error(String(error));
    throw koffiRuntimeError;
  }
}

function buildWindowsErrorCodeLabel(statusCode) {
  const unsignedCode = Number(statusCode) >>> 0;
  return `${statusCode} (0x${unsignedCode.toString(16).toUpperCase()})`;
}

function ensureNvdaRunning(runtime) {
  const statusCode = runtime.lib.testIfRunning();
  if (statusCode !== 0) {
    throw new Error(`NVDA n'est pas detecte (code ${buildWindowsErrorCodeLabel(statusCode)}).`);
  }
}

function writeMessage(runtime, text) {
  const statusCode = runtime.lib.brailleMessage(text);
  if (statusCode !== 0) {
    throw new Error(
      `Echec d'ecriture vers NVDA (code ${buildWindowsErrorCodeLabel(statusCode)}).`,
    );
  }
}

function runWithNvdaRuntime(operation) {
  const runtime = getKoffiRuntime();
  return operation(runtime);
}

function sanitizeDisplayText(inputText) {
  const normalizedText = typeof inputText === "string" ? inputText : "";
  return normalizedText
    .replace(/\u0000/gu, "")
    .replace(/\r?\n/gu, " ")
    .slice(0, MAX_DISPLAY_TEXT_LENGTH);
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

function buildAvailableStatus() {
  return {
    supported: true,
    available: true,
    reason: null,
    displayColumns: 0,
    displayRows: 0,
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
  if (!isWindowsPlatform()) {
    return buildUnsupportedStatus("Le client NVDA est disponible uniquement sous Windows.");
  }

  const forceRefresh = options.forceRefresh === true;
  const now = Date.now();
  if (!forceRefresh && cachedStatus && now - cachedStatusAt < STATUS_CACHE_TTL_MS) {
    return cachedStatus;
  }

  try {
    runWithNvdaRuntime((runtime) => {
      ensureNvdaRunning(runtime);
    });
    cachedStatus = buildAvailableStatus();
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
      runWithNvdaRuntime((runtime) => {
        ensureNvdaRunning(runtime);
        writeMessage(runtime, displayText.length > 0 ? displayText : " ");
      });

      cachedStatus = buildAvailableStatus();
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
  if (!isWindowsPlatform()) {
    return {
      supported: false,
      available: false,
      queued: false,
      reason: "Le client NVDA est disponible uniquement sous Windows.",
    };
  }

  const now = Date.now();
  if (now < writesDisabledUntil) {
    return {
      supported: true,
      available: false,
      queued: false,
      reason: "Sortie NVDA temporairement desactivee apres erreurs repetees.",
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
  if (!isWindowsPlatform()) {
    return {
      supported: false,
      available: false,
      cleared: false,
      reason: "Le client NVDA est disponible uniquement sous Windows.",
    };
  }

  pendingWriteText = null;

  try {
    runWithNvdaRuntime((runtime) => {
      ensureNvdaRunning(runtime);
      writeMessage(runtime, " ");
    });

    cachedStatus = buildAvailableStatus();
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