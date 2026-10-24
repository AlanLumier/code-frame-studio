/* ==========================================================================
   Code MV · 深浅主题
   --------------------------------------------------------------------------
   • 首次访问跟随系统（prefers-color-scheme）
   • 手动切换后记住选择（localStorage）
   • 只改 UI 主题，画布里的 MV 画面仍按调色板渲染
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var KEY = "codemv.theme";
  var U = NS.utils;

  function systemTheme() {
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    ) {
      return "light";
    }
    return "dark";
  }

  function current() {
    var saved = U.storageGet("localStorage", KEY);
    if (saved === "light" || saved === "dark") return saved;
    return systemTheme();
  }

  function apply(theme) {
    theme = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    U.storageSet("localStorage", KEY, theme);

    var btn = document.getElementById("btnTheme");
    if (btn) {
      btn.setAttribute(
        "aria-label",
        theme === "light" ? "切换到深色模式" : "切换到浅色模式"
      );
      btn.setAttribute("title", theme === "light" ? "深色模式" : "浅色模式");
    }
  }

  function toggle() {
    var next =
      document.documentElement.getAttribute("data-theme") === "light"
        ? "dark"
        : "light";
    apply(next);
    return next;
  }

  function init() {
    /* 允许用 #light / #dark 直接指定（方便演示和截图） */
    var hash = window.location.hash || "";
    if (hash.indexOf("light") >= 0) {
      apply("light");
    } else if (hash.indexOf("dark") >= 0) {
      apply("dark");
    } else {
      apply(current());
    }

    var btn = document.getElementById("btnTheme");
    if (btn) {
      btn.addEventListener("click", function () {
        toggle();
      });
    }

    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: light)");
      var onChange = function (e) {
        if (U.storageGet("localStorage", KEY)) return; /* 用户手动选过就不跟系统 */
        apply(e.matches ? "light" : "dark");
      };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
    }
  }

  NS.theme = {
    init: init,
    apply: apply,
    toggle: toggle,
    current: current
  };
})(window.CodeMV);
