const path = require("node:path");
const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const brailleService = require("./braille-service");
const gbsDocumentService = require("./gbs-document-service");

app.commandLine.appendSwitch("force-renderer-accessibility");
if (
  process.platform === "linux" &&
  !process.env.DISPLAY &&
  !process.env.WAYLAND_DISPLAY
) {
  app.commandLine.appendSwitch("disable-gpu");
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

function registerIpcHandlers() {
  ipcMain.handle("braille:list-tables", () => brailleService.listTables());
  ipcMain.handle("braille:get-style-support", (_event, payload) =>
    brailleService.getStyleSupport(payload),
  );
  ipcMain.handle("braille:translate", (_event, payload) => {
    const outputText = brailleService.translate(payload);
    return { outputText };
  });
  ipcMain.handle("gbs:save-document", async (event, payload) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    return gbsDocumentService.saveDocument(payload, browserWindow ?? undefined);
  });
  ipcMain.handle("gbs:open-document", async (event, payload) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    return gbsDocumentService.openDocument(payload, browserWindow ?? undefined);
  });
  ipcMain.handle("app:set-realtime-translation-menu-state", (_event, payload) => {
    if (typeof payload !== "boolean") {
      throw new TypeError("L'état du menu de traduction en temps réel doit être un booléen.");
    }

    setRealtimeTranslationMenuChecked(payload);
  });
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
