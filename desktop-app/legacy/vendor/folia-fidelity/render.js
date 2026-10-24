/* ==========================================================================
   Folia Fidelity · Folia 还原可选模块（高保真重实现）
   --------------------------------------------------------------------------
   许可证：AGPL-3.0（见同目录 LICENSE / NOTICE.md）

   参数来源（AGPL 派生，均提取自上游源码）：
     • fume/fumeTextStyle.ts, fume/fumeArticleLayout.ts
       —— hero 24~54px / body 14~28px，lineHeight 1.02/1.06，
          通过/激活透明度 0.74/0.58，heroScale 1
     • classic/Visualizer.tsx —— 字阶 clamp(2.25rem, 6vw, 4.5rem)，
       词距 0.12·fontPx、随机散布 20、旋转 ±5°、通过词 ±22.5°、浮动 14px / 7s
     • cadenza/cadenzaPlacements.ts —— 焦点词放大约 1.5×，其余词围绕中心散布
     • partita/partitaLayout.ts —— 可用高度 0.65H、行高 100px、列间距 1.6rem
     • cappella/VisualizerCappella.tsx, cappellaIntensity.ts, CappellaBubbleParts.tsx
       —— 基础字号 18（clamp 15~26）、气泡最大宽 0.68W-56、头像 40px、
          激活气泡 1.12× / 字号 ×1.34、内边距 20/16、行间距 12px
     • tilt/VisualizerTilt.tsx —— 字阶 clamp(3.125rem, 6.875vw, 5.625rem)，
       1~4 行概率拆分、倾斜段斜体、逐字延迟 0.04 / 0.05s、行高 1.35 / 1.25
     • diorama/dioramaSceneConstants.ts —— 多层歌词平面 + 相机漂移 + 粒子
     • pendolo/pendoloGeometry.ts —— 轮盘半径 0.42·min(W,H)、弧角 100°、
       9 行窗口、alpha = cos(0.75a)^2.5·(1-0.18d)、scale 1.25 / max(0.7,1-0.08d)

   本文件为独立的 Canvas 2D 重实现，未复制上游 React/Three.js 代码，因此是
   高保真而非逐像素一致。
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var U = NS.utils;
  var TAU = Math.PI * 2;

  /* 1000px 参考视口：上游 CSS px 换算到当前画布宽度 */
  function vpx(W, base) {
    return (base * W) / 1000;
  }

  var PALETTES = {
    fume: { bg: ["#0c0c24", "#05050f"], primary: "#c09024", accent: "#e8c27a", light: "#e4d8cc" },
    lumiere: { bg: ["#0c0c24", "#04040c"], primary: "#f0b424", accent: "#ffd98a", light: "#ccccd8" },
    cadenza: { bg: ["#0c0c24", "#06060f"], primary: "#303c48", accent: "#d8c078", light: "#cccccc" },
    partita: { bg: ["#0c0c24", "#05050f"], primary: "#f0b418", accent: "#ffe1a0", light: "#ccccd8" },
    cappella: { bg: ["#0c0c0c", "#050505"], primary: "#60c0e4", accent: "#a8e6ff", light: "#e8fbff" },
    tilt: { bg: ["#0c0c24", "#050510"], primary: "#24303c", accent: "#549ccc", light: "#fcfcfc" },
    diorama: { bg: ["#0c0c24", "#05050e"], primary: "#3c4854", accent: "#ccd8f0", light: "#ccd8f0" },
    pendolo: { bg: ["#181824", "#07070c"], primary: "#303c48", accent: "#849c9c", light: "#d8e4e4" },
    monet: { bg: ["#0b1220", "#0a1a1e"], primary: "#7fb8b0", accent: "#e8c9a0", light: "#f0e8dc" },
    sonnet: { bg: ["#0e0d0b", "#17130e"], primary: "#c9b48a", accent: "#f0e6d2", light: "#f5efe2" },
    tempera: { bg: ["#12100c", "#1a160e"], primary: "#c9a227", accent: "#e8e2d0", light: "#f2e9d4" },
    claddagh: { bg: ["#0a1410", "#0d1a12"], primary: "#7aa27a", accent: "#d9c27a", light: "#eef0d8" }
  };

  var TUNING = {
    fume: { heroScale: 1, objectOpacity: 0.5, glow: 1, cameraSpeed: 1 },
    classic: { wordSpacing: 0.7, spread: 20, rotate: 5, passedRotate: 22.5, floatDist: 14, floatDuration: 7, wordMinGap: 0.12 },
    cadenza: { fontScale: 1.12, widthRatio: 0.72, heroScale: 1.5, passedRotate: 6 },
    partita: { availableHeight: 0.65, baseRowHeight: 100, columnGap: 1.6, staggerMin: 20, staggerMax: 100 },
    cappella: { fontBase: 18, fontMin: 15, fontMax: 26, groupRatio: 0.68, avatar: 40, gap: 12, padX: 16, padY: 12, activeScale: 1.12, activeFont: 1.34, passedScale: 0.92, passedOpacity: 0.82 },
    tilt: { fontMin: 50, fontMax: 90, lineHeightNormal: 1.35, lineHeightTilt: 1.25, charDelay: 0.04, tiltCharDelay: 0.05, splitProbability: 0.75 },
    diorama: { cameraSpeed: 1, motion: 1, particles: 48, glow: 1 },
    pendolo: { arcRadius: 0.42, arcAngleDeg: 100, visibleWindow: 9, activeScale: 1.25, tickSnappiness: 2, wheelCenterY: 0.5 },
    monet: { railBefore: 4, railAfter: 4, activeGapRatio: 0.49, inactiveGapRatio: 0.38, subtitleStagger: 0.04 },
    sonnet: { cameraIntensity: 1, heroWeight: 900, supportWeight: 700, decorWeight: 300 },
    tempera: { settleStretch: 0.5, enterStagger: 0.05, flowAngle: -0.15, textInversion: true },
    claddagh: { maxArcSpan: 4.25, letterSpacingEm: 0.04, baseTrackingEm: 0.18, backFollow: 0.28, nextEntryLead: 0.34 }
  };

  /* ---------- 工具 ---------- */

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function easeOutCubic(k) { return 1 - Math.pow(1 - clamp(k, 0, 1), 3); }
  function easeInCubic(k) { return Math.pow(clamp(k, 0, 1), 3); }
  function palette(mode) { return PALETTES[mode] || PALETTES.lumiere; }
  function hexA(hex, a) { return U.rgba(hex, a); }
  function rand(seed, off) {
    var x = Math.sin(seed * 12.9898 + off * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function getFont() {
    var s = NS.lyricStyle ? NS.lyricStyle.load() : null;
    return {
      family: NS.lyricStyle ? NS.lyricStyle.fontFamily() : "system-ui, sans-serif",
      weight: s ? s.weight : 700,
      glow: s ? s.glow : 0.55,
      opacity: s ? s.opacity : 1
    };
  }

  function curLine(api) {
    return api.line ? api.line(api.t) : null;
  }

  function safeLines(api) {
    return (api.lines && api.lines.length && api.lines) || null;
  }

  function splitWords(text) {
    if (!text) return [];
    if (/\s/.test(text)) return text.split(/(\s+)/).filter(function (s) { return s.trim().length; });
    return Array.from(text);
  }

  function bg(ctx, W, H, p, opts) {
    opts = opts || {};
    var g = ctx.createLinearGradient(0, 0, W * 0.15, H);
    g.addColorStop(0, p.bg[0]);
    g.addColorStop(1, p.bg[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var gx = W * (opts.gx == null ? 0.4 : opts.gx);
    var gy = H * (opts.gy == null ? 0.42 : opts.gy);
    var glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.8);
    glow.addColorStop(0, hexA(p.primary, opts.glow == null ? 0.1 : opts.glow));
    glow.addColorStop(0.55, hexA(p.primary, 0.02));
    glow.addColorStop(1, hexA(p.primary, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  function vignette(ctx, W, H, strength) {
    var g = ctx.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.78);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0," + (strength == null ? 0.66 : strength) + ")");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function dust(ctx, W, H, t, color, n, speed) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < n; i++) {
      var seed = i * 3.77;
      var x = (W * U.hash(seed) + t * (6 + U.hash(seed + 1) * 16) * (speed || 1)) % W;
      var y = (H * U.hash(seed + 2) - t * (4 + U.hash(seed + 3) * 10) * (speed || 1) + H * 2) % H;
      var r = 0.6 + U.hash(seed + 4) * 1.6;
      ctx.fillStyle = hexA(color, 0.04 + U.hash(seed + 5) * 0.14);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- 行间过渡：入场 / 出场（对齐 Folia 的 seek-stable transition frame） ---------- */
  function transitionState(line) {
    var enter = clamp(line.age / 0.42, 0, 1);
    var exit = clamp((line.dur - line.age) / 0.34, 0, 1);
    var e = easeOutCubic(enter);
    var o = easeOutCubic(exit);
    return {
      enter: e,
      exit: o,
      dx: (1 - e) * 12 - (1 - o) * 10,
      dy: (1 - e) * 26 - (1 - o) * 20,
      scale: 0.98 + 0.02 * e,
      blur: (1 - e) * 6 + (1 - o) * 5
    };
  }

  function applyTransition(ctx, W, H, tr) {
    ctx.save();
    ctx.translate(W / 2 + tr.dx, H / 2 + tr.dy);
    ctx.scale(tr.scale, tr.scale);
    ctx.translate(-W / 2, -H / 2);
    if (ctx.filter !== undefined) {
      ctx.filter = tr.blur > 0.3 ? "blur(" + Math.min(7, tr.blur).toFixed(1) + "px)" : "none";
    }
    return function restore() {
      ctx.filter = "none";
      ctx.restore();
    };
  }

  /* 上一句的出画幽灵（crossfade 用） */
  function drawGhostLine(ctx, W, H, line, p, f, sizePx, y, alpha) {
    if (!line || !line.text) return;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = hexA(p.light, 0.9);
    ctx.font = "600 " + Math.round(sizePx) + "px " + f.family;
    var text = line.text;
    var mw = ctx.measureText(text).width;
    if (mw > W * 0.82) {
      sizePx = Math.round(sizePx * ((W * 0.82) / mw));
      ctx.font = "600 " + Math.round(sizePx) + "px " + f.family;
    }
    ctx.fillText(text, W / 2, y);
    ctx.restore();
  }

  /** 呼吸感镜头（所有模式通用，幅度很小） */
  function breathe(ctx, W, H, t, amount) {
    var s = 1 + Math.sin(t * 0.23) * 0.004 * (amount || 1);
    var dx = Math.sin(t * 0.17) * W * 0.0012 * (amount || 1);
    var dy = Math.cos(t * 0.19) * H * 0.0012 * (amount || 1);
    ctx.translate(W / 2 + dx, H / 2 + dy);
    ctx.scale(s, s);
    ctx.translate(-W / 2, -H / 2);
  }

  function lineReveal(line, opts) {
    opts = opts || {};
    var dur = Math.max(0.25, line.dur * (opts.durRatio || 0.8));
    return clamp((line.age - (opts.delay || 0)) / dur, 0, 1);
  }

  /* ============================================================
     1) 浮名 fume —— 报纸分栏排版：hero 大字 + 两侧 body 小字
     ============================================================ */
  function renderFume(ctx, W, H, api) {
    var p = palette("fume");
    var t = api.t;
    var f = getFont();
    bg(ctx, W, H, p, { gx: 0.38, gy: 0.36, glow: 0.12 });

    /* 印刷符号（hidePrintSymbols=false） */
    ctx.save();
    ctx.strokeStyle = hexA(p.accent, 0.15);
    ctx.lineWidth = Math.max(1, W * 0.001);
    for (var i = 0; i < 10; i++) {
      var seed = i * 4.31;
      var x = W * U.hash(seed);
      var y = H * U.hash(seed + 1);
      var s = vpx(W, 8 + U.hash(seed + 2) * 10);
      ctx.globalAlpha = TUNING.fume.objectOpacity * (0.4 + U.hash(seed + 3) * 0.6);
      ctx.beginPath();
      if (i % 3 === 0) ctx.arc(x, y, s * 0.5, 0, TAU);
      else if (i % 3 === 1) {
        ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
        ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
      } else ctx.rect(x - s * 0.6, y - s * 0.6, s * 1.2, s * 1.2);
      ctx.stroke();
    }
    ctx.restore();

    var line = curLine(api);
    var lines = safeLines(api);
    var idx = line ? line.index : -1;

    /* 相机慢速漂移（cameraSpeed = 1） */
    var camX = Math.sin(t * 0.11) * vpx(W, 10) * TUNING.fume.cameraSpeed;
    var camY = Math.cos(t * 0.09) * vpx(W, 7) * TUNING.fume.cameraSpeed;
    var camZoom = 1 + Math.sin(t * 0.07) * 0.012;

    ctx.save();
    ctx.translate(W / 2 + camX, H * 0.5 + camY);
    ctx.scale(camZoom, camZoom);
    ctx.translate(-W / 2, -H * 0.5);

    var heroPx = vpx(W, clamp(34 * TUNING.fume.heroScale, 24, 54));
    var bodyPx = vpx(W, 20);

    if (line && line.text) {
      var fumeTr = transitionState(line);
      var fumeEnd = applyTransition(ctx, W, H, fumeTr);
      if (line.age < 0.5 && idx > 0) {
        drawGhostLine(ctx, W, H, lines[idx - 1], p, f, heroPx * 0.72, H * 0.5 - vpx(W, 40), (1 - clamp(line.age / 0.5, 0, 1)) * 0.5);
      }
      drawFumeHero(ctx, W, H, line, p, f, heroPx, lineReveal(line, { durRatio: 0.9 }));
      fumeEnd();
    }
    if (lines && idx >= 0) {
      drawFumeBody(ctx, W, H, lines[idx - 1], p, f, bodyPx, 0.58, 0.13, 0.26, 0.3);
      drawFumeBody(ctx, W, H, lines[idx + 1], p, f, bodyPx, 0.4, 0.69, 0.3, 0.26);
    }
    ctx.restore();

    dust(ctx, W, H, t, p.accent, 46, 0.5);
    vignette(ctx, W, H);
  }

  function drawFumeHero(ctx, W, H, line, p, f, heroPx, reveal) {
    var text = line.text || "";
    var chars = Array.from(text);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 " + heroPx + "px " + f.family;
    var total = ctx.measureText(text).width;
    var maxW = W * 0.8;
    if (total > maxW) {
      heroPx = Math.round(heroPx * (maxW / total));
      ctx.font = "700 " + heroPx + "px " + f.family;
      total = ctx.measureText(text).width;
    }
    var x = W / 2 - total / 2;
    var baseY = H * 0.5;
    var alpha = clamp(line.alpha, 0, 1) * f.opacity;
    var litCount = Math.floor(reveal * chars.length) + 1;

    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      var chW = ctx.measureText(ch).width;
      var k = easeInCubic(clamp((reveal * chars.length - i) / 2, 0, 1));
      var lit = i < litCount;
      ctx.save();
      ctx.translate(x + chW / 2, baseY + (1 - k) * heroPx * 0.25);
      ctx.globalAlpha = alpha * (0.25 + 0.75 * k);
      if (lit) {
        ctx.shadowColor = hexA(p.accent, 0.8);
        ctx.shadowBlur = heroPx * 0.28 * f.glow;
        ctx.fillStyle = hexA(p.light, 1);
      } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = hexA(p.accent, 0.5);
      }
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      x += chW;
    }
    ctx.restore();
  }

  function drawFumeBody(ctx, W, H, line, p, f, bodyPx, alphaBase, xRatio, yRatio, widthRatio) {
    if (!line || !line.text) return;
    ctx.save();
    ctx.globalAlpha = alphaBase;
    ctx.fillStyle = hexA(p.light, 0.85);
    ctx.font = "400 " + Math.round(bodyPx) + "px " + f.family;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    var maxW = W * widthRatio;
    var x = W * xRatio;
    var y = H * yRatio;
    var words = splitWords(line.text);
    var row = "";
    var rowY = y;
    for (var i = 0; i < words.length; i++) {
      var test = row ? row + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && row) {
        ctx.fillText(row, x, rowY);
        rowY += bodyPx * 1.06;
        row = words[i];
      } else {
        row = test;
      }
    }
    if (row) ctx.fillText(row, x, rowY);
    ctx.restore();
  }

  /* ============================================================
     2) 流光 lumiere / classic —— 逐词旋转 / 散布 / 通过词旋转
     ============================================================ */
  function renderLumiere(ctx, W, H, api) {
    var p = palette("lumiere");
    var t = api.t;
    var f = getFont();
    bg(ctx, W, H, p, { gx: 0.5, gy: 0.45, glow: 0.1 });
    dust(ctx, W, H, t, p.accent, 60, 0.9);

    var line = curLine(api);
    if (!line) { vignette(ctx, W, H); return; }

    var linePx = clamp(vpx(W, 60), vpx(W, 36), vpx(W, 72));
    var words = splitWords(line.text || "");
    var seed = line.start || 0;
    var reveal = lineReveal(line, { durRatio: 0.85 });
    var gap = linePx * TUNING.classic.wordMinGap * TUNING.classic.wordSpacing;
    var spread = vpx(W, TUNING.classic.spread);
    var floatY = Math.sin((t / TUNING.classic.floatDuration) * TAU) * vpx(W, TUNING.classic.floatDist);
    var baseY = H * 0.5 + floatY;
    var alpha = clamp(line.alpha, 0, 1) * f.opacity;
    var revealChars = reveal * (line.text || "").length;
    var lumiTr = transitionState(line);
    var lumiEnd = applyTransition(ctx, W, H, lumiTr);
    if (line.age < 0.5 && line.index > 0) {
      var lumiLines = safeLines(api);
      if (lumiLines) drawGhostLine(ctx, W, H, lumiLines[line.index - 1], p, f, linePx * 0.9, H * 0.5 - vpx(W, 46), (1 - clamp(line.age / 0.5, 0, 1)) * 0.45);
    }

    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    function measure(px) {
      ctx.font = "700 " + Math.round(px) + "px " + f.family;
      return words.map(function (w) { return ctx.measureText(w).width; });
    }
    var widths = measure(linePx);
    var totalW = widths.reduce(function (a, b) { return a + b; }, 0) + gap * Math.max(0, words.length - 1);
    var maxW = W * 0.84;
    if (totalW > maxW) {
      linePx = Math.round(linePx * (maxW / totalW));
      gap = linePx * TUNING.classic.wordMinGap * TUNING.classic.wordSpacing;
      widths = measure(linePx);
      totalW = widths.reduce(function (a, b) { return a + b; }, 0) + gap * Math.max(0, words.length - 1);
    }

    var x = W / 2 - totalW / 2;
    var consumed = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var wordStart = consumed;
      consumed += w.length;
      var k = clamp((revealChars - wordStart) / Math.max(1, w.length), 0, 1);
      var isActive = k > 0.02 && k < 0.995;
      var passed = k >= 0.995;

      var rx = (rand(seed + i, 1) - 0.5) * spread * 2;
      var ry = (rand(seed + i, 2) - 0.5) * spread * 2;
      var rot = passed
        ? ((rand(seed + i, 8) - 0.5) * TUNING.classic.passedRotate * Math.PI) / 180
        : ((rand(seed + i, 3) - 0.5) * TUNING.classic.rotate * Math.PI) / 180;

      if (passed) {
        ctx.globalAlpha = 0.55 * alpha;
        ctx.fillStyle = hexA(p.light, 0.65);
        ctx.shadowBlur = 0;
      } else if (isActive) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = hexA(p.light, 1);
        ctx.shadowColor = hexA(p.accent, 0.75);
        ctx.shadowBlur = linePx * 0.22 * f.glow;
      } else {
        ctx.globalAlpha = alpha * k * 0.5;
        ctx.fillStyle = hexA(p.accent, 0.6);
        ctx.shadowBlur = 0;
      }

      ctx.save();
      ctx.translate(x + rx, baseY + ry + (1 - easeOutCubic(k)) * linePx * 0.5);
      ctx.rotate(rot * (1 - k * 0.4));
      ctx.font = (isActive ? 700 : 600) + " " + Math.round(linePx) + "px " + f.family;
      ctx.fillText(w, 0, 0);
      ctx.restore();
      x += widths[i] + gap;
    }
    ctx.restore();
    lumiEnd();
    vignette(ctx, W, H);
  }

  /* ============================================================
     3) 心象 cadenza —— 词围绕中心散布，焦点词放大
     ============================================================ */
  function renderCadenza(ctx, W, H, api) {
    var p = palette("cadenza");
    var t = api.t;
    var f = getFont();
    bg(ctx, W, H, p, { gx: 0.5, gy: 0.45, glow: 0.14 });

    var line = curLine(api);
    if (!line) { vignette(ctx, W, H); return; }

    var linePx = clamp(vpx(W, 30) * TUNING.cadenza.fontScale, vpx(W, 24), vpx(W, 54));
    var words = splitWords(line.text || "");
    var seed = line.start || 0;
    var reveal = lineReveal(line, { durRatio: 0.8 });
    var alpha = clamp(line.alpha, 0, 1) * f.opacity;
    var cxp = W / 2;
    var cyp = H * 0.5;
    var maxRadius = vpx(W, 120);

    var heroIndex = 0;
    var best = -1;
    for (var h = 0; h < words.length; h++) {
      var score = words[h].length + (1 - Math.abs(h - (words.length - 1) / 2) / Math.max(1, words.length)) * 4;
      if (score > best) { best = score; heroIndex = h; }
    }

    var cadTr = transitionState(line);
    var cadEnd = applyTransition(ctx, W, H, cadTr);

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var k = clamp((reveal * words.length - i) / 1.5, 0, 1);
      var isHero = i === heroIndex;
      var wordPx = isHero ? linePx * TUNING.cadenza.heroScale : linePx;
      ctx.font = (isHero ? 700 : 500) + " " + Math.round(wordPx) + "px " + f.family;
      var wW = ctx.measureText(w).width;

      var angle = (i / Math.max(1, words.length)) * TAU + (rand(seed, i) - 0.5) * 0.8;
      var radius = isHero ? 0 : maxRadius * (0.55 + rand(seed + i, 5) * 0.45);
      var px = cxp + Math.cos(angle) * radius * 1.5;
      var py = cyp + Math.sin(angle) * radius * 0.65;
      if (isHero) { px = cxp; py = cyp; }
      px += (rand(seed + i, 6) - 0.5) * vpx(W, 220) * (1 - k);
      py += (rand(seed + i, 7) - 0.5) * vpx(W, 220) * (1 - k);

      var rotate = isHero ? 0 : (rand(seed + i, 8) - 0.5) * 0.25 * (1 - k * 0.5);
      if (k < 0.99) rotate += (rand(seed + i, 9) - 0.5) * 0.5 * (1 - k);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rotate);
      var sc = 0.9 + 0.1 * easeOutCubic(k);
      ctx.scale(sc, sc);
      ctx.globalAlpha = alpha * k;
      if (isHero) {
        ctx.shadowColor = hexA(p.accent, 0.9);
        ctx.shadowBlur = wordPx * 0.5 * f.glow;
        ctx.fillStyle = p.accent;
        ctx.strokeStyle = hexA(p.accent, 0.35 * k);
        ctx.lineWidth = Math.max(1, wordPx * 0.03);
        ctx.beginPath();
        ctx.ellipse(0, 0, wW * 0.75, wordPx * 0.72, 0, 0, TAU);
        ctx.stroke();
      } else {
        ctx.shadowColor = hexA(p.light, 0.25);
        ctx.shadowBlur = wordPx * 0.18;
        ctx.fillStyle = hexA(p.light, 0.9);
      }
      ctx.fillText(w, 0, 0);
      ctx.restore();
    }
    ctx.restore();
    cadEnd();

    dust(ctx, W, H, t, p.accent, 36, 0.7);
    vignette(ctx, W, H);
  }

  /* ============================================================
     4) 云阶 partita —— 行块布局 + 错峰 + 引导线
     ============================================================ */
  function renderPartita(ctx, W, H, api) {
    var p = palette("partita");
    var f = getFont();
    var lines = safeLines(api);
    var line = curLine(api);
    bg(ctx, W, H, p, {});

    if (!line || !lines) { vignette(ctx, W, H); return; }

    var idx = line.index;
    var reveal = lineReveal(line, { durRatio: 0.8 });
    var alpha = clamp(line.alpha, 0, 1) * f.opacity;

    var availableH = H * TUNING.partita.availableHeight;
    var rowH = vpx(W, TUNING.partita.baseRowHeight);
    var rowCount = Math.max(1, Math.min(5, Math.floor(availableH / (rowH * 0.7))));
    var rowPx = clamp(vpx(W, 26), vpx(W, 18), vpx(W, 40));
    var gapX = vpx(W, 26);
    var visible = [];
    for (var d = -3; d <= 3; d++) {
      var li = idx + d;
      if (li >= 0 && li < lines.length) visible.push(li);
    }
    var shownCount = Math.min(visible.length, rowCount);
    var rowSlide = (1 - easeOutCubic(clamp(line.age / 0.4, 0, 1))) * rowH * 0.4;
    var startY = H * 0.5 - ((shownCount - 1) * rowH) / 2 - rowSlide;

    ctx.save();
    ctx.strokeStyle = hexA(p.accent, 0.1);
    ctx.lineWidth = 1;
    for (var g = 0; g <= shownCount; g++) {
      ctx.beginPath();
      ctx.moveTo(W * 0.08, startY + (g - 0.5) * rowH);
      ctx.lineTo(W * 0.92, startY + (g - 0.5) * rowH);
      ctx.stroke();
    }
    for (var gi = 0; gi < 3; gi++) {
      var gx = W * (0.3 + gi * 0.2);
      ctx.beginPath();
      ctx.moveTo(gx, startY - rowH * 0.5);
      ctx.lineTo(gx, startY + (shownCount - 0.5) * rowH);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.textBaseline = "middle";
    for (var r = 0; r < shownCount; r++) {
      var itemIdx = visible[r];
      var item = lines[itemIdx];
      var isActive = itemIdx === idx;
      var passed = itemIdx < idx;
      var words = splitWords(item.text || "");
      var seed = item.time || 0;
      var appear = isActive ? reveal : passed ? 1 : 0;

      ctx.globalAlpha = (isActive ? alpha : passed ? 0.3 : 0.12) * appear;
      var size = isActive ? rowPx : rowPx * 0.62;
      ctx.font = (isActive ? 700 : 400) + " " + Math.round(size) + "px " + f.family;
      ctx.fillStyle = isActive ? p.light : hexA(p.light, 0.75);
      ctx.shadowColor = hexA(p.accent, 0.6);
      ctx.shadowBlur = isActive ? size * 0.35 * f.glow : 0;

      var cols = Math.min(3, Math.max(1, Math.ceil(words.length / 4)));
      var chunks = [];
      for (var c = 0; c < cols; c++) {
        chunks.push(words.filter(function (_, wi) { return wi % cols === c; }));
      }
      var widths = chunks.map(function (chunk) { return ctx.measureText(chunk.join("")).width; });
      var textW = widths.reduce(function (a, b) { return a + b; }, 0) + gapX * Math.max(0, chunks.length - 1);
      var y = startY + r * rowH;
      var x = isActive ? W / 2 - textW / 2 : W * 0.2 + rand(seed, r) * W * 0.2;

      for (var ci = 0; ci < chunks.length; ci++) {
        var stagger = (TUNING.partita.staggerMin + rand(seed, ci) * (TUNING.partita.staggerMax - TUNING.partita.staggerMin)) / 1000;
        var appear2 = clamp((line.age - stagger * (ci + 1)) / 0.25, 0, 1);
        var chunkY = y + (1 - easeOutCubic(appear2)) * vpx(W, 24);
        ctx.save();
        ctx.globalAlpha *= 0.2 + 0.8 * appear2;
        ctx.textAlign = "left";
        ctx.fillText(chunks[ci].join(""), x, chunkY);
        ctx.restore();
        x += widths[ci] + gapX;
      }
    }
    ctx.restore();

    dust(ctx, W, H, api.t, p.accent, 32, 0.6);
    vignette(ctx, W, H);
  }

  /* ============================================================
     5) 群唱 cappella —— 聊天气泡 + 头像 + 逐字显示
     ============================================================ */
  function renderCappella(ctx, W, H, api) {
    var p = palette("cappella");
    var t = api.t;
    var f = getFont();
    bg(ctx, W, H, p, { gx: 0.6, gy: 0.3, glow: 0.12 });

    var lines = safeLines(api);
    var line = curLine(api);
    if (!line || !lines) { vignette(ctx, W, H); return; }

    var scale = W / 1000;
    var basePx = clamp(TUNING.cappella.fontBase * scale, TUNING.cappella.fontMin * scale, TUNING.cappella.fontMax * scale);
    var avatar = vpx(W, TUNING.cappella.avatar);
    var gap = vpx(W, TUNING.cappella.gap);
    var padX = vpx(W, TUNING.cappella.padX);
    var padY = vpx(W, TUNING.cappella.padY);
    var maxTextW = Math.max(vpx(W, 96), vpx(W, TUNING.cappella.groupRatio * 1000 - 56));

    var idx = line.index;
    var visible = [];
    for (var d = -3; d <= 0; d++) {
      var li = idx + d;
      if (li >= 0 && li < lines.length) visible.push(li);
    }

    var sides = ["left", "right", "left", "right", "right"];
    var y = H * 0.22;
    ctx.save();
    for (var v = 0; v < visible.length; v++) {
      var itemIdx = visible[v];
      var item = lines[itemIdx];
      var isActive = itemIdx === idx;
      var text = item.text || "";
      var side = sides[(v + itemIdx) % sides.length];
      var fontPx = basePx * (isActive ? TUNING.cappella.activeFont : 1);
      var px = isActive ? padX : padX * 0.8;
      var py = isActive ? padY : padY * 0.76;

      ctx.font = (isActive ? 600 : 400) + " " + Math.round(fontPx) + "px " + f.family;
      var textW = Math.min(ctx.measureText(text).width, maxTextW);
      var bubbleW = textW + px * 2;
      var bubbleH = Math.max(fontPx * 1.45 + py * 2, isActive ? vpx(W, 58) : vpx(W, 44));
      var bx = side === "left" ? W * 0.16 + avatar + gap : W * 0.84 - bubbleW;

      ctx.save();
      ctx.globalAlpha = isActive ? 1 : TUNING.cappella.passedOpacity;
      var enterPop = isActive ? 0.94 + 0.06 * easeOutCubic(clamp(item.line ? line.age / 0.3 : 1, 0, 1)) : 1;
      var s = (isActive ? TUNING.cappella.activeScale : TUNING.cappella.passedScale) * enterPop;
      ctx.translate(bx + bubbleW / 2, y + bubbleH / 2);
      ctx.scale(s, s);
      ctx.translate(-(bx + bubbleW / 2), -(y + bubbleH / 2));
      if (isActive) {
        ctx.translate(0, (1 - easeOutCubic(clamp(line.age / 0.3, 0, 1))) * vpx(W, 12));
      }

      var radius = Math.min(bubbleH / 2, vpx(W, 26));
      roundRect(ctx, bx, y, bubbleW, bubbleH, radius);
      ctx.fillStyle = isActive ? hexA(p.primary, 0.16) : hexA(p.primary, 0.08);
      ctx.fill();
      ctx.strokeStyle = isActive ? hexA(p.accent, 0.5) : hexA(p.accent, 0.2);
      ctx.lineWidth = Math.max(1, W * 0.0012);
      ctx.stroke();

      var ax = side === "left" ? bx - avatar / 2 - gap : bx + bubbleW + avatar / 2 + gap;
      drawAvatar(ctx, ax, y + bubbleH / 2, avatar, p, itemIdx, f);

      ctx.save();
      clipRoundRect(ctx, bx + px, y + py, bubbleW - px * 2, bubbleH - py * 2, radius * 0.6);
      ctx.fillStyle = p.light;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      var shown = text;
      if (isActive) {
        var chars = Array.from(text);
        var frac = clamp(line.age / Math.max(0.4, line.dur * 0.6), 0, 1);
        shown = chars.slice(0, Math.max(1, Math.ceil(chars.length * frac))).join("");
      }
      ctx.fillText(shown, bx + px, y + bubbleH / 2);
      ctx.restore();

      if (isActive) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.font = "500 " + Math.round(vpx(W, 11)) + "px " + f.family;
        ctx.fillStyle = p.accent;
        ctx.textAlign = side === "left" ? "left" : "right";
        ctx.fillText(formatStamp(item.time || 0), side === "left" ? bx : bx + bubbleW, y + bubbleH + vpx(W, 12));
        ctx.restore();
      }
      ctx.restore();
      y += bubbleH + gap;
    }
    ctx.restore();

    ctx.save();
    for (var e = 0; e < 7; e++) {
      var sd = e * 7.7;
      var ex = W * (0.12 + U.hash(sd) * 0.76);
      var ey = H * (0.14 + U.hash(sd + 1) * 0.7) + Math.sin(t * 0.6 + e) * vpx(W, 6);
      ctx.fillStyle = hexA(p.accent, 0.1 + U.hash(sd + 2) * 0.12);
      ctx.beginPath();
      ctx.arc(ex, ey, vpx(W, 2 + U.hash(sd + 3) * 3), 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    vignette(ctx, W, H);
  }

  function drawAvatar(ctx, cx, cy, r, p, seed, f) {
    ctx.save();
    var g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, hexA(p.primary, 0.55));
    g.addColorStop(1, hexA(p.accent, 0.35));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r / 2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = hexA(p.accent, 0.4);
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.stroke();
    ctx.fillStyle = hexA(p.light, 0.9);
    ctx.font = "600 " + Math.round(r * 0.42) + "px " + f.family;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String.fromCharCode(65 + Math.floor(U.hash(seed * 3.3) * 26)), cx, cy + r * 0.02);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function clipRoundRect(ctx, x, y, w, h, r) {
    roundRect(ctx, x, y, w, h, r);
    ctx.clip();
  }

  function formatStamp(sec) {
    sec = Math.max(0, sec || 0);
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  /* ============================================================
     6) 倾诉 tilt —— 1~4 行概率拆分 + 倾斜段上下错位
     ============================================================ */
  function renderTilt(ctx, W, H, api) {
    var p = palette("tilt");
    var t = api.t;
    var f = getFont();
    bg(ctx, W, H, p, { gx: 0.5, gy: 0.5, glow: 0.08 });

    var line = curLine(api);
    if (!line) { vignette(ctx, W, H); return; }

    var text = line.text || "";
    var chars = Array.from(text);
    var seed = line.start || 0;

    var numLines = clamp(
      Math.round(Math.log2(Math.max(1, chars.length) / 20 + 1) + (rand(seed, 1) - 0.5) * 2 * TUNING.tilt.splitProbability) + 1,
      1,
      4
    );
    var segments = splitIntoSegments(chars, numLines, seed);
    var tiltIndex = -1;
    if (segments.length > 1 && rand(seed, 2) < 0.35) {
      tiltIndex = Math.floor(rand(seed, 3) * segments.length);
    }

    var fontPx = clamp(vpx(W, 68.75), vpx(W, TUNING.tilt.fontMin), vpx(W, TUNING.tilt.fontMax));
    var reveal = lineReveal(line, { durRatio: 0.85 });
    var alpha = clamp(line.alpha, 0, 1) * f.opacity;

    /* 先算每段的字号与行高，再垂直居中整块 */
    var sizes = [];
    var lineHs = [];
    var segTexts = [];
    for (var pi = 0; pi < segments.length; pi++) {
      var segText = segments[pi].join("");
      var segTilt = pi === tiltIndex;
      var sz = fontPx;
      ctx.save();
      ctx.font = (segTilt ? "italic " : "") + (segTilt ? 300 : 400) + " " + Math.round(sz) + "px " + f.family;
      var sw = ctx.measureText(segText).width;
      var segMaxW = W * 0.8;
      if (sw > segMaxW) sz = Math.round(sz * (segMaxW / sw));
      ctx.restore();
      sizes.push(sz);
      lineHs.push(sz * (segTilt ? TUNING.tilt.lineHeightTilt : TUNING.tilt.lineHeightNormal));
      segTexts.push(segText);
    }
    var totalH = lineHs.reduce(function (a, b) { return a + b; }, 0);
    var cursorY = H / 2 - totalH / 2;

    var tiltTr = transitionState(line);
    var tiltEnd = applyTransition(ctx, W, H, tiltTr);

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    var charCursor = 0;
    for (var si = 0; si < segments.length; si++) {
      var seg = segments[si];
      var isTilt = si === tiltIndex;
      var size = sizes[si];
      var weight = isTilt ? 300 : 400;
      var style = isTilt ? "italic " : "";
      ctx.font = style + weight + " " + Math.round(size) + "px " + f.family;

      var segW = ctx.measureText(segTexts[si]).width;
      var y = cursorY + lineHs[si] / 2;
      var x = W / 2 - segW / 2;

      for (var ci = 0; ci < seg.length; ci++) {
        var ch = seg[ci];
        var chW = ctx.measureText(ch).width;
        var delay = (isTilt ? TUNING.tilt.tiltCharDelay : TUNING.tilt.charDelay) * charCursor;
        var k = clamp((reveal * (line.dur * 0.85) - delay) / 0.22, 0, 1);
        var tiltOffset = isTilt ? (ci % 2 === 1 ? -size * 0.16 : size * 0.06) : 0;
        ctx.save();
        ctx.translate(x + chW / 2, y + tiltOffset + (1 - easeOutCubic(k)) * size * 0.3);
        ctx.globalAlpha = alpha * k;
        ctx.fillStyle = isTilt ? hexA(p.accent, 0.95) : p.light;
        ctx.shadowColor = hexA(p.accent, isTilt ? 0.5 : 0.25);
        ctx.shadowBlur = size * (isTilt ? 0.2 : 0.12);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
        x += chW;
        charCursor++;
      }
      cursorY += lineHs[si];
    }
    ctx.restore();
    tiltEnd();

    dust(ctx, W, H, t, p.accent, 26, 0.5);
    vignette(ctx, W, H);
  }

  function splitIntoSegments(chars, n, seed) {
    n = Math.max(1, Math.min(n, chars.length));
    var segs = [];
    var remaining = chars.slice();
    for (var i = 0; i < n; i++) {
      var left = n - i;
      var take = Math.max(1, Math.ceil(remaining.length / left + (rand(seed + i, 4) - 0.5) * 2));
      take = Math.min(take, remaining.length - (left - 1));
      segs.push(remaining.slice(0, take));
      remaining = remaining.slice(take);
    }
    return segs;
  }

  /* ============================================================
     7) 镜台 diorama —— 伪 3D 多层歌词 + 相机 + 镜像
     ============================================================ */
  function renderDiorama(ctx, W, H, api) {
    var p = palette("diorama");
    var t = api.t;
    var f = getFont();
    bg(ctx, W, H, p, { gx: 0.5, gy: 0.4, glow: 0.08 });

    var line = curLine(api);
    var lines = safeLines(api);
    var idx = line ? line.index : -1;

    var camX = Math.sin(t * 0.18 * TUNING.diorama.cameraSpeed) * vpx(W, 24) * TUNING.diorama.motion;
    var camY = Math.cos(t * 0.13 * TUNING.diorama.cameraSpeed) * vpx(W, 12) * TUNING.diorama.motion;

    var horizon = H * 0.62 + camY * 0.4;
    var vanish = W * 0.5 + camX * 0.5;
    ctx.save();
    ctx.strokeStyle = hexA(p.accent, 0.14);
    ctx.lineWidth = Math.max(1, W * 0.001);
    for (var i = 0; i < 10; i++) {
      var yy = horizon + (H - horizon) * Math.pow(i / 10, 1.7);
      ctx.globalAlpha = 0.05 + (i / 10) * 0.12;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(W, yy);
      ctx.stroke();
    }
    for (var j = -7; j <= 7; j++) {
      ctx.globalAlpha = 0.08;
      ctx.beginPath();
      ctx.moveTo(vanish + j * vpx(W, 9), horizon);
      ctx.lineTo(vanish + j * vpx(W, 150), H);
      ctx.stroke();
    }
    ctx.restore();

    if (!line) { vignette(ctx, W, H); return; }

    var linePx = clamp(vpx(W, 44), vpx(W, 26), vpx(W, 56));
    var reveal = lineReveal(line, { durRatio: 0.85 });
    var alpha = clamp(line.alpha, 0, 1) * f.opacity;
    var lineSlide = (1 - easeOutCubic(clamp(line.age / 0.45, 0, 1))) * vpx(W, 42);
    var baseY = H * 0.44 + camY * 0.6 - lineSlide;

    var planes = [
      { scale: 1, a: 1, dy: 0 },
      { scale: 0.86, a: 0.42, dy: -vpx(W, 96) },
      { scale: 0.72, a: 0.2, dy: -vpx(W, 168) },
      { scale: 0.6, a: 0.1, dy: -vpx(W, 228) }
    ];

    for (var pi = 0; pi < planes.length; pi++) {
      var pl = planes[pi];
      var srcLine = pi === 0 ? line : lines && idx - pi >= 0 ? lines[idx - pi] : null;
      if (!srcLine || !srcLine.text) continue;
      var size = linePx * pl.scale;
      ctx.save();
      ctx.globalAlpha = alpha * pl.a * (pi === 0 ? 1 : 0.8);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 " + Math.round(size) + "px " + f.family;
      var text = srcLine.text;
      var mw = ctx.measureText(text).width;
      var maxW = W * (0.8 - pi * 0.06);
      if (mw > maxW) {
        size = Math.round(size * (maxW / mw));
        ctx.font = "700 " + Math.round(size) + "px " + f.family;
        mw = ctx.measureText(text).width;
      }
      var x = W / 2 + camX * (pi + 1) * 0.35;
      var y = baseY + pl.dy;
      if (pi === 0) {
        ctx.shadowColor = hexA(p.accent, 0.7);
        ctx.shadowBlur = size * 0.3 * f.glow;
        ctx.fillStyle = p.light;
        ctx.fillText(text, x, y);
        ctx.save();
        ctx.globalAlpha *= 0.16;
        ctx.translate(0, y + size * 0.8);
        ctx.scale(1, -1);
        ctx.fillText(text, x, 0);
        ctx.restore();
        ctx.globalAlpha = alpha * 0.5;
        ctx.strokeStyle = hexA(p.accent, 0.4);
        ctx.lineWidth = Math.max(1, W * 0.0016);
        ctx.beginPath();
        ctx.moveTo(x - mw * 0.35, y + size * 0.72);
        ctx.lineTo(x + mw * 0.35, y + size * 0.72);
        ctx.stroke();
      } else {
        ctx.fillStyle = hexA(p.accent, 0.85);
        ctx.fillText(text, x, y);
      }
      ctx.restore();
    }

    dust(ctx, W, H, t, p.accent, TUNING.diorama.particles, 0.4);
    vignette(ctx, W, H, 0.72);
  }

  /* ============================================================
     8) 时计 pendolo —— 轮盘弧线排版（9 行窗口）
     ============================================================ */
  function renderPendolo(ctx, W, H, api) {
    var p = palette("pendolo");
    var t = api.t;
    var f = getFont();
    bg(ctx, W, H, p, { gx: 0.35, gy: 0.5, glow: 0.1 });

    var lines = safeLines(api);
    var line = curLine(api);
    if (!line || !lines) { vignette(ctx, W, H); return; }

    var idx = line.index;
    var cx = 0; /* wheelCenterX = 0 → 圆心在左边缘 */
    var cy = H * TUNING.pendolo.wheelCenterY;
    var radius = Math.min(W, H) * TUNING.pendolo.arcRadius;
    var totalArc = (TUNING.pendolo.arcAngleDeg * Math.PI) / 180;
    var angleStep = totalArc / (TUNING.pendolo.visibleWindow - 1);
    var linePx = clamp(vpx(W, 30), vpx(W, 22), vpx(W, 40));

    ctx.save();
    ctx.strokeStyle = hexA(p.accent, 0.16);
    ctx.lineWidth = Math.max(1, W * 0.0012);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2 - totalArc / 2, -Math.PI / 2 + totalArc / 2);
    ctx.stroke();
    ctx.strokeStyle = hexA(p.accent, 0.28);
    for (var ti = 0; ti <= 24; ti++) {
      var ta = -Math.PI / 2 - totalArc / 2 + (totalArc * ti) / 24;
      var inner = radius * (ti % 4 === 0 ? 0.94 : 0.97);
      ctx.globalAlpha = ti % 4 === 0 ? 0.4 : 0.16;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ta) * inner, cy + Math.sin(ta) * inner);
      ctx.lineTo(cx + Math.cos(ta) * radius * 1.01, cy + Math.sin(ta) * radius * 1.01);
      ctx.stroke();
    }
    ctx.restore();

    var scrollIn = (1 - easeOutCubic(clamp(line.age / 0.5, 0, 1))) * angleStep;
    var offsetAngle = Math.sin(t * 0.8) * angleStep * 0.06 + scrollIn;
    var reveal = lineReveal(line, { durRatio: 0.85 });
    var alpha = clamp(line.alpha, 0, 1) * f.opacity;

    ctx.save();
    for (var d = -4; d <= 4; d++) {
      var li = idx + d;
      if (li < 0 || li >= lines.length) continue;
      var item = lines[li];
      var angle = d * angleStep + offsetAngle;
      if (Math.abs(angle) >= Math.PI / 2) continue;

      var x = cx + radius * Math.cos(angle);
      var y = cy + radius * Math.sin(angle);
      var isActive = d === 0;
      var absDistance = Math.abs(d);
      var itemAlpha = Math.max(0.12, Math.pow(Math.cos(angle * 0.75), 2.5) * (1 - absDistance * 0.18));
      var scale = isActive ? TUNING.pendolo.activeScale : Math.max(0.7, 1 - absDistance * 0.08);
      var size = linePx * scale;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.globalAlpha = itemAlpha * (isActive ? alpha : 0.8);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = (isActive ? 700 : 500) + " " + Math.round(size) + "px " + f.family;
      if (isActive) {
        ctx.shadowColor = hexA(p.light, 0.6);
        ctx.shadowBlur = size * 0.3 * f.glow;
        ctx.fillStyle = p.light;
      } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = hexA(p.light, 0.75);
      }
      var text = item.text || "";
      ctx.fillText(text, 0, 0);

      if (isActive) {
        var tw = ctx.measureText(text).width;
        var prog = clamp(reveal, 0, 1);
        ctx.strokeStyle = hexA(p.accent, 0.7);
        ctx.lineWidth = Math.max(1.4, W * 0.0022);
        ctx.beginPath();
        ctx.moveTo(0, size * 0.72);
        ctx.lineTo(tw * prog, size * 0.72);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = hexA(p.accent, 0.2);
    ctx.lineWidth = Math.max(1, W * 0.001);
    ctx.beginPath();
    ctx.arc(cx, cy, vpx(W, 26), 0, TAU);
    ctx.stroke();
    for (var gd = 0; gd < 8; gd++) {
      var ga = (gd / 8) * TAU + t * 0.1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ga) * vpx(W, 26), cy + Math.sin(ga) * vpx(W, 26));
      ctx.lineTo(cx + Math.cos(ga) * vpx(W, 34), cy + Math.sin(ga) * vpx(W, 34));
      ctx.stroke();
    }
    ctx.restore();

    vignette(ctx, W, H);
  }


  /* ============================================================
     9) 莫奈 monet —— 竖向歌词轨道（rail）+ 水彩光斑
     ============================================================ */
  function renderMonet(ctx, W, H, api) {
    var p = palette("monet");
    var t = api.t;
    var f = getFont();
    bg(ctx, W, H, p, { gx: 0.25, gy: 0.35, glow: 0.14 });

    /* 水彩光斑 */
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var b = 0; b < 6; b++) {
      var seed = b * 5.31;
      var bx = W * (0.1 + U.hash(seed) * 0.8) + Math.sin(t * 0.1 + b) * W * 0.02;
      var by = H * (0.15 + U.hash(seed + 1) * 0.7) + Math.cos(t * 0.08 + b) * H * 0.02;
      var br = W * (0.1 + U.hash(seed + 2) * 0.16);
      var g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, hexA(b % 2 ? p.primary : p.accent, 0.1 + U.hash(seed + 3) * 0.06));
      g.addColorStop(1, hexA(p.primary, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    var lines = safeLines(api);
    var line = curLine(api);
    if (!line || !lines) { vignette(ctx, W, H); return; }

    var idx = line.index;
    var basePx = clamp(vpx(W, 36.5), vpx(W, 22), vpx(W, 52));
    var reveal = lineReveal(line, { durRatio: 0.8 });
    var alpha = clamp(line.alpha, 0, 1) * f.opacity;
    var gapActive = Math.max(vpx(W, 18), basePx * TUNING.monet.activeGapRatio);
    var gapInactive = Math.max(vpx(W, 14), basePx * TUNING.monet.inactiveGapRatio);

    /* 滚动进位的平滑 */
    var scroll = (1 - easeOutCubic(clamp(line.age / 0.4, 0, 1)));

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var y = H * 0.5 - scroll * gapInactive;
    for (var d = -TUNING.monet.railBefore; d <= TUNING.monet.railAfter; d++) {
      var li = idx + d;
      if (li < 0 || li >= lines.length) continue;
      var item = lines[li];
      var isActive = d === 0;
      var dist = Math.abs(d);
      var size = isActive ? basePx : basePx * clamp(Math.pow(0.9, dist), 0.68, 0.92);
      var itemAlpha = isActive ? alpha : clamp(0.58 - (dist - 1) * 0.12, 0.24, 0.56);
      ctx.globalAlpha = itemAlpha;
      ctx.font = (isActive ? 700 : 500) + " " + Math.round(size) + "px " + f.family;
      if (isActive) {
        ctx.shadowColor = hexA(p.accent, 0.6);
        ctx.shadowBlur = size * 0.3 * f.glow;
        ctx.fillStyle = p.light;
      } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = hexA(p.light, 0.72);
      }
      var text = item.text || "";
      var mw = ctx.measureText(text).width;
      if (mw > W * 0.7) {
        size = Math.round(size * ((W * 0.7) / mw));
        ctx.font = (isActive ? 700 : 500) + " " + Math.round(size) + "px " + f.family;
      }
      ctx.fillText(text, W / 2, y + Math.sin(t * 0.7 + d) * vpx(W, 2));
      y += size + (isActive ? gapActive : gapInactive);
    }
    /* 副标题小字 */
    if (line.text && reveal > 0.4) {
      ctx.globalAlpha = alpha * 0.5;
      ctx.font = "400 " + Math.round(basePx * 0.34) + "px " + f.family;
      ctx.fillStyle = p.accent;
      ctx.fillText("— " + (api.artist || "") + " —", W / 2, H * 0.5 + basePx * 1.6 + TUNING.monet.subtitleStagger * basePx);
    }
    ctx.restore();

    dust(ctx, W, H, t, p.accent, 34, 0.5);
    vignette(ctx, W, H);
  }

  /* ============================================================
     10) 十四行 sonnet —— 杂志排版：hero 大字 + 侧栏小字
     ============================================================ */
  function renderSonnet(ctx, W, H, api) {
    var p = palette("sonnet");
    var t = api.t;
    var f = getFont();
    bg(ctx, W, H, p, { gx: 0.5, gy: 0.3, glow: 0.06 });

    /* 纸张：细横线 + 边框 */
    ctx.save();
    ctx.strokeStyle = hexA(p.accent, 0.08);
    ctx.lineWidth = 1;
    for (var i = 0; i < 18; i++) {
      var yy = H * (0.08 + i * 0.052);
      ctx.beginPath();
      ctx.moveTo(W * 0.06, yy);
      ctx.lineTo(W * 0.94, yy);
      ctx.stroke();
    }
    ctx.strokeStyle = hexA(p.accent, 0.22);
    ctx.strokeRect(W * 0.045, H * 0.06, W * 0.91, H * 0.88);
    ctx.restore();

    var line = curLine(api);
    var lines = safeLines(api);
    if (!line) { vignette(ctx, W, H); return; }

    var tr = transitionState(line);
    var endTr = applyTransition(ctx, W, H, tr);

    var words = splitWords(line.text || "");
    var heroIdx = 0;
    var best = -1;
    for (var h = 0; h < words.length; h++) {
      var sc = Math.min(words[h].length, 8) * 14 + (1 - Math.abs(h - (words.length - 1) / 2) / Math.max(1, words.length)) * 12;
      if (sc > best) { best = sc; heroIdx = h; }
    }

    var reveal = lineReveal(line, { durRatio: 0.85 });
    var alpha = clamp(line.alpha, 0, 1) * f.opacity;
    var heroPx = clamp(vpx(W, 84), vpx(W, 46), vpx(W, 110));
    var supportPx = vpx(W, 26);

    ctx.save();
    ctx.textBaseline = "middle";

    /* hero 词 */
    var heroWord = words[heroIdx] || "";
    ctx.textAlign = "center";
    ctx.font = "900 " + Math.round(heroPx) + "px " + f.family;
    var hw = ctx.measureText(heroWord).width;
    if (hw > W * 0.72) {
      heroPx = Math.round(heroPx * ((W * 0.72) / hw));
      ctx.font = "900 " + Math.round(heroPx) + "px " + f.family;
      hw = ctx.measureText(heroWord).width;
    }
    ctx.globalAlpha = alpha;
    ctx.shadowColor = hexA(p.accent, 0.4);
    ctx.shadowBlur = heroPx * 0.2;
    ctx.fillStyle = p.light;
    ctx.fillText(heroWord, W / 2, H * 0.42);

    /* 其余词：左右侧栏 + 下方小字 */
    var others = words.filter(function (_, i) { return i !== heroIdx; });
    ctx.textAlign = "left";
    ctx.font = "700 " + Math.round(supportPx) + "px " + f.family;
    ctx.shadowBlur = 0;
    ctx.fillStyle = hexA(p.accent, 0.92);
    var left = others.filter(function (_, i) { return i % 2 === 0; });
    var right = others.filter(function (_, i) { return i % 2 === 1; });
    var colY = H * 0.6;
    left.forEach(function (w2, i2) {
      ctx.globalAlpha = alpha * 0.8 * clamp((reveal * 2 - i2 * 0.2), 0, 1);
      ctx.fillText(w2, W * 0.1, colY + i2 * supportPx * 1.5);
    });
    ctx.textAlign = "right";
    right.forEach(function (w2, i2) {
      ctx.globalAlpha = alpha * 0.7 * clamp((reveal * 2 - i2 * 0.2), 0, 1);
      ctx.fillText(w2, W * 0.9, colY + i2 * supportPx * 1.5);
    });

    /* 上一句做页眉小字 */
    if (lines && line.index > 0 && lines[line.index - 1]) {
      ctx.textAlign = "left";
      ctx.globalAlpha = 0.35 * alpha;
      ctx.font = "italic 300 " + Math.round(vpx(W, 18)) + "px " + f.family;
      ctx.fillStyle = p.accent;
      ctx.fillText(String(lines[line.index - 1].text || "").slice(0, 30), W * 0.08, H * 0.13);
    }
    ctx.restore();
    endTr();

    vignette(ctx, W, H, 0.55);
  }

  /* ============================================================
     11) 蛋彩 tempera —— 色块 + 网线 + 反白字
     ============================================================ */
  function renderTempera(ctx, W, H, api) {
    var p = palette("tempera");
    var t = api.t;
    var f = getFont();
    bg(ctx, W, H, p, { gx: 0.4, gy: 0.4, glow: 0.12 });

    /* 斜向网线（hatch） */
    ctx.save();
    ctx.strokeStyle = hexA(p.accent, 0.06);
    ctx.lineWidth = 1;
    for (var i = -12; i < 28; i++) {
      ctx.beginPath();
      ctx.moveTo(i * vpx(W, 46), 0);
      ctx.lineTo(i * vpx(W, 46) + W, H);
      ctx.stroke();
    }
    /* 角标 */
    ctx.strokeStyle = hexA(p.accent, 0.4);
    ctx.lineWidth = Math.max(1.4, W * 0.0016);
    var m = vpx(W, 34);
    [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]].forEach(function (c) {
      var x = c[0] === 0 ? m : W - m;
      var y = c[1] === 0 ? m : H - m;
      ctx.beginPath();
      ctx.moveTo(x + c[2] * vpx(W, 26), y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + c[3] * vpx(W, 26));
      ctx.stroke();
    });
    ctx.restore();

    var line = curLine(api);
    if (!line) { vignette(ctx, W, H); return; }

    var tr = transitionState(line);
    var endTr = applyTransition(ctx, W, H, tr);

    var words = splitWords(line.text || "");
    var basePx = clamp(vpx(W, 52), vpx(W, 30), vpx(W, 64));
    var reveal = lineReveal(line, { durRatio: 0.85 });
    var alpha = clamp(line.alpha, 0, 1) * f.opacity;
    var flowX = Math.cos(TUNING.tempera.flowAngle);
    var flowY = Math.sin(TUNING.tempera.flowAngle);

    /* 两行流式排布 */
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    var rows = [[], []];
    words.forEach(function (w2, i2) {
      rows[i2 % 2].push(w2);
    });
    var rowY = [H * 0.4, H * 0.58];
    rows.forEach(function (rowWords, r) {
      var size = r === 0 ? basePx : basePx * 0.72;
      ctx.font = "800 " + Math.round(size) + "px " + f.family;
      var widths = rowWords.map(function (w2) { return ctx.measureText(w2).width; });
      var total = widths.reduce(function (a, b) { return a + b; }, 0) + (rowWords.length - 1) * size * 0.26;
      var x = W / 2 - total / 2;
      for (var w3 = 0; w3 < rowWords.length; w3++) {
        var k = clamp((reveal * words.length - (w3 * 2 + r)) / 1.4, 0, 1);
        var offX = (1 - easeOutCubic(k)) * vpx(W, 60) * flowX;
        var offY = (1 - easeOutCubic(k)) * vpx(W, 40) * flowY;
        ctx.save();
        ctx.translate(x + offX, rowY[r] + offY);
        ctx.globalAlpha = alpha * k;

        /* 反白色块 */
        if (TUNING.tempera.textInversion && r === 0) {
          var pad = size * 0.18;
          ctx.fillStyle = hexA(p.accent, 0.92 * k);
          ctx.fillRect(-pad, -size * 0.62, widths[w3] + pad * 2, size * 1.24);
          ctx.fillStyle = p.bg[0];
        } else {
          ctx.fillStyle = r === 0 ? p.light : hexA(p.light, 0.85);
          /* 网线块 */
          ctx.save();
          ctx.globalAlpha *= 0.22;
          ctx.fillStyle = hexA(p.primary, 0.5);
          ctx.fillRect(-size * 0.1, -size * 0.55, widths[w3] + size * 0.2, size * 1.1);
          ctx.restore();
        }
        ctx.fillText(rowWords[w3], 0, 0);
        ctx.restore();
        x += widths[w3] + size * 0.26;
      }
    });
    ctx.restore();
    endTr();

    dust(ctx, W, H, t, p.accent, 30, 0.5);
    vignette(ctx, W, H, 0.62);
  }

  /* ============================================================
     12) 克拉达 claddagh —— 环形字符排布
     ============================================================ */
  function renderCladdagh(ctx, W, H, api) {
    var p = palette("claddagh");
    var t = api.t;
    var f = getFont();
    bg(ctx, W, H, p, { gx: 0.5, gy: 0.5, glow: 0.1 });

    var lines = safeLines(api);
    var line = curLine(api);
    if (!line || !lines) { vignette(ctx, W, H); return; }

    var cx = W / 2;
    var cy = H * 0.52;
    var R = Math.min(W, H) * 0.3;
    var chars = Array.from(line.text || "");
    var reveal = lineReveal(line, { durRatio: 0.88 });
    var alpha = clamp(line.alpha, 0, 1) * f.opacity;
    var size = clamp(vpx(W, 40), vpx(W, 24), vpx(W, 52));

    /* 圆环导轨 + 克拉达花纹 */
    ctx.save();
    ctx.strokeStyle = hexA(p.accent, 0.28);
    ctx.lineWidth = Math.max(1, W * 0.0012);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.92, 0, TAU);
    ctx.stroke();
    /* 下方克拉达心形 */
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    var hx = cx;
    var hy = cy + R + vpx(W, 26);
    var hs = vpx(W, 18) * (1 + Math.sin(t * 1.2) * 0.04);
    ctx.moveTo(hx, hy + hs);
    ctx.bezierCurveTo(hx - hs * 1.6, hy - hs * 0.4, hx - hs * 0.6, hy - hs * 1.1, hx, hy - hs * 0.3);
    ctx.bezierCurveTo(hx + hs * 0.6, hy - hs * 1.1, hx + hs * 1.6, hy - hs * 0.4, hx, hy + hs);
    ctx.stroke();
    ctx.restore();

    /* 旋转的字符环 */
    var arcSpan = Math.min(TUNING.claddagh.maxArcSpan, chars.length * 0.32);
    var startAngle = -Math.PI / 2 - arcSpan / 2 + Math.sin(t * 0.3) * 0.1;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var cursor = 0;
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      ctx.font = "600 " + Math.round(size) + "px " + f.family;
      var chW = ctx.measureText(ch).width * (1 + TUNING.claddagh.baseTrackingEm);
      var frac = (cursor + chW / 2) / Math.max(1, chars.length * size);
      var angle = startAngle + arcSpan * frac;
      var k = clamp((reveal * chars.length - i) / 1.6, 0, 1);
      var x = cx + Math.cos(angle) * R;
      var y = cy + Math.sin(angle) * R;
      var deg = (angle * 180) / Math.PI;
      if (deg > 90) deg -= 180;
      if (deg < -90) deg += 180;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.globalAlpha = alpha * k;
      ctx.fillStyle = hexColorFor(p, i, chars.length);
      ctx.shadowColor = hexA(p.accent, 0.6);
      ctx.shadowBlur = size * 0.25 * f.glow;
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      cursor += chW;
    }
    ctx.restore();

    /* 上一句：背面小环 */
    if (line.index > 0 && lines[line.index - 1]) {
      ctx.save();
      ctx.globalAlpha = 0.2 * alpha * TUNING.claddagh.backFollow;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "400 " + Math.round(size * 0.7) + "px " + f.family;
      var prev = String(lines[line.index - 1].text || "");
      var prevW = ctx.measureText(prev).width;
      if (prevW < W * 0.5) {
        ctx.fillStyle = p.light;
        ctx.fillText(prev, cx, cy - R * 1.05);
      }
      ctx.restore();
    }

    dust(ctx, W, H, t, p.accent, 40, 0.6);
    vignette(ctx, W, H);
  }

  function hexColorFor(p, i, total) {
    return i % 5 === 0 ? p.light : hexA(p.light, 0.82);
  }

  var RENDERERS = {
    fume: renderFume,
    lumiere: renderLumiere,
    classic: renderLumiere,
    cadenza: renderCadenza,
    partita: renderPartita,
    cappella: renderCappella,
    tilt: renderTilt,
    diorama: renderDiorama,
    pendolo: renderPendolo,
    monet: renderMonet,
    sonnet: renderSonnet,
    tempera: renderTempera,
    claddagh: renderCladdagh
  };

  NS.foliaFidelity = {
    PALETTES: PALETTES,
    TUNING: TUNING,
    DESIGN_REF: {
      classic: "clamp(2.25rem, 6vw, 4.5rem); wordSpacing .7; spread 20; rotate ±5°",
      tilt: "clamp(3.125rem, 6.875vw, 5.625rem); 1~4 lines; italic tilt segment; .04/.05s per char",
      partita: "0.65H rows; rowHeight 100px; columnGap 1.6rem; stagger 20~100ms",
      cappella: "font 18 clamp(15,26); bubble max 0.68W-56; avatar 40px; active 1.12×",
      pendolo: "wheel R=0.42·min(W,H); 100° arc; 9-line window; alpha cos(0.75a)^2.5",
      fume: "hero 24~54px body 14~28px; lineHeight 1.02/1.06; columns",
      cadenza: "hero word ~1.5×; radial scatter; passed rotate ±6°",
      diorama: "planes by depth; camera drift; particles; mirror"
    },
    has: function (mode) { return !!RENDERERS[mode]; },
    render: function (ctx, W, H, api, mode) {
      var fn = RENDERERS[mode];
      if (!fn) return false;
      fn(ctx, W, H, api);
      return true;
    },
    LICENSE: "AGPL-3.0",
    SOURCE: "https://github.com/chthollyphile/folia-major"
  };
})(window.CodeMV);
