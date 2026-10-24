#!/usr/bin/env node
/* ==========================================================================
   CodeMV · 本地服务（零依赖）
   --------------------------------------------------------------------------
   作用有两个：
     1. 托管前端静态文件（http://127.0.0.1:8899）
     2. 代理网易云非官方接口，绕开浏览器 CORS

   用法：
     node server.js
   然后浏览器打开 http://127.0.0.1:8899/

   ⚠️ 网易云没有官方开放 API。本文件只做转发，风险自负：
      • 可能违反服务条款
      • 接口随时可能失效
      • 频繁请求可能触发账号风控
      仅建议个人学习使用，不要用于商业或大规模抓取。
   ========================================================================== */

"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const ROOT = process.env.CODEMV_ROOT ? path.resolve(process.env.CODEMV_ROOT) : __dirname;
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 8899);
const CONTROL_TOKEN = process.env.CODEMV_CONTROL_TOKEN || "";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const UPSTREAM_HEADERS = {
  "User-Agent": UA,
  Referer: "https://music.163.com/",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  "Accept-Encoding": "identity",
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
};

/* ---------- 响应工具 ---------- */

/* 路径必须在目录内（防目录穿越） */
function isInside(base, target) {
  const rel = path.relative(base, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function sendJson(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
  });
  res.end(body);
}

function sendAudio(res, status, type, buf) {
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
  });
  res.end(buf);
}

/* ---------- 代理 ---------- */

async function proxyJson(target, cookie, res) {
  const headers = Object.assign({}, UPSTREAM_HEADERS);
  if (cookie) headers.Cookie = cookie;

  const r = await fetch(target, { headers, redirect: "follow" });
  const text = await r.text();

  if (!r.ok) {
    sendJson(res, r.status, {
      error: "upstream " + r.status,
      detail: text.slice(0, 400),
    });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(text);
}

async function proxyAudio(target, cookie, res) {
  const headers = Object.assign({}, UPSTREAM_HEADERS, { Accept: "*/*" });
  if (cookie) headers.Cookie = cookie;

  const r = await fetch(target, { headers, redirect: "follow" });
  if (!r.ok) {
    sendJson(res, r.status, { error: "audio upstream " + r.status });
    return;
  }

  const type = r.headers.get("content-type") || "audio/mpeg";
  const buf = Buffer.from(await r.arrayBuffer());

  /* 网易云对 VIP / 版权受限歌曲会返回空内容或 HTML */
  if (!/audio|octet-stream/i.test(type) || buf.length < 10000) {
    sendJson(res, 502, {
      error:
        "这首歌曲无法取到音频（可能需要登录 Cookie / VIP / 版权受限），可以改用本地上传",
    });
    return;
  }

  sendAudio(res, 200, type, buf);
}

/* Folia 构建产物使用绝对 /assets/ 路径：映射到 vendor/folia-build */
function serveFoliaAsset(pathname, res) {
  const base = path.resolve(ROOT, "vendor", "folia-build");
  const file = path.resolve(base, "." + pathname);
  if (!isInside(base, file)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("404");
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

/* ---------- 静态文件 ---------- */

function serveStatic(pathname, res) {
  let p = decodeURIComponent(pathname);
  if (p === "/") p = "/index.html";

  const base = path.resolve(ROOT);
  const file = path.resolve(base, "." + p);
  if (!isInside(base, file)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("forbidden");
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 not found");
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

/* ---------- 路由 ---------- */

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");

  /* 只允许本机同源页面调用写操作（防 CSRF）；GET 代理接口也不放开跨域 */
  const origin = req.headers.origin || "";
  const allowedOrigins = [
    "http://127.0.0.1:" + PORT,
    "http://localhost:" + PORT
  ];
  const sameOrigin = !origin || allowedOrigins.indexOf(origin) >= 0;
  if (!sameOrigin && req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    sendJson(res, 403, { error: "forbidden: cross-origin request rejected" });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const cookie = req.headers["x-netease-cookie"] || "";

  try {
    /* 健康检查：前端自动发现本地代理用 */
    if (u.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        name: "code-mv-proxy",
        version: "1.3.0",
        time: new Date().toISOString()
      });
      return;
    }


    /* 应用信息（版本 / 作者 / 仓库） */
    if (u.pathname === "/api/app/info") {
      let info = {};
      try { info = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8")); } catch (e) {}
      const head = await new Promise((resolve) => {
        execFile("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"], { timeout: 5000 }, (err, stdout) => {
          resolve(err ? "" : String(stdout || "").trim());
        });
      });
      sendJson(res, 200, {
        app: info.app || "Code MV",
        version: info.version || "0.0.0",
        commit: head,
        author: info.author || { name: "AlanLumier", email: "1957784559@qq.com" },
        repo: info.repo || "https://github.com/AlanLumier/code-mv",
        license: info.license || "AGPL-3.0",
        desktop: process.env.CODEMV_DESKTOP === "1"
      });
      return;
    }

    /* 检查 GitHub 更新 */
    if (u.pathname === "/api/update/check") {
      let localInfo = {};
      try { localInfo = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8")); } catch (e) {}
      sendJson(res, 200, {
        ok: true,
        local: { version: localInfo.version || "0.0.0", commit: localInfo.version || "便携版" },
        latest: null,
        behind: 0,
        upToDate: true,
        commits: [],
        portable: true,
        note: "便携版不支持 git 自动更新，重新下载新版即可"
      });
      return;
    }

    /* 重启桌面版（Electron 控制端口 8897） */
    if (u.pathname === "/api/app/restart" && req.method === "POST") {
      if (process.env.CODEMV_DESKTOP !== "1") {
        sendJson(res, 200, { ok: false, error: "当前不是桌面版，刷新页面即可" });
        return;
      }
      try {
        const ctrl = await fetch("http://127.0.0.1:8897/restart", {
          method: "POST",
          headers: { "x-codemv-token": CONTROL_TOKEN }
        });
        await ctrl.json().catch(() => ({}));
        sendJson(res, 200, { ok: true, restarting: true });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: "无法联系桌面壳（8897）：" + String(err.message || err) });
      }
      return;
    }

    /* 拉取更新（git pull --ff-only） */
    if (u.pathname === "/api/update/pull" && req.method === "POST") {
      sendJson(res, 200, { ok: false, error: "便携版不支持 git 自动更新，请重新下载新版" });
      return;
      const git = (args) => new Promise((resolve) => {
        execFile("git", ["-C", ROOT].concat(args), { timeout: 20000 }, (err, stdout, stderr) => {
          resolve({ err, out: String(stdout || "").trim(), errout: String(stderr || "").trim() });
        });
      });

      const remote = await git(["remote", "get-url", "origin"]);
      if (remote.err || !/github\.com[:/]AlanLumier\/code-mv(\.git)?$/i.test(remote.out)) {
        sendJson(res, 403, { ok: false, error: "仓库 origin 不是 AlanLumier/code-mv，已拒绝自动更新" });
        return;
      }
      const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
      if (branch.err || branch.out !== "main") {
        sendJson(res, 409, { ok: false, error: "当前不在 main 分支，已拒绝自动更新" });
        return;
      }
      const status = await git(["status", "--porcelain"]);
      if (status.err || status.out) {
        sendJson(res, 409, { ok: false, error: "工作区有未提交修改，已拒绝自动更新" });
        return;
      }

      const runGit = (args, timeout) => new Promise((resolve) => {
        execFile("git", ["-C", ROOT].concat(args), {
          timeout: timeout || 45000,
          windowsHide: true,
          env: Object.assign({}, process.env, {
            GIT_HTTP_LOW_SPEED_LIMIT: "1000",
            GIT_HTTP_LOW_SPEED_TIME: "20"
          })
        }, (err, stdout, stderr) => {
          resolve({ err, stdout: String(stdout || ""), stderr: String(stderr || "") });
        });
      });

      /* 只拉最新一层提交，速度远快于完整 pull；失败自动重试一次 */
      let fetched = await runGit(["fetch", "--no-tags", "--depth=1", "origin", "main"], 45000);
      if (fetched.err) fetched = await runGit(["fetch", "--no-tags", "--depth=1", "origin", "main"], 45000);

      let merged;
      if (fetched.err) {
        /* 浅拉取失败再退回普通 pull（网络较差时保底） */
        merged = await runGit(["pull", "--ff-only", "origin", "main"], 90000);
      } else {
        merged = await runGit(["merge", "--ff-only", "FETCH_HEAD"], 20000);
      }

      const result = {
        err: merged.err || fetched.err,
        stdout: (fetched.stdout || "") + (merged.stdout || ""),
        stderr: (merged.stderr || "") + (fetched.stderr || "")
      };
      if (result.err) {
        sendJson(res, 500, {
          ok: false,
          error: (result.stderr || result.stdout || result.err.message || "git pull 失败").slice(0, 800)
        });
        return;
      }
      const lines = (result.stdout || "").trim().split("\n").filter(Boolean);
      sendJson(res, 200, { ok: true, summary: lines[lines.length - 1] || "已更新", output: result.stdout.slice(0, 2000) });
      return;
    }

    if (u.pathname === "/api/search") {
      const q = u.searchParams.get("keywords") || "";
      const limit = u.searchParams.get("limit") || "20";
      const target =
        "https://music.163.com/api/search/get/web?s=" +
        encodeURIComponent(q) +
        "&type=1&limit=" +
        encodeURIComponent(limit) +
        "&offset=0";
      await proxyJson(target, cookie, res);
      return;
    }

    if (u.pathname === "/api/lyric") {
      const id = u.searchParams.get("id") || "";
      const target =
        "https://music.163.com/api/song/lyric?id=" +
        encodeURIComponent(id) +
        "&lv=-1&kv=-1&tv=-1";
      await proxyJson(target, cookie, res);
      return;
    }

    /* 网易云扫码登录：获取 unikey（二维码内容） */
    if (u.pathname === "/api/login/qr/new") {
      const r = await fetch(
        "https://music.163.com/api/login/qrcode/unikey?type=1&appver=8.10.90&os=pc",
        { headers: Object.assign({}, UPSTREAM_HEADERS), redirect: "follow" }
      );
      const text = await r.text();
      let data = {};
      try { data = JSON.parse(text); } catch (e) {}
      if (!data.unikey) {
        sendJson(res, 502, { error: "生成二维码失败：" + String(text).slice(0, 160) });
        return;
      }
      sendJson(res, 200, {
        key: data.unikey,
        url: "https://music.163.com/login?codekey=" + data.unikey
      });
      return;
    }

    /* 轮询扫码状态：800 过期 / 801 等待扫码 / 802 待确认 / 803 成功 */
    if (u.pathname === "/api/login/qr/check") {
      const key = u.searchParams.get("key") || "";
      if (!key) {
        sendJson(res, 400, { error: "缺少 key" });
        return;
      }
      const r = await fetch(
        "https://music.163.com/api/login/qrcode/client/login?key=" +
          encodeURIComponent(key) +
          "&type=1&appver=8.10.90&os=pc",
        { headers: Object.assign({}, UPSTREAM_HEADERS), redirect: "follow" }
      );
      const text = await r.text();
      let data = {};
      try { data = JSON.parse(text); } catch (e) {}
      let list = [];
      if (typeof r.headers.getSetCookie === "function") list = r.headers.getSetCookie();
      else if (r.headers.get("set-cookie")) list = [r.headers.get("set-cookie")];
      let musicU = "";
      list.forEach(function (c) {
        const m = /MUSIC_U=([^;]+)/.exec(String(c));
        if (m && m[1]) musicU = "MUSIC_U=" + m[1];
      });
      if (data.code === 8821) {
        data.message = "网易云提示“需要更新版本”：请改用手机号登录 / Cookie，或先用手机 App 扫码确认";
      }
      const out = { code: data.code || 0, message: data.message || "" };
      if (musicU) out.cookie = musicU;
      sendJson(res, 200, out);
      return;
    }

    if (u.pathname === "/api/audio") {
      const id = u.searchParams.get("id") || "";
      const target =
        "https://music.163.com/song/media/outer/url?id=" +
        encodeURIComponent(id) +
        ".mp3";
      await proxyAudio(target, cookie, res);
      return;
    }

    if (u.pathname.startsWith("/assets/")) {
      serveFoliaAsset(u.pathname, res);
      return;
    }

    serveStatic(u.pathname, res);
  } catch (err) {
    sendJson(res, 502, { error: String((err && err.message) || err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("  CodeMV 本地服务已启动");
  console.log("  打开：http://" + HOST + ":" + PORT + "/");
  console.log("  代理：/api/search  /api/lyric  /api/audio  /api/login/qr/new  /api/login/qr/check");
  console.log("");
  console.log("  ⚠️  网易云为非官方接口，仅个人学习使用，风控自负。Ctrl+C 退出。");
  console.log("");
});
