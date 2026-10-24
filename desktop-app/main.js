const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require("electron");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const execFileAsync = promisify(execFile);
const { generateScene } = require("./ai");

const REPO_OWNER = "AlanLumier";
const REPO_NAME = "code-frame-studio";
const APP_VERSION = "0.8.0";
const ROOT = __dirname;

let mainWindow = null;
let staticServer = null;

// 固定到应用目录下的可写数据目录，避免 Electron 在 AppData 权限异常时启动即崩。
const DATA_DIR = path.join(__dirname, "..", ".userdata");
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  app.setPath("userData", DATA_DIR);
} catch (error) {
  console.error("userData setup failed", error);
}

// 这台机器的 GPU/ANGLE 初始化会让 Electron 直接退出；默认软件渲染，
// 设置 CODEMV_GPU=1 可尝试硬件加速（排查驱动问题时用）。
if (!process.env.CODEMV_GPU) {
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
}
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.commandLine.appendSwitch("enable-unsafe-swiftshader");

const LOG = path.join(DATA_DIR, "startup.log");
function log(message) {
  try {
    fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    /* ignore */
  }
}
process.on("uncaughtException", (error) => log(`uncaught: ${error.stack || error.message}`));
log("app start");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".lrc": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".wasm": "application/wasm",
};

/** 本地静态服务：让独立搬进来的 Folia 视觉库、风格缩略图和示例音频同源访问，
    不再依赖 Folia 账号或上游页面。 */
function startStaticServer() {
  return new Promise((resolve, reject) => {
    staticServer = http.createServer((req, res) => {
      try {
        const url = decodeURIComponent((req.url || "/").split("?")[0]);
        const rel = url === "/" ? "/renderer/index.html" : url;
        const file = path.normalize(path.join(ROOT, rel));
        if (!file.startsWith(ROOT)) {
          res.writeHead(403);
          res.end("forbidden");
          return;
        }
        const stat = fs.statSync(file);
        if (stat.isDirectory()) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
        const range = req.headers.range;
        if (range && /^bytes=/.test(range)) {
          const [startRaw, endRaw] = range.replace("bytes=", "").split("-");
          const start = Math.max(0, parseInt(startRaw, 10) || 0);
          const end = endRaw ? Math.min(stat.size - 1, parseInt(endRaw, 10)) : stat.size - 1;
          res.writeHead(206, {
            "Content-Type": type,
            "Content-Length": end - start + 1,
            "Content-Range": `bytes ${start}-${end}/${stat.size}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
          });
          fs.createReadStream(file, { start, end }).pipe(res);
          return;
        }
        res.writeHead(200, {
          "Content-Type": type,
          "Content-Length": stat.size,
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-cache",
        });
        fs.createReadStream(file).pipe(res);
      } catch {
        res.writeHead(404);
        res.end("not found");
      }
    });
    staticServer.on("error", reject);
    staticServer.listen(0, "127.0.0.1", () => resolve(staticServer.address().port));
  });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

/** 原封不动加载旧 CodeMV：复制过来的 legacy/ 就是旧项目本身，
    由旧项目自带的零依赖 server.js 同端口提供页面与网易云代理。 */
async function startLegacyServer() {
  const port = await findFreePort();
  process.env.PORT = String(port);
  process.env.CODEMV_ROOT = path.join(__dirname, "legacy");
  require("./legacy/server.js");
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        log(`legacy server ready on ${port}`);
        return port;
      }
    } catch {
      /* wait */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("legacy server did not become ready");
}

function createWindow(port, urlPath = "/") {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
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
  mainWindow.loadURL(`http://127.0.0.1:${port}${urlPath}`);
  mainWindow.webContents.on("did-finish-load", () => {
    log("did-finish-load title=" + mainWindow.webContents.getTitle());
    // 软件渲染下最贵的是大面积 backdrop blur；保留配色与布局，只关掉实时模糊。
    mainWindow.webContents.insertCSS(`
      * { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
      #appBackdrop { animation: none !important; }
    `).catch(() => {});
  });
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => log("did-fail-load " + code + " " + desc + " " + url));
  log("window created");
  mainWindow.on("closed", () => log("window closed"));
  mainWindow.webContents.on("render-process-gone", (_event, details) => log(`renderer gone ${JSON.stringify(details)}`));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", async () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    const result = await dialog.showMessageBox(mainWindow, {
      type: "question",
      buttons: ["退出并重启", "保留当前窗口"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      title: "codemv 已在运行",
      message: "codemv 已经在运行",
      detail: "是否退出当前实例并重新启动？",
    });
    if (result.response === 0) {
      app.relaunch();
      app.exit(0);
    }
  });

  app.whenReady().then(async () => {
    log("ready");
    Menu.setApplicationMenu(null);
    let port = 0;
    let loadPath = "/";
    try {
      port = await startLegacyServer();
      loadPath = "/";
    } catch (error) {
      log(`legacy failed: ${error.message}`);
      try {
        port = await startStaticServer();
        loadPath = "/renderer/index.html";
      } catch (fallbackError) {
        log(`fallback failed: ${fallbackError.message}`);
      }
    }
    createWindow(port, loadPath);
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(port, loadPath);
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  if (staticServer) staticServer.close();
});

const NET_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
  Referer: "https://music.163.com/",
  Accept: "application/json, text/plain, */*",
};

ipcMain.handle("netease-search", async (_event, keywords) => {
  const query = String(keywords || "").trim();
  if (!query) return [];
  const url = `https://music.163.com/api/search/get/web?s=${encodeURIComponent(query)}&type=1&limit=20`;
  const response = await fetch(url, { headers: NET_HEADERS });
  if (!response.ok) throw new Error(`网易云搜索 HTTP ${response.status}`);
  const data = await response.json();
  const songs = (data && data.result && data.result.songs) || [];
  return songs.map((song) => ({
    id: song.id,
    name: song.name,
    artists: (song.artists || song.ar || []).map((a) => a.name).join(" / "),
    album: (song.album && song.album.name) || (song.al && song.al.name) || "",
    duration: Math.round((song.duration || song.dt || 0) / 1000),
  }));
});

ipcMain.handle("netease-lyric", async (_event, id) => {
  const url = `https://music.163.com/api/song/lyric?id=${encodeURIComponent(id)}&lv=1&kv=1&tv=-1`;
  const response = await fetch(url, { headers: NET_HEADERS });
  if (!response.ok) throw new Error(`网易云歌词 HTTP ${response.status}`);
  const data = await response.json();
  const lrc = (data && data.lrc && data.lrc.lyric) || "";
  const tlyric = (data && data.tlyric && data.tlyric.lyric) || "";
  if (!lrc.trim()) throw new Error("这首歌没有可用的 LRC 歌词");
  return { lrc, tlyric };
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


ipcMain.handle("export-video", async (_event, options) => {
  const { data, audioPath = "", title = "codemv" } = options || {};
  const tmp = path.join(DATA_DIR, "video-" + Date.now() + ".webm");
  fs.writeFileSync(tmp, Buffer.from(data));
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: title + ".mp4",
    filters: [{ name: "MP4 视频", extensions: ["mp4"] }],
  });
  if (result.canceled || !result.filePath) {
    try { fs.unlinkSync(tmp); } catch {}
    return null;
  }
  const ffmpeg = path.join(ROOT, "..", "tools", "ffmpeg", "ffmpeg.exe");
  if (fs.existsSync(ffmpeg) && audioPath && fs.existsSync(audioPath)) {
    await execFileAsync(ffmpeg, [
      "-y", "-i", tmp, "-i", audioPath, "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", result.filePath,
    ]);
    try { fs.unlinkSync(tmp); } catch {}
    return result.filePath;
  }
  const webm = result.filePath.replace(/\.mp4$/i, ".webm");
  fs.renameSync(tmp, webm);
  return webm;
});

ipcMain.handle("save-file", async (_event, options) => {
  const { defaultName = "codemv-export", filters = [], text = "", sourcePath = "" } = options || {};
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath: defaultName, filters });
  if (result.canceled || !result.filePath) return null;
  if (sourcePath && fs.existsSync(sourcePath)) fs.copyFileSync(sourcePath, result.filePath);
  else fs.writeFileSync(result.filePath, text, "utf8");
  return result.filePath;
});

ipcMain.handle("app-info", () => ({
  version: APP_VERSION,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
}));
