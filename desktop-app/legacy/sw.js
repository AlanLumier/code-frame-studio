/* ==========================================================================
   Code MV · Service Worker
   --------------------------------------------------------------------------
   目标：静态资源离线可用（PWA 安装后没有网络也能打开）。
   策略：安装时预缓存核心文件；fetch 走 cache-first，网络失败时回退缓存。
   注意：只缓存同源 GET 请求；/api/ 永远不走缓存（网易云代理是动态数据）。
   ========================================================================== */

const VERSION = "codemv-v1.15.5";
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./js/utils.js",
  "./js/lrc.js",
  "./js/audio.js",
  "./js/script.js",
  "./js/styles-library.js",
  "./js/style-render.js",
  "./js/scenes.js",
  "./js/story.js",
  "./js/alan-engine.js",
  "./js/lyric-style.js",
  "./js/align.js",
  "./js/live.js",
  "./js/theme.js",
  "./js/export.js",
  "./js/encode.js",
  "./js/netease.js",
  "./js/llm.js",
  "./js/scene-core.js",
  "./js/scene-worker.js",
  "./js/scene-code.js",
  "./js/mv-auto.js",
  "./js/sw-register.js",
  "./js/app.js",
  "./vendor/mp4-muxer/mp4-muxer.min.js",
  "./vendor/folia-fidelity/render.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; /* 动态接口不缓存 */

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          if (!res || res.status !== 200 || res.type === "opaque") return res;
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});