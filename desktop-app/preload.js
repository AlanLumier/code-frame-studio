const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codemv", {
  generateScene: (payload) => ipcRenderer.invoke("generate-scene", payload),
  neteaseSearch: (keywords) => ipcRenderer.invoke("netease-search", keywords),
  neteaseLyric: (id) => ipcRenderer.invoke("netease-lyric", id),
  checkUpdate: () => ipcRenderer.invoke("check-update"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  appInfo: () => ipcRenderer.invoke("app-info"),
});
