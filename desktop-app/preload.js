const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codemv", {
  generateScene: (payload) => ipcRenderer.invoke("generate-scene", payload),
  checkUpdate: () => ipcRenderer.invoke("check-update"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  appInfo: () => ipcRenderer.invoke("app-info"),
});
