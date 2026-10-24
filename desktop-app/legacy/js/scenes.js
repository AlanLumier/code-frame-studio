/* ==========================================================================
   CodeMV · 场景渲染器（确定性）
   --------------------------------------------------------------------------
   纪律：每个场景的 draw() 都是纯函数 —— 只依赖 (t, api)，
   不使用 Math.random()、不保存帧间状态、不用 CSS 过渡。
   这样「实时播放」和「逐帧导出」得到的是同一套画面。
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var TAU = Math.PI * 2;
  var FONT =
    '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "SF Pro Display", sans-serif';

  /* ---------- 数学 / 颜色 ---------- */

  function hash(n) {
    var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453123;
    return x - Math.floor(x);
  }

  function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
  }

  function easeOutCubic(p) {
    return 1 - Math.pow(1 - p, 3);
  }

  function rgba(c, a) {
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }

  function mixRgb(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    ];
  }

  /* ---------- 文本 ---------- */

  function wrapText(ctx, text, maxWidth) {
    var chars = String(text).split("");
    var rows = [];
    var cur = "";

    for (var i = 0; i < chars.length; i++) {
      var next = cur + chars[i];
      if (cur && ctx.measureText(next).width > maxWidth) {
        rows.push(cur);
        cur = chars[i];
      } else {
        cur = next;
      }
    }
    if (cur) rows.push(cur);
    return rows;
  }

  /** 画当前歌词：跟随「歌词样式」设置（位置 / 字号 / 字距 / 字体 / 动效） */
  function drawLyric(ctx, W, H, api, opts) {
  if (window.CodeMV && window.CodeMV.__barMode) return;
    opts = opts || {};
    var line = api.line(api.t);
    if (!line || line.alpha <= 0.002) return;

    var LS = NS.lyricStyle;
    var ls = LS ? LS.load() : null;
    if (ls && ls.visible === false) return;

    var m = LS ? LS.metrics(W, H) : null;
    var size = opts.size || (m ? m.size : Math.round(W * 0.046));
    var anim = opts.anim || (m ? m.anim : "highlight");
    var text = line.text || "";

    if (opts.typewriter || anim === "typewriter") {
      var n = Math.floor(text.length * line.typeProgress);
      text = text.slice(0, Math.max(1, n));
    }

    var align = opts.align || (m ? m.s.align : "center");
    var weight = opts.weight || (m ? m.s.weight : 600);
    var family = opts.font || (m ? m.fontFamily : FONT);
    var tracking =
      opts.tracking != null ? opts.tracking : m ? m.tracking : "0.06em";
    var y = opts.y != null ? opts.y : m ? m.y : H * 0.5;
    var opacity = opts.opacity != null ? opts.opacity : m ? m.opacity : 1;
    var glow = opts.glowAlpha != null ? opts.glowAlpha : m ? m.glow : 0.55;
    var lineHeight = m ? m.s.lineHeight : 1.34;
    var maxW = W * (opts.maxWidth || (m ? m.s.maxWidth : 0.78));
    var pad = (W - maxW) / 2;

    ctx.save();
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.font = weight + " " + size + "px " + family;
    try {
      ctx.letterSpacing = tracking;
    } catch (e) {
      /* 老浏览器忽略 */
    }

    var rows = wrapText(ctx, text, maxW);
    var lh = size * lineHeight;
    var startY = y - ((rows.length - 1) * lh) / 2;
    var rise =
      anim === "slide"
        ? (1 - easeOutCubic(clamp(line.age / 0.6, 0, 1))) * size * 0.35
        : 0;
    var alpha = (anim === "none" ? 1 : line.alpha) * opacity;

    var x = align === "center" ? W / 2 : align === "right" ? W - pad : pad;

    if (glow > 0.02) {
      ctx.shadowColor = rgba(opts.glow || api.palette[1], glow);
      ctx.shadowBlur = size * (0.2 + glow * 0.6);
    }

    if (m && m.outline > 0.004) {
      ctx.strokeStyle = "rgba(255,255,255," + alpha * 0.85 + ")";
      ctx.lineWidth = Math.max(1, size * m.outline);
      for (var s = 0; s < rows.length; s++) {
        ctx.strokeText(rows[s], x, startY + s * lh + rise);
      }
    }

    ctx.fillStyle = "rgba(255,255,255," + alpha + ")";
    for (var r = 0; r < rows.length; r++) {
      ctx.fillText(rows[r], x, startY + r * lh + rise);
    }

    ctx.restore();
  }

  /** 开头显示歌名，几秒内淡出 */
  function drawIntroTitle(ctx, W, H, api, opts) {
    opts = opts || {};
    var t = api.t;
    if (t > 6.5 || !api.title) return;

    var alpha = clamp(t / 0.8, 0, 1) * clamp((6.5 - t) / 1.2, 0, 1);
    if (alpha <= 0.01) return;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "500 " + Math.round(W * 0.016) + "px " + FONT;
    ctx.fillStyle = rgba(api.palette[3], 0.85 * alpha);
    try {
      ctx.letterSpacing = "0.3em";
    } catch (e) {}
    ctx.fillText(api.title.toUpperCase(), W / 2, H * 0.15);

    ctx.font = "400 " + Math.round(W * 0.012) + "px " + FONT;
    ctx.fillStyle = rgba(api.palette[1], 0.7 * alpha);
    ctx.fillText("CODE MV", W / 2, H * 0.15 + W * 0.026);
    ctx.restore();
  }

  /* ======================================================================
     场景 1 · 液态霓虹
     ====================================================================== */
  var liquid = {
    id: "liquid",
    draw: function (ctx, W, H, api) {
      var t = api.t;
      var pal = api.palette;
      var e = api.energy(t);
      var b = api.bass(t);
      var sec = api.section || {};
      var zoom = sec.motion === "zoom" ? 1 + clamp((t - sec.start) / 10, 0, 0.1) : 1;

      ctx.fillStyle = rgba(mixRgb(pal[0], [0, 0, 0], 0.4), 1);
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      if (zoom !== 1) {
        ctx.translate(W / 2, H / 2);
        ctx.scale(zoom, zoom);
        ctx.translate(-W / 2, -H / 2);
      }

      /* 大色块 */
      ctx.globalCompositeOperation = "lighter";
      var blobs = 5;
      for (var i = 0; i < blobs; i++) {
        var ph = hash(i + 1) * TAU;
        var sp = 0.08 + hash(i + 2) * 0.1;
        var x = W * (0.15 + 0.7 * hash(i + 3)) + Math.sin(t * sp + ph) * W * 0.24;
        var y = H * (0.2 + 0.6 * hash(i + 4)) + Math.cos(t * sp * 1.2 + ph) * H * 0.22;
        var r = H * (0.4 + 0.22 * hash(i + 5)) * (1 + 0.24 * b);
        var col = pal[1 + (i % (pal.length - 1))];

        var g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(col, 0.42 + 0.16 * e));
        g.addColorStop(0.45, rgba(col, 0.1));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }

      /* 漂浮尘埃 */
      for (var k = 0; k < 70; k++) {
        var seed = hash(k * 3.7);
        var dx = (((hash(k * 7.1) + t * (0.004 + seed * 0.012)) % 1) + 1) % 1;
        var dy = clamp(hash(k * 11.3) + Math.sin(t * 0.3 + k) * 0.03, 0, 1);
        ctx.fillStyle = rgba(pal[3], 0.12 + 0.3 * e * seed);
        ctx.beginPath();
        ctx.arc(dx * W, dy * H, 1 + seed * 2.2, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      ctx.globalCompositeOperation = "source-over";

      /* 暗角 */
      var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 1.0);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.72)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      /* 节拍脉冲环 */
      var phase = api.beatPhase(t);
      var pulse = Math.pow(1 - phase, 3) * (0.25 + 0.75 * b);
      ctx.strokeStyle = rgba(pal[1], 0.2 * pulse);
      ctx.lineWidth = 2 + 12 * pulse;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, H * (0.16 + 0.06 * (1 - phase)), 0, TAU);
      ctx.stroke();

      drawLyric(ctx, W, H, api, { y: H * 0.53, glow: pal[1] });
      drawIntroTitle(ctx, W, H, api, {});
    }
  };

  /* ======================================================================
     场景 2 · 粒子星云
     ====================================================================== */
  var PARTICLES = null;

  function ensureParticles() {
    if (PARTICLES) return PARTICLES;
    PARTICLES = [];
    for (var i = 0; i < 190; i++) {
      PARTICLES.push({
        a: hash(i * 1.13) * TAU,
        r: 0.1 + hash(i * 2.71) * 0.92,
        s: 0.5 + hash(i * 3.37) * 2.1,
        w: 0.08 + hash(i * 4.19) * 0.35,
        ph: hash(i * 5.53) * TAU
      });
    }
    return PARTICLES;
  }

  var nebula = {
    id: "nebula",
    draw: function (ctx, W, H, api) {
      var t = api.t;
      var pal = api.palette;
      var e = api.energy(t);
      var b = api.bass(t);

      /* 底色 */
      var bg = ctx.createRadialGradient(
        W * 0.5,
        H * 0.46,
        0,
        W * 0.5,
        H * 0.46,
        Math.max(W, H) * 0.75
      );
      bg.addColorStop(0, rgba(mixRgb(pal[0], pal[2], 0.1), 1));
      bg.addColorStop(1, "#020309");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      var ps = ensureParticles();
      var cx = W * 0.5;
      var cy = H * 0.48;
      var spread = H * (0.4 + 0.12 * e + 0.06 * b);

      var pts = [];
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        var ang = p.a + t * p.w;
        var rad = p.r * spread * (1 + 0.1 * Math.sin(t * 0.8 + p.ph));
        var x = cx + Math.cos(ang) * rad;
        var y = cy + Math.sin(ang) * rad * 0.74;
        pts.push({ x: x, y: y, s: p.s, i: i });
      }

      /* 连线 */
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 1;
      var maxDist = Math.min(W, H) * 0.13;
      for (var a = 0; a < pts.length; a++) {
        for (var c = a + 1; c < pts.length; c++) {
          var dx = pts[a].x - pts[c].x;
          var dy = pts[a].y - pts[c].y;
          var d2 = dx * dx + dy * dy;
          if (d2 < maxDist * maxDist) {
            var alpha = (1 - Math.sqrt(d2) / maxDist) * 0.22 * (0.4 + 0.6 * e);
            ctx.strokeStyle = rgba(pal[1], alpha);
            ctx.beginPath();
            ctx.moveTo(pts[a].x, pts[a].y);
            ctx.lineTo(pts[c].x, pts[c].y);
            ctx.stroke();
          }
        }
      }

      /* 粒子 */
      for (var k = 0; k < pts.length; k++) {
        var pt = pts[k];
        var col = pal[1 + (pt.i % (pal.length - 1))];
        var size = pt.s * (1 + 0.7 * e) * (1 + 0.25 * b);
        ctx.fillStyle = rgba(col, 0.55 + 0.35 * e);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, size, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      /* 中心柔光 */
      var glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 0.42);
      glow.addColorStop(0, rgba(pal[1], 0.1 + 0.08 * e));
      glow.addColorStop(1, rgba(pal[1], 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      drawLyric(ctx, W, H, api, { y: H * 0.53, glow: pal[2] });
      drawIntroTitle(ctx, W, H, api, {});
    }
  };

  /* ======================================================================
     场景 3 · 线稿流动
     ====================================================================== */
  var lineArt = {
    id: "line",
    draw: function (ctx, W, H, api) {
      var t = api.t;
      var pal = api.palette;
      var e = api.energy(t);

      ctx.fillStyle = "#06080f";
      ctx.fillRect(0, 0, W, H);

      /* 背景网格 */
      ctx.strokeStyle = "rgba(255,255,255,0.035)";
      ctx.lineWidth = 1;
      var step = Math.round(W / 26);
      for (var gx = 0; gx < W; gx += step) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, H);
        ctx.stroke();
      }
      for (var gy = 0; gy < H; gy += step) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
        ctx.stroke();
      }

      /* 流动线条 */
      var curves = 9;
      for (var k = 0; k < curves; k++) {
        var col = pal[1 + (k % (pal.length - 1))];
        ctx.strokeStyle = rgba(col, 0.16 + 0.26 * e * (0.5 + 0.5 * hash(k * 2.3)));
        ctx.lineWidth = 1.4 + hash(k * 3.1) * 1.6;
        ctx.beginPath();

        var baseY = H * (0.16 + 0.68 * hash(k * 2.1));
        var amp = H * (0.02 + 0.035 * e) * (0.6 + hash(k * 4.7));
        var freq = 0.0022 + hash(k * 6.1) * 0.0026;
        var speed = 0.35 + k * 0.06;

        for (var x = 0; x <= W; x += 10) {
          var y =
            baseY +
            Math.sin(x * freq + t * speed + k * 1.7) * amp +
            Math.sin(x * freq * 2.3 - t * speed * 0.7) * amp * 0.45;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      /* 光标点 */
      var cursorX = ((t * 0.12) % 1) * W;
      var cursorY =
        H * 0.2 +
        Math.sin(cursorX * 0.004 + t * 0.6) * H * 0.18 +
        Math.cos(cursorX * 0.0021 - t * 0.4) * H * 0.1;
      ctx.fillStyle = rgba(pal[3], 0.9);
      ctx.beginPath();
      ctx.arc(cursorX, cursorY, 4 + 3 * e, 0, TAU);
      ctx.fill();

      /* 歌词：打字机 */
      drawLyric(ctx, W, H, api, {
        y: H * 0.5,
        typewriter: true,
        glow: pal[1],
        weight: 500
      });

      drawIntroTitle(ctx, W, H, api, {});
    }
  };

  /* ======================================================================
     场景 4 · 水墨
     ====================================================================== */
  var ink = {
    id: "ink",
    draw: function (ctx, W, H, api) {
      var t = api.t;
      var e = api.energy(t);
      var b = api.bass(t);

      var paper = ctx.createRadialGradient(
        W * 0.5,
        H * 0.44,
        0,
        W * 0.5,
        H * 0.44,
        Math.max(W, H) * 0.72
      );
      paper.addColorStop(0, "rgba(44,52,64,1)");
      paper.addColorStop(1, "rgba(7,8,10,1)");
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, W, H);

      /* 墨晕 */
      ctx.globalCompositeOperation = "lighter";
      for (var i = 0; i < 7; i++) {
        var ph = hash(i * 3.1) * TAU;
        var sp = 0.04 + hash(i * 2.7) * 0.05;
        var x = W * (0.18 + 0.64 * hash(i * 5.3)) + Math.sin(t * sp + ph) * W * 0.1;
        var y = H * (0.22 + 0.56 * hash(i * 7.1)) + Math.cos(t * sp * 1.1 + ph) * H * 0.08;
        var r = H * (0.22 + 0.22 * hash(i * 9.7)) * (1 + 0.18 * b);

        var g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, "rgba(226,238,255," + (0.2 + 0.14 * e) + ")");
        g.addColorStop(0.5, "rgba(170,190,220,0.07)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }

      /* 飘动墨线 */
      for (var k = 0; k < 5; k++) {
        ctx.strokeStyle = "rgba(220,235,255," + (0.05 + 0.12 * e) + ")";
        ctx.lineWidth = 0.8 + hash(k * 2.3) * 2.2;
        ctx.beginPath();
        var baseY = H * (0.2 + 0.6 * hash(k * 3.7));
        for (var x2 = 0; x2 <= W; x2 += 14) {
          var y2 =
            baseY +
            Math.sin(
              x2 * (0.0018 + hash(k) * 0.002) + t * (0.25 + k * 0.05) + k
            ) *
              H *
              (0.02 + 0.03 * e);
          if (x2 === 0) ctx.moveTo(x2, y2);
          else ctx.lineTo(x2, y2);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";

      var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 1.05);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      drawLyric(ctx, W, H, api, {
        y: H * 0.52,
        font: '"Songti SC", "STSong", "SimSun", serif',
        weight: 500,
        glow: [200, 220, 255],
        size: Math.round(W * 0.044)
      });
      drawIntroTitle(ctx, W, H, api, {});
    }
  };

  /* ======================================================================
     场景 5 · 像素 CRT
     ====================================================================== */
  var PIX_W = 320;
  var PIX_H = 180;
  var pixCanvas = null;
  var pixCtx = null;

  function ensurePixelBuffer() {
    if (pixCanvas) return;
    pixCanvas = document.createElement("canvas");
    pixCanvas.width = PIX_W;
    pixCanvas.height = PIX_H;
    pixCtx = pixCanvas.getContext("2d");
  }

  var pixel = {
    id: "pixel",
    draw: function (ctx, W, H, api) {
      ensurePixelBuffer();

      var p = pixCtx;
      var t = api.t;
      var pal = api.palette;
      var e = api.energy(t);
      var b = api.bass(t);

      var grad = p.createLinearGradient(0, 0, 0, PIX_H);
      grad.addColorStop(0, rgba(mixRgb(pal[0], [10, 10, 30], 0.5), 1));
      grad.addColorStop(1, "#050510");
      p.fillStyle = grad;
      p.fillRect(0, 0, PIX_W, PIX_H);

      /* 星空 */
      for (var i = 0; i < 70; i++) {
        var sx = Math.floor(hash(i * 2.7) * PIX_W);
        var sy = Math.floor(hash(i * 5.1) * PIX_H * 0.8);
        var tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.5 + hash(i) * 2) + i));
        p.fillStyle = "rgba(180,230,255," + (0.2 + 0.6 * tw * (0.4 + e)) + ")";
        p.fillRect(sx, sy, 1, 1);
      }

      /* 地平线与网格 */
      var horizon = Math.floor(PIX_H * 0.62);
      p.strokeStyle = rgba(pal[1], 0.3);
      p.lineWidth = 1;
      p.beginPath();
      p.moveTo(0, horizon);
      p.lineTo(PIX_W, horizon);
      p.stroke();

      for (var g2 = 0; g2 < 12; g2++) {
        var gg = (t * 0.35 + g2 / 12) % 1;
        var gy = horizon + Math.pow(gg, 2) * (PIX_H - horizon);
        p.globalAlpha = 0.22 * (1 - gg) + 0.05;
        p.beginPath();
        p.moveTo(0, Math.floor(gy));
        p.lineTo(PIX_W, Math.floor(gy));
        p.stroke();
      }
      p.globalAlpha = 1;

      /* 低分辨率歌词 */
      drawLyric(p, PIX_W, PIX_H, api, {
        y: PIX_H * 0.47,
        size: 13,
        weight: 700,
        glow: pal[1],
        maxWidth: 0.9
      });

      /* 放大 */
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pixCanvas, 0, 0, W, H);

      /* 轻微 RGB 分离 */
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.05 + 0.05 * e;
      ctx.drawImage(pixCanvas, -2, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.imageSmoothingEnabled = true;

      /* 扫描线 */
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      for (var y2 = 0; y2 < H; y2 += 3) ctx.fillRect(0, y2, W, 1);

      var vg2 = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.95);
      vg2.addColorStop(0, "rgba(0,0,0,0)");
      vg2.addColorStop(1, "rgba(0,0,0,0.66)");
      ctx.fillStyle = vg2;
      ctx.fillRect(0, 0, W, H);
    }
  };

  /* ======================================================================
     场景 6 · 手写字
     ====================================================================== */
  var handwrite = {
    id: "handwrite",
    draw: function (ctx, W, H, api) {
      var t = api.t;
      var pal = api.palette;
      var e = api.energy(t);

      ctx.fillStyle = "#090b10";
      ctx.fillRect(0, 0, W, H);

      /* 纸纤维 */
      for (var i = 0; i < 160; i++) {
        ctx.fillStyle = "rgba(255,255,255," + (0.012 + 0.018 * hash(i)) + ")";
        ctx.fillRect(hash(i * 1.9) * W, hash(i * 3.3) * H, 2, 1);
      }

      var line = api.line(t);
      if (!line || line.alpha <= 0.01) {
        drawIntroTitle(ctx, W, H, api, {});
        return;
      }

      var size = Math.round(W * 0.05);
      ctx.save();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font =
        "500 " + size + "px 'Kaiti SC','STKaiti','KaiTi','Songti SC',serif";
      try {
        ctx.letterSpacing = "0.04em";
      } catch (e2) {
        /* ignore */
      }

      var chars = line.text.split("");
      var widths = [];
      var totalW = 0;
      for (var m = 0; m < chars.length; m++) {
        var w = ctx.measureText(chars[m]).width;
        widths.push(w);
        totalW += w;
      }

      var shown = Math.floor(chars.length * line.typeProgress);
      var startX = W / 2 - totalW / 2;
      var baseY = H * 0.52;
      var x = startX;

      for (var c2 = 0; c2 < chars.length; c2++) {
        var age = line.age - c2 * 0.06;
        if (c2 < shown && age > 0) {
          var pop = Math.min(1, age / 0.25);
          var jx = (hash(c2 * 7.1) - 0.5) * 3;
          var jy = (hash(c2 * 3.7) - 0.5) * 4;
          var rot = (hash(c2 * 5.3) - 0.5) * 0.06;

          ctx.save();
          ctx.translate(x + widths[c2] / 2 + jx, baseY + jy);
          ctx.rotate(rot);
          ctx.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop);
          ctx.fillStyle = "rgba(240,244,255," + line.alpha * pop + ")";
          ctx.shadowColor = "rgba(160,200,255,0.5)";
          ctx.shadowBlur = size * 0.25;
          ctx.fillText(chars[c2], -widths[c2] / 2, 0);
          ctx.restore();
        }
        x += widths[c2];
      }

      /* 笔尖 */
      var penX = startX;
      for (var c3 = 0; c3 < Math.min(shown, chars.length); c3++) penX += widths[c3];
      ctx.fillStyle = rgba(pal[1], 0.9);
      ctx.beginPath();
      ctx.arc(penX + 2, baseY - size * 0.35 + Math.sin(t * 6) * 4, 3 + 2 * e, 0, TAU);
      ctx.fill();
      ctx.restore();

      /* 手绘下划线 */
      var uy = baseY + size * 0.95;
      var uw = Math.min(totalW, W * 0.7) * line.typeProgress;
      ctx.strokeStyle = rgba(pal[1], 0.25 * line.alpha);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var ux = -uw / 2; ux <= uw / 2; ux += 8) {
        var yy = uy + Math.sin(ux * 0.02 + t * 2) * 2;
        if (ux === -uw / 2) ctx.moveTo(W / 2 + ux, yy);
        else ctx.lineTo(W / 2 + ux, yy);
      }
      ctx.stroke();

      drawIntroTitle(ctx, W, H, api, {});
    }
  };

  /* ======================================================================
     场景 7 · 三维线框（纯 Canvas 投影，无需 Three.js）
     ====================================================================== */
  var wire3d = {
    id: "wire3d",
    draw: function (ctx, W, H, api) {
      var t = api.t;
      var pal = api.palette;
      var e = api.energy(t);
      var b = api.bass(t);

      ctx.fillStyle = "#04050a";
      ctx.fillRect(0, 0, W, H);

      var cx = W / 2;
      var cy = H / 2;
      var fov = 900;
      var rotY = t * 0.35;
      var rotX = Math.sin(t * 0.21) * 0.35;
      var radius = Math.min(W, H) * 0.3 * (1 + 0.08 * b);

      var rings = 12;
      var segs = 24;
      var pts = [];

      for (var ri = 0; ri < rings; ri++) {
        var lat = (ri / (rings - 1) - 0.5) * Math.PI;
        var ring = [];
        for (var si = 0; si < segs; si++) {
          var lon = (si / segs) * TAU;
          var x = Math.cos(lat) * Math.cos(lon) * radius;
          var y = Math.sin(lat) * radius;
          var z = Math.cos(lat) * Math.sin(lon) * radius;

          var x1 = x * Math.cos(rotY) - z * Math.sin(rotY);
          var z1 = x * Math.sin(rotY) + z * Math.cos(rotY);
          var y1 = y * Math.cos(rotX) - z1 * Math.sin(rotX);
          var z2 = y * Math.sin(rotX) + z1 * Math.cos(rotX);

          var scale = fov / (fov + z2 + radius);
          ring.push({
            x: cx + x1 * scale,
            y: cy + y1 * scale,
            z: z2,
            s: scale
          });
        }
        pts.push(ring);
      }

      for (var r2 = 0; r2 < rings; r2++) {
        for (var s2 = 0; s2 < segs; s2++) {
          var a = pts[r2][s2];
          var nb = pts[r2][(s2 + 1) % segs];
          var alpha = clamp(0.34 - (a.z + radius) / (radius * 4), 0.03, 0.34);

          ctx.strokeStyle = rgba(pal[1], alpha * (0.4 + 0.6 * e));
          ctx.lineWidth = 0.8 + a.s * 0.8;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(nb.x, nb.y);
          ctx.stroke();

          if (r2 < rings - 1) {
            var nv = pts[r2 + 1][s2];
            ctx.strokeStyle = rgba(pal[2], alpha * (0.3 + 0.5 * e));
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(nv.x, nv.y);
            ctx.stroke();
          }
        }
      }

      var glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.6);
      glow.addColorStop(0, rgba(pal[1], 0.08 + 0.06 * e));
      glow.addColorStop(1, rgba(pal[1], 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      drawLyric(ctx, W, H, api, { y: H * 0.53, glow: pal[2] });
      drawIntroTitle(ctx, W, H, api, {});
    }
  };

  /* ---------- 导出 ---------- */

  NS.scenes = {
    liquid: liquid,
    nebula: nebula,
    line: lineArt,
    ink: ink,
    pixel: pixel,
    handwrite: handwrite,
    wire3d: wire3d,
    list: [liquid, nebula, lineArt, ink, pixel, handwrite, wire3d],
    helpers: {
      drawLyric: drawLyric,
      drawIntroTitle: drawIntroTitle,
      hash: hash,
      clamp: clamp,
      rgba: rgba,
      mixRgb: mixRgb,
      easeOutCubic: easeOutCubic
    }
  };
})(window.CodeMV);
