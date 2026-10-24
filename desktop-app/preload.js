const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("codemvAI", {
  chat: (messages) => ipcRenderer.invoke("ai-chat", messages),
});

contextBridge.exposeInMainWorld("codemv", {
  generateScene: (payload) => ipcRenderer.invoke("generate-scene", payload),
  neteaseSearch: (keywords) => ipcRenderer.invoke("netease-search", keywords),
  neteaseLyric: (id) => ipcRenderer.invoke("netease-lyric", id),
  saveFile: (options) => ipcRenderer.invoke("save-file", options),
  exportVideo: (options) => ipcRenderer.invoke("export-video", options),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || "";
    } catch {
      return "";
    }
  },
  checkUpdate: () => ipcRenderer.invoke("check-update"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  appInfo: () => ipcRenderer.invoke("app-info"),
});
