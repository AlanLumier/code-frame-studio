/* 本地桌面模式下不注册 Service Worker，并清掉旧缓存，避免看到旧版界面与旧风格库。 */
(function () {
  if (!("serviceWorker" in navigator)) return;
  var isLocal = location.hostname === "127.0.0.1" || location.hostname === "localhost";
  if (isLocal) {
    try {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (reg) { reg.unregister(); });
      });
      if (window.caches) {
        caches.keys().then(function (keys) {
          keys.forEach(function (key) { caches.delete(key); });
        });
      }
    } catch (e) { /* ignore */ }
    return;
  }
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  });
})();
