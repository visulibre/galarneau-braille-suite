const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("brailleApi", {
  listTables: () => ipcRenderer.invoke("braille:list-tables"),
  getRuntimeInfo: () => ipcRenderer.invoke("braille:get-runtime-info"),
  getLinuxBrlapiStatus: () => ipcRenderer.invoke("braille:linux-brlapi-status"),
  writeLinuxBrlapiDisplay: (payload) => ipcRenderer.invoke("braille:linux-brlapi-write", payload),
  clearLinuxBrlapiDisplay: () => ipcRenderer.invoke("braille:linux-brlapi-clear"),
  getStyleSupport: (payload) => ipcRenderer.invoke("braille:get-style-support", payload),
  translate: (payload) => ipcRenderer.invoke("braille:translate", payload),
  saveDocument: (payload) => ipcRenderer.invoke("gbs:save-document", payload),
  openDocument: (payload) => ipcRenderer.invoke("gbs:open-document", payload),
  setRealtimeTranslationMenuState: (payload) =>
    ipcRenderer.invoke("app:set-realtime-translation-menu-state", payload),
  onMenuAction: (listener) => {
    if (typeof listener !== "function") {
      throw new TypeError("Le listener de menu doit être une fonction.");
    }

    const wrappedListener = (_event, payload) => {
      listener(payload);
    };

    ipcRenderer.on("app:menu-action", wrappedListener);
    return () => {
      ipcRenderer.removeListener("app:menu-action", wrappedListener);
    };
  },
});
