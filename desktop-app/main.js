const { app, BrowserWindow, ipcMain, shell, Menu } = require("electron");
const path = require("node:path");
const { generateScene } = require("./ai");

const REPO_OWNER = "AlanLumier";
const REPO_NAME = "code-frame-studio";
const APP_VERSION = "0.6.0";

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: "#0b0f17",
    title: "codemv",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "assets", "codemv.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("generate-scene", async (_event, payload) => {
  const text = await generateScene(payload);
  return { text };
});

ipcMain.handle("check-update", async () => {
  const headers = { "User-Agent": "codemv-desktop", Accept: "application/vnd.github+json" };
  const release = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
    { headers },
  );
  if (release.ok) {
    const data = await release.json();
    return { latest: String(data.tag_name || "").replace(/^v/, ""), url: data.html_url };
  }
  const tags = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/tags?per_page=1`,
    { headers },
  );
  if (!tags.ok) throw new Error(`GitHub 返回 HTTP ${tags.status}`);
  const list = await tags.json();
  return {
    latest: String((list[0] && list[0].name) || "").replace(/^v/, ""),
    url: `https://github.com/${REPO_OWNER}/${REPO_NAME}`,
  };
});

ipcMain.handle("open-external", (_event, url) => {
  if (typeof url === "string" && /^https?:\/\//.test(url)) return shell.openExternal(url);
  return null;
});

ipcMain.handle("app-info", () => ({
  version: APP_VERSION,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
}));
