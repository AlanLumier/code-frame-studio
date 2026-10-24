/* ==========================================================================
   CodeMV · 主程序
   --------------------------------------------------------------------------
   串起整条链路：
     音频 → 解码/分析 → 歌词对齐 → 分镜脚本 → 确定性渲染 → 导出视频
   ========================================================================== */

(function () {
  "use strict";

  var NS = window.CodeMV;

  function $(id) {
    return document.getElementById(id);
  }

  function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
  }

  /* ---------- 状态 ---------- */
  var state = {
    volume: (function () { try { var v = NS.utils.storageGet("localStorage", "codemv.volume"); return v == null ? 1 : Math.max(0, Math.min(1, Number(v))); } catch (e) { return 1; } })(),
    muted: false,
    audioBuffer: null,
    features: null,
    lines: [],
    script: null,
    story: [],
    alan: null,
    aligned: false,
    alignRows: null,
    codeMode: false,
    styleId: "story",
    ratio: "16:9",
    exportName: "",
    author: "",
    creditEnabled: false,
    exportMode: "realtime",
    exporting: false,
    silent: false,
    title: "",
    artist: "",
    duration: 0,
    playing: false,
    offset: 0,
    startedAt: 0,
    source: null,
    raf: 0
  };

  var canvas;
  var ctx;

  var DEMO_LRC = [
    "[00:02.00] 夜色落在窗前",
    "[00:06.00] 灯火把影子拉长",
    "[00:10.00] 我听见城市的呼吸",
    "[00:14.00] 像潮水涌向月亮",
    "[00:18.00] 如果风也会记得",
    "[00:22.00] 请把我的名字带走"
  ].join("\n");


  /* ======================================================================
     工具
     ====================================================================== */

  function setStatus(text, kind) {
    var el = $("statusBadge");
    if (!el) return;
    el.textContent = text;
    el.className = "badge" + (kind ? " is-" + kind : "");
  }

  function styleName(id) {
    if (id === "story") return "逐字生成";
    if (NS.styleLibrary) {
      var def = NS.styleLibrary.get(id);
      if (def) return def.name;
    }
    var list = (NS.script && NS.script.STYLES) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i].name;
    }
    return id;
  }

  function copyText(text) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch (e) {
        /* ignore */
      }
      document.body.removeChild(ta);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(fallback);
    }
    fallback();
    return Promise.resolve();
  }

  /* ======================================================================
     时间轴 / 歌词
     ====================================================================== */

  function currentTime() {
    if (state.playing) {
      if (state.silent) {
        return (performance.now() - state.startedAt) / 1000;
      }
      return NS.audio.context().currentTime - state.startedAt;
    }
    return state.offset;
  }

  /** 返回 t 时刻该显示的歌词（含淡入淡出与打字机进度） */
  function lyricAt(t) {
    var lines = state.lines;
    if (!lines || !lines.length) return null;

    var idx = NS.lrc.indexAt(lines, t);
    if (idx < 0) return null;

    var cur = lines[idx];
    var next = lines[idx + 1];
    var end = next ? Math.min(next.time, state.duration) : state.duration;
    var dur = Math.max(0.4, end - cur.time);
    var age = t - cur.time;

    var alpha = clamp(age / 0.45, 0, 1) * clamp((end - t) / 0.35, 0, 1);
    var typeProgress = clamp(age / Math.max(0.8, dur * 0.7), 0, 1);

    return {
      text: cur.text,
      index: idx,
      start: cur.time,
      end: end,
      age: age,
      dur: dur,
      alpha: alpha,
      typeProgress: typeProgress
    };
  }

  /* ======================================================================
     AI 代码模式
     ====================================================================== */

  function getSubtitleStyle() {
    try {
      var raw = JSON.parse(NS.utils.storageGet("localStorage", "codemv.settings") || "{}");
      return raw.subtitleStyle === "bar" ? "bar" : "inline";
    } catch (e) {
      return "inline";
    }
  }

  function getBarConfig() {
    try {
      var raw = JSON.parse(NS.utils.storageGet("localStorage", "codemv.settings") || "{}");
      var b = raw.subtitleBar || {};
      return {
        pos: b.pos != null ? Number(b.pos) : 5.5,
        width: b.width != null ? Number(b.width) : 92,
        opacity: b.opacity != null ? Number(b.opacity) : 42,
        font: b.font || "sans",
        radius: b.radius != null ? Number(b.radius) : 32
      };
    } catch (e) {
      return { pos: 5.5, width: 92, opacity: 42 };
    }
  }

  function drawSubtitleBar(t) {
    var line = lyricAt(t);
    if (!line || !line.text) return;
    var W = canvas.width;
    var H = canvas.height;
    var mainSize = Math.round(W * 0.036);
    var subSize = Math.round(W * 0.018);
    var cfg = getBarConfig();
    var FONT_MAP = {
      sans: '"PingFang SC","Microsoft YaHei",sans-serif',
      serif: '"Songti SC","SimSun",Georgia,serif',
      rounded: '"Yuanti SC","YouYuan","Microsoft YaHei",sans-serif',
      mono: 'Consolas,"Courier New",monospace'
    };
    var barFont = FONT_MAP[cfg.font] || FONT_MAP.sans;

    ctx.save();
    ctx.font = "600 " + mainSize + "px " + barFont;
    var mainW = ctx.measureText(line.text).width;
    var sub = line.translation || "";
    ctx.font = subSize + "px " + barFont;
    var subW = sub ? ctx.measureText(sub).width : 0;

    var padX = W * 0.035;
    var padY = H * 0.014;
    var boxW = Math.min(W * (cfg.width / 100), Math.max(mainW, subW) + padX * 2);
    var boxH = mainSize * 1.25 + (sub ? subSize * 1.7 : 0) + padY * 2;
    var x = (W - boxW) / 2;
    var y = H - boxH - H * (cfg.pos / 100);
    var r = boxH * Math.min(0.5, Math.max(0, cfg.radius / 100));

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + boxW, y, x + boxW, y + boxH, r);
    ctx.arcTo(x + boxW, y + boxH, x, y + boxH, r);
    ctx.arcTo(x, y + boxH, x, y, r);
    ctx.arcTo(x, y, x + boxW, y, r);
    ctx.closePath();
    ctx.fillStyle = "rgba(8,10,16," + (cfg.opacity / 100) + ")";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = Math.max(1, W * 0.0007);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(245,247,255,0.96)";
    ctx.font = "600 " + mainSize + "px " + barFont;
    ctx.fillText(line.text, W / 2, y + padY + mainSize * 0.62);
    if (sub) {
      ctx.fillStyle = "rgba(220,226,240,0.72)";
      ctx.font = subSize + "px " + barFont;
      ctx.fillText(sub, W / 2, y + padY + mainSize * 1.25 + subSize * 0.9);
    }
    ctx.restore();
  }

  function drawLyricOverlay(t) {
    if (!state.script) return;

    var palette = NS.script.paletteRgb(state.script);
    var W = canvas.width;
    var H = canvas.height;

    var api = {
      t: t,
      palette: palette,
      title: state.title,
      line: function (t2) {
        return lyricAt(t2);
      }
    };

    NS.scenes.helpers.drawLyric(ctx, W, H, api, {
      y: H * 0.5,
      glow: [240, 246, 255],
      weight: 500,
      size: Math.round(W * 0.045)
    });

    var curLine = lyricAt(t);
    if (curLine && curLine.translation) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "rgb(" + palette[3].join(",") + ")";
      ctx.font = Math.round(W * 0.022) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(curLine.translation, W / 2, H * 0.5 + W * 0.045 * 1.5);
      ctx.restore();
    }

    NS.scenes.helpers.drawIntroTitle(ctx, W, H, api, {});
  }

  function stopSceneCode(redraw) {
    if (NS.sceneCode) NS.sceneCode.stop();
    state.codeMode = false;
    var hint = $("codeHint");
    if (hint) hint.textContent = "未启用";
    if (redraw) drawAt(currentTime());
  }

  /* ---------- 离线一键生成 MV（不需要 AI 接口） ---------- */
  function autoGenerateMV() {
    if (!state.audioBuffer) { if (NS.utils && NS.utils.toast) NS.utils.toast("先载入歌曲", "warn"); return; }
    if (!state.lines || !state.lines.length) { if (NS.utils && NS.utils.toast) NS.utils.toast("先导入歌词", "warn"); return; }
    if (!NS.mvAuto) { if (NS.utils && NS.utils.toast) NS.utils.toast("离线生成器未加载", "warn"); return; }
    var code = NS.mvAuto.build(state.lines.map(function (l) { return { text: l.text, time: l.time }; }), state.duration);
    startSceneCode(code);
    if (NS.utils && NS.utils.toast) NS.utils.toast("已按歌词关键词生成 " + state.lines.length + " 个镜头（离线）", "ok");
  }

  function startSceneCode(code) {
    if (!state.audioBuffer || !state.script) {
      setStatus("先加载歌曲", "");
      return;
    }

    var palette = NS.script.paletteRgb(state.script);

    state.codeMode = false;
    $("codeHint").textContent = "自检中…";
    setStatus("代码自检中…", "busy");

    NS.sceneCode.start({
      code: code,
      width: canvas.width,
      height: canvas.height,
      duration: state.duration,
      fps: 30,
      palette: {
        deep: palette[0],
        primary: palette[1],
        accent: palette[2],
        light: palette[3]
      },
      sections: state.script.sections,
      lines: state.lines,
      features: state.features,
      timeout: (function () {
        /* 允许用 #...&timeout=300000 调大自检超时（调试 / 慢机器） */
        var m = /timeout=(\d+)/.exec(location.hash || "");
        return m ? Math.min(600000, Number(m[1])) : 15000;
      })(),

      onFrame: function (bitmap, t) {
        if (!bitmap) return;
        var W = canvas.width;
        var H = canvas.height;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(bitmap, 0, 0, W, H);
        if (bitmap.close) bitmap.close();
        drawLyricOverlay(t);
        ctx.restore();
      },

      onState: function (mode, info) {
        info = info || {};

        if (mode === "booting") {
          setStatus("代码自检中…", "busy");
          return;
        }

        if (mode === "ready") {
          state.codeMode = true;
          var box = info.sandbox === "worker" ? "Worker 沙箱" : "主线程降级";
          setStatus("AI 代码已启用", "ok");
          $("codeHint").textContent =
            box + " · 确定性自检 " + (info.checked || 0) + " 帧通过";
          if ($("hudStyle")) $("hudStyle").textContent = "AI 画面代码";
          if (NS.utils && NS.utils.toast) {
            NS.utils.toast("AI 代码已启用 · " + box, "ok");
          }
          drawAt(currentTime());
          return;
        }

        if (mode === "failed") {
          var firstErr = (info && info.errors && info.errors[0]) || "未知错误";
          if ($("codeHint")) $("codeHint").textContent = "代码运行失败：" + firstErr;
          if (NS.utils && NS.utils.toast) NS.utils.toast("代码语法/运行错误，已显示在代码面板", "warn");
          state.codeMode = false;
          var msg =
            info.errors && info.errors.length ? info.errors[0] : "未知错误";
          setStatus("代码未通过，已回退情景模式", "");
          $("codeHint").textContent = "失败：" + String(msg).slice(0, 120);
          if ($("hudStyle")) $("hudStyle").textContent = styleName(state.styleId);
          if (NS.utils && NS.utils.toast) {
            NS.utils.toast("代码未通过，已回退", "warn");
          }
          drawAt(currentTime());
        }
      }
    });
  }

  /* ======================================================================
     渲染
     ====================================================================== */

  function drawAt(t) {
    if (!state.script) return;

    var scene = NS.scenes[state.script.style] || NS.scenes.liquid;
    var palette = NS.script.paletteRgb(state.script);
    var W = canvas.width;
    var H = canvas.height;
    var time = clamp(t, 0, state.duration || 0);

    /* 渲染钩子：供 render/render.mjs 与外部自动化读取/驱动 */
    if (window.__meta) {
      window.__meta.duration = state.duration || 0;
      window.__meta.style = state.script.style;
      window.__meta.width = W;
      window.__meta.height = H;
      window.__meta.ready = true;
      window.__ready = true;
    }

    /* 上游预览接管时：隐藏内置画布、停止重复渲染，只推送状态给 iframe */
    if (NS.foliaBridge && NS.foliaBridge.isOpen && NS.foliaBridge.isOpen()) {
      NS.foliaBridge.pushState(time);
      return;
    }

    var barMode = getSubtitleStyle() === "bar";
    NS.__barMode = barMode;

    /* AI 代码模式：主线程同步渲染 AI 画面，再叠歌词 */
    if (state.codeMode && NS.sceneCode && NS.sceneCode.isReady()) {
      NS.sceneCode.request(time);
      var srcCanvas = NS.sceneCode.getCanvas();
      if (srcCanvas) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(srcCanvas, 0, 0, W, H);
        if (barMode) drawSubtitleBar(time);
        else drawLyricOverlay(time);
        ctx.restore();
        NS.__barMode = false;
      }
      return;
    }

    var api = {
      t: time,
      palette: palette,
      story: state.story,
      alan: state.alan,
      section: NS.script.sectionAt(state.script, time),
      energy: function (t2) {
        return state.features ? NS.audio.energyAt(state.features, t2) : 0;
      },
      bass: function (t2) {
        return state.features ? NS.audio.bassAt(state.features, t2) : 0;
      },
      beatPhase: function (t2) {
        return state.features
          ? NS.audio.beatPhase(state.features, t2)
          : (t2 * 2) % 1;
      },
      line: function (t2) {
        return lyricAt(t2);
      },
      lines: state.lines,
      title: state.title,
      artist: state.artist
    };

    ctx.save();
    ctx.clearRect(0, 0, W, H);

    /* 生动化：镜头呼吸（缓慢推拉 + 轻微漂移） */
    var restoreCam = NS.live ? NS.live.applyCamera(ctx, W, H, time) : null;

    var noLyrics = !state.lines || !state.lines.length;

    if (noLyrics) {
      /* 没有歌词：用当前风格（或兜底风格）画背景，标题卡在最后叠加 */
      var fb =
        (NS.styleLibrary && NS.styleLibrary.get(state.script.style)) ||
        (NS.styleLibrary && NS.styleLibrary.get("min-white")) ||
        null;
      if (fb && NS.foliaFidelity && fb.folia) {
        NS.foliaFidelity.render(ctx, W, H, api, fb.folia);
      } else if (fb && NS.styleRender) {
        NS.styleRender.draw(ctx, W, H, api, fb);
      } else {
        scene.draw(ctx, W, H, api);
      }
    } else if (state.script.style === "story" && NS.alan) {
      /* 逐字驱动：每唱到一个字，画面实时变化 */
      NS.alan.render(ctx, W, H, api);
    } else if (
      NS.foliaFidelity &&
      NS.styleLibrary &&
      NS.styleLibrary.get(state.script.style) &&
      NS.styleLibrary.get(state.script.style).folia
    ) {
      /* Folia 还原模块（AGPL 可选）：直接绘制整套 visualizer */
      NS.foliaFidelity.render(
        ctx,
        W,
        H,
        api,
        NS.styleLibrary.get(state.script.style).folia
      );
    } else if (NS.styleLibrary && NS.styleLibrary.get(state.script.style) && NS.styleRender) {
      /* 参数化风格库：背景 + 形状层 + 纹理 + 歌词 + 叠层 */
      NS.styleRender.draw(ctx, W, H, api, NS.styleLibrary.get(state.script.style));
    } else if (state.script.style === "story" && NS.story) {
      NS.story.render(ctx, W, H, api);
    } else {
      scene.draw(ctx, W, H, api);
    }

    if (typeof restoreCam === "function") restoreCam();

    /* 没有歌词时：持续显示「歌名 - 歌手」标题卡 */
    if (!state.lines || !state.lines.length) {
      if (NS.lyricStyle && NS.lyricStyle.drawTitleCard) {
        NS.lyricStyle.drawTitleCard(ctx, W, H, api);
      }
    }

    /* Folia stage 预览同步 */
    if (NS.foliaBridge && NS.foliaBridge.isOpen && NS.foliaBridge.isOpen()) {
      NS.foliaBridge.pushState(t);
    }

    /* 片尾作者署名（导出时可选） */
    if (state.creditEnabled && state.author && state.duration) {
      var creditStart = Math.max(0, state.duration - 3.5);
      if (t > creditStart) {
        var ck = clamp((t - creditStart) / 0.8, 0, 1) * clamp((state.duration - t) / 0.6, 0, 1);
        ctx.save();
        ctx.globalAlpha = 0.62 * ck;
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.font = "500 " + Math.round(W * 0.016) + "px " + (NS.lyricStyle ? NS.lyricStyle.fontFamily() : "system-ui, sans-serif");
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 8;
        ctx.fillText("作者 · " + state.author, W - W * 0.03, H - H * 0.035);
        ctx.restore();
      }
    }

    /* 生动化：漂浮微尘 + 拍点微闪（叠在所有画面之上） */
    if (NS.live) {
      NS.live.atmosphere(ctx, W, H, time, api, { count: 64 });
      NS.live.flash(ctx, W, H, time, api, null, 0.02);
    }

    /* 底部字幕条：屏幕空间绘制，不受镜头缩放影响 */
    if (barMode) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawSubtitleBar(time);
      ctx.restore();
    }
    NS.__barMode = false;

    ctx.restore();
  }

  function flashStage() {
    var stage = document.querySelector(".stage");
    if (!stage) return;
    stage.classList.remove("is-switching");
    void stage.offsetWidth;
    stage.classList.add("is-switching");
    window.setTimeout(function () { stage.classList.remove("is-switching"); }, 520);
  }

  function updatePlayerBar() {
    if (!$("tpTitle")) return;
    $("tpTitle").textContent = state.title || "未命名";
    $("tpArtist").textContent = state.artist || "Code MV";

    var wrap = $("tpCoverWrap");
    var img = $("tpCover");
    if (state.coverUrl) {
      if (img.getAttribute("src") !== state.coverUrl) img.src = state.coverUrl;
      if (wrap) wrap.classList.add("has-cover");
    } else if (wrap) {
      wrap.classList.remove("has-cover");
    }

    if ($("inspCover")) {
      var ic = $("inspCover");
      if (state.coverUrl) { ic.src = state.coverUrl; ic.style.display = "block"; }
      else { ic.style.display = "none"; }
    }
    if ($("inspTitle")) $("inspTitle").textContent = state.title || "未命名";
    if ($("inspArtist")) $("inspArtist").textContent = state.artist || "Code MV";

    var bd = $("appBackdrop");
    if (bd) {
      if (state.coverUrl) {
        bd.style.backgroundImage = 'url("' + state.coverUrl + '")';
        bd.classList.add("has-cover");
      } else {
        bd.classList.remove("has-cover");
      }
    }
  }

  function updateTransport(t) {
    var fill = $("seekFill");
    var thumb = $("seekThumb");
    var seek = $("seek");
    var label = $("timeLabel");
    var dur = state.duration || 0;
    var pct = dur ? clamp(t / dur, 0, 1) * 100 : 0;
    if (fill) fill.style.width = pct + "%";
    if (thumb) thumb.style.left = pct + "%";
    if (seek) seek.setAttribute("aria-valuenow", String(Math.round(pct)));
    if (label) {
      label.textContent = NS.lrc.formatTime(t) + " / " + NS.lrc.formatTime(dur);
    }
    updatePlayerBar();
  }

  /* ======================================================================
     播放控制
     ====================================================================== */

  function setPlayIcon(playing) {
    var btn = $("btnPlay");
    if (!btn) return;
    btn.innerHTML =
      '<svg class="ico ico--fill" aria-hidden="true"><use href="#i-' +
      (playing ? "pause" : "play") +
      '" /></svg>';

    var cover = $("tpCoverWrap");
    if (cover) cover.classList.toggle("is-playing", !!playing && !!state.coverUrl);
    if (!playing) {
      document.body.classList.remove("controls-hidden");
    } else if (typeof NS.__scheduleHideControls === "function") {
      NS.__scheduleHideControls();
    }
  }

  function foliaSync(paused) {
    if (!NS.foliaBridge || !NS.foliaBridge.isOpen || !NS.foliaBridge.isOpen()) return;
    try { NS.foliaBridge.pushState(currentTime()); } catch (e) {}
  }

  NS.__redrawStage = function () {
    if (state.script) drawAt(currentTime());
  };

  function stopAudioSource() {
    if (state.source) {
      try { state.source.onended = null; } catch (e) {}
      try { state.source.stop(); } catch (e) {}
      try { state.source.disconnect(); } catch (e) {}
      state.source = null;
    }
    if (state.gain) {
      try { state.gain.disconnect(); } catch (e) {}
      state.gain = null;
    }
  }

  function haltPlayback() {
    cancelAnimationFrame(state.raf);
    state.playing = false;
    stopAudioSource();
    setPlayIcon(false);
  }

  function play() {
    if (!state.audioBuffer) {
      /* 静音预览：没有音频也能播放画面 */
      if (!state.silent || !state.duration) return;
      if (state.offset >= state.duration - 0.05) state.offset = 0;
      state.startedAt = performance.now() - state.offset * 1000;
      state.playing = true;
      setPlayIcon(true);
      foliaSync();
      cancelAnimationFrame(state.raf);
      state.raf = requestAnimationFrame(tick);
      return;
    }

    var actx = NS.audio.context();
    if (actx && actx.state === "suspended") {
      try { actx.resume(); } catch (e) {}
    }
    /* 音量被滚轮误调到 0 时自动恢复到可听音量，避免“没声音” */
    if (!state.muted && !(state.volume > 0.01)) {
      state.volume = 0.8;
      try { NS.utils.storageSet("localStorage", "codemv.volume", "0.8"); } catch (e) {}
      if ($("volumeRange")) $("volumeRange").value = "0.8";
      if (NS.utils && NS.utils.toast) NS.utils.toast("音量已恢复到 80%", "ok");
    }
    if (state.offset >= state.duration - 0.05) state.offset = 0;

    stopAudioSource(); /* 防止上一次音源仍在播放（叠音） */

    var src = actx.createBufferSource();
    src.buffer = state.audioBuffer;

    var gain = actx.createGain();
    gain.gain.value = state.muted ? 0 : state.volume;
    src.connect(gain);
    gain.connect(actx.destination);
    state.gain = gain;

    src.start(0, state.offset);

    state.source = src;
    state.startedAt = actx.currentTime - state.offset;
    state.playing = true;
    setPlayIcon(true);
    foliaSync();

    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(tick);
  }

  function pause() {
    if (!state.playing) return;

    var t = currentTime();
    state.offset = clamp(t, 0, state.duration);
    state.playing = false;
    foliaSync(true);

    stopAudioSource();

    cancelAnimationFrame(state.raf);
    setPlayIcon(false);
    drawAt(state.offset);
    updateTransport(state.offset);
  }

  function seekTo(t) {
    t = clamp(t, 0, state.duration);
    var wasPlaying = state.playing;

    if (wasPlaying) {
      if (state.source) {
        try {
          state.source.stop();
        } catch (e) {
          /* ignore */
        }
        state.source = null;
      }
      state.playing = false;
      cancelAnimationFrame(state.raf);
    }

    state.offset = t;
    drawAt(t);
    updateTransport(t);
    foliaSync();

    if (wasPlaying) play();
  }

  function tick() {
    if (!state.playing) return;

    var t = currentTime();

    if (t >= state.duration) {
      state.playing = false;
      stopAudioSource();
      state.offset = 0;
      setPlayIcon(false);
      drawAt(0);
      updateTransport(0);
      return;
    }

    drawAt(t);
    updateTransport(t);
    state.raf = requestAnimationFrame(tick);
  }

  /* ======================================================================
     分镜
     ====================================================================== */

  /** 没有音频时的「歌词静音预览」：用歌词时间轴驱动画面 */
  function enterSilentPreview(reason) {
    if (!state.lines || !state.lines.length) return;

    state.silent = true;
    state.playing = false;
    if (state.source) {
      try {
        state.source.stop();
      } catch (e) {}
      state.source = null;
    }

    var last = state.lines[state.lines.length - 1].time + 6;
    state.duration = Math.max(10, Math.round(last));
    state.offset = 0;
    state.features = null;

    hidePlaceholder();
    rebuildScript();
    drawAt(0);
    updateTransport(0);
    updateSongMeta();

    if ($("btnPlay")) $("btnPlay").disabled = false;
    if ($("btnExport")) $("btnExport").disabled = false;
    if ($("audioLabel")) {
      $("audioLabel").textContent = "仅歌词（无音频）";
    }
    setStatus("歌词预览 · 无音频", "ok");
    if (NS.utils && NS.utils.toast) {
      NS.utils.toast(reason || "音频未加载，已切换为歌词静音预览", "warn");
    }
  }

  function rebuildStory() {
    if (!state.lines.length) {
      state.story = [];
      state.alan = null;
      return;
    }

    if (NS.alan) {
      /* 逐字生成引擎：每个字有自己的时间片和概念 */
      state.alan = NS.alan.build(state.lines, state.duration, state.script);

      /* 做过强制对齐的话，用对齐后的词级时间覆盖 */
      if (state.aligned && state.alignRows && NS.align) {
        state.alan = NS.align.applyRows(state.alan, state.alignRows, true);
      }
    }

    if (NS.story) {
      state.story = NS.story.build(state.lines, state.duration, state.script);
    }
  }

  function rebuildScript() {
    state.script = NS.script.makeDefaultScript({
      style: state.styleId,
      lines: state.lines,
      duration: state.duration
    });
    state.styleId = state.script.style;
    rebuildStory();

    var mood = NS.script.MOODS[state.script.mood];
    $("styleName").textContent = styleName(state.styleId);
  }


  /* ======================================================================
     风格
     ====================================================================== */

  function setStyleActive(id) {
    var items = document.querySelectorAll(".style-item");
    Array.prototype.forEach.call(items, function (el) {
      el.classList.toggle("is-active", el.dataset.style === id);
    });
  }

  function pickStyle(id) {
    flashStage();
    /* Folia 风格卡片：自动打开上游预览并切换对应 visualizer */
    var foliaDef = NS.styleLibrary && NS.styleLibrary.get ? NS.styleLibrary.get(id) : null;
    if (foliaDef && foliaDef.folia && NS.foliaBridge) {
      if (NS.foliaBridge.setMode) NS.foliaBridge.setMode(foliaDef.folia);
      if (NS.foliaBridge.open) NS.foliaBridge.open();
    }

    /* AI 画面代码生效时风格会被覆盖：先退出代码模式，保证「点风格就生效」 */
    if (state.codeMode) {
      stopSceneCode(false);
      if (NS.utils && NS.utils.toast) {
        NS.utils.toast("已退出 AI 画面代码，切换到风格模式", "warn");
      }
    }

    state.styleId = id;
    if (state.script) state.script.style = id;
    setStyleActive(id);
    $("styleName").textContent = styleName(id);

    /* 立即重绘一帧：播放中也能马上看到变化 */
    drawAt(currentTime());
    updateSongMeta();

    if (NS.utils && NS.utils.toast) {
      NS.utils.toast("已切换到「" + styleName(id) + "」", "ok");
    }
  }

  function makeStyleCard(def) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "style-item";
    btn.dataset.style = def.id;
    btn.title = def.desc || def.name;

    var sw = document.createElement("span");
    sw.className = "style-swatch";
    if (def.id === "story") {
      sw.style.background =
        "radial-gradient(circle at 30% 30%, #dfe8ff, #7c9cff 45%, #0b1026)";
    } else {
      var pal = NS.styleLibrary.palette(def.id);
      sw.style.background =
        "linear-gradient(135deg, " +
        pal.bg[0] +
        ", " +
        pal.primary +
        " 60%, " +
        pal.accent +
        ")";
    }
    btn.appendChild(sw);

    var text = document.createElement("span");
    text.className = "style-text";
    var b = document.createElement("b");
    b.textContent = def.name;
    var small = document.createElement("small");
    small.textContent = def.desc || "";
    text.appendChild(b);
    text.appendChild(small);
    btn.appendChild(text);

    btn.addEventListener("click", function () {
      pickStyle(def.id);
    });
    return btn;
  }

  function buildStyleList() {
    var host = $("styleList");
    host.innerHTML = "";

    var cats = (NS.styleLibrary && NS.styleLibrary.CATEGORIES) || [];
    var story = { id: "story", name: "逐字生成", desc: "按歌词内容实时渲染（内置引擎）" };

    cats.forEach(function (cat) {
      var group = document.createElement("details");
      group.className = "style-group";
      group.dataset.cat = cat.id;
      if (cat.id === "scene" || cat.id === "featured") group.open = true;

      var count = 0;
      if (cat.id === "scene") {
        count = 1;
      } else if (cat.id === "featured") {
        count = (NS.styleLibrary.FEATURED || []).length;
      } else if (NS.styleLibrary) {
        count = NS.styleLibrary.list.filter(function (s) {
          return s.category === cat.id;
        }).length;
      }

      var summary = document.createElement("summary");
      summary.innerHTML =
        "<b>" + cat.name + "</b><span>" + (cat.desc || "") + "</span><i>" + count + "</i>";
      group.appendChild(summary);

      var grid = document.createElement("div");
      grid.className = "style-grid";

      if (cat.id === "scene") {
        grid.appendChild(makeStyleCard(story));
      } else if (cat.id === "featured") {
        (NS.styleLibrary.FEATURED || []).forEach(function (id) {
          var def = NS.styleLibrary.get(id);
          if (def) grid.appendChild(makeStyleCard(def));
        });
      } else if (NS.styleLibrary) {
        NS.styleLibrary.list.forEach(function (def) {
          if (def.category === cat.id) grid.appendChild(makeStyleCard(def));
        });
      }

      group.appendChild(grid);
      host.appendChild(group);
    });

    var total = 1 + (NS.styleLibrary ? NS.styleLibrary.list.length : 0);
    if ($("styleCount")) $("styleCount").textContent = total + " 种";

    setStyleActive(state.styleId);
  }

  function filterStyleList(q) {
    q = (q || "").trim().toLowerCase();
    var groups = document.querySelectorAll(".style-group");
    Array.prototype.forEach.call(groups, function (group) {
      var visible = 0;
      Array.prototype.forEach.call(group.querySelectorAll(".style-item"), function (el) {
        var def = NS.styleLibrary && NS.styleLibrary.get(el.dataset.style);
        var name = (el.textContent || "").toLowerCase();
        var hit =
          !q ||
          name.indexOf(q) >= 0 ||
          (def && (def.id + " " + def.desc).toLowerCase().indexOf(q) >= 0);
        el.style.display = hit ? "" : "none";
        if (hit) visible += 1;
      });
      group.style.display = visible ? "" : "none";
      if (q && visible && group.tagName === "DETAILS") group.open = true;
    });
  }

  /* ======================================================================
     载入
     ====================================================================== */

  function hidePlaceholder() {
    var ph = $("placeholder");
    if (ph) ph.classList.add("is-hidden");
  }

  function syncMetaForm() {
    var active = document.activeElement;
    if ($("songName") && active !== $("songName")) {
      $("songName").value = state.title || "";
    }
    if ($("songArtist") && active !== $("songArtist")) {
      $("songArtist").value = state.artist || "";
    }
    if ($("exportName") && active !== $("exportName")) {
      $("exportName").value = state.exportName || "";
    }
    if ($("metaHint")) {
      $("metaHint").textContent = state.audioBuffer
        ? state.artist
          ? state.artist
          : "已载入"
        : "未载入歌曲";
    }
  }

  function saveMetaForm() {
    if (!state.audioBuffer) {
      if (NS.utils && NS.utils.toast) NS.utils.toast("先载入歌曲", "warn");
      return;
    }
    state.title = ($("songName") ? $("songName").value.trim() : "") || state.title;
    state.artist = $("songArtist") ? $("songArtist").value.trim() : "";
    state.exportName = $("exportName") ? $("exportName").value.trim() : "";
    updateSongMeta();
    if (NS.utils && NS.utils.toast) {
      NS.utils.toast("歌曲信息已保存", "ok");
    }
  }

  function updateSongMeta() {
    $("songTitle").textContent = state.title || "未载入歌曲";
    $("styleName").textContent = styleName(state.styleId);
    if ($("hudStyle")) $("hudStyle").textContent = styleName(state.styleId);
    $("renderInfo").textContent =
      "确定性渲染 · " +
      Math.round(state.duration) +
      "s · " +
      (state.features && state.features.bpm ? state.features.bpm + " BPM" : "—");
    syncMetaForm();
  }

  function afterAudioReady() {
    setStatus("分析音频…", "busy");

    if (state.codeMode || (NS.sceneCode && NS.sceneCode.isReady())) {
      stopSceneCode(false);
    }

    window.setTimeout(function () {
      state.features = NS.audio.analyze(state.audioBuffer);
      state.silent = false;
      state.offset = 0;
      state.playing = false;
      state.source = null;

      state.aligned = false;
      state.alignRows = null;
      var ah = $("alignHint");
      if (ah) ah.textContent = "未对齐：逐字时间按语义估算";

      rebuildScript();
      hidePlaceholder();
      updateSongMeta();
      drawAt(0);
      updateTransport(0);

      $("btnPlay").disabled = false;
      $("btnExport").disabled = false;
      setPlayIcon(false);

      var offline = NS.encoder && NS.encoder.available();
      var mime = NS.exporter.pickMime();
      var kind = offline
        ? "离线编码 MP4"
        : mime.indexOf("mp4") >= 0
        ? "实时录制 MP4"
        : mime
        ? "实时录制 WebM"
        : "不支持导出";
      setStatus("就绪 · " + kind, "ok");
      updatePrimaryAction();

      /* 用 #demo 打开时，自动跳到有歌词的位置，方便截图 / 快速预览 */
      if (window.location.hash.indexOf("demo") >= 0 && state.duration > 12) {
        window.setTimeout(function () {
          seekTo(15.2);
        }, 120);
      }

      /* 用 #code 打开时，自动跑一遍示例场景代码 */
      if (window.location.hash.indexOf("code") >= 0) {
        window.setTimeout(function () {
          startSceneCode(NS.sceneCode.SAMPLE_CODE);
        }, 260);
      }
    }, 30);
  }

  function loadAudioFile(file) {
    haltPlayback();
    state.offset = 0;
    setStatus("解码音频…", "busy");

    NS.audio
      .decodeFile(file)
      .then(function (buffer) {
        state.audioBuffer = buffer;
        state.duration = buffer.duration;
        state.title = file.name.replace(/\.[^.]+$/, "");
        $("audioLabel").textContent = file.name;
        afterAudioReady();
      })
      .catch(function (err) {
        setStatus("解码失败：" + err.message, "");
      });
  }

  function loadLrcFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || "");
      $("lrcText").value = text;
      $("lrcLabel").textContent = file.name;
      applyLrc(text);
    };
    reader.readAsText(file, "utf-8");
  }

  function applyCoverAccent(url) {
    if (!url) return;
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      try {
        var c = document.createElement("canvas");
        c.width = 24; c.height = 24;
        var cx = c.getContext("2d");
        cx.drawImage(img, 0, 0, 24, 24);
        var d = cx.getImageData(0, 0, 24, 24).data;
        var r = 0, g = 0, b = 0, n = 0;
        for (var i = 0; i < d.length; i += 4) {
          var mx = Math.max(d[i], d[i + 1], d[i + 2]);
          if (mx < 20) continue;
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
        if (!n) return;
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
        state.coverColor = [r, g, b];
        document.documentElement.style.setProperty("--cover-accent", "rgb(" + r + "," + g + "," + b + ")");
        updatePlayerBar();
        drawAt(currentTime());
      } catch (e) {}
    };
    img.src = url;
  }

  function applyTranslations(tlyric) {
    if (!tlyric || !state.lines || !state.lines.length) return;
    var parsed = NS.lrc.parse(tlyric);
    if (!parsed.length) return;
    var byKey = {};
    parsed.forEach(function (row) {
      if (row.time == null) return;
      byKey[row.time.toFixed(2)] = row.text;
    });
    var hit = 0;
    state.lines.forEach(function (line) {
      var k = Number(line.time).toFixed(2);
      if (byKey[k]) { line.translation = byKey[k]; hit++; }
    });
  }

  function applyLrc(text) {
    var parsed = NS.lrc.parse(text);
    var normalized = NS.lrc.normalize(parsed, state.duration || 180);
    state.lines = normalized;

    $("lrcHint").textContent = normalized.length
      ? "已解析 " + normalized.length + " 行"
      : "没有识别到歌词";

    if (state.audioBuffer) {
      rebuildScript();
      drawAt(currentTime());
      if (NS.utils && NS.utils.toast) {
        NS.utils.toast(
          normalized.length
            ? "歌词已应用 · " + normalized.length + " 行"
            : "没有识别到歌词",
          normalized.length ? "ok" : "warn"
        );
      }
    }
  }

  function loadDemo() {
    haltPlayback();
    state.offset = 0;
    setStatus("生成示例…", "busy");

    window.setTimeout(function () {
      var buffer = NS.audio.buildDemoBuffer(24);

      state.audioBuffer = buffer;
      state.duration = buffer.duration;
      state.title = "夜航 · 示例";
      state.artist = "CodeMV";

      $("audioLabel").textContent = "示例音频 · 24s";
      $("lrcText").value = DEMO_LRC;
      $("lrcHint").textContent = "示例歌词 6 行";

      state.lines = NS.lrc.normalize(NS.lrc.parse(DEMO_LRC), buffer.duration);
      if ((window.location.hash || "").indexOf("silent") >= 0) {
        state.audioBuffer = null;
        state.duration = buffer.duration;
        $("lrcText").value = DEMO_LRC;
        enterSilentPreview("静音预览（开发模式）");
        return;
      }
      if ((window.location.hash || "").indexOf("nolrc") >= 0) {
        state.lines = [];
        $("lrcText").value = "";
        $("lrcHint").textContent = "未导入歌词：画布显示歌名卡";
      }
      afterAudioReady();
    }, 30);
  }

  /* ======================================================================
     导出
     ====================================================================== */

  function safeFileName() {
    var base =
      state.exportName ||
      (state.title
        ? state.title + (state.artist ? " - " + state.artist : "")
        : "codemv");
    return String(base).replace(/[\\/:*?"<>|]/g, "_").trim() || "codemv";
  }

  /** 导出入口：优先离线逐帧编码，不行就回落实时录制 */
  /* ======================================================================
     弹窗：歌曲信息编辑 / 导出确认
     ====================================================================== */

  var modalOpen = null;

  function openModal(id) {
    var el = $(id);
    if (!el) return;
    closeModal();
    modalOpen = id;
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    if ($("modalBackdrop")) $("modalBackdrop").hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    if (state.exporting) {
      cancelExport();
      return;
    }
    if (modalOpen) {
      var el = $(modalOpen);
      if (el) {
        el.hidden = true;
        el.setAttribute("aria-hidden", "true");
      }
    }
    modalOpen = null;
    if ($("modalBackdrop")) $("modalBackdrop").hidden = true;
    document.body.classList.remove("modal-open");
    qrStop();
  }

  function openMetaModal() {
    if ($("modalSongName")) $("modalSongName").value = state.title || "";
    if ($("modalSongArtist")) $("modalSongArtist").value = state.artist || "";
    if ($("modalAuthor")) $("modalAuthor").value = state.author || "";
    if ($("modalExportName")) $("modalExportName").value = state.exportName || "";
    openModal("metaModal");
    window.setTimeout(function () {
      if ($("modalSongName")) $("modalSongName").focus();
    }, 30);
  }

  function saveMetaModal() {
    var title = $("modalSongName") ? $("modalSongName").value.trim() : "";
    var artist = $("modalSongArtist") ? $("modalSongArtist").value.trim() : "";
    var author = $("modalAuthor") ? $("modalAuthor").value.trim() : "";
    var exportName = $("modalExportName") ? $("modalExportName").value.trim() : "";

    state.title = title || state.title;
    state.artist = artist;
    state.author = author;
    state.exportName = exportName;
    NS.utils.storageSet("localStorage", "codemv.author", author);

    if ($("songName")) $("songName").value = state.title || "";
    if ($("songArtist")) $("songArtist").value = state.artist || "";
    if ($("exportName")) $("exportName").value = state.exportName || "";
    if ($("audioLabel")) $("audioLabel").textContent = state.artist ? state.title + " · " + state.artist : state.title;

    updateSongMeta();
    closeModal();
    drawAt(currentTime());
    if (NS.utils && NS.utils.toast) NS.utils.toast("歌曲信息已保存", "ok");
  }

  function setExportMode(mode) {
    state.exportMode = mode === "offline" ? "offline" : "realtime";
    var btns = document.querySelectorAll("#exportModes .chip-btn");
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle("is-active", b.dataset.mode === state.exportMode);
    });
    var codecEl = $("exportSummaryCodec");
    if (codecEl) {
      codecEl.textContent =
        state.exportMode === "realtime"
          ? "实时录制（含音轨）"
          : NS.encoder && NS.encoder.available()
          ? "离线编码（检测音轨…）"
          : "离线编码不可用，将回退实时录制";
    }
    if ($("exportModeHint")) {
      $("exportModeHint").textContent =
        state.exportMode === "realtime"
          ? "实时录制耗时约等于歌曲时长，但音轨稳定（推荐）。"
          : "离线编码更快，但部分浏览器的 AAC 音轨可能无声；如果导出后没有声音请改用实时录制。";
    }
    NS.utils.storageSet("localStorage", "codemv.exportMode", state.exportMode);
  }

  function openExportModal() {
    if (!state.audioBuffer) {
      if (NS.utils && NS.utils.toast) NS.utils.toast("先载入歌曲", "warn");
      return;
    }
    if ($("exportSummarySong")) {
      $("exportSummarySong").textContent =
        (state.title || "未命名") + (state.artist ? " · " + state.artist : "");
    }
    if ($("exportSummaryArtist")) $("exportSummaryArtist").textContent = state.author || "未设置";
    if ($("exportSummaryStyle")) $("exportSummaryStyle").textContent = styleName(state.styleId);
    if ($("exportSummaryRatio")) {
      var dur = state.duration || 0;
      var mm = Math.floor(dur / 60);
      var ss = Math.round(dur % 60);
      $("exportSummaryRatio").textContent =
        (state.ratio || "16:9") + " · " + mm + ":" + (ss < 10 ? "0" : "") + ss;
    }
    if ($("exportSummaryFile")) $("exportSummaryFile").textContent = safeFileName() + ".mp4";
    if ($("exportAuthor") && !$("exportAuthor").value) $("exportAuthor").value = state.author || "";
    if ($("exportCredit")) $("exportCredit").checked = !!state.creditEnabled;
    setExportMode(NS.utils.storageGet("localStorage", "codemv.exportMode") || state.exportMode || "realtime");

    var codecEl = $("exportSummaryCodec");
    if (codecEl) {
      codecEl.textContent = NS.encoder && NS.encoder.available() ? "离线编码（检测音轨…）" : "实时录制";
    }
    openModal("exportModal");
    if (NS.foliaBridge && NS.foliaBridge.isOpen()) {
      if (codecEl) codecEl.textContent = "Folia 上游画面 · 实时录制（含音轨）";
      if ($("exportModeHint")) $("exportModeHint").textContent = "检测到 Folia 上游预览已打开：导出会直接录制上游 visualizer 画面（实时，含音轨）。";
    }

    if (NS.encoder && NS.encoder.available() && state.audioBuffer) {
      NS.encoder
        .probe(1920, 1080, 30, {
          sampleRate: state.audioBuffer.sampleRate,
          numberOfChannels: Math.min(2, state.audioBuffer.numberOfChannels)
        })
        .then(function (caps) {
          if (!codecEl || state.exportMode !== "offline") return;
          codecEl.textContent = caps.audio
            ? "离线编码 MP4 · 音轨 " + (caps.audio === "opus" ? "Opus" : "AAC") + " " + caps.audioSampleRate + "Hz（可能无声）"
            : "离线编码不可用，将回退实时录制";
        })
        .catch(function () {});
    }
  }

  /* ---------- 导出进度 / 取消 ---------- */

  function exportUIShow(mode) {
    var modal = $("exportModal");
    if (modal) modal.classList.add("is-exporting");
    if ($("exportProgress")) $("exportProgress").hidden = false;
    if ($("exportSummaryCodec")) {
        $("exportSummaryCodec").textContent =
          mode === "folia-offline"
            ? "Folia 逐帧编码 MP4（高清 · 含音轨）"
            : mode === "folia"
            ? "Folia 上游画面 · 实时录制（含音轨）"
            : mode === "realtime"
            ? "实时录制（含音轨）"
            : "离线编码";
      }
    if ($("btnExportStart")) $("btnExportStart").hidden = true;
    if ($("btnExportDone")) $("btnExportDone").hidden = true;
    if ($("btnExportCancel")) $("btnExportCancel").textContent = "取消导出";
    exportUIProgress(0, mode === "folia-offline" ? "准备逐帧渲染…" : mode === "folia" ? "准备 Folia 画面…" : mode === "realtime" ? "准备录制…" : "准备离线编码…");
  }

  function exportUIProgress(p, text) {
    var pct = Math.max(0, Math.min(100, Math.round((p || 0) * 100)));
    if ($("exportProgressFill")) $("exportProgressFill").style.width = pct + "%";
    if ($("exportProgressText") && text) $("exportProgressText").textContent = text + " · " + pct + "%";
  }

  function exportUIFinish(ok, text) {
    state.exporting = false;
    var modal = $("exportModal");
    if (modal) modal.classList.remove("is-exporting");
    if ($("exportProgress")) $("exportProgress").hidden = !ok ? false : false;
    if ($("btnExportStart")) $("btnExportStart").hidden = true;
    if ($("btnExportDone")) $("btnExportDone").hidden = false;
    if ($("btnExportCancel")) $("btnExportCancel").textContent = "关闭";
    if (ok) exportUIProgress(1, text || "导出完成");
    else if ($("exportProgressText")) $("exportProgressText").textContent = text || "已取消";
    if ($("btnPlay")) $("btnPlay").disabled = false;
    if ($("btnExport")) $("btnExport").disabled = false;
  }

  function cancelExport() {
    if (!state.exporting) return;
    if (NS.encoder && NS.encoder.cancel) NS.encoder.cancel();
    if (NS.exporter && NS.exporter.stop) NS.exporter.stop();
    exportUIFinish(false, "已取消导出");
    if (NS.utils && NS.utils.toast) NS.utils.toast("已取消导出", "warn");
  }

  function startExportFromModal() {
    state.author = $("exportAuthor") ? $("exportAuthor").value.trim() : state.author;
    state.creditEnabled = $("exportCredit") ? $("exportCredit").checked : false;
    NS.utils.storageSet("localStorage", "codemv.author", state.author || "");
    NS.utils.storageSet("localStorage", "codemv.credit", state.creditEnabled ? "1" : "0");
    var modeEl = document.querySelector("#exportModes .chip-btn.is-active");
    state.exportMode = modeEl && modeEl.dataset.mode === "offline" ? "offline" : "realtime";
    NS.utils.storageSet("localStorage", "codemv.exportMode", state.exportMode);
      if (NS.foliaBridge && NS.foliaBridge.isOpen()) {
        /* 逐帧编码更快也更稳（实时录制会一边等一边录，容易黑屏/掉帧） */
        state.exportMode = "folia-offline";
      }
    if (state.exporting) return;
    state.exporting = true;
    if (state.playing) pause();
    exportUIShow(state.exportMode);
    drawAt(currentTime());
    exportVideo(state.exportMode);
  }

  /* 开发自检：3 秒样片 → 检查 MP4 里有没有 soun/mp4a 音轨 */
  function runExportCheck(done) {
    var out = document.createElement("pre");
    out.id = "exportCheck";
    out.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:999;max-width:90vw;max-height:50vh;overflow:auto;background:#000;color:#0f0;padding:8px;font-size:11px;";
    document.body.appendChild(out);
    var buf = state.audioBuffer;
    if (!buf) {
      out.textContent = "no audio buffer\n";
      return;
    }
    function hasAscii(arr, s) {
      var p = [];
      for (var k = 0; k < s.length; k++) p.push(s.charCodeAt(k));
      outer: for (var i = 0; i < arr.length - p.length; i++) {
        for (var j = 0; j < p.length; j++) {
          if (arr[i + j] !== p[j]) continue outer;
        }
        return true;
      }
      return false;
    }
    NS.encoder
      .probe(640, 360, 30, {
        sampleRate: buf.sampleRate,
        numberOfChannels: Math.min(2, buf.numberOfChannels)
      })
      .then(function (caps) {
        out.textContent += "caps video=" + caps.video + " audio=" + caps.audio + " rate=" + caps.audioSampleRate + "\n";
        out.textContent += "encoding small sample...\n";
        var prevW = canvas.width;
        var prevH = canvas.height;
        canvas.width = 160;
        canvas.height = 90;
        return NS.encoder
          .encode({
            canvas: canvas,
            audioBuffer: buf,
            duration: 0.5,
            fps: 8,
            width: 160,
            height: 90,
            bitrate: 400000,
            draw: function (t) {
              drawAt(t);
            },
            onProgress: function () {}
          })
          .then(function (res) {
            return res.blob.arrayBuffer().then(function (ab) {
              var arr = new Uint8Array(ab);
              out.textContent +=
                "encode hasAudio=" + res.hasAudio +
                " codec=" + res.audioCodec +
                " rate=" + res.audioSampleRate +
                " bytes=" + arr.length +
                " soun=" + hasAscii(arr, "soun") +
                " mp4a=" + hasAscii(arr, "mp4a") +
                " avc1=" + hasAscii(arr, "avc1") + "\n";
              /* 真正解码导出的 MP4，检查音频是否有声音（RMS > 0） */
              var copy = ab.slice(0);
              var AC = window.AudioContext || window.webkitAudioContext;
              if (!AC) {
                out.textContent += "decode skipped: no AudioContext\n";
                try { localStorage.setItem("codemv.exportcheck", out.textContent); } catch (e) {}
                if (done) done(out.textContent);
                return null;
              }
              /* 用 <audio> 元素测试真实播放器能否识别音轨 */
              var url = URL.createObjectURL(res.blob);
              var audio = document.createElement("audio");
              var audioProbe = new Promise(function (resolve) {
                var settled = false;
                function finish(text) {
                  if (settled) return;
                  settled = true;
                  resolve(text);
                }
                audio.addEventListener("error", function () {
                  finish("audioEl error code=" + (audio.error && audio.error.code) + " msg=" + (audio.error && audio.error.message));
                });
                audio.addEventListener("loadedmetadata", function () {
                  finish("audioEl ok duration=" + audio.duration.toFixed(3) + "s");
                });
                audio.src = url;
                audio.load();
                window.setTimeout(function () {
                  finish("audioEl timeout");
                }, 6000);
              });
              return audioProbe.then(function (text) {
                out.textContent += text + "\n";
                /* 播放并用 AnalyserNode 测量真实音量（RMS） */
                var rmsProbe = new Promise(function (resolve) {
                  var settled = false;
                  function done2(txt) {
                    if (settled) return;
                    settled = true;
                    resolve(txt);
                  }
                  try {
                    var actxM = new AC();
                    var src = actxM.createMediaElementSource(audio);
                    var an = actxM.createAnalyser();
                    an.fftSize = 2048;
                    src.connect(an);
                    an.connect(actxM.destination);
                    audio.muted = false;
                    audio.volume = 0.01;
                    var playP = audio.play();
                    if (playP && playP.catch) playP.catch(function (e) { done2("play rejected: " + e.message); });
                    window.setTimeout(function () {
                      try {
                        var data2 = new Float32Array(an.fftSize);
                        an.getFloatTimeDomainData(data2);
                        var sum = 0;
                        for (var i = 0; i < data2.length; i++) sum += data2[i] * data2[i];
                        done2("analyser rms=" + Math.sqrt(sum / data2.length).toFixed(5));
                      } catch (e3) {
                        done2("analyser error: " + e3.message);
                      }
                    }, 400);
                  } catch (e2) {
                    done2("analyser setup error: " + e2.message);
                  }
                });
                return rmsProbe.then(function (rmsText) {
                  out.textContent += rmsText + "\n";
                  URL.revokeObjectURL(url);
                  var actx = new AC();
                return actx
                  .decodeAudioData(copy)
                .then(function (decoded) {
                  var rms = 0;
                  var ch = decoded.getChannelData(0);
                  for (var i = 0; i < Math.min(ch.length, decoded.sampleRate); i += 8) {
                    rms += ch[i] * ch[i];
                  }
                  rms = Math.sqrt(rms / Math.max(1, Math.min(ch.length, decoded.sampleRate) / 8));
                  out.textContent +=
                    "decoded duration=" + decoded.duration.toFixed(3) + "s rms=" + rms.toFixed(5) +
                    " channels=" + decoded.numberOfChannels + "\n";
                })
                .catch(function (err) {
                  out.textContent += "decode error: " + (err && err.message) + "\n";
                })
                  .then(function () {
                    try { localStorage.setItem("codemv.exportcheck", out.textContent); } catch (e) {}
                    if (done) done(out.textContent);
                  });
                });
              });
            });
          })
          .then(function () {
            canvas.width = prevW;
            canvas.height = prevH;
          })
          .catch(function (err) {
            out.textContent += "encode error: " + (err && err.message) + "\n";
            canvas.width = prevW;
            canvas.height = prevH;
            try { localStorage.setItem("codemv.exportcheck", out.textContent); } catch (e) {}
            if (done) done(out.textContent);
          });
      })
      .catch(function (err) {
        out.textContent += "probe error: " + (err && err.message) + "\n";
        if (done) done(out.textContent);
      });
  }

  /** 开发自检：实时录制 2 秒 → 检查导出文件里的音频是否有声 */
  NS.devRunRealtime = function () {
    return new Promise(function (resolve) {
      var log = [];
      var tries = 0;
      var timer = window.setInterval(function () {
        tries += 1;
        if (!state.audioBuffer) {
          if (tries > 120) {
            window.clearInterval(timer);
            resolve("no audio buffer");
          }
          return;
        }
        window.clearInterval(timer);
        var mime = NS.exporter.pickMime();
        log.push("mime=" + mime);
        NS.exporter
          .capture({
            canvas: canvas,
            audioBuffer: state.audioBuffer,
            fps: 30,
            duration: 2,
            mime: mime,
            draw: function (t) {
              drawAt(t);
            },
            onProgress: function () {}
          })
          .then(function (res) {
            log.push("capture bytes=" + res.blob.size + " ext=" + res.ext);
            var url = URL.createObjectURL(res.blob);
            var audio = document.createElement("audio");
            var AC = window.AudioContext || window.webkitAudioContext;
            var probe = new Promise(function (done) {
              var settled = false;
              function fin(txt) {
                if (settled) return;
                settled = true;
                done(txt);
              }
              audio.addEventListener("error", function () {
                fin("audioEl error " + (audio.error && audio.error.code));
              });
              audio.addEventListener("loadedmetadata", function () {
                fin("audioEl duration=" + audio.duration.toFixed(2));
              });
              audio.src = url;
              audio.load();
              window.setTimeout(function () {
                fin("audioEl timeout");
              }, 6000);
            });
            return probe.then(function (txt) {
              log.push(txt);
              return new Promise(function (done2) {
                try {
                  var actx = new AC();
                  var srcNode = actx.createMediaElementSource(audio);
                  var an = actx.createAnalyser();
                  an.fftSize = 2048;
                  srcNode.connect(an);
                  an.connect(actx.destination);
                  audio.volume = 0.01;
                  var p = audio.play();
                  if (p && p.catch) p.catch(function () {});
                  window.setTimeout(function () {
                    try {
                      var data = new Float32Array(an.fftSize);
                      an.getFloatTimeDomainData(data);
                      var sum = 0;
                      for (var i = 0; i < data.length; i++) sum += data[i] * data[i];
                      log.push("realtime rms=" + Math.sqrt(sum / data.length).toFixed(5));
                    } catch (e2) {
                      log.push("analyser error " + e2.message);
                    }
                    URL.revokeObjectURL(url);
                    done2();
                  }, 500);
                } catch (e3) {
                  log.push("analyser setup error " + e3.message);
                  done2();
                }
              });
            });
          })
          .catch(function (err) {
            log.push("capture error " + (err && err.message));
          })
          .then(function () {
            resolve(log.join("\n"));
          });
      }, 100);
    });
  };

  NS.devRunExport = function () {
    return new Promise(function (resolve) {
      var tries = 0;
      var timer = window.setInterval(function () {
        tries += 1;
        if (state.audioBuffer) {
          window.clearInterval(timer);
          runExportCheck(resolve);
        } else if (tries > 120) {
          window.clearInterval(timer);
          resolve("no audio buffer");
        }
      }, 100);
    });
  };

  function exportVideo(mode) {
    mode = mode || state.exportMode || "realtime";
    if (!state.audioBuffer) {
      if (NS.utils && NS.utils.toast) {
        NS.utils.toast("静音预览无法导出（没有音轨），请拖入本地音频", "warn");
      }
      return;
    }
    if (state.playing) pause();

    /* 防止重复导出导致 rAF / 轨道泄漏 */
    if (NS.exporter && NS.exporter.isActive()) NS.exporter.stop();
    $("btnPlay").disabled = true;

    if (NS.utils && NS.utils.toast) NS.utils.toast("开始导出…", "ok");

    if (mode === "folia-offline") {
      exportFoliaOffline();
      return;
    }
    if (mode === "folia") {
      exportFoliaRealtime();
      return;
    }

    /* 离线编码的 AAC/Opus 音轨在部分浏览器里会静音 → 默认实时录制保证有声 */
    if (mode === "offline" && NS.encoder && NS.encoder.available() && !state.codeMode) {
      var probeOpts = {
        sampleRate: state.audioBuffer.sampleRate,
        numberOfChannels: Math.min(2, state.audioBuffer.numberOfChannels)
      };
      NS.encoder
        .probe(1920, 1080, 30, probeOpts)
        .then(function (caps) {
          if (caps.audio) {
            exportOffline();
          } else {
            if (NS.utils && NS.utils.toast) {
              NS.utils.toast("离线编码不支持音轨，改用实时录制（含声音）", "warn");
            }
            exportRealtime();
          }
        })
        .catch(function () {
          exportRealtime();
        });
    } else {
      exportRealtime();
    }
  }

  /** 离线逐帧编码（WebCodecs + mp4-muxer） */
  function exportOffline() {
    var prevW = canvas.width;
    var prevH = canvas.height;
    var W = 1920;
    var H = 1080;

    canvas.width = W;
    canvas.height = H;

    $("btnExport").disabled = true;
    $("btnPlay").disabled = true;
    exportUIProgress(0, "离线编码中…");
    setStatus("离线编码 0%", "busy");

    NS.encoder
      .encode({
        canvas: canvas,
        audioBuffer: state.audioBuffer,
        duration: state.duration,
        fps: 30,
        width: W,
        height: H,
        bitrate: 14000000,
        draw: function (t) {
          drawAt(t);
        },
        onProgress: function (p) {
          exportUIProgress(p, "离线编码中…");
          setStatus("离线编码 " + Math.round(p * 100) + "%", "busy");
        }
      })
      .then(function (result) {
        NS.exporter.download(result.blob, safeFileName() + ".mp4");
        if (result.hasAudio) {
          setStatus("已导出 MP4（含音轨）", "ok");
          exportUIFinish(true, "已导出 MP4（含音轨）");
          if (NS.utils && NS.utils.toast) NS.utils.toast("导出完成：含 " + (result.audioCodec === "opus" ? "Opus" : "AAC") + " 音轨", "ok");
        } else {
          setStatus("已导出 MP4（没有音轨）", "warn");
          exportUIFinish(true, "已导出 MP4（没有音轨）");
        }
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : "未知错误";
        setStatus("离线编码失败：" + msg, "");
        exportUIFinish(false, msg.indexOf("取消") >= 0 ? "已取消导出" : "导出失败：" + msg);
      })
      .then(function () {
        canvas.width = prevW;
        canvas.height = prevH;
        $("btnExport").disabled = false;
        $("btnPlay").disabled = false;
        state.offset = 0;
        drawAt(0);
        updateTransport(0);
      });
  }
  /** Folia 上游画面 · 离线逐帧编码：逐帧取上游画面 → WebCodecs 编码（含 AAC 音轨） */
  function exportFoliaOffline() {
    if (!NS.foliaBridge || !NS.foliaBridge.isOpen() || !NS.encoder || !NS.encoder.available()) {
      if (NS.utils && NS.utils.toast) NS.utils.toast("离线编码不可用，回退实时录制", "warn");
      exportFoliaRealtime();
      return;
    }
    var iframe = document.getElementById("foliaFrame");
    var rect = iframe ? iframe.getBoundingClientRect() : { width: 1280, height: 720 };
    var outH = 1080;
    var aspect = rect.width / Math.max(1, rect.height);
    var outW = Math.round(outH * aspect);
    if (outW > 1920) { outW = 1920; outH = Math.round(outW / aspect); }
    outW -= outW % 2;
    outH -= outH % 2;

    var out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    var octx = out.getContext("2d");

    /* 上一帧兜底 + 黑帧检测 */
    var lastGood = document.createElement("canvas");
    lastGood.width = outW;
    lastGood.height = outH;
    var lg = lastGood.getContext("2d");
    var sampler = document.createElement("canvas");
    sampler.width = 48;
    sampler.height = 27;
    var sctx = sampler.getContext("2d");
    var blankFrames = 0;
    var totalFrames = 0;

    function isBlankFrame() {
      try {
        sctx.clearRect(0, 0, 48, 27);
        sctx.drawImage(out, 0, 0, 48, 27);
        var d = sctx.getImageData(0, 0, 48, 27).data;
        var max = 0;
        for (var i = 0; i < d.length; i += 4) {
          var v = Math.max(d[i], d[i + 1], d[i + 2]);
          if (v > max) max = v;
        }
        return max < 8;
      } catch (e) {
        return false;
      }
    }

    var startedAt = performance.now();

    $("btnExport").disabled = true;
    $("btnPlay").disabled = true;
    /* 冻结上游内部时钟，避免导出期间自动推进导致时间漂移 */
    if (NS.foliaBridge.pushState) NS.foliaBridge.pushState(0, false);

    exportUIProgress(0, "Folia 逐帧渲染准备…（可随时取消）");
    setStatus("Folia 离线编码 0%", "busy");
    if (NS.utils && NS.utils.toast) NS.utils.toast("逐帧渲染 Folia 上游画面（比实时慢，但画质更高）", "ok");

    function renderFrame(t) {
      totalFrames += 1;
      return new Promise(function (resolve) {
        if (!NS.foliaBridge.isOpen()) { resolve(); return; }
        var tries = 0;

        function settle() {
          NS.foliaBridge.snapshotComposite(octx, outW, outH);
          if (isBlankFrame() && tries < 8) {
            tries += 1;
            window.setTimeout(attempt, 16);
            return;
          }
          if (isBlankFrame()) {
            blankFrames += 1;
            /* 上游这一帧确实没画出来：用上一帧兜底，避免成片黑屏 */
            try {
              octx.clearRect(0, 0, outW, outH);
              octx.drawImage(lastGood, 0, 0);
            } catch (e) {}
          } else {
            try {
              lg.clearRect(0, 0, outW, outH);
              lg.drawImage(out, 0, 0);
            } catch (e) {}
          }
          resolve();
        }

        function attempt() {
          NS.foliaBridge.seek(t);
          if (NS.foliaBridge.waitFrame) {
            NS.foliaBridge.waitFrame().then(function () {
              NS.foliaBridge.waitFrame().then(settle, settle);
            }, settle);
          } else {
            window.setTimeout(settle, 40);
          }
        }

        attempt();
      });
    }

    NS.encoder
      .encode({
        canvas: out,
        audioBuffer: state.audioBuffer,
        duration: state.duration,
        fps: 30,
        width: outW,
        height: outH,
        bitrate: 16000000,
        draw: renderFrame,
        onProgress: function (p) {
          var elapsed = Math.max(0, (performance.now() - startedAt) / 1000);
          var eta = p > 0.02 ? Math.max(0, (elapsed / p) * (1 - p)) : 0;
          var text = "Folia 逐帧编码中… " + Math.round(p * 100) + "% · 已用 " + elapsed.toFixed(0) + "s";
          if (eta > 0.5) text += " · 剩余约 " + eta.toFixed(0) + "s";
          exportUIProgress(p, text);
          setStatus("Folia 离线编码 " + Math.round(p * 100) + "%", "busy");
        }
      })
      .then(function (result) {
        NS.exporter.download(result.blob, safeFileName() + ".mp4");
        var extra = "";
        if (blankFrames > 0) {
          extra = "；其中 " + blankFrames + " 帧上游未就绪，已用上一帧补齐";
          if (blankFrames / Math.max(1, totalFrames) > 0.3) {
            extra += "（比例较高，可能是 iframe 被系统节能限制）";
          }
        }
        setStatus("已导出 MP4（Folia 逐帧 · 含音轨）" + extra, "ok");
        exportUIFinish(true, "已导出 MP4（Folia 逐帧 · 含音轨）" + extra);
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : "未知错误";
        setStatus("Folia 离线编码失败：" + msg, "");
        exportUIFinish(false, msg.indexOf("取消") >= 0 ? "已取消导出" : "导出失败：" + msg);
      })
      .then(function () {
        $("btnExport").disabled = false;
        $("btnPlay").disabled = false;
        state.offset = 0;
        drawAt(0);
        updateTransport(0);
        /* 恢复上游状态同步 */
        if (NS.foliaBridge.pushState) NS.foliaBridge.pushState(currentTime());
      });
  }


  /** Folia 上游画面导出：合成 iframe 内 canvas → MediaRecorder 实时录制（含音轨） */
  function exportFoliaRealtime() {
    if (!NS.foliaBridge || !NS.foliaBridge.isOpen()) {
      exportRealtime();
      return;
    }
    var iframe = document.getElementById("foliaFrame");
    var rect = iframe ? iframe.getBoundingClientRect() : { width: 1280, height: 720 };
    var outH = Math.min(1080, Math.max(540, Math.round(rect.height)));
    var aspect = rect.width / Math.max(1, rect.height);
    var outW = Math.round(outH * aspect);
    outW -= outW % 2;
    outH -= outH % 2;

    var out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    var octx = out.getContext("2d");

    $("btnExport").disabled = true;
    $("btnPlay").disabled = true;
    exportUIProgress(0, "Folia 上游画面 · 录制中…（可随时取消）");
    setStatus("Folia 导出 0%", "busy");
    if (NS.utils && NS.utils.toast) NS.utils.toast("正在录制 Folia 上游画面…", "ok");

    function drawFrame(t) {
      NS.foliaBridge.seek(t);
      NS.foliaBridge.snapshotComposite(octx, outW, outH);
    }

    NS.exporter
      .capture({
        canvas: out,
        audioBuffer: state.audioBuffer,
        fps: 30,
        duration: state.duration,
        mime: NS.exporter.pickMime(),
        draw: drawFrame,
        onProgress: function (p) {
          exportUIProgress(p, "Folia 上游画面 · 录制中…");
          setStatus("Folia 导出 " + Math.round(p * 100) + "%", "busy");
        }
      })
      .then(function (result) {
        NS.exporter.download(result.blob, safeFileName() + "." + result.ext);
        setStatus("已导出 " + result.ext.toUpperCase() + "（Folia 上游画面）", "ok");
        exportUIFinish(true, "已导出 " + result.ext.toUpperCase() + "（Folia 上游画面）");
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : "未知错误";
        setStatus("Folia 导出失败：" + msg, "");
        exportUIFinish(false, msg.indexOf("取消") >= 0 ? "已取消导出" : "导出失败：" + msg);
      })
      .then(function () {
        $("btnExport").disabled = false;
        $("btnPlay").disabled = false;
        state.offset = 0;
        drawAt(0);
        updateTransport(0);
        /* 恢复上游状态同步 */
        if (NS.foliaBridge.pushState) NS.foliaBridge.pushState(currentTime());
      });
  }



  /** 实时录制（MediaRecorder，保底方案） */
  function exportRealtime() {
    var mime = NS.exporter.pickMime();
    if (!mime) {
      setStatus("浏览器不支持导出", "");
      return;
    }

    $("btnExport").disabled = true;
    $("btnPlay").disabled = true;
    exportUIProgress(0, "录制中…（可随时取消）");
    setStatus("录制 0%", "busy");

    NS.exporter
      .capture({
        canvas: canvas,
        audioBuffer: state.audioBuffer,
        fps: 30,
        duration: state.duration,
        mime: mime,
        draw: function (t) {
          drawAt(t);
        },
        onProgress: function (p) {
          exportUIProgress(p, "录制中…（可随时取消）");
          setStatus("录制 " + Math.round(p * 100) + "%", "busy");
        }
      })
      .then(function (result) {
        NS.exporter.download(result.blob, safeFileName() + "." + result.ext);
        setStatus("已导出 " + result.ext.toUpperCase() + "（实时录制）", "ok");
        exportUIFinish(true, "已导出 " + result.ext.toUpperCase() + "（实时录制）");
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : "未知错误";
        setStatus("导出失败：" + msg, "");
        exportUIFinish(false, msg.indexOf("取消") >= 0 ? "已取消导出" : "导出失败：" + msg);
      })
      .then(function () {
        $("btnExport").disabled = false;
        $("btnPlay").disabled = false;
        state.offset = 0;
        drawAt(0);
        updateTransport(0);
        /* 恢复上游状态同步 */
        if (NS.foliaBridge.pushState) NS.foliaBridge.pushState(currentTime());
      });
  }

  /* ======================================================================
     网易云搜歌
     ====================================================================== */

  function renderNsResults(list) {
    var host = $("nsResults");
    host.innerHTML = "";

    if (!list.length) {
      var empty = document.createElement("li");
      empty.textContent = "没有搜到结果";
      host.appendChild(empty);
      return;
    }

    list.forEach(function (item) {
      var li = document.createElement("li");

      var b = document.createElement("b");
      b.textContent = item.name;

      var small = document.createElement("small");
      small.textContent =
        (item.artists || "未知歌手") + (item.album ? " · " + item.album : "");

      li.appendChild(b);
      li.appendChild(small);
      li.addEventListener("click", function () {
        loadNeteaseSong(item, li);
      });

      host.appendChild(li);
    });
  }

  var nsDetecting = false;

  function updateNsStatus(ok, text) {
    var row = $("nsStatusRow");
    if (!row) return;
    row.classList.toggle("is-ok", ok === true);
    row.classList.toggle("is-off", ok === false);
    if ($("nsStatus")) $("nsStatus").textContent = text;
  }

  function detectProxy(manual) {
    if (nsDetecting || !NS.netease || !NS.netease.autoDetect) return;
    nsDetecting = true;
    updateNsStatus(null, "检测本地代理…");
    NS.netease
      .autoDetect()
      .then(function (origin) {
        nsDetecting = false;
        if (origin) {
          updateNsStatus(true, "已连接 " + origin.replace(/^https?:\/\//, ""));
          if ($("nsBase")) $("nsBase").value = origin;
          if (manual && NS.utils) NS.utils.toast("网易云代理已连接", "ok");
        } else {
          updateNsStatus(
            false,
            "未启动本地代理：双击 start.bat（或 node server.js）"
          );
          if (manual && NS.utils) NS.utils.toast("未检测到本地代理", "warn");
        }
      })
      .catch(function () {
        nsDetecting = false;
        updateNsStatus(false, "本地代理不可用");
      });
  }

  /* ======================================================================
     网易云扫码登录
     ====================================================================== */

  var qrState = { key: null, timer: null, url: "" };

  function qrStop() {
    if (qrState.timer) {
      window.clearInterval(qrState.timer);
      qrState.timer = null;
    }
  }

  function qrSetStatus(text) {
    if ($("qrStatus")) $("qrStatus").textContent = text;
  }

  function qrProxyBase() {
    var base = ($("nsBase") && $("nsBase").value) || NS.netease.base();
    return String(base).replace(/\/$/, "");
  }

  function qrStart() {
    qrStop();
    qrShowUrl("");
    qrSetStatus("正在生成二维码…");
    fetch(qrProxyBase() + "/api/login/qr/new")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.key) throw new Error((data && data.error) || "生成失败");
        qrState.key = data.key;
        qrState.url = data.url || "";
        if ($("qrImage")) {
          $("qrImage").onerror = function () {
            if ($("qrFallback")) {
              $("qrFallback").hidden = false;
              $("qrFallback").textContent = "二维码图片加载失败，可复制登录链接在手机打开：" + qrState.url;
            }
          };
          $("qrImage").src =
            "https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=" +
            encodeURIComponent(qrState.url);
        }
        qrSetStatus("等待扫码…（用网易云音乐 App）");
        qrState.timer = window.setInterval(qrPoll, 1600);
      })
      .catch(function (err) {
        qrSetStatus("生成失败：" + err.message + "（确认本地代理已启动）");
      });
  }

  function qrShowUrl(url) {
    if ($("qrFallback")) {
      $("qrFallback").hidden = !url;
      $("qrFallback").textContent = url ? "登录链接：" + url : "";
    }
  }

  function qrPoll() {
    if (!qrState.key) return;
    fetch(qrProxyBase() + "/api/login/qr/check?key=" + encodeURIComponent(qrState.key))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var code = data && data.code;
        if (code === 800) {
          qrSetStatus("二维码已过期，请点「刷新二维码」");
          qrStop();
        } else if (code === 801) {
          qrSetStatus("等待扫码…（用网易云音乐 App）");
        } else if (code === 802) {
          qrSetStatus("已扫码，请在手机上确认登录…");
        } else if (code === 803) {
          qrStop();
          if (data.cookie && $("nsCookie")) {
            $("nsCookie").value = data.cookie;
            if ($("nsRemember")) $("nsRemember").checked = true;
            NS.netease.setCookie(data.cookie, $("nsRemember") ? $("nsRemember").checked : true);
          }
          qrSetStatus("登录成功");
          if (NS.utils && NS.utils.toast) NS.utils.toast("网易云登录成功（Cookie 已保存）", "ok");
          updateNsStatus(true, "已登录 网易云");
          window.setTimeout(closeModal, 700);
        } else {
          qrSetStatus((data && data.message) || "等待扫码…");
        }
      })
      .catch(function () {
        qrSetStatus("轮询失败：检查本地代理");
      });
  }

  function searchNetease() {
    var q = $("nsQuery").value.trim();
    if (!q) return;

    NS.netease.setBase($("nsBase").value || NS.netease.base());
    NS.netease.setCookie(
      $("nsCookie").value || "",
      $("nsRemember") ? $("nsRemember").checked : false
    );

    setStatus("搜索中…", "busy");

    NS.netease
      .search(q, 20)
      .then(function (list) {
        renderNsResults(list);
        setStatus(list.length ? "找到 " + list.length + " 首" : "没有结果", list.length ? "ok" : "");
      })
      .catch(function (err) {
        $("nsResults").innerHTML = "";
        var li = document.createElement("li");
        li.textContent =
          "搜索失败：" + err.message + "（本地代理未启动时请双击 start.bat）";
        $("nsResults").appendChild(li);
        updateNsStatus(false, "连接失败：检查本地代理");
        setStatus("搜索失败", "");
      });
  }

  function loadNeteaseSong(item, li) {
    haltPlayback();
    state.offset = 0;
    updateTransport(0);
    li.classList.add("is-loading");
    setStatus("拉取歌词…", "busy");

    state.coverUrl = item.picUrl || "";
    applyCoverAccent(state.coverUrl);
    flashStage();

    NS.netease
      .lyric(item.id)
      .then(function (res) {
        $("lrcText").value = res.lrc;
        $("lrcLabel").textContent = item.name + ".lrc";
        applyLrc(res.lrc);
        applyTranslations(res.tlyric);
        setStatus("下载音频…", "busy");
        return fetch(NS.netease.songUrl(item.id));
      })
      .then(function (r) {
        if (!r.ok) {
          return r.json().then(function (j) {
            throw new Error(j.error || "HTTP " + r.status);
          });
        }
        return r.arrayBuffer();
      })
      .then(function (buf) {
        return NS.audio.decodeArrayBuffer(buf);
      })
      .then(function (buffer) {
        state.audioBuffer = buffer;
        state.duration = buffer.duration;
        state.title = item.name;
        state.artist = item.artists;

        $("audioLabel").textContent = item.name + " · " + item.artists;
        li.classList.remove("is-loading");
        afterAudioReady();
      })
      .catch(function (err) {
        li.classList.remove("is-loading");
        var msg = String((err && err.message) || "未知错误");
        if (state.lines && state.lines.length) {
          enterSilentPreview(
            "音频获取失败（" + msg + "），已用歌词生成静音预览；拖入本地音频可带声音"
          );
        } else {
          setStatus("加载失败：" + msg, "");
          if (NS.utils && NS.utils.toast) {
            NS.utils.toast("加载失败：" + msg, "warn");
          }
        }
      });
  }

  /* ======================================================================
     模型设置 / AI 一键生成分镜
     ====================================================================== */

  function loadSettings() {
    state.author = NS.utils.storageGet("localStorage", "codemv.author") || "";
    state.creditEnabled = NS.utils.storageGet("localStorage", "codemv.credit") !== "0";
    state.exportMode = NS.utils.storageGet("localStorage", "codemv.exportMode") || "realtime";
    var llm = NS.llm.load();
    $("llmBase").value = llm.base || "";
    $("llmKey").value = llm.key || "";
    $("llmModel").value = llm.model || "";
    $("nsBase").value = NS.netease.base();
    $("nsCookie").value = NS.netease.cookie();
    if ($("nsRemember")) $("nsRemember").checked = NS.netease.remembersCookie();
  }

  function saveSettings() {
    NS.llm.save({
      base: $("llmBase").value.trim(),
      key: $("llmKey").value.trim(),
      model: $("llmModel").value.trim()
    });
    NS.netease.setBase($("nsBase").value.trim());
    NS.netease.setCookie(
      $("nsCookie").value.trim(),
      $("nsRemember") ? $("nsRemember").checked : false
    );
    setStatus("设置已保存", "ok");
  }


  /* ======================================================================
     事件绑定
     ====================================================================== */

  function wireDrop(dropEl, inputEl, onFile) {
    ["dragenter", "dragover"].forEach(function (ev) {
      dropEl.addEventListener(ev, function (e) {
        e.preventDefault();
        dropEl.classList.add("is-over");
      });
    });

    ["dragleave", "drop"].forEach(function (ev) {
      dropEl.addEventListener(ev, function (e) {
        e.preventDefault();
        dropEl.classList.remove("is-over");
      });
    });

    dropEl.addEventListener("drop", function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files[0]) onFile(files[0]);
    });

    inputEl.addEventListener("change", function () {
      if (inputEl.files && inputEl.files[0]) onFile(inputEl.files[0]);
    });
  }

  /* ---------- 可拖动进度条 ---------- */

  var seeking = false;
  var resumeAfterSeek = false;

  function seekRatio(e) {
    var rect = $("seek").getBoundingClientRect();
    var x =
      e && e.touches && e.touches[0]
        ? e.touches[0].clientX
        : e.clientX;
    return clamp((x - rect.left) / Math.max(1, rect.width), 0, 1);
  }

  function seekPreview(ratio) {
    var t = ratio * (state.duration || 0);
    updateTransport(t);
    drawAt(t);
    return t;
  }

  function onSeekPointerDown(e) {
    if (!state.duration) return;
    e.preventDefault();
    seeking = true;
    resumeAfterSeek = state.playing;
    if (state.playing) pause();

    $("seek").classList.add("is-dragging");
    window.addEventListener("pointermove", onSeekPointerMove);
    window.addEventListener("pointerup", onSeekPointerUp);
    window.addEventListener("pointercancel", onSeekPointerUp);
    onSeekPointerMove(e);
  }

  function onSeekPointerMove(e) {
    if (!seeking) return;
    var ratio = seekRatio(e);
    var tip = $("seekTip");
    if (tip) {
      tip.textContent = NS.lrc.formatTime(ratio * (state.duration || 0));
      tip.style.left = ratio * 100 + "%";
    }
    seekPreview(ratio);
  }

  function onSeekPointerUp(e) {
    if (!seeking) return;
    seeking = false;
    $("seek").classList.remove("is-dragging");
    window.removeEventListener("pointermove", onSeekPointerMove);
    window.removeEventListener("pointerup", onSeekPointerUp);
    window.removeEventListener("pointercancel", onSeekPointerUp);

    var ratio = seekRatio(e);
    seekTo(ratio * (state.duration || 0));
    if (resumeAfterSeek && !state.playing) play();
    resumeAfterSeek = false;
  }

  function onSeekKeyDown(e) {
    if (!state.duration) return;
    var step = e.shiftKey ? 10 : 2;
    var t = currentTime();
    var next = null;

    if (e.key === "ArrowLeft") next = t - step;
    else if (e.key === "ArrowRight") next = t + step;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = state.duration;
    else return;

    e.preventDefault();
    seekTo(clamp(next, 0, state.duration));
  }



  /* ======================================================================
     启动
     ====================================================================== */

  /* ======================================================================
     对外渲染钩子（供 render/render.mjs、自动化脚本、agent 使用）
       window.__meta  → 当前时长 / 尺寸 / 风格
       window.__ready → 可以开始逐帧渲染
       window.__draw(t) → 渲染第 t 秒（t 的纯函数）
     ====================================================================== */

  window.__meta = {
    duration: 0,
    fps: 30,
    width: 1600,
    height: 900,
    style: "story",
    ready: false
  };
  window.__ready = false;
  window.__draw = function (t) {
    if (!state.script) return;
    seekTo(Math.max(0, Math.min(Number(t) || 0, state.duration || 0)));
  };
  /* ---------- 统一的「生成」按钮：按当前分页决定做什么 ---------- */

  function currentTab() {
    var tab = document.querySelector(".tab.is-active");
    return (tab && tab.getAttribute("data-tab")) || "source";
  }

  function updatePrimaryAction(tab) {
    tab = tab || currentTab();
    var label = $("primaryLabel");
    if (!label) return;

    if (tab === "ai") {
      label.textContent = "运行画面代码";
    } else if (tab === "style") {
      label.textContent = "随机换一个风格";
    } else {
      label.textContent = state.audioBuffer ? "生成预览" : "拖入歌曲开始";
    }
  }

  function runPrimaryAction() {
    var tab = currentTab();

    if (tab === "ai") {
      var code = $("codeText") ? $("codeText").value.trim() : "";
      if (!code) {
        NS.utils.toast("先在下面粘贴 AI 返回的代码", "warn");
        return;
      }
      startSceneCode(code);
      return;
    }

    if (tab === "style") {
      if (!NS.styleLibrary) return;
      var list = NS.styleLibrary.list;
      var pick = list[Math.floor(Math.random() * list.length)];
      pickStyle(pick.id);
      return;
    }

    /* 素材：没歌就提示拖入，有歌就应用歌词 */
    if (!state.audioBuffer) {
      if (NS.utils && NS.utils.toast) {
        NS.utils.toast("先拖入歌曲文件，或用网易云搜歌", "warn");
      }
      return;
    }
    var text = $("lrcText") ? $("lrcText").value : "";
    if (text.trim()) {
      applyLrc(text);
    } else {
      NS.utils.toast("粘贴 LRC 或拖入歌词文件", "warn");
    }
  }

  /* ---------- 歌词样式抽屉 ---------- */

  function initLyricPanel() {
    var LS = NS.lyricStyle;
    if (!LS || !$("lyricDrawer")) return;

    var drawer = $("lyricDrawer");
    var mask = $("drawerMask");

    function openDrawer() {
      drawer.classList.add("is-open");
      drawer.setAttribute("aria-hidden", "false");
      if (mask) mask.hidden = false;
    }

    function closeDrawer() {
      drawer.classList.remove("is-open");
      drawer.setAttribute("aria-hidden", "true");
      if (mask) mask.hidden = true;
    }

    if ($("btnLyric")) {
      $("btnLyric").addEventListener("click", function () {
        if (drawer.classList.contains("is-open")) closeDrawer();
        else openDrawer();
      });
    }
    if ($("btnLyricClose")) $("btnLyricClose").addEventListener("click", closeDrawer);
    if (mask) mask.addEventListener("click", closeDrawer);

    LS.FONT_LABELS.forEach(function (f) {
      var opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.name;
      $("lyricFont").appendChild(opt);
    });

    LS.ANIMS.forEach(function (a) {
      var opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.name;
      $("lyricAnim").appendChild(opt);
    });

    var presetHost = $("lyricPresets");
    LS.PRESETS.forEach(function (p) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip-btn";
      btn.dataset.preset = p.id;
      btn.textContent = p.name;
      btn.addEventListener("click", function () {
        LS.applyPreset(p.id);
        syncPanel();
        drawAt(currentTime());
        setActivePreset(p.id);
        if (NS.utils && NS.utils.toast) NS.utils.toast("歌词预设：" + p.name, "ok");
      });
      presetHost.appendChild(btn);
    });

    function setActivePreset(id) {
      Array.prototype.forEach.call(
        presetHost.querySelectorAll(".chip-btn"),
        function (el) {
          el.classList.toggle("is-active", el.dataset.preset === id);
        }
      );
    }

    var ranges = [
      ["lyricY", "y", "lyricYVal", function (v) { return Math.round(v) + "%"; }],
      ["lyricSize", "size", "lyricSizeVal", function (v) { return v.toFixed(1) + "%"; }],
      ["lyricTracking", "tracking", "lyricTrackingVal", function (v) { return v.toFixed(2) + "em"; }],
      ["lyricLH", "lineHeight", "lyricLHVal", function (v) { return v.toFixed(2); }],
      ["lyricOpacity", "opacity", "lyricOpacityVal", function (v) { return Math.round(v * 100) + "%"; }],
      ["lyricGlow", "glow", "lyricGlowVal", function (v) { return Math.round(v * 100) + "%"; }],
      ["lyricOutline", "outline", "lyricOutlineVal", function (v) { return Math.round(v * 100) + "%"; }],
      ["lyricMaxWidth", "maxWidth", "lyricMaxWVal", function (v) { return Math.round(v * 100) + "%"; }]
    ];

    function syncPanel() {
      var s = LS.load();
      if ($("lyricVisible")) $("lyricVisible").checked = s.visible;
      ranges.forEach(function (r) {
        var el = $(r[0]);
        if (el) el.value = s[r[1]];
        if ($(r[2])) $(r[2]).textContent = r[3](Number(s[r[1]]));
      });
      if ($("lyricAlign")) $("lyricAlign").value = s.align;
      if ($("lyricFont")) $("lyricFont").value = s.font;
      if ($("lyricAnim")) $("lyricAnim").value = s.anim;
    }

    function commit() {
      var s = LS.load();
      var patch = { visible: $("lyricVisible") ? $("lyricVisible").checked : s.visible };
      ranges.forEach(function (r) {
        var el = $(r[0]);
        if (el) {
          patch[r[1]] = Number(el.value);
          if ($(r[2])) $(r[2]).textContent = r[3](Number(el.value));
        }
      });
      if ($("lyricAlign")) patch.align = $("lyricAlign").value;
      if ($("lyricFont")) patch.font = $("lyricFont").value;
      if ($("lyricAnim")) patch.anim = $("lyricAnim").value;
      LS.save(patch);
      drawAt(currentTime());
    }

    ranges.forEach(function (r) {
      var el = $(r[0]);
      if (el) el.addEventListener("input", commit);
    });
    ["lyricVisible", "lyricAlign", "lyricFont", "lyricAnim"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("change", commit);
    });

    if ($("btnLyricReset")) {
      $("btnLyricReset").addEventListener("click", function () {
        LS.reset();
        LS.saveTitle(LS.TITLE_DEFAULTS);
        syncPanel();
        syncTitle();
        setActivePreset("");
        drawAt(currentTime());
        if (NS.utils && NS.utils.toast) NS.utils.toast("样式已恢复默认", "ok");
      });
    }

    /* ---------- 歌名卡（没有歌词时显示） ---------- */

    var titleRanges = [
      ["titleY", "y", "titleYVal", function (v) { return Math.round(v) + "%"; }],
      ["titleSize", "size", "titleSizeVal", function (v) { return v.toFixed(1) + "%"; }],
      ["titleOpacity", "opacity", "titleOpacityVal", function (v) { return Math.round(v * 100) + "%"; }],
      ["titleGlow", "glow", "titleGlowVal", function (v) { return Math.round(v * 100) + "%"; }]
    ];

    function syncTitle() {
      var s = LS.loadTitle();
      if ($("titleVisible")) $("titleVisible").checked = s.visible;
      if ($("titleShowArtist")) $("titleShowArtist").checked = s.showArtist;
      if ($("titleSep")) $("titleSep").value = s.sep;
      titleRanges.forEach(function (r) {
        var el = $(r[0]);
        if (el) el.value = s[r[1]];
        if ($(r[2])) $(r[2]).textContent = r[3](Number(s[r[1]]));
      });
    }

    function commitTitle() {
      var patch = {
        visible: $("titleVisible") ? $("titleVisible").checked : true,
        showArtist: $("titleShowArtist") ? $("titleShowArtist").checked : true,
        sep: $("titleSep") ? $("titleSep").value : " - "
      };
      titleRanges.forEach(function (r) {
        var el = $(r[0]);
        if (el) {
          patch[r[1]] = Number(el.value);
          if ($(r[2])) $(r[2]).textContent = r[3](Number(el.value));
        }
      });
      LS.saveTitle(patch);
      drawAt(currentTime());
    }

    titleRanges.forEach(function (r) {
      var el = $(r[0]);
      if (el) el.addEventListener("input", commitTitle);
    });
    ["titleVisible", "titleShowArtist", "titleSep"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("change", commitTitle);
    });

    syncPanel();
    syncTitle();
  }

  /* ---------- 侧栏收起 / 沉浸模式 ---------- */

  function initLayoutControls() {
    var layout = document.querySelector(".layout");
    if (!layout) return;

    var saved = NS.utils.storageGet("localStorage", "codemv.sidebar");
    if (saved === "hidden") layout.classList.add("is-sidebar-hidden");

    if ($("btnSidebar")) {
      $("btnSidebar").addEventListener("click", function () {
        layout.classList.toggle("is-sidebar-hidden");
        NS.utils.storageSet(
          "localStorage",
          "codemv.sidebar",
          layout.classList.contains("is-sidebar-hidden") ? "hidden" : "shown"
        );
      });
    }

    function setImmersive(on) {
      document.body.classList.toggle("is-immersive", on);
      if (on) {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(function () {});
        }
        if (NS.utils && NS.utils.toast) NS.utils.toast("沉浸模式 · Esc 退出", "ok");
      } else if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      }
      window.setTimeout(fitCanvas, 280);
    }

    if ($("btnImmersive")) {
      $("btnImmersive").addEventListener("click", function () {
        setImmersive(!document.body.classList.contains("is-immersive"));
      });
    }

    if ($("btnInspectorClose")) {
      $("btnInspectorClose").addEventListener("click", function () {
        layout.classList.add("is-sidebar-hidden");
        NS.utils.storageSet("localStorage", "codemv.sidebar", "hidden");
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("is-immersive")) {
        setImmersive(false);
      }
    });

    document.addEventListener("fullscreenchange", function () {
      if (!document.fullscreenElement) {
        document.body.classList.remove("is-immersive");
      }
      window.setTimeout(fitCanvas, 140);
    });
  }

  /* ---------- 画幅比例 / 画布自适应 ---------- */

  var RATIO_SIZES = {
    "16:9": [1600, 900],
    "9:16": [900, 1600],
    "1:1": [1080, 1080],
    "21:9": [1680, 720]
  };

  function applyRatio(ratio, silent) {
    if (!RATIO_SIZES[ratio]) ratio = "16:9";
    state.ratio = ratio;
    NS.utils.storageSet("localStorage", "codemv.ratio", ratio);

    var size = RATIO_SIZES[ratio];
    canvas.width = size[0];
    canvas.height = size[1];

    if ($("hudRatio")) $("hudRatio").textContent = ratio;
    Array.prototype.forEach.call(
      document.querySelectorAll("#ratioChips .chip-btn"),
      function (b) {
        b.classList.toggle("is-active", b.dataset.ratio === ratio);
      }
    );

    fitCanvas();
    if (state.duration) drawAt(currentTime());
    if (!silent && NS.utils) NS.utils.toast("画幅：" + ratio, "ok");
  }

  function fitCanvas() {
    var shell = document.querySelector(".canvas-shell");
    var wrap = $("canvasWrap");
    if (!shell || !wrap) return;

    var transport = document.querySelector(".transport");
    var gap = 12;
    var reserved = transport ? transport.offsetHeight + gap : 0;
    var availW = shell.clientWidth;
    var availH = shell.clientHeight - reserved;
    if (availW <= 0 || availH <= 0) return;

    var ratio = (canvas.width || 1600) / (canvas.height || 900);
    var w = availW;
    var h = w / ratio;
    if (h > availH) {
      h = availH;
      w = h * ratio;
    }

    wrap.style.width = Math.max(160, Math.floor(w)) + "px";
    wrap.style.height = Math.max(90, Math.floor(h)) + "px";
  }

  function initCanvasControls() {
    var saved = NS.utils.storageGet("localStorage", "codemv.ratio") || "16:9";
    var m = /ratio=(16:9|9:16|1:1|21:9)/.exec(window.location.hash || "");
    if (m) saved = m[1];
    applyRatio(saved, true);

    Array.prototype.forEach.call(
      document.querySelectorAll("#ratioChips .chip-btn"),
      function (btn) {
        btn.addEventListener("click", function () {
          applyRatio(btn.dataset.ratio);
        });
      }
    );

    window.addEventListener("resize", fitCanvas);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", fitCanvas);
    }
    window.setTimeout(fitCanvas, 80);
  }

  function init() {
    canvas = $("stageCanvas");
    ctx = canvas.getContext("2d");

    if (NS.theme) NS.theme.init();
    buildStyleList();
    initLyricPanel();
    initLayoutControls();
    initCanvasControls();
    detectProxy(false);

    /* 左侧分页：素材 / 风格 / AI */
    var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
    var panels = Array.prototype.slice.call(document.querySelectorAll(".tab-panel"));

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var id = tab.getAttribute("data-tab");
        tabs.forEach(function (t) {
          t.classList.toggle("is-active", t === tab);
        });
        panels.forEach(function (p) {
          p.classList.toggle("is-active", p.getAttribute("data-panel") === id);
        });
        updatePrimaryAction(id);

        /* 检查器被叉掉后，点左边图标应重新出现 */
        var layout = document.querySelector(".layout");
        if (layout) layout.classList.remove("is-sidebar-hidden");
        NS.utils.storageSet("localStorage", "codemv.sidebar", "shown");

        var titles = { source: "素材", style: "风格", ai: "AI" };
        if ($("inspectorTitle")) {
          $("inspectorTitle").textContent = titles[id] || id;
        }
        window.setTimeout(fitCanvas, 30);
      });
    });

    wireDrop($("audioDrop"), $("audioInput"), loadAudioFile);
    wireDrop($("lrcDrop"), $("lrcInput"), loadLrcFile);

    $("btnApplyLrc").addEventListener("click", function () {
      applyLrc($("lrcText").value);
    });

    $("btnPlay").addEventListener("click", function () {
      if (state.playing) pause();
      else play();
    });

    if ($("btnPrimary")) $("btnPrimary").addEventListener("click", runPrimaryAction);
    updatePrimaryAction();
    $("btnExport").addEventListener("click", openExportModal);

    /* 设置入口 */
    if ($("btnSettings")) $("btnSettings").addEventListener("click", function () {
      if (NS.settings) NS.settings.open();
    });
    if (NS.settings) NS.settings.init();

    /* 离线一键 MV 按钮（无 AI 接口也能用） */
    if (!$("btnAutoMv") && $("btnExport") && $("btnExport").parentNode) {
      var autoBtn = document.createElement("button");
      autoBtn.id = "btnAutoMv";
      autoBtn.type = "button";
      autoBtn.className = "btn";
      autoBtn.title = "按歌词关键词离线生成 MV（不需要 AI 接口）";
      autoBtn.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-spark" /></svg>一键 MV';
      autoBtn.addEventListener("click", autoGenerateMV);
      $("btnExport").parentNode.insertBefore(autoBtn, $("btnExport"));
    }

    /* 弹窗按钮 */
    if ($("btnSaveMeta")) $("btnSaveMeta").addEventListener("click", openMetaModal);
    if ($("btnMetaSave")) $("btnMetaSave").addEventListener("click", saveMetaModal);
    if ($("btnMetaCancel")) $("btnMetaCancel").addEventListener("click", closeModal);
    if ($("btnMetaClose")) $("btnMetaClose").addEventListener("click", closeModal);
    if ($("btnExportStart")) $("btnExportStart").addEventListener("click", startExportFromModal);
    if ($("btnExportCancel")) $("btnExportCancel").addEventListener("click", function () {
      if (state.exporting) cancelExport();
      else closeModal();
    });
    if ($("btnExportDone")) $("btnExportDone").addEventListener("click", closeModal);
    if ($("btnExportClose")) $("btnExportClose").addEventListener("click", closeModal);
    if ($("modalBackdrop")) $("modalBackdrop").addEventListener("click", closeModal);
    if ($("foliaMode")) {
      $("foliaMode").addEventListener("change", function () {
        if (NS.foliaBridge) NS.foliaBridge.setMode($("foliaMode").value);
      });
    }
    /* 音量 */
    if ($("volumeRange")) {
      $("volumeRange").value = String(state.volume);
      $("volumeRange").addEventListener("input", function () {
        state.volume = Math.max(0, Math.min(1, Number($("volumeRange").value)));
        if (state.gain) state.gain.gain.value = state.muted ? 0 : state.volume;
        try { NS.utils.storageSet("localStorage", "codemv.volume", String(state.volume)); } catch (e) {}
      });
    }
    var volumeHud = $("volumeHud");
    function showVolumeHud() {
      if (!volumeHud) return;
      volumeHud.textContent = "音量 " + Math.round((state.muted ? 0 : state.volume) * 100) + "%";
      volumeHud.classList.add("is-show");
      window.clearTimeout(volumeHud._t);
      volumeHud._t = window.setTimeout(function () { volumeHud.classList.remove("is-show"); }, 800);
    }
    var volWrap = document.querySelector(".tp-volume");
    if (volWrap) {
      volWrap.addEventListener("wheel", function (e) {
        e.preventDefault();
        var d = e.deltaY < 0 ? 0.05 : -0.05;
        state.volume = clamp(state.volume + d, 0, 1);
        if (state.gain) state.gain.gain.value = state.muted ? 0 : state.volume;
        if ($("volumeRange")) $("volumeRange").value = String(state.volume);
        try { NS.utils.storageSet("localStorage", "codemv.volume", String(state.volume)); } catch (err) {}
        showVolumeHud();
      }, { passive: false });
    }

    if ($("btnMute")) {
      $("btnMute").addEventListener("click", function () {
        state.muted = !state.muted;
        if (state.gain) state.gain.gain.value = state.muted ? 0 : state.volume;
        $("btnMute").innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-' + (state.muted ? "mute" : "volume") + '" /></svg>';
      });
    }

    /* 更多菜单 */
    if ($("btnMore")) {
      $("btnMore").addEventListener("click", function (e) {
        e.stopPropagation();
        var menu = $("tpMenu");
        if (!menu) return;
        menu.hidden = !menu.hidden;
      });
      document.addEventListener("click", function () {
        if ($("tpMenu")) $("tpMenu").hidden = true;
      });
      Array.prototype.forEach.call(document.querySelectorAll("#tpMenu button"), function (b) {
        b.addEventListener("click", function () {
          if ($("tpMenu")) $("tpMenu").hidden = true;
          var act = b.getAttribute("data-more");
          if (act === "meta") openMetaModal();
          else if (act === "export") openExportModal();
          else if (act === "settings" && NS.settings) NS.settings.open();
        });
      });
    }

    /* 播放条自动隐藏（Folia 式） */
    var idleTimer = null;
    var transportEl = document.querySelector(".transport");
    function hideLater() {
      window.clearTimeout(idleTimer);
      var cfg = NS.settings && NS.settings.current ? NS.settings.current() : {};
      if (cfg.autoHideControls === false || cfg.previewStyle !== "folia") {
        document.body.classList.remove("controls-hidden");
        return;
      }
      idleTimer = window.setTimeout(function () {
        if (!state.playing || state.exporting) return;
        if (document.querySelector(".modal:not([hidden])")) return;
        document.body.classList.add("controls-hidden");
      }, 3000);
    }
    function wakeControls() {
      document.body.classList.remove("controls-hidden");
      hideLater();
    }
    ["mousemove", "pointerdown", "keydown"].forEach(function (ev) {
      document.addEventListener(ev, wakeControls, { passive: true });
    });
    if (transportEl) {
      transportEl.addEventListener("mouseenter", function () {
        document.body.classList.remove("controls-hidden");
        window.clearTimeout(idleTimer);
      });
      transportEl.addEventListener("mouseleave", hideLater);
    }
    NS.__scheduleHideControls = hideLater;
    hideLater();

    if ($("btnFoliaClose")) $("btnFoliaClose").addEventListener("click", function () {
      if (NS.foliaBridge) NS.foliaBridge.close();
    });
    if ((window.location.hash || "").indexOf("folia") >= 0) {
      window.setTimeout(function () {
        if (NS.foliaBridge) NS.foliaBridge.open();
      }, 600);
    }

    /* 给 Folia iframe 提供状态 */
    NS.__getFoliaState = function (t) {
      return {
        duration: state.duration,
        playing: state.playing,
        artist: state.artist,
        title: state.title,
        coverUrl: state.coverUrl || "",
        lines: (state.lines || []).map(function (l) {
          return { text: l.text, time: l.time, translation: l.translation || "" };
        })
      };
    };
    NS.__getFoliaCurrentTime = function () { return currentTime(); };
    if ($("btnNsQr")) $("btnNsQr").addEventListener("click", function () {
      openModal("qrModal");
      qrStart();
    });
    if ($("btnQrClose")) $("btnQrClose").addEventListener("click", closeModal);
    if ($("btnQrRefresh")) $("btnQrRefresh").addEventListener("click", qrStart);
    if ($("btnQrCopy")) $("btnQrCopy").addEventListener("click", function () {
      if (!qrState.url) return;
      try {
        navigator.clipboard.writeText(qrState.url).then(function () {
          if (NS.utils && NS.utils.toast) NS.utils.toast("登录链接已复制", "ok");
        });
      } catch (e) {}
      qrShowUrl(qrState.url);
    });
    var modeBtns = document.querySelectorAll("#exportModes .chip-btn");
    Array.prototype.forEach.call(modeBtns, function (b) {
      b.addEventListener("click", function () {
        setExportMode(b.dataset.mode);
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modalOpen) closeModal();
    });
    $("seek").addEventListener("pointerdown", onSeekPointerDown);
    $("seek").addEventListener("keydown", onSeekKeyDown);

    ["songName", "songArtist", "exportName"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter") saveMetaForm();
      });
    });

    if ($("styleSearch")) {
      $("styleSearch").addEventListener("input", function () {
        filterStyleList($("styleSearch").value);
      });
    }

    /* 网易云 */
    $("btnNsSearch").addEventListener("click", searchNetease);
    if ($("btnNsDetect")) {
      $("btnNsDetect").addEventListener("click", function () {
        detectProxy(true);
      });
    }
    $("nsQuery").addEventListener("keydown", function (e) {
      if (e.key === "Enter") searchNetease();
    });

    /* 模型设置 */
    $("btnLlmSave").addEventListener("click", saveSettings);

    /* AI 画面代码 */
    $("btnCodePrompt").addEventListener("click", function () {
      if (!state.script) {
        setStatus("先加载歌曲", "");
        return;
      }
      var prompt = NS.sceneCode.buildPrompt({
        lines: state.lines,
        duration: state.duration,
        sections: state.script.sections
      });
      copyText(prompt);
      $("codeHint").textContent = "提示词已复制，去大模型生成代码";
      setStatus("代码提示词已复制", "ok");
    });

    $("btnCodeSample").addEventListener("click", function () {
      $("codeText").value = NS.sceneCode.SAMPLE_CODE;
      $("codeHint").textContent = "已填入示例代码，点「运行代码」看看";
    });

    $("btnCodeRun").addEventListener("click", function () {
      var code = $("codeText").value.trim();
      if (!code) {
        setStatus("先填代码", "");
        return;
      }
      startSceneCode(code);
    });

    $("btnCodeStop").addEventListener("click", function () {
      stopSceneCode(true);
      setStatus("已回退情景模式", "ok");
    });

    /* 强制对齐：音频能量 / Whisper JSON */
    $("btnAlignEnergy").addEventListener("click", function () {
      if (!state.alan || !state.features) {
        setStatus("先加载歌曲和歌词", "");
        return;
      }
      try {
        var aligned = NS.align.fromEnergy(state.alan, state.features);
        state.alignRows = aligned.rows;
        state.aligned = true;
        rebuildStory();
        drawAt(currentTime());
        var q = NS.align.quality(state.alan);
        $("alignHint").textContent = q.ok
          ? "已按音频能量对齐（词级时间）"
          : "对齐完成，但有疑问：" + q.issues[0];
        setStatus("能量对齐完成", "ok");
        if (NS.utils && NS.utils.toast) NS.utils.toast("已按音频能量对齐", "ok");
      } catch (err) {
        $("alignHint").textContent = "对齐失败：" + err.message;
      }
    });

    $("btnAlignImport").addEventListener("click", function () {
      try {
        var data = JSON.parse($("alignText").value);
        if (!state.alan) throw new Error("先加载歌曲和歌词");
        var aligned = NS.align.fromWhisper(state.alan, data);
        state.alignRows = aligned.rows;
        state.aligned = true;
        rebuildStory();
        drawAt(currentTime());
        $("alignHint").textContent = "已导入 Whisper 词级时间戳";
        setStatus("已导入词级时间", "ok");
        if (NS.utils && NS.utils.toast) NS.utils.toast("已导入 Whisper 词级时间", "ok");
      } catch (err) {
        $("alignHint").textContent = "导入失败：" + err.message;
      }
    });
    loadSettings();

    /* 页面关闭时停掉正在进行的导出，避免资源泄漏 */
    window.addEventListener("pagehide", function () {
      if (NS.exporter && NS.exporter.isActive()) NS.exporter.stop();
    $("btnPlay").disabled = true;
      if (NS.sceneCode) NS.sceneCode.stop();
    });

    /* 把运行时错误暴露到状态栏，方便排查 */
    window.addEventListener("error", function (e) {
      try {
        setStatus("JS 错误：" + (e && e.message ? e.message : "unknown"), "");
      } catch (err) {
        /* ignore */
      }
    });

    /* 初始空画面 */
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* 带 #demo / #code / #light / #dark / #style=xxx 打开时的快捷入口 */
    var hash = window.location.hash || "";

    /* 开发自检：自动开弹窗 / 导出音轨检查 / 署名预览 */
    var devTries = 0;
    var devTimer = window.setInterval(function () {
      devTries += 1;
      var devWant =
        hash.indexOf("modalmeta") >= 0 ||
        hash.indexOf("modalexport") >= 0 ||
        hash.indexOf("exportcheck") >= 0 ||
        hash.indexOf("nsqr") >= 0 ||
        hash.indexOf("auto") >= 0 ||
        hash.indexOf("settings") >= 0 ||
        hash.indexOf("credittest") >= 0;
      if (!devWant) {
        window.clearInterval(devTimer);
        return;
      }
      if (!state.audioBuffer && devTries < 80) return;
      window.clearInterval(devTimer);
      if (hash.indexOf("auto") >= 0 && $("btnAutoMv")) $("btnAutoMv").click();
      if (hash.indexOf("settings") >= 0 && NS.settings) NS.settings.open();
    if (hash.indexOf("nsqr") >= 0 && $("btnNsQr")) $("btnNsQr").click();
      if (hash.indexOf("modalmeta") >= 0 && $("btnSaveMeta")) $("btnSaveMeta").click();
      if (hash.indexOf("modalexport") >= 0 && $("btnExport")) $("btnExport").click();
      if (hash.indexOf("exportcheck") >= 0) {
        try { localStorage.removeItem("codemv.exportcheck"); } catch (e) {}
        var pre0 = document.createElement("pre");
        pre0.id = "exportCheck";
        pre0.textContent = "devtimer fired; encoder=" + (NS.encoder ? "yes" : "no") + "; audioBuffer=" + (state.audioBuffer ? "yes" : "no") + "\n";
        document.body.appendChild(pre0);
        window.setTimeout(runExportCheck, 200);
      }
      if (hash.indexOf("credittest") >= 0) {
        state.author = "CodeMV Studio";
        state.creditEnabled = true;
        drawAt(Math.max(0, state.duration - 1.2));
      }
    }, 300);
    if (
      hash.indexOf("demo") >= 0 ||
      hash.indexOf("code") >= 0 ||
      hash.indexOf("light") >= 0 ||
      hash.indexOf("dark") >= 0 ||
      hash.indexOf("style=") >= 0
    ) {
      loadDemo();
    }
    /* #panel=style / #panel=ai 直接切到对应分页 */
    var panelMatch = /panel=([a-z]+)/.exec(hash);
    if (panelMatch) {
      window.setTimeout(function () {
        var btn = document.querySelector('.tab[data-tab="' + panelMatch[1] + '"]');
        if (btn) btn.click();
      }, 400);
    }

    if (hash.indexOf("lyric") >= 0) {
      window.setTimeout(function () {
        var b = $("btnLyric");
        if (b) b.click();
      }, 400);
    }

    if (hash.indexOf("immersive") >= 0) {
      window.setTimeout(function () {
        var b = $("btnImmersive");
        if (b) b.click();
      }, 500);
    }

    /* 开发用途：用 #...&t=12.5 直接定位到指定秒，便于检查歌词过渡 */
    var timeMatch = /[?&#]t=([\d.]+)/.exec(hash);
    if (timeMatch) {
      var wantedTime = parseFloat(timeMatch[1]);
      var timeTries = 0;
      var timeTimer = window.setInterval(function () {
        timeTries += 1;
        if (state.script) {
          window.clearInterval(timeTimer);
          window.setTimeout(function () {
            seekTo(Math.max(0, Math.min(state.duration || wantedTime, wantedTime)));
          }, 100);
        } else if (timeTries > 60) {
          window.clearInterval(timeTimer);
        }
      }, 250);
    }
    var styleMatch = /style=([a-z0-9-]+)/.exec(hash);
    if (styleMatch) {
      /* 等分镜就绪再应用（音频解码可能 > 500ms，用轮询而不是一次性 setTimeout） */
      var wantedStyle = styleMatch[1];
      var styleTries = 0;
      var styleTimer = window.setInterval(function () {
        styleTries += 1;
        if (state.script) {
          window.clearInterval(styleTimer);
          pickStyle(wantedStyle);
        } else if (styleTries > 60) {
          window.clearInterval(styleTimer);
        }
      }, 250);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
