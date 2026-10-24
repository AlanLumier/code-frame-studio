/* ==========================================================================
   Code MV · 设置中心（外观 / 画布与文字 / 更新与关于）
   --------------------------------------------------------------------------
   设置项（7 类）：
     1. 主题模式：深色 / 浅色 / 跟随系统
     2. 强调色：预设色板 + 自定义
     3. 界面字体：系统 / 无衬线 / 衬线 / 等宽
     4. 歌词字体
     5. 歌词字号
     6. 动效强度：平静 / 标准 / 活跃 / 关闭
     7. 默认画幅比例
   “更新与关于”：读取 GitHub 最新提交 → 一键 git pull 更新；作者信息。
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var KEY = "codemv.settings";
  var DEFAULTS = {
    themeMode: "dark",
    autoUpdate: true,
    autoRestart: true,
    subtitleStyle: "inline",
    subtitleBar: { pos: 5.5, width: 92, opacity: 42, font: "sans", radius: 32 },
    autoHideControls: true,
    previewStyle: "classic",
    accent: "#ffffff",
    uiFont: "system",
    lyricFont: "",
    lyricSize: 4.6,
    motion: "normal",
    ratio: "16:9"
  };

  var FONTS = {
    system: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
    sans: '"Segoe UI", "Helvetica Neue", Arial, "Microsoft YaHei", sans-serif',
    serif: 'Georgia, "Songti SC", "SimSun", serif',
    mono: '"Consolas", "SFMono-Regular", "Courier New", monospace'
  };

  var ACCENTS = ["#ffffff", "#5ce1c6", "#7dd3fc", "#ffb35c", "#a78bfa", "#fb7185"];
  var ACCENT_DARK_TEXT = ["#111111"];

  var settings = null;

  function load() {
    var raw = null;
    try {
      raw = JSON.parse(NS.utils.storageGet("localStorage", KEY) || "null");
    } catch (e) {
      raw = null;
    }
    var out = {};
    for (var k in DEFAULTS) out[k] = DEFAULTS[k];
    if (raw && typeof raw === "object") {
      for (var k2 in DEFAULTS) {
        if (raw[k2] != null) out[k2] = raw[k2];
      }
      /* 旧设置迁移：默认改为纯黑主题 */
      if (raw.__v !== 2) out.themeMode = "dark";
    }
    return out;
  }

  function save(patch) {
    settings = Object.assign({}, settings || load(), patch || {});
    settings.__v = 2;
    NS.utils.storageSet("localStorage", KEY, JSON.stringify(settings));
    apply();
  }

  function resolvedTheme() {
    var mode = settings.themeMode;
    if (mode === "system") {
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    return mode === "light" ? "light" : "dark";
  }

  function apply() {
    if (!settings) return;
    var root = document.documentElement;

    /* 主题：统一走 theme.js，避免两套主题状态冲突（SVG 图标/按钮状态都由它维护） */
    var theme = resolvedTheme();
    var hash = window.location.hash || "";
    if (!(hash.indexOf("dark") >= 0 || hash.indexOf("light") >= 0)) {
      if (NS.theme && NS.theme.apply) NS.theme.apply(theme);
      else root.setAttribute("data-theme", theme);
    }

    /* 强调色 */
    root.style.setProperty("--accent", settings.accent);
    root.style.setProperty("--accent-2", settings.accent);

    /* 界面字体 */
    root.style.setProperty("--font-ui", FONTS[settings.uiFont] || FONTS.system);

    /* 动效强度 */
    root.setAttribute("data-motion", settings.motion);
    document.body.classList.toggle("preview-folia", settings.previewStyle === "folia");

    /* 歌词字体 / 字号（同步到歌词样式模块） */
    if (NS.lyricStyle && NS.lyricStyle.save) {
      var patch = {};
      if (settings.lyricFont) patch.font = settings.lyricFont;
      if (settings.lyricSize) patch.size = settings.lyricSize;
      try { NS.lyricStyle.save(patch); } catch (e) {}
    }

    /* 画布比例：点击抽屉里的 ratio chip，复用现有逻辑 */
    if (settings.ratio) {
      var chip = document.querySelector('#ratioChips .chip-btn[data-ratio="' + settings.ratio + '"]');
      if (chip && !chip.classList.contains("is-active")) chip.click();
    }
  }

  /* ---------------- 设置界面 ---------------- */

  function panelEl(name) {
    return document.querySelector('#settingsModal .settings-panel[data-panel="' + name + '"]');
  }
  function navEl(name) {
    return document.querySelector('#settingsModal .settings-nav button[data-panel="' + name + '"]');
  }

  function switchPanel(name) {
    var panels = document.querySelectorAll("#settingsModal .settings-panel");
    Array.prototype.forEach.call(panels, function (p) {
      p.hidden = p.getAttribute("data-panel") !== name;
    });
    var navs = document.querySelectorAll("#settingsModal .settings-nav button");
    Array.prototype.forEach.call(navs, function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-panel") === name);
    });
  }

  function open() {
    settings = settings || load();
    syncUI();
    var modal = document.getElementById("settingsModal");
    var backdrop = document.getElementById("settingsBackdrop");
    if (modal) modal.hidden = false;
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add("modal-open");
    switchPanel("appearance");
    loadAppInfo();
  }

  function close() {
    var modal = document.getElementById("settingsModal");
    var backdrop = document.getElementById("settingsBackdrop");
    if (modal) modal.hidden = true;
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function syncUI() {
    settings = settings || load();
    var themeBtns = document.querySelectorAll("#settingsModal .set-theme .chip-btn");
    Array.prototype.forEach.call(themeBtns, function (b) {
      b.classList.toggle("is-active", b.dataset.mode === settings.themeMode);
    });
    var accentHost = document.getElementById("setAccents");
    if (accentHost) {
      accentHost.innerHTML = "";
      ACCENTS.forEach(function (c) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "accent-dot" + (c === settings.accent ? " is-active" : "");
        b.style.background = c;
        b.title = c;
        b.addEventListener("click", function () { save({ accent: c }); syncUI(); });
        accentHost.appendChild(b);
      });
    }
    var autoUpd = document.getElementById("setAutoUpdate");
    if (autoUpd) autoUpd.checked = settings.autoUpdate !== false;
    var autoRst = document.getElementById("setAutoRestart");
    if (autoRst) autoRst.checked = settings.autoRestart !== false;
    if (document.getElementById("setBarPos")) {
      var bcfg = settings.subtitleBar || { pos: 5.5, width: 92, opacity: 42 };
      document.getElementById("setBarPos").value = bcfg.pos;
      document.getElementById("setBarPosVal").textContent = bcfg.pos + "%";
      document.getElementById("setBarWidth").value = bcfg.width;
      document.getElementById("setBarWidthVal").textContent = bcfg.width + "%";
      document.getElementById("setBarOpacity").value = bcfg.opacity;
      document.getElementById("setBarOpacityVal").textContent = bcfg.opacity + "%";
    }
    var autoHideBox = document.getElementById("setAutoHide");
    if (autoHideBox) autoHideBox.checked = settings.autoHideControls !== false;
    var bcfg0 = settings.subtitleBar || {};
    if (document.getElementById("setBarFont")) document.getElementById("setBarFont").value = bcfg0.font || "sans";
    if (document.getElementById("setBarRadius")) {
      var rad = bcfg0.radius != null ? bcfg0.radius : 32;
      document.getElementById("setBarRadius").value = rad;
      document.getElementById("setBarRadiusVal").textContent = rad + "%";
    }
    var previewBtns = document.querySelectorAll("#settingsModal .set-preview .chip-btn");
    Array.prototype.forEach.call(previewBtns, function (b) {
      b.classList.toggle("is-active", b.dataset.preview === (settings.previewStyle || "classic"));
    });
    var subBtns = document.querySelectorAll("#settingsModal .set-subtitle .chip-btn");
    Array.prototype.forEach.call(subBtns, function (b) {
      b.classList.toggle("is-active", b.dataset.sub === (settings.subtitleStyle || "inline"));
    });

    var accentInput = document.getElementById("setAccentCustom");
    if (accentInput) accentInput.value = settings.accent;
    var uiFont = document.getElementById("setUiFont");
    if (uiFont) uiFont.value = settings.uiFont;
    var lyricFont = document.getElementById("setLyricFont");
    if (lyricFont) {
      var src = document.getElementById("lyricFont");
      if (src && lyricFont.options.length <= 1) {
        Array.prototype.forEach.call(src.options, function (o) {
          var opt = document.createElement("option");
          opt.value = o.value;
          opt.textContent = o.textContent;
          lyricFont.appendChild(opt);
        });
      }
      if (settings.lyricFont) lyricFont.value = settings.lyricFont;
    }
    var lyricSize = document.getElementById("setLyricSize");
    if (lyricSize) {
      lyricSize.value = settings.lyricSize;
      var out = document.getElementById("setLyricSizeVal");
      if (out) out.textContent = Number(settings.lyricSize).toFixed(1) + "%";
    }
    var motionBtns = document.querySelectorAll("#settingsModal .set-motion .chip-btn");
    Array.prototype.forEach.call(motionBtns, function (b) {
      b.classList.toggle("is-active", b.dataset.motion === settings.motion);
    });
    var ratioBtns = document.querySelectorAll("#settingsModal .set-ratio .chip-btn");
    Array.prototype.forEach.call(ratioBtns, function (b) {
      b.classList.toggle("is-active", b.dataset.ratio === settings.ratio);
    });
  }

  /* ---------------- 更新与关于 ---------------- */

  function setUpdateStatus(text, kind) {
    var el = document.getElementById("updateStatus");
    if (!el) return;
    el.textContent = text;
    el.className = "update-status" + (kind ? " is-" + kind : "");
  }

  function renderCommits(list) {
    var host = document.getElementById("updateCommits");
    if (!host) return;
    host.innerHTML = "";
    (list || []).forEach(function (c) {
      var row = document.createElement("div");
      row.className = "update-commit";
      var sha = document.createElement("code");
      sha.textContent = String(c.sha || "").slice(0, 7);
      var msg = document.createElement("span");
      msg.textContent = c.message || "";
      var date = document.createElement("small");
      date.textContent = c.date ? String(c.date).replace("T", " ").slice(0, 16) : "";
      row.appendChild(sha);
      row.appendChild(msg);
      row.appendChild(date);
      host.appendChild(row);
    });
  }

  function loadAppInfo() {
    fetch("/api/app/info")
      .then(function (r) { return r.json(); })
      .then(function (info) {
        NS.__appInfo = info;
        var v = document.getElementById("aboutVersion");
        if (v) v.textContent = "v" + (info.version || "?") + (info.commit ? " · " + info.commit : "") + (info.desktop ? " · 桌面版" : " · 网页版");
        var a = document.getElementById("aboutAuthor");
        if (a && info.author) a.textContent = info.author.name + " · " + info.author.email;
        var g = document.getElementById("aboutGithub");
        if (g && info.repo) {
          g.textContent = info.repo;
          g.href = info.repo;
        }
      })
      .catch(function () {});
  }

  function checkUpdate() {
    setUpdateStatus("正在检查 GitHub 更新…", "busy");
    var btn = document.getElementById("btnCheckUpdate");
    if (btn) btn.disabled = true;
    fetch("/api/update/check")
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.error) || "检查失败");
        renderCommits(res.commits);
        var apply = document.getElementById("btnApplyUpdate");
        if (res.upToDate) {
          setUpdateStatus("已是最新版本（" + (res.local.commit || "").slice(0, 7) + "）", "ok");
          if (apply) apply.disabled = true;
        } else {
          setUpdateStatus("发现 " + res.behind + " 个新提交，可立即更新", "warn");
          if (apply) apply.disabled = false;
        }
      })
      .catch(function (err) {
        setUpdateStatus("检查失败：" + err.message + "（本机需能访问 github.com）", "error");
      })
      .then(function () { if (btn) btn.disabled = false; });
  }

  function applyUpdate() {
    var btn = document.getElementById("btnApplyUpdate");
    if (btn) btn.disabled = true;
    setUpdateStatus("正在拉取更新（git pull）…", "busy");
    fetch("/api/update/pull", { method: "POST" })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.error) || "更新失败");
        if (NS.__appInfo && NS.__appInfo.desktop) {
          setUpdateStatus("更新完成，正在重启 Code MV…", "ok");
          fetch("/api/app/restart", { method: "POST" })
            .then(function (r) { return r.json(); })
            .then(function (r2) {
              if (!r2 || !r2.ok) throw new Error((r2 && r2.error) || "自动重启失败");
              /* 兜底：若 6 秒后页面还在（重启失败），刷新页面 */
              window.setTimeout(reloadApp, 6000);
            })
            .catch(function (err2) {
              setUpdateStatus("自动重启失败：" + err2.message + "，改为刷新页面", "warn");
              window.setTimeout(reloadApp, 1200);
            });
        } else {
          setUpdateStatus("更新完成：" + (res.summary || "已是最新") + "，即将重新加载…", "ok");
          window.setTimeout(reloadApp, 1200);
        }
      })
      .catch(function (err) {
        setUpdateStatus("更新失败：" + err.message, "error");
        if (btn) btn.disabled = false;
      });
  }

  /* ---------------- 启动时自动更新 ---------------- */

  function updateCheckedThisLaunch() {
    try { return sessionStorage.getItem("codemv.autoUpdate.checked") === "1"; } catch (e) { return false; }
  }
  function markUpdateChecked() {
    try { sessionStorage.setItem("codemv.autoUpdate.checked", "1"); } catch (e) {}
  }

  function autoUpdateOnLaunch() {
    if (settings.autoUpdate === false) return;
    if (updateCheckedThisLaunch()) return;
    var hash = window.location.hash || "";
    if (hash.indexOf("demo") >= 0) return; /* 演示/截图环境不自动更新 */
    markUpdateChecked();
    fetch("/api/update/check")
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.ok || res.upToDate) return null;
        setUpdateStatus("发现新版本，正在自动更新…", "busy");
        return fetch("/api/update/pull", { method: "POST" })
          .then(function (r) { return r.json(); })
          .then(function (pull) {
            if (!pull || !pull.ok) {
              setUpdateStatus("自动更新失败：" + ((pull && pull.error) || "未知错误"), "error");
              return null;
            }
            return fetch("/api/app/info")
              .then(function (r) { return r.json(); })
              .then(function (info) { showUpdateDialog(res, pull, info || {}); })
              .catch(function () { showUpdateDialog(res, pull, {}); });
          });
      })
      .catch(function () {});
  }

  var autoRestartTimer = null;
  var autoRestartLeft = 0;

  function clearAutoRestart() {
    if (autoRestartTimer) { window.clearInterval(autoRestartTimer); autoRestartTimer = null; }
    autoRestartLeft = 0;
    var apply = document.getElementById("btnUpdateApplyNow");
    if (apply) {
      apply.textContent = (NS.__appInfo && NS.__appInfo.desktop) ? "重启并应用" : "刷新页面";
    }
  }

  function startAutoRestart(info) {
    clearAutoRestart();
    if (settings.autoRestart === false) return;
    autoRestartLeft = 5;
    var apply = document.getElementById("btnUpdateApplyNow");
    var note = document.getElementById("updateNote");
    function paint() {
      if (apply) apply.textContent = "重启并应用（" + autoRestartLeft + "s）";
      if (note) {
        var base = info && info.desktop ? "已拉取最新代码，即将自动重启软件。" : "已拉取最新代码，即将自动刷新页面。";
        note.textContent = base + " " + autoRestartLeft + " 秒后自动执行。";
      }
    }
    paint();
    autoRestartTimer = window.setInterval(function () {
      autoRestartLeft -= 1;
      if (autoRestartLeft <= 0) {
        clearAutoRestart();
        applyUpdateNow();
        return;
      }
      paint();
    }, 1000);
  }

  function showUpdateDialog(res, pull, info) {
    var modal = document.getElementById("updateModal");
    var backdrop = document.getElementById("updateBackdrop");
    if (!modal) return;
    var verEl = document.getElementById("updateNewVersion");
    var hashEl = document.getElementById("updateNewHash");
    if (verEl) verEl.textContent = (info.version ? "v" + info.version : "—");
    if (hashEl) hashEl.textContent = (res.latest && res.latest.commit) || (info.commit || "—");
    renderCommitsTo("updateCommitsList", res.commits);
    var note = document.getElementById("updateNote");
    if (note) {
      var t = pull && pull.summary ? "已拉取：" + pull.summary : "已拉取最新代码";
      t += info.desktop ? "。重启软件后生效。" : "。刷新页面后生效。";
      note.textContent = t;
    }
    var apply = document.getElementById("btnUpdateApplyNow");
    if (apply) apply.textContent = (NS.__appInfo && NS.__appInfo.desktop) || (info && info.desktop) ? "重启并应用" : "刷新页面";
    modal.hidden = false;
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add("modal-open");
    startAutoRestart(info);
  }

  function renderCommitsTo(id, list) {
    var host = document.getElementById(id);
    if (!host) return;
    host.innerHTML = "";
    (list || []).forEach(function (c) {
      var row = document.createElement("div");
      row.className = "update-commit";
      var sha = document.createElement("code");
      sha.textContent = String(c.short || c.sha || "").slice(0, 7);
      var msg = document.createElement("span");
      msg.textContent = c.message || "";
      var date = document.createElement("small");
      date.textContent = c.date ? String(c.date).replace("T", " ").slice(0, 16) : "";
      row.appendChild(sha); row.appendChild(msg); row.appendChild(date);
      host.appendChild(row);
    });
  }

  function closeUpdateDialog() {
    clearAutoRestart();
    var modal = document.getElementById("updateModal");
    var backdrop = document.getElementById("updateBackdrop");
    if (modal) modal.hidden = true;
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function applyUpdateNow() {
    clearAutoRestart();
    if (NS.__appInfo && NS.__appInfo.desktop) {
      fetch("/api/app/restart", { method: "POST" }).catch(function () {}).then(function () {
        window.setTimeout(reloadApp, 5000);
      });
    } else {
      reloadApp();
    }
  }

  function reloadApp() {
    try {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          regs.forEach(function (r) { r.unregister(); });
        });
      }
    } catch (e) {}
    window.setTimeout(function () { location.reload(); }, 300);
  }

  /* ---------------- 初始化 ---------------- */

  function bind() {
    settings = load();
    apply();

    if (document.getElementById("settingsBackdrop")) {
      document.getElementById("settingsBackdrop").addEventListener("click", close);
    }
    var done = document.getElementById("btnSettingsDone");
    if (done) done.addEventListener("click", close);
    var closeBtn = document.getElementById("btnSettingsClose");
    if (closeBtn) closeBtn.addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      var modal = document.getElementById("settingsModal");
      if (e.key === "Escape" && modal && !modal.hidden) close();
    });

    var navs = document.querySelectorAll("#settingsModal .settings-nav button");
    Array.prototype.forEach.call(navs, function (b) {
      b.addEventListener("click", function () { switchPanel(b.getAttribute("data-panel")); });
    });

    var themeBtns = document.querySelectorAll("#settingsModal .set-theme .chip-btn");
    Array.prototype.forEach.call(themeBtns, function (b) {
      b.addEventListener("click", function () { save({ themeMode: b.dataset.mode }); syncUI(); });
    });

    /* 顶栏主题切换按钮：回写设置，避免两套状态打架 */
    var themeBtn = document.getElementById("btnTheme");
    if (themeBtn) {
      themeBtn.addEventListener("click", function () {
        window.setTimeout(function () {
          var now = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
          save({ themeMode: now });
          syncUI();
        }, 0);
      });
    }
    var autoUpd = document.getElementById("setAutoUpdate");
    if (autoUpd) autoUpd.checked = settings.autoUpdate !== false;
    var autoRst = document.getElementById("setAutoRestart");
    if (autoRst) autoRst.checked = settings.autoRestart !== false;
    if (document.getElementById("setBarPos")) {
      var bcfg = settings.subtitleBar || { pos: 5.5, width: 92, opacity: 42 };
      document.getElementById("setBarPos").value = bcfg.pos;
      document.getElementById("setBarPosVal").textContent = bcfg.pos + "%";
      document.getElementById("setBarWidth").value = bcfg.width;
      document.getElementById("setBarWidthVal").textContent = bcfg.width + "%";
      document.getElementById("setBarOpacity").value = bcfg.opacity;
      document.getElementById("setBarOpacityVal").textContent = bcfg.opacity + "%";
    }
    var autoHideBox = document.getElementById("setAutoHide");
    if (autoHideBox) autoHideBox.checked = settings.autoHideControls !== false;
    var bcfg0 = settings.subtitleBar || {};
    if (document.getElementById("setBarFont")) document.getElementById("setBarFont").value = bcfg0.font || "sans";
    if (document.getElementById("setBarRadius")) {
      var rad = bcfg0.radius != null ? bcfg0.radius : 32;
      document.getElementById("setBarRadius").value = rad;
      document.getElementById("setBarRadiusVal").textContent = rad + "%";
    }
    var previewBtns = document.querySelectorAll("#settingsModal .set-preview .chip-btn");
    Array.prototype.forEach.call(previewBtns, function (b) {
      b.classList.toggle("is-active", b.dataset.preview === (settings.previewStyle || "classic"));
    });
    var subBtns = document.querySelectorAll("#settingsModal .set-subtitle .chip-btn");
    Array.prototype.forEach.call(subBtns, function (b) {
      b.classList.toggle("is-active", b.dataset.sub === (settings.subtitleStyle || "inline"));
    });

    var accentInput = document.getElementById("setAccentCustom");
    if (accentInput) {
      accentInput.addEventListener("input", function () { save({ accent: accentInput.value }); });
    }
    var autoUpdBox = document.getElementById("setAutoUpdate");
    if (autoUpdBox) {
      autoUpdBox.addEventListener("change", function () { save({ autoUpdate: !!autoUpdBox.checked }); });
    }
    var autoRstBox = document.getElementById("setAutoRestart");
    if (autoRstBox) {
      autoRstBox.addEventListener("change", function () { save({ autoRestart: !!autoRstBox.checked }); });
    }
    if (document.getElementById("setBarPos")) {
      var bcfg = settings.subtitleBar || { pos: 5.5, width: 92, opacity: 42 };
      document.getElementById("setBarPos").value = bcfg.pos;
      document.getElementById("setBarPosVal").textContent = bcfg.pos + "%";
      document.getElementById("setBarWidth").value = bcfg.width;
      document.getElementById("setBarWidthVal").textContent = bcfg.width + "%";
      document.getElementById("setBarOpacity").value = bcfg.opacity;
      document.getElementById("setBarOpacityVal").textContent = bcfg.opacity + "%";
    }
    var autoHideBox = document.getElementById("setAutoHide");
    if (autoHideBox) autoHideBox.checked = settings.autoHideControls !== false;
    var bcfg0 = settings.subtitleBar || {};
    if (document.getElementById("setBarFont")) document.getElementById("setBarFont").value = bcfg0.font || "sans";
    if (document.getElementById("setBarRadius")) {
      var rad = bcfg0.radius != null ? bcfg0.radius : 32;
      document.getElementById("setBarRadius").value = rad;
      document.getElementById("setBarRadiusVal").textContent = rad + "%";
    }
    var previewBtns = document.querySelectorAll("#settingsModal .set-preview .chip-btn");
    Array.prototype.forEach.call(previewBtns, function (b) {
      b.classList.toggle("is-active", b.dataset.preview === (settings.previewStyle || "classic"));
    });
    var subBtns = document.querySelectorAll("#settingsModal .set-subtitle .chip-btn");
    Array.prototype.forEach.call(subBtns, function (b) {
      b.addEventListener("click", function () {
        save({ subtitleStyle: b.dataset.sub });
        syncUI();
        if (NS.__redrawStage) NS.__redrawStage();
      });
    });
    var uiFont = document.getElementById("setUiFont");
    if (uiFont) uiFont.addEventListener("change", function () { save({ uiFont: uiFont.value }); });
    var lyricFont = document.getElementById("setLyricFont");
    if (lyricFont) lyricFont.addEventListener("change", function () { save({ lyricFont: lyricFont.value }); });
    var lyricSize = document.getElementById("setLyricSize");
    if (lyricSize) {
      lyricSize.addEventListener("input", function () {
        var out = document.getElementById("setLyricSizeVal");
        if (out) out.textContent = Number(lyricSize.value).toFixed(1) + "%";
        save({ lyricSize: Number(lyricSize.value) });
      });
    }
    var motionBtns = document.querySelectorAll("#settingsModal .set-motion .chip-btn");
    Array.prototype.forEach.call(motionBtns, function (b) {
      b.addEventListener("click", function () { save({ motion: b.dataset.motion }); syncUI(); });
    });
    var ratioBtns = document.querySelectorAll("#settingsModal .set-ratio .chip-btn");
    Array.prototype.forEach.call(ratioBtns, function (b) {
      b.addEventListener("click", function () {
        save({ ratio: b.dataset.ratio });
        syncUI();
      });
    });
    var reset = document.getElementById("btnSettingsReset");
    if (reset) {
      reset.addEventListener("click", function () {
        settings = Object.assign({}, DEFAULTS);
        NS.utils.storageSet("localStorage", KEY, JSON.stringify(settings));
        apply();
        syncUI();
        if (NS.utils && NS.utils.toast) NS.utils.toast("设置已恢复默认", "ok");
      });
    }

    if (document.getElementById("updateBackdrop")) {
      document.getElementById("updateBackdrop").addEventListener("click", closeUpdateDialog);
    }
    if (document.getElementById("btnUpdateClose")) document.getElementById("btnUpdateClose").addEventListener("click", closeUpdateDialog);
    if (document.getElementById("btnUpdateLater")) document.getElementById("btnUpdateLater").addEventListener("click", closeUpdateDialog);
    if (document.getElementById("btnUpdateApplyNow")) document.getElementById("btnUpdateApplyNow").addEventListener("click", applyUpdateNow);

    function bindBarRange(id, key, suffix) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", function () {
        var v = Number(el.value);
        var out = document.getElementById(id + "Val");
        if (out) out.textContent = v + suffix;
        var bar = Object.assign({ pos: 5.5, width: 92, opacity: 42 }, settings.subtitleBar || {});
        bar[key] = v;
        save({ subtitleBar: bar });
        if (NS.__redrawStage) NS.__redrawStage();
      });
    }
    bindBarRange("setBarPos", "pos", "%");
    bindBarRange("setBarRadius", "radius", "%");
    var barFontEl = document.getElementById("setBarFont");
    if (barFontEl) {
      barFontEl.addEventListener("change", function () {
        var bar = Object.assign({ pos: 5.5, width: 92, opacity: 42, font: "sans", radius: 32 }, settings.subtitleBar || {});
        bar.font = barFontEl.value;
        save({ subtitleBar: bar });
        if (NS.__redrawStage) NS.__redrawStage();
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll("#settingsModal .set-preview .chip-btn"), function (b) {
      b.addEventListener("click", function () {
        save({ previewStyle: b.dataset.preview });
        syncUI();
      });
    });
    var autoHideEl = document.getElementById("setAutoHide");
    if (autoHideEl) {
      autoHideEl.addEventListener("change", function () { save({ autoHideControls: !!autoHideEl.checked }); });
    }
    bindBarRange("setBarWidth", "width", "%");
    bindBarRange("setBarOpacity", "opacity", "%");

    var check = document.getElementById("btnCheckUpdate");
    if (check) check.addEventListener("click", checkUpdate);
    var applyBtn = document.getElementById("btnApplyUpdate");
    if (applyBtn) applyBtn.addEventListener("click", applyUpdate);
    var reloadBtn = document.getElementById("btnReloadApp");
    if (reloadBtn) reloadBtn.addEventListener("click", reloadApp);

    /* 启动时自动更新（延迟执行，不影响首屏） */
    window.setTimeout(autoUpdateOnLaunch, 3500);

    /* 跟随系统主题变化 */
    if (window.matchMedia) {
      try {
        window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () {
          if (settings.themeMode === "system") apply();
        });
      } catch (e) {}
    }
  }

  NS.settings = {
    open: open,
    close: close,
    load: load,
    save: save,
    apply: apply,
    current: function () { return settings || load(); },
    checkUpdate: checkUpdate,
    applyUpdate: applyUpdate,
    autoUpdateOnLaunch: autoUpdateOnLaunch,
    __showUpdateForTest: function (res, pull, info) { showUpdateDialog(res || {}, pull || {}, info || {}); },
    init: bind
  };
})(window.CodeMV);
