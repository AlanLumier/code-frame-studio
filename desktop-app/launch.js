/* CodeMV 新版启动器（Node，不生成 exe / 不弹 CMD 批处理）
   1) 后台启动旧项目 server.js（固定 8899，已在运行则复用）
   2) 用 Edge 应用窗口打开旧界面（无地址栏，GPU 加速）
*/
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = __dirname;
const PORT = 8899;
const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => fs.existsSync(p));

function busy(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.setTimeout(700);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
    socket.on("error", () => resolve(false));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!(await busy(PORT))) {
    const server = spawn(process.execPath, [path.join(ROOT, "legacy", "server.js")], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), CODEMV_ROOT: path.join(ROOT, "legacy"), ELECTRON_RUN_AS_NODE: "" },
      stdio: "ignore",
      windowsHide: true,
      detached: true,
    });
    server.unref();
    for (let i = 0; i < 25 && !(await busy(PORT)); i += 1) await sleep(200);
  }

  if (!EDGE) {
    spawn("cmd", ["/c", "start", "", `http://127.0.0.1:${PORT}/`], { stdio: "ignore", windowsHide: true, detached: true }).unref();
    return;
  }
  const profile = path.join(ROOT, ".edge-profile-v4");
  fs.mkdirSync(profile, { recursive: true });
  const view = spawn(EDGE, [
    `--app=http://127.0.0.1:${PORT}/`,
    "--window-size=1440,900",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--force-dark-mode",
    "--default-background-color=ff08090c",
  ], { stdio: "ignore", windowsHide: true, detached: true });
  view.unref();
})();
