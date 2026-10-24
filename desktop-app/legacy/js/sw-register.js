/* Service Worker 注册（从 index.html 内联脚本拆出，满足 CSP：禁止内联脚本） */
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () {});
      });
    }
