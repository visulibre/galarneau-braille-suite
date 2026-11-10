const path = require("node:path");
const fs = require("node:fs/promises");
const { fork } = require("node:child_process");
const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const brailleService = require("./braille-service");
const brlapiLinuxService = require("./brlapi-linux-service");
const nvdaWindowsService = require("./nvda-windows-service");
const gbsDocumentService = require("./gbs-document-service");
const braillePrintService = require("./braille-print-service");

const PRODUCTION_TRANSLATION_TIMEOUT_MS = 120000;
const SEGFAULT_EXIT_CODE = 139;
const SEGFAULT_SIGNAL = "SIGSEGV";
const TRANSLATE_WORKER_PATH = path.join(__dirname, "braille-translate-worker.js");
const TRANSLATION_LOG_FILE_NAME = "gbs-translation-errors.log";

app.commandLine.appendSwitch("force-renderer-accessibility");
if (
  process.platform === "linux" &&
  !process.env.DISPLAY &&
  !process.env.WAYLAND_DISPLAY
) {
  app.commandLine.appendSwitch("disable-gpu");
}

const unsupportedBrailleDisplayService = {
  getStatus: async () => ({
    supported: false,
    available: false,
    reason: "Service d'afficheur braille externe disponible uniquement sous Linux (BRLAPI) ou Windows (NVDA).",
    displayColumns: 0,
    displayRows: 0,
  }),
  writeDisplay: async () => ({
    supported: false,
    available: false,
    queued: false,
    reason: "Service d'afficheur braille externe disponible uniquement sous Linux (BRLAPI) ou Windows (NVDA).",
  }),
  clearDisplay: async () => ({
    supported: false,
    available: false,
    cleared: false,
    reason: "Service d'afficheur braille externe disponible uniquement sous Linux (BRLAPI) ou Windows (NVDA).",
  }),
};

function getActiveBrailleDisplayService() {
  if (process.platform === "linux") {
    return brlapiLinuxService;
  }

  if (process.platform === "win32") {
    return nvdaWindowsService;
  }

  return unsupportedBrailleDisplayService;
}

function getBrailleDisplayMenuLabel() {
  if (process.platform === "linux") {
    return "Basculer l'affichage BRLAPI (Linux)";
  }

  if (process.platform === "win32") {
    return "Basculer l'affichage NVDA (Windows)";
  }

  return "Basculer l'affichage braille externe";
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}

function sendMenuActionToRenderer(action, additionalPayload = {}) {
  const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  targetWindow.webContents.send("app:menu-action", { action, ...additionalPayload });
}

function setRealtimeTranslationMenuChecked(isChecked) {
  const menu = Menu.getApplicationMenu();
  if (!menu) {
    return;
  }

  const realtimeMenuItem = menu.getMenuItemById("toggle-realtime-translation");
  if (!realtimeMenuItem || realtimeMenuItem.type !== "checkbox") {
    return;
  }

  realtimeMenuItem.checked = isChecked;
}

function buildApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "Fichier",
      submenu: [
        {
          label: "Nouveau",
          accelerator: "CmdOrCtrl+N",
          click: () => sendMenuActionToRenderer("new-document"),
        },
        {
          label: "Ouvrir…",
          accelerator: "CmdOrCtrl+O",
          click: () => sendMenuActionToRenderer("open-document"),
        },
        {
          label: "Enregistrer",
          accelerator: "CmdOrCtrl+S",
          click: () => sendMenuActionToRenderer("save-document"),
        },
        {
          label: "Enregistrer sous…",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => sendMenuActionToRenderer("save-document-as"),
        },
        {
          label: "Envoyer le BRF à l’embosseuse…",
          accelerator: "CmdOrCtrl+P",
          click: () => sendMenuActionToRenderer("print-braille-document"),
        },
        {
          label: "Exporter le document braille en BRF…",
          click: () => sendMenuActionToRenderer("export-braille-document"),
        },
        { type: "separator" },
        ...(isMac ? [{ role: "close" }] : [{ role: "quit" }]),
      ],
    },
    {
      label: "Traduire",
      submenu: [
        {
          label: "Traduire le document",
          accelerator: "CmdOrCtrl+T",
          click: () => sendMenuActionToRenderer("translate-document"),
        },
        {
          label: "Basculer la traduction en temps réel",
          id: "toggle-realtime-translation",
          type: "checkbox",
          checked: true,
          accelerator: "CmdOrCtrl+Shift+T",
          click: (menuItem) =>
            sendMenuActionToRenderer("set-realtime-translation", { enabled: menuItem.checked }),
        },
      ],
    },
    {
      label: "Édition",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        {
          label: "Centrer la ligne active",
          accelerator: "CmdOrCtrl+E",
          click: () => sendMenuActionToRenderer("center-active-line"),
        },
        {
          label: "Appliquer le gras BFU",
          accelerator: "CmdOrCtrl+B",
          click: () => sendMenuActionToRenderer("apply-bold-style"),
        },
        {
          label: "Appliquer l’italique BFU",
          accelerator: "CmdOrCtrl+I",
          click: () => sendMenuActionToRenderer("apply-italic-style"),
        },
        {
          label: "Appliquer le surlignage BFU",
          accelerator: "CmdOrCtrl+U",
          click: () => sendMenuActionToRenderer("apply-highlight-style"),
        },
        {
          label: getBrailleDisplayMenuLabel(),
          accelerator: "CmdOrCtrl+Shift+B",
          click: () => sendMenuActionToRenderer("toggle-braille-display"),
        },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(isMac
          ? [
              { role: "pasteAndMatchStyle" },
              { role: "delete" },
              { role: "selectAll" },
            ]
          : [{ role: "delete" }, { type: "separator" }, { role: "selectAll" }]),
      ],
    },
    {
      label: "Affichage",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    if (typeof error.message === "string" && error.message.trim().length > 0) {
      return error.message;
    }

    return "erreur inconnue";
  }

  if (error && typeof error === "object" && typeof error.message === "string") {
    const message = error.message.trim();
    return message.length > 0 ? message : "erreur inconnue";
  }

  if (typeof error === "string") {
    const message = error.trim();
    return message.length > 0 ? message : "erreur inconnue";
  }

  if (error === null || error === undefined) {
    return "erreur inconnue";
  }

  const normalized = String(error).trim();
  if (normalized.length === 0 || normalized.toLowerCase() === "undefined" || normalized.toLowerCase() === "null") {
    return "erreur inconnue";
  }

  return normalized;
}

function resolveTranslationLogPath() {
  return path.join(app.getPath("userData"), TRANSLATION_LOG_FILE_NAME);
}

function truncateLogValue(value, maxLength = 20000) {
  const textValue = typeof value === "string" ? value : String(value ?? "");
  if (textValue.length <= maxLength) {
    return textValue;
  }

  return `${textValue.slice(0, maxLength)}... [tronqué ${textValue.length - maxLength} caractères]`;
}

function sanitizeLogPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      eventType: "unknown",
      message: truncateLogValue(payload),
    };
  }

  const normalizedPayload = {
    ...payload,
    eventType:
      typeof payload.eventType === "string" && payload.eventType.trim().length > 0
        ? payload.eventType.trim()
        : "unknown",
  };

  if (typeof normalizedPayload.message === "string") {
    normalizedPayload.message = truncateLogValue(normalizedPayload.message);
  }

  if (typeof normalizedPayload.errorMessage === "string") {
    normalizedPayload.errorMessage = truncateLogValue(normalizedPayload.errorMessage);
  }

  if (typeof normalizedPayload.errorStack === "string") {
    normalizedPayload.errorStack = truncateLogValue(normalizedPayload.errorStack, 40000);
  }

  return normalizedPayload;
}

async function appendTranslationLogEntry(payload) {
  const logPath = resolveTranslationLogPath();
  const logEntry = {
    timestamp: new Date().toISOString(),
    source: "renderer",
    pid: process.pid,
    platform: process.platform,
    arch: process.arch,
    appVersion: app.getVersion(),
    ...sanitizeLogPayload(payload),
  };

  await fs.appendFile(logPath, `${JSON.stringify(logEntry)}\n`, "utf8");
  return {
    ok: true,
    filePath: logPath,
  };
}

function translateInIsolatedProcess(payload, timeoutMs = PRODUCTION_TRANSLATION_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const childProcess = fork(TRANSLATE_WORKER_PATH, {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });

    let settled = false;
    const settle = (callback) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      callback();
    };

    const timeoutId = setTimeout(() => {
      settle(() => {
        childProcess.kill("SIGKILL");
        reject(new Error("La traduction a dépassé le délai autorisé."));
      });
    }, timeoutMs);

    childProcess.once("message", (message) => {
      settle(() => {
        childProcess.kill();

        if (!message || typeof message !== "object") {
          reject(new Error("Réponse invalide du processus de traduction."));
          return;
        }

        if (message.ok === true) {
          resolve(message.result);
          return;
        }

        const errorPayload = message.error && typeof message.error === "object"
          ? message.error
          : {};
        reject(new Error(errorPayload.message || "Échec de la traduction isolée."));
      });
    });

    childProcess.once("error", (error) => {
      settle(() => {
        reject(error);
      });
    });

    childProcess.once("exit", (code, signal) => {
      settle(() => {
        if (signal === SEGFAULT_SIGNAL || code === SEGFAULT_EXIT_CODE) {
          reject(new Error("Le moteur de traduction a rencontré une erreur de segmentation."));
          return;
        }

        reject(
          new Error(
            `Le processus de traduction s'est arrêté de façon inattendue (code: ${code ?? "null"}, signal: ${signal ?? "null"}).`,
          ),
        );
      });
    });

    childProcess.send({ type: "translate", payload });
  });
}

function isProductionTranslationPayload(payload) {
  return (
    payload &&
    typeof payload === "object" &&
    payload.executionMode === "production"
  );
}

async function translateWithRescueFallback(payload) {
  if (!isProductionTranslationPayload(payload)) {
    return brailleService.translate(payload);
  }

  try {
    return await translateInIsolatedProcess(payload);
  } catch (productionError) {
    const productionReason = getErrorMessage(productionError);
    const previewPayload = {
      ...payload,
      executionMode: "preview",
    };

    try {
      const previewResult = await translateInIsolatedProcess(previewPayload);
      const warningParts = [];
      if (typeof previewResult?.warning === "string" && previewResult.warning.length > 0) {
        warningParts.push(previewResult.warning);
      }
      warningParts.push(
        `Le moteur de traduction de production a échoué (${productionReason}). Repli automatique vers la traduction preview.`,
      );

      return {
        ...previewResult,
        executionMode: "production",
        warning: warningParts.join(" "),
      };
    } catch (previewError) {
      throw new Error(
        `Échec de traduction en production (${productionReason}). Le repli preview a aussi échoué: ${getErrorMessage(previewError)}.`,
      );
    }
  }
}

function registerIpcHandlers() {
  const brailleDisplayService = getActiveBrailleDisplayService();

  ipcMain.handle("braille:list-tables", () => brailleService.listTables());
  ipcMain.handle("braille:get-runtime-info", () => brailleService.getRuntimeInfo());

  // Generic display channels.
  ipcMain.handle("braille:display-status", () => brailleDisplayService.getStatus());
  ipcMain.handle("braille:display-write", (_event, payload) =>
    brailleDisplayService.writeDisplay(payload),
  );
  ipcMain.handle("braille:display-clear", () => brailleDisplayService.clearDisplay());

  // Legacy channels kept for compatibility with existing renderer code.
  ipcMain.handle("braille:linux-brlapi-status", () => brailleDisplayService.getStatus());
  ipcMain.handle("braille:linux-brlapi-write", (_event, payload) =>
    brailleDisplayService.writeDisplay(payload),
  );
  ipcMain.handle("braille:linux-brlapi-clear", () => brailleDisplayService.clearDisplay());

  ipcMain.handle("braille:get-style-support", (_event, payload) =>
    brailleService.getStyleSupport(payload),
  );
  ipcMain.handle("braille:translate", async (_event, payload) =>
    translateWithRescueFallback(payload),
  );
  ipcMain.handle("gbs:save-document", async (event, payload) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    return gbsDocumentService.saveDocument(payload, browserWindow ?? undefined);
  });
  ipcMain.handle("gbs:open-document", async (event, payload) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    return gbsDocumentService.openDocument(payload, browserWindow ?? undefined);
  });
  ipcMain.handle("gbs:print-braille-document", async (event, payload) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    if (!parentWindow || parentWindow.isDestroyed()) {
      throw new Error("La fenêtre du document braille n'est plus disponible.");
    }

    return braillePrintService.printBrailleDocument(payload);
  });
  ipcMain.handle("gbs:export-braille-document", async (event, payload) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    if (!parentWindow || parentWindow.isDestroyed()) {
      throw new Error("La fenêtre du document braille n'est plus disponible.");
    }

    return braillePrintService.exportBrailleDocument(payload, parentWindow);
  });
  ipcMain.handle("app:set-realtime-translation-menu-state", (_event, payload) => {
    if (typeof payload !== "boolean") {
      throw new TypeError("L'état du menu de traduction en temps réel doit être un booléen.");
    }

    setRealtimeTranslationMenuChecked(payload);
  });
  ipcMain.handle("app:log-translation-event", async (_event, payload) =>
    appendTranslationLogEntry(payload),
  );
  ipcMain.handle("app:get-translation-log-path", () => ({
    filePath: resolveTranslationLogPath(),
  }));
}

app
  .whenReady()
  .then(() => {
    if (typeof app.setAccessibilitySupportEnabled === "function") {
      app.setAccessibilitySupportEnabled(true);
    }

    registerIpcHandlers();
    buildApplicationMenu();
    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  })
  .catch((error) => {
    console.error("Échec de l'initialisation de l'application:", error);
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
