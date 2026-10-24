/* Folia 上游 stage 页桥接（实验）
   前提：vendor/folia-build/codemv-stage.html 存在（node tools/build-folia.cjs --stage 生成）。
   父页面向 iframe 发送时间/歌词，iframe 用上游 VisualizerRenderer 渲染。 */
window.CodeMV = window.CodeMV || {};
(function (NS) {
  "use strict";
  var STAGE = "vendor/folia-build/codemv-stage.html";
  var frame = null;
  var isOpen = false;
  var ready = false;
  var mode = "fume";

  function head(url) {
    return new Promise(function (resolve) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open("HEAD", url, true);
        xhr.onload = function () { resolve(xhr.status >= 200 && xhr.status < 400); };
        xhr.onerror = function () { resolve(false); };
        xhr.send();
      } catch (e) { resolve(false); }
    });
  }

  function post(payload) {
    if (!frame || !ready || !frame.contentWindow) return;
    try { frame.contentWindow.postMessage(payload, window.location.origin); } catch (e) {}
  }

  function seek(t) { post({ type: "codemv:seek", t: t }); }

  function iframeCanvasList() {
    try {
      var doc = frame && frame.contentDocument;
      if (!doc) return [];
      return Array.prototype.slice.call(doc.querySelectorAll("#root canvas"));
    } catch (e) {
      return [];
    }
  }

  function snapshotComposite(outCtx, W, H) {
    var doc = frame && frame.contentDocument;
    if (!doc) return false;
    var list = iframeCanvasList();
    if (!list.length) return false;
    var vw = (doc.documentElement && doc.documentElement.clientWidth) || frame.clientWidth || W;
    var vh = (doc.documentElement && doc.documentElement.clientHeight) || frame.clientHeight || H;
    var sx = W / Math.max(1, vw);
    var sy = H / Math.max(1, vh);
    outCtx.save();
    outCtx.globalAlpha = 1;
    outCtx.globalCompositeOperation = "source-over";
    outCtx.fillStyle = "#000";
    outCtx.fillRect(0, 0, W, H);
    for (var i = 0; i < list.length; i++) {
      var cv = list[i];
      try {
        var cs = doc.defaultView.getComputedStyle(cv);
        if (!cs || cs.display === "none" || cs.visibility === "hidden") continue;
        var r = cv.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        var op = parseFloat(cs.opacity);
        outCtx.globalAlpha = isFinite(op) ? Math.max(0, Math.min(1, op)) : 1;
        var blend = cs.mixBlendMode;
        outCtx.globalCompositeOperation =
          blend === "screen" || blend === "lighten" || blend === "plus-lighter"
            ? "screen"
            : blend === "multiply"
            ? "multiply"
            : "source-over";
        outCtx.drawImage(cv, r.left * sx, r.top * sy, r.width * sx, r.height * sy);
      } catch (e) {}
    }
    outCtx.restore();
    return true;
  }

  /** 等待 iframe 内部完成一帧渲染（用于逐帧取图，约 16~20ms） */
  function waitFrame(timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function () { if (!done) { done = true; resolve(); } };
      try {
        var win = frame && frame.contentWindow;
        if (win && win.requestAnimationFrame) win.requestAnimationFrame(finish);
        else window.setTimeout(finish, 16);
      } catch (e) { window.setTimeout(finish, 16); }
      /* 防止 iframe 被隐藏/节流时取帧永久挂起 */
      window.setTimeout(finish, Math.max(80, Number(timeoutMs) || 500));
    });
  }

  function pushState(t, playingOverride) {
    if (!isOpen || !NS.__getFoliaState) return;
    var s = NS.__getFoliaState(t) || {};
    post({
      type: "codemv:state",
      t: t,
      duration: s.duration || 0,
      playing: typeof playingOverride === "boolean" ? playingOverride : !!s.playing,
      lines: s.lines || [],
      coverUrl: s.coverUrl || "",
      artist: s.artist || "",
      title: s.title || ""
    });
  }

  function setMode(m) {
    mode = m || mode;
    post({ type: "codemv:mode", mode: mode });
  }

  function open() {
    frame = frame || document.getElementById("foliaFrame");
    var modal = document.getElementById("foliaModal");
    var hint = document.getElementById("foliaHint");
    if (!frame || !modal) return;
    head(STAGE).then(function (ok) {
      if (!ok) {
        if (hint) hint.textContent = "未找到 vendor/folia-build/codemv-stage.html：先运行 node tools/build-folia.cjs --stage（需要 npm 和网络）。";
        return;
      }
      if (hint) hint.textContent = "上游 Folia visualizer 运行中（像素级还原）。";
      ready = false;
      isOpen = true;
      frame.src = STAGE + "?mode=" + encodeURIComponent(mode);
      modal.hidden = false;
      document.body.classList.add("folia-active");
    });
  }

  function close() {
    isOpen = false;
    document.body.classList.remove("folia-active");
    var modal = document.getElementById("foliaModal");
    if (modal) modal.hidden = true;
    if (NS.__redrawStage) NS.__redrawStage();
  }

  window.addEventListener("message", function (ev) {
    var m = ev.data || {};
    if (m.type === "codemv:stage-ready") {
      ready = true;
      setMode(mode);
      pushState(NS.__getFoliaCurrentTime ? NS.__getFoliaCurrentTime() : 0);
    }
  });

  NS.foliaBridge = {
    open: open,
    close: close,
    pushState: pushState,
    setMode: setMode,
    seek: seek,
    waitFrame: waitFrame,
    snapshotComposite: snapshotComposite,
    isOpen: function () { return isOpen; },
    isReady: function () { return ready; }
  };
})(window.CodeMV);
