// 开发工具：无界面启动，截取一张主界面截图，便于检查排版。
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  await window.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const image = await window.webContents.capturePage();
  const out = path.join(__dirname, "..", "..", "output", "app_v6.png");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, image.toPNG());
  console.log("saved", out);
  app.quit();
});
