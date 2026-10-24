/* ==========================================================================
   Code MV · 共享工具函数
   --------------------------------------------------------------------------
   之前 clamp / lerp / hash / 颜色转换 在 6 个文件里各写一份，
   统一收到这里，后续新代码一律走 NS.utils。
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var TAU = Math.PI * 2;

  function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
  }

  function lerp(a, b, k) {
    return a + (b - a) * k;
  }

  function hash(n) {
    var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453123;
    return x - Math.floor(x);
  }

  function hash2(a, b) {
    return hash(a * 127.1 + b * 311.7);
  }

  function smoothstep(a, b, x) {
    var k = clamp((x - a) / (b - a || 1), 0, 1);
    return k * k * (3 - 2 * k);
  }

  function easeOut(k) {
    return 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  }

  function easeIn(k) {
    return Math.pow(clamp(k, 0, 1), 3);
  }

  function backOut(k) {
    var c = 1.70158;
    var p = clamp(k, 0, 1) - 1;
    return 1 + (c + 1) * p * p * p + c * p * p;
  }

  /** 阻尼弹簧：age 秒后回到 1，带一点过冲 */
  function spring(age, dur, overshoot) {
    var t = clamp(age / (dur || 0.6), 0, 1);
    var o = overshoot == null ? 1.15 : overshoot;
    return 1 - Math.exp(-6 * t) * Math.cos(t * Math.PI * 2.2) * o;
  }

  function rgbOf(hex) {
    if (Array.isArray(hex)) return hex;
    var h = String(hex || "#ffffff").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (!isFinite(n)) return [255, 255, 255];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgba(c, a) {
    if (typeof c === "string" && /^rgba?\(/i.test(c.trim())) return c;
    var v = rgbOf(c);
    return "rgba(" + v[0] + "," + v[1] + "," + v[2] + "," + (a == null ? 1 : a) + ")";
  }

  function hexAlpha(hex, a) {
    return rgba(hex, a);
  }

  function mixRgb(a, b, k) {
    var A = rgbOf(a);
    var B = rgbOf(b);
    return [
      Math.round(lerp(A[0], B[0], k)),
      Math.round(lerp(A[1], B[1], k)),
      Math.round(lerp(A[2], B[2], k))
    ];
  }

  function isHex(v) {
    return typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
  }

  /** 秒 → mm:ss */
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
  }

  function debounce(fn, ms) {
    var timer = 0;
    return function () {
      var args = arguments;
      var self = this;
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        fn.apply(self, args);
      }, ms || 120);
    };
  }

  function rafLoop(fn) {
    var id = 0;
    var stopped = false;

    function step(ts) {
      if (stopped) return;
      id = window.requestAnimationFrame(step);
      fn(ts);
    }

    id = window.requestAnimationFrame(step);

    return {
      stop: function () {
        stopped = true;
        if (id) window.cancelAnimationFrame(id);
        id = 0;
      }
    };
  }

  /** 只允许 localhost / 127.0.0.1 的地址（用于 cookie 转发） */
  function isLocalUrl(url) {
    return /^(https?:\/\/)?(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(
      String(url || "")
    );
  }

  function storageGet(store, key) {
    try {
      return window[store].getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageSet(store, key, value) {
    try {
      if (value == null) window[store].removeItem(key);
      else window[store].setItem(key, value);
    } catch (e) {
      /* ignore */
    }
  }

  /* ---------- 轻量 Toast 提示 ---------- */

  var toastHost = null;

  function toast(message, type) {
    if (!message) return;
    if (typeof document === "undefined") return;

    if (!toastHost) {
      toastHost = document.createElement("div");
      toastHost.className = "toast-host";
      document.body.appendChild(toastHost);
    }

    var el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.textContent = message;
    toastHost.appendChild(el);

    window.setTimeout(function () {
      el.classList.add("is-out");
      window.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 230);
    }, 2200);
  }

  NS.utils = {
    TAU: TAU,
    clamp: clamp,
    lerp: lerp,
    hash: hash,
    hash2: hash2,
    smoothstep: smoothstep,
    easeOut: easeOut,
    easeIn: easeIn,
    backOut: backOut,
    spring: spring,
    rgbOf: rgbOf,
    rgba: rgba,
    hexAlpha: hexAlpha,
    mixRgb: mixRgb,
    isHex: isHex,
    fmtTime: fmtTime,
    debounce: debounce,
    rafLoop: rafLoop,
    isLocalUrl: isLocalUrl,
    storageGet: storageGet,
    storageSet: storageSet,
    toast: toast
  };
})(window.CodeMV);
