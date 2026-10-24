/* ==========================================================================
   Code MV · 参数化风格渲染器
   --------------------------------------------------------------------------
   输入：风格定义（js/styles-library.js）
   输出：一帧画面（只依赖 t，确定性）

   组合方式：
     背景渐变 → 形状层 A → 形状层 B → 纹理 → 歌词 → 叠层
   每种形状/纹理/叠层都是确定性函数，随机用 hash(i)。
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var U = NS.utils;
  var TAU = Math.PI * 2;

  function H(n) {
    return U.hash(n);
  }

  function rgba(hex, a) {
    return U.rgba(hex, a);
  }

  function clamp(v, a, b) {
    return U.clamp(v, a, b);
  }

  function motionClock(t, motion) {
    var speed = {
      drift: 0.22,
      pulse: 0.6,
      orbit: 0.5,
      fall: 0.7,
      flow: 0.4,
      sway: 0.3,
      rise: 0.5,
      spin: 0.34,
      wipe: 0.45
    }[motion] || 0.3;
    return t * speed;
  }

  /* ---------- 形状层 ---------- */

  function formOrbs(ctx, W, Hh, t, pal, beat) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < 6; i++) {
      var seed = i * 7.13 + 1.7;
      var x =
        W * (0.15 + H(seed) * 0.7) +
        Math.sin(t * (0.3 + H(seed + 1) * 0.4) + i) * W * 0.06;
      var y =
        Hh * (0.15 + H(seed + 2) * 0.7) +
        Math.cos(t * (0.25 + H(seed + 3) * 0.3) + i * 1.3) * Hh * 0.06;
      var r = Math.min(W, Hh) * (0.12 + H(seed + 4) * 0.2) * (1 + beat * 0.08);
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(i % 2 ? pal.primary : pal.accent, 0.5));
      g.addColorStop(0.5, rgba(i % 2 ? pal.primary : pal.accent, 0.16));
      g.addColorStop(1, rgba(pal.primary, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function formLines(ctx, W, Hh, t, pal, beat) {
    ctx.save();
    ctx.strokeStyle = rgba(pal.accent, 0.22);
    ctx.lineWidth = Math.max(1, W * 0.0012);
    var n = 36;
    for (var i = 0; i < n; i++) {
      var k = i / n;
      var x = W * k + Math.sin(t + i * 0.3) * W * 0.01;
      var y0 = Hh * (0.05 + H(i) * 0.2);
      var y1 = Hh * (0.75 + H(i + 9) * 0.2);
      ctx.globalAlpha = 0.12 + H(i * 3.3) * 0.18 + beat * 0.05;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x + Math.sin(t * 0.5 + i) * W * 0.02, y1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function formRings(ctx, W, Hh, t, pal, beat) {
    ctx.save();
    var cx = W * (0.5 + Math.sin(t * 0.2) * 0.05);
    var cy = Hh * 0.46;
    var max = Math.min(W, Hh) * 0.48;
    for (var i = 0; i < 10; i++) {
      var p = (i / 10 + t * 0.06) % 1;
      var r = max * p * (1 + beat * 0.04);
      ctx.strokeStyle = rgba(i % 2 ? pal.primary : pal.accent, (1 - p) * 0.5);
      ctx.lineWidth = Math.max(1, W * 0.0016);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function formGrid(ctx, W, Hh, t, pal) {
    var horizon = Hh * 0.62;
    ctx.save();
    ctx.strokeStyle = rgba(pal.primary, 0.28);
    ctx.lineWidth = Math.max(1, W * 0.0012);

    for (var i = 0; i < 18; i++) {
      var p = (i / 18 + (t * 0.05) % (1 / 18));
      var y = horizon + (Hh - horizon) * Math.pow(p, 1.8);
      ctx.globalAlpha = 0.1 + p * 0.35;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    var vx = W / 2;
    for (var j = -12; j <= 12; j++) {
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.moveTo(vx + j * W * 0.02, horizon);
      ctx.lineTo(vx + j * W * 0.16, Hh);
      ctx.stroke();
    }
    ctx.restore();
  }

  function formShards(ctx, W, Hh, t, pal, beat) {
    ctx.save();
    for (var i = 0; i < 16; i++) {
      var seed = i * 3.71;
      var x = W * (0.1 + H(seed) * 0.8) + Math.sin(t + i) * W * 0.03;
      var y = Hh * (0.12 + H(seed + 1) * 0.76) + Math.cos(t * 0.8 + i) * Hh * 0.03;
      var s = Math.min(W, Hh) * (0.02 + H(seed + 2) * 0.06) * (1 + beat * 0.1);
      var rot = t * 0.2 + H(seed + 3) * TAU;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = rgba(i % 3 === 0 ? pal.accent : pal.primary, 0.14 + H(seed + 4) * 0.2);
      ctx.beginPath();
      ctx.moveTo(-s, -s * 0.6);
      ctx.lineTo(s * 0.9, -s * 0.2);
      ctx.lineTo(s * 0.3, s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function formWaves(ctx, W, Hh, t, pal, beat) {
    ctx.save();
    ctx.lineCap = "round";
    for (var k = 0; k < 6; k++) {
      ctx.strokeStyle = rgba(k % 2 ? pal.primary : pal.accent, 0.18 + k * 0.02);
      ctx.lineWidth = Math.max(1.5, W * (0.002 + k * 0.0004));
      ctx.beginPath();
      for (var x = 0; x <= W; x += W / 64) {
        var kn = x / W;
        var y =
          Hh * (0.3 + k * 0.07) +
          Math.sin(kn * 6 + t * 1.2 + k) * Hh * 0.05 +
          Math.sin(kn * 13 - t * 0.8) * Hh * 0.02;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function formBlocks(ctx, W, Hh, t, pal) {
    ctx.save();
    for (var i = 0; i < 18; i++) {
      var seed = i * 5.17;
      var x = W * ((H(seed) + t * 0.01 * (0.4 + H(seed + 1))) % 1);
      var y = Hh * H(seed + 2);
      var w = W * (0.02 + H(seed + 3) * 0.1);
      var h = Hh * (0.01 + H(seed + 4) * 0.06);
      ctx.fillStyle = rgba(i % 2 ? pal.primary : pal.accent, 0.08 + H(seed + 5) * 0.14);
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  function formDots(ctx, W, Hh, t, pal) {
    ctx.save();
    for (var i = 0; i < 90; i++) {
      var seed = i * 2.37;
      var x = (W * H(seed) + t * (6 + H(seed + 1) * 20)) % W;
      var y = (Hh * H(seed + 2) - t * (4 + H(seed + 3) * 14) + Hh * 2) % Hh;
      var r = 0.6 + H(seed + 4) * 1.8;
      ctx.fillStyle = rgba(i % 3 ? pal.accent : pal.primary, 0.15 + H(seed + 5) * 0.4);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function formRibbons(ctx, W, Hh, t, pal) {
    ctx.save();
    ctx.lineCap = "round";
    for (var i = 0; i < 5; i++) {
      ctx.strokeStyle = rgba(i % 2 ? pal.primary : pal.accent, 0.2);
      ctx.lineWidth = Math.max(3, W * (0.004 + i * 0.002));
      ctx.beginPath();
      var y0 = Hh * (0.2 + i * 0.14);
      ctx.moveTo(-W * 0.1, y0);
      for (var x = 0; x <= W * 1.1; x += W / 40) {
        var k = x / W;
        ctx.lineTo(
          x,
          y0 + Math.sin(k * 4 + t * 0.6 + i) * Hh * 0.08 + Math.cos(k * 9 - t) * Hh * 0.02
        );
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function formBurst(ctx, W, Hh, t, pal, beat) {
    ctx.save();
    ctx.translate(W / 2, Hh * 0.45);
    var len = Math.max(W, Hh) * (0.5 + beat * 0.06);
    for (var i = 0; i < 42; i++) {
      var a = (i / 42) * TAU + t * 0.08;
      ctx.strokeStyle = rgba(i % 2 ? pal.primary : pal.accent, 0.06 + H(i) * 0.12 + beat * 0.06);
      ctx.lineWidth = Math.max(1, W * 0.0014);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * len * 0.12, Math.sin(a) * len * 0.12);
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function formArcs(ctx, W, Hh, t, pal) {
    ctx.save();
    for (var i = 0; i < 7; i++) {
      ctx.strokeStyle = rgba(i % 2 ? pal.primary : pal.accent, 0.2);
      ctx.lineWidth = Math.max(2, W * 0.003);
      ctx.beginPath();
      var r = Math.min(W, Hh) * (0.12 + i * 0.07);
      ctx.arc(W * 0.5, Hh * (0.9 - i * 0.02), r, Math.PI, TAU - t * 0.05);
      ctx.stroke();
    }
    ctx.restore();
  }

  function formMountains(ctx, W, Hh, t, pal) {
    ctx.save();
    for (var layer = 0; layer < 4; layer++) {
      ctx.fillStyle = rgba(layer % 2 ? pal.bg[1] : pal.primary, 0.22 + layer * 0.12);
      ctx.beginPath();
      ctx.moveTo(0, Hh);
      var baseY = Hh * (0.72 - layer * 0.08);
      for (var x = 0; x <= W; x += W / 48) {
        var k = x / W;
        var y =
          baseY +
          Math.sin(k * (3 + layer) + t * 0.1 + layer) * Hh * 0.05 +
          Math.sin(k * 11 + layer * 2) * Hh * 0.02;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, Hh);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function formSteps(ctx, W, Hh, t, pal) {
    ctx.save();
    var n = 7;
    for (var i = 0; i < n; i++) {
      var w = W / n;
      var h = Hh * (0.12 + i * 0.06) * (0.9 + 0.1 * Math.sin(t + i));
      ctx.fillStyle = rgba(i % 2 ? pal.primary : pal.accent, 0.14 + i * 0.02);
      ctx.fillRect(i * w, Hh - h, w * 0.92, h);
    }
    ctx.restore();
  }

  function formSmoke(ctx, W, Hh, t, pal) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < 9; i++) {
      var seed = i * 4.41;
      var x = W * (0.2 + H(seed) * 0.6) + Math.sin(t * 0.4 + i) * W * 0.05;
      var y = Hh - ((t * 40 + H(seed + 1) * Hh) % (Hh * 1.2));
      var r = Math.min(W, Hh) * (0.05 + H(seed + 2) * 0.1);
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(pal.accent, 0.16));
      g.addColorStop(1, rgba(pal.accent, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function formCracks(ctx, W, Hh, t, pal) {
    ctx.save();
    ctx.strokeStyle = rgba(pal.accent, 0.2);
    ctx.lineWidth = Math.max(1, W * 0.0012);
    for (var i = 0; i < 10; i++) {
      var seed = i * 6.7;
      var x = W * H(seed);
      var y = Hh * H(seed + 1);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (var s = 0; s < 5; s++) {
        x += (H(seed + s + 2) - 0.5) * W * 0.06;
        y += (H(seed + s + 7) - 0.5) * Hh * 0.06;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function formHalftone(ctx, W, Hh, t, pal) {
    ctx.save();
    var step = Math.max(6, W / 90);
    for (var y = 0; y < Hh; y += step) {
      for (var x = 0; x < W; x += step) {
        var d =
          Math.sqrt(Math.pow(x - W / 2, 2) + Math.pow(y - Hh * 0.45, 2)) /
          Math.max(W, Hh);
        var r = step * (0.5 - d * 0.6 + 0.2 * Math.sin(t + x * 0.01));
        if (r <= 0.2) continue;
        ctx.fillStyle = rgba(pal.primary, 0.16);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function formScan(ctx, W, Hh, t, pal) {
    ctx.save();
    for (var i = 0; i < 4; i++) {
      var y = ((t * 90 + i * Hh * 0.27) % (Hh * 1.2)) - Hh * 0.1;
      var g = ctx.createLinearGradient(0, y - 30, 0, y + 30);
      g.addColorStop(0, rgba(pal.accent, 0));
      g.addColorStop(0.5, rgba(pal.accent, 0.16));
      g.addColorStop(1, rgba(pal.accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 30, W, 60);
    }
    ctx.restore();
  }

  function formParticles(ctx, W, Hh, t, pal, mode) {
    ctx.save();
    var n = 40;
    for (var i = 0; i < n; i++) {
      var seed = i * 3.9;
      var x = W * H(seed) + Math.sin(t + i) * W * 0.03;
      var y =
        mode === "rise"
          ? Hh - ((t * 60 + H(seed) * Hh) % (Hh * 1.1))
          : (t * 50 + H(seed) * Hh) % (Hh * 1.1);
      var s = Math.min(W, Hh) * (0.004 + H(seed + 1) * 0.01);
      ctx.fillStyle = rgba(i % 2 ? pal.accent : pal.primary, 0.2 + H(seed + 2) * 0.3);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 0.3 + i);
      if (mode === "bubble") {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, TAU);
        ctx.stroke();
      } else if (mode === "petal") {
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.6, s * 0.7, 0, 0, TAU);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function formPlaid(ctx, W, Hh, t, pal) {
    ctx.save();
    ctx.strokeStyle = rgba(pal.primary, 0.14);
    ctx.lineWidth = Math.max(2, W * 0.01);
    for (var i = 0; i < 8; i++) {
      var y = (i / 8) * Hh + Math.sin(t + i) * 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    for (var j = 0; j < 10; j++) {
      var x = (j / 10) * W + Math.cos(t + j) * 4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, Hh);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- V3 新增形状语言（拉开风格差异） ---------- */

  function formVortex(ctx, W, Hh, t, pal, beat) {
    ctx.save();
    ctx.translate(W / 2, Hh * 0.46);
    ctx.globalCompositeOperation = "lighter";
    for (var arm = 0; arm < 5; arm++) {
      ctx.beginPath();
      for (var i = 0; i < 60; i++) {
        var p = i / 59;
        var ang = arm * (U.TAU / 5) + p * 4.6 + t * 0.5;
        var r = Math.min(W, Hh) * 0.06 + p * Math.min(W, Hh) * 0.42;
        var x = Math.cos(ang) * r;
        var y = Math.sin(ang) * r * 0.8;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba(pal.accent, 0.17 + arm * 0.02);
      ctx.lineWidth = Math.max(1, W * 0.0018);
      ctx.stroke();
    }
    ctx.restore();
  }

  function formBloom(ctx, W, Hh, t, pal, beat) {
    ctx.save();
    ctx.translate(W * 0.5, Hh * 0.45);
    ctx.globalAlpha = 0.5;
    for (var i = 0; i < 16; i++) {
      var a = (i / 16) * U.TAU + t * 0.12;
      var len = Math.min(W, Hh) * (0.18 + 0.08 * Math.sin(t * 0.7 + i));
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = rgba(i % 2 ? pal.primary : pal.accent, 0.1 + beat * 0.05);
      ctx.beginPath();
      ctx.ellipse(len, 0, len * 0.55, len * 0.16, 0, 0, U.TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function formColumns(ctx, W, Hh, t, pal, beat) {
    ctx.save();
    var n = 42;
    var bw = W / n;
    for (var i = 0; i < n; i++) {
      var h =
        Hh *
        (0.08 +
          0.34 * Math.abs(Math.sin(i * 0.42 + t * 1.4)) +
          0.18 * beat * Math.abs(Math.sin(i * 0.9)));
      ctx.fillStyle = rgba(i % 4 === 0 ? pal.accent : pal.primary, 0.16);
      ctx.fillRect(i * bw + bw * 0.2, Hh * 0.86 - h, bw * 0.6, h);
    }
    ctx.restore();
  }

  function formDunes(ctx, W, Hh, t, pal) {
    ctx.save();
    for (var layer = 0; layer < 3; layer++) {
      ctx.fillStyle = rgba(layer % 2 ? pal.primary : pal.accent, 0.12 + layer * 0.05);
      ctx.beginPath();
      var baseY = Hh * (0.62 + layer * 0.1);
      ctx.moveTo(0, Hh);
      for (var x = 0; x <= W; x += W / 40) {
        var k = x / W;
        var y =
          baseY +
          Math.sin(k * 4.2 + t * 0.22 + layer * 1.2) * Hh * 0.055 +
          Math.sin(k * 9.4 - t * 0.14 + layer) * Hh * 0.018;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, Hh);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function formMosaic(ctx, W, Hh, t, pal) {
    ctx.save();
    var cols = 22;
    var rows = 12;
    var cw = W / cols;
    var ch = Hh / rows;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var v = U.hash(x * 13.1 + y * 7.7 + Math.floor(t * 0.8));
        if (v < 0.55) continue;
        ctx.fillStyle = rgba(pal.primary, 0.04 + v * 0.16);
        ctx.fillRect(x * cw + 1.5, y * ch + 1.5, cw - 3, ch - 3);
      }
    }
    ctx.restore();
  }

  function formRadialBars(ctx, W, Hh, t, pal, beat) {
    ctx.save();
    ctx.translate(W * 0.5, Hh * 0.45);
    var n = 64;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * U.TAU + t * 0.1;
      var len =
        Math.min(W, Hh) *
        (0.18 +
          0.1 * Math.abs(Math.sin(i * 0.6 + t * 1.6)) +
          0.05 * beat);
      ctx.strokeStyle = rgba(i % 8 === 0 ? pal.accent : pal.primary, 0.2);
      ctx.lineWidth = Math.max(1, W * 0.0022);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * len * 0.72, Math.sin(a) * len * 0.72);
      ctx.lineTo(Math.cos(a) * (len + 0.05 * Math.min(W, Hh)), Math.sin(a) * (len + 0.05 * Math.min(W, Hh)));
      ctx.stroke();
    }
    ctx.restore();
  }

  function formStrands(ctx, W, Hh, t, pal) {
    ctx.save();
    ctx.lineCap = "round";
    for (var i = 0; i < 22; i++) {
      var seed = i * 3.3;
      ctx.strokeStyle = rgba(i % 2 ? pal.accent : pal.primary, 0.06 + U.hash(seed) * 0.14);
      ctx.lineWidth = Math.max(1, W * (0.0008 + U.hash(seed + 1) * 0.0016));
      ctx.beginPath();
      var x0 = U.hash(seed + 2) * W;
      for (var s = 0; s <= 24; s++) {
        var p = s / 24;
        var x = x0 + Math.sin(p * 5 + t * 0.4 + i) * W * 0.1;
        var y = Hh * (p * 1.1 - 0.05);
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function formStrips(ctx, W, Hh, t, pal) {
    ctx.save();
    for (var i = 0; i < 16; i++) {
      var y = Hh * U.hash(i * 5.1);
      var h = Hh * (0.006 + U.hash(i * 3.7) * 0.02);
      var off = Math.sin(t * 0.7 + i * 1.7) * W * 0.04;
      ctx.fillStyle = rgba(i % 3 === 0 ? pal.accent : pal.primary, 0.06 + U.hash(i) * 0.12);
      ctx.fillRect(off, y, W, h);
    }
    ctx.restore();
  }

  function formPrism(ctx, W, Hh, t, pal, beat) {
    ctx.save();
    for (var i = 0; i < 12; i++) {
      var seed = i * 6.1;
      var x = W * (0.1 + U.hash(seed) * 0.8);
      var y = Hh * (0.12 + U.hash(seed + 1) * 0.7);
      var s = Math.min(W, Hh) * (0.06 + U.hash(seed + 2) * 0.12);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 0.16 + U.hash(seed + 3) * U.TAU);
      var g = ctx.createLinearGradient(-s, -s, s, s);
      g.addColorStop(0, rgba(pal.accent, 0.05));
      g.addColorStop(0.5, rgba(pal.primary, 0.22 + beat * 0.05));
      g.addColorStop(1, rgba(pal.accent, 0.03));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.92, s * 0.7);
      ctx.lineTo(-s * 0.92, s * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function formHalo(ctx, W, Hh, t, pal, beat) {
    ctx.save();
    var cx = W * 0.5 + Math.sin(t * 0.3) * W * 0.05;
    var cy = Hh * 0.42;
    for (var i = 0; i < 4; i++) {
      var r = Math.min(W, Hh) * (0.16 + i * 0.1) * (1 + beat * 0.03);
      var g = ctx.createRadialGradient(cx, cy, r * 0.72, cx, cy, r);
      g.addColorStop(0, rgba(pal.primary, 0));
      g.addColorStop(0.8, rgba(pal.primary, 0.07 - i * 0.012));
      g.addColorStop(1, rgba(pal.primary, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, U.TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- Folia 灵感形状 ---------- */

  function formLightBands(ctx, W, Hh, t, pal, beat) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < 6; i++) {
      var seed = i * 4.7;
      var y = Hh * (0.15 + U.hash(seed) * 0.7) + Math.sin(t * 0.4 + i) * Hh * 0.04;
      var h = Hh * (0.04 + U.hash(seed + 1) * 0.1);
      var g = ctx.createLinearGradient(0, y, W, y + h);
      g.addColorStop(0, rgba(pal.primary, 0));
      g.addColorStop(0.35, rgba(pal.accent, 0.14 + beat * 0.04));
      g.addColorStop(0.6, rgba(pal.primary, 0.1));
      g.addColorStop(1, rgba(pal.primary, 0));
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(W / 2, y + h / 2);
      ctx.rotate(-0.18 + Math.sin(t * 0.2 + i) * 0.05);
      ctx.fillRect(-W, -h / 2, W * 2, h);
      ctx.restore();
    }
    ctx.restore();
  }

  function formChoir(ctx, W, Hh, t, pal, beat) {
    ctx.save();
    ctx.lineCap = "round";
    for (var i = 0; i < 9; i++) {
      ctx.strokeStyle = rgba(i % 2 ? pal.primary : pal.accent, 0.08 + 0.03 * (i % 3));
      ctx.lineWidth = Math.max(1, W * (0.0012 + (i % 3) * 0.0008));
      ctx.beginPath();
      for (var x = 0; x <= W; x += W / 56) {
        var k = x / W;
        var y =
          Hh * (0.34 + i * 0.035) +
          Math.sin(k * 7 + t * (1 + i * 0.05) + i * 0.6) * Hh * (0.02 + beat * 0.01);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function formReflection(ctx, W, Hh, t, pal) {
    ctx.save();
    ctx.translate(0, Hh * 0.62);
    ctx.scale(1, -1);
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < 7; i++) {
      var seed = i * 3.9;
      var x = W * (0.16 + U.hash(seed) * 0.68);
      var y = Hh * U.hash(seed + 1) * 0.28;
      var r = Math.min(W, Hh) * (0.05 + U.hash(seed + 2) * 0.12);
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(i % 2 ? pal.accent : pal.primary, 0.16));
      g.addColorStop(1, rgba(pal.primary, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, U.TAU);
      ctx.fill();
    }
    ctx.restore();

    /* 水平镜面线 */
    ctx.save();
    ctx.strokeStyle = rgba(pal.accent, 0.2);
    ctx.lineWidth = Math.max(1, W * 0.0012);
    ctx.beginPath();
    ctx.moveTo(0, Hh * 0.62);
    ctx.lineTo(W, Hh * 0.62);
    ctx.stroke();
    ctx.restore();
  }

  function formPendulum(ctx, W, Hh, t, pal, beat) {
    var cx = W * 0.5;
    var cy = Hh * 0.2;
    var len = Math.min(W, Hh) * 0.28;
    ctx.save();
    ctx.strokeStyle = rgba(pal.accent, 0.28);
    ctx.lineWidth = Math.max(1, W * 0.0016);
    ctx.beginPath();
    ctx.arc(cx, cy, len, Math.PI * 0.25, Math.PI * 0.75);
    ctx.stroke();

    var ang = Math.sin(t * 1.1) * 0.7;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(ang) * len, cy + Math.cos(ang) * len);
    ctx.stroke();

    ctx.fillStyle = rgba(pal.accent, 0.5);
    ctx.beginPath();
    ctx.arc(cx + Math.sin(ang) * len, cy + Math.cos(ang) * len, Math.max(3, W * 0.008) * (1 + beat * 0.1), 0, U.TAU);
    ctx.fill();
    ctx.restore();
  }

  var FORMS = {
    lightBands: function (c, W, H, t, p, b) { formLightBands(c, W, H, t, p, b); },
    choir: function (c, W, H, t, p, b) { formChoir(c, W, H, t, p, b); },
    reflection: function (c, W, H, t, p) { formReflection(c, W, H, t, p); },
    pendulum: function (c, W, H, t, p, b) { formPendulum(c, W, H, t, p, b); },
    vortex: function (c, W, H, t, p, b) { formVortex(c, W, H, t, p, b); },
    bloom: function (c, W, H, t, p, b) { formBloom(c, W, H, t, p, b); },
    columns: function (c, W, H, t, p, b) { formColumns(c, W, H, t, p, b); },
    dunes: function (c, W, H, t, p) { formDunes(c, W, H, t, p); },
    mosaic: function (c, W, H, t, p) { formMosaic(c, W, H, t, p); },
    radialBars: function (c, W, H, t, p, b) { formRadialBars(c, W, H, t, p, b); },
    strands: function (c, W, H, t, p) { formStrands(c, W, H, t, p); },
    strips: function (c, W, H, t, p) { formStrips(c, W, H, t, p); },
    prism: function (c, W, H, t, p, b) { formPrism(c, W, H, t, p, b); },
    halo: function (c, W, H, t, p, b) { formHalo(c, W, H, t, p, b); },
    orbs: formOrbs,
    lines: function (c, W, H, t, p, b) { formLines(c, W, H, t, p, b); },
    rings: function (c, W, H, t, p, b) { formRings(c, W, H, t, p, b); },
    grid: function (c, W, H, t, p) { formGrid(c, W, H, t, p); },
    shards: function (c, W, H, t, p, b) { formShards(c, W, H, t, p, b); },
    waves: function (c, W, H, t, p, b) { formWaves(c, W, H, t, p, b); },
    blocks: function (c, W, H, t, p) { formBlocks(c, W, H, t, p); },
    dots: function (c, W, H, t, p) { formDots(c, W, H, t, p); },
    ribbons: function (c, W, H, t, p) { formRibbons(c, W, H, t, p); },
    burst: function (c, W, H, t, p, b) { formBurst(c, W, H, t, p, b); },
    arcs: function (c, W, H, t, p) { formArcs(c, W, H, t, p); },
    mountains: function (c, W, H, t, p) { formMountains(c, W, H, t, p); },
    steps: function (c, W, H, t, p) { formSteps(c, W, H, t, p); },
    smoke: function (c, W, H, t, p) { formSmoke(c, W, H, t, p); },
    cracks: function (c, W, H, t, p) { formCracks(c, W, H, t, p); },
    halftone: function (c, W, H, t, p) { formHalftone(c, W, H, t, p); },
    scan: function (c, W, H, t, p) { formScan(c, W, H, t, p); },
    snow: function (c, W, H, t, p) { formParticles(c, W, H, t, p, "fall"); },
    petals: function (c, W, H, t, p) { formParticles(c, W, H, t, p, "petal"); },
    bubbles: function (c, W, H, t, p) { formParticles(c, W, H, t, p, "bubble"); },
    plaid: function (c, W, H, t, p) { formPlaid(c, W, H, t, p); },
    none: function () {}
  };

  /* ---------- 纹理 ---------- */

  function texture(ctx, W, Hh, kind, pal) {
    if (kind === "none") return;
    ctx.save();
    if (kind === "grain") {
      for (var i = 0; i < 2200; i++) {
        var x = H(i * 1.7) * W;
        var y = H(i * 2.9 + 0.3) * Hh;
        ctx.fillStyle = rgba("#ffffff", 0.02 + H(i * 3.3) * 0.05);
        ctx.fillRect(x, y, 1.4, 1.4);
      }
    } else if (kind === "scanlines") {
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      for (var y = 0; y < Hh; y += 4) ctx.fillRect(0, y, W, 1.4);
    } else if (kind === "dots") {
      ctx.fillStyle = rgba(pal.light, 0.05);
      var step = Math.max(10, W / 110);
      for (var yy = 0; yy < Hh; yy += step) {
        for (var xx = 0; xx < W; xx += step) {
          ctx.fillRect(xx, yy, 1.6, 1.6);
        }
      }
    } else if (kind === "halftone") {
      var s2 = Math.max(7, W / 100);
      for (var y2 = 0; y2 < Hh; y2 += s2) {
        for (var x2 = 0; x2 < W; x2 += s2) {
          var r = s2 * 0.22 * H(x2 * 0.01 + y2 * 0.013);
          ctx.fillStyle = "rgba(0,0,0,0.18)";
          ctx.beginPath();
          ctx.arc(x2, y2, r, 0, TAU);
          ctx.fill();
        }
      }
    } else if (kind === "noise") {
      for (var n = 0; n < 90; n++) {
        ctx.fillStyle = rgba(pal.accent, 0.03 + H(n * 5.1) * 0.06);
        ctx.fillRect(H(n * 7.7) * W, H(n * 9.1) * Hh, W * 0.02, Hh * 0.004);
      }
    }
    ctx.restore();
  }

  /* ---------- 叠层 ---------- */

  function overlay(ctx, W, Hh, kind, pal, def) {
    if (kind === "none") return;
    ctx.save();
    if (kind === "vignette") {
      var g = ctx.createRadialGradient(
        W / 2, Hh * 0.45, Math.min(W, Hh) * 0.25,
        W / 2, Hh * 0.5, Math.max(W, Hh) * 0.72
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.78)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, Hh);
    } else if (kind === "frame") {
      var pad = Math.round(W * 0.03);
      ctx.strokeStyle = rgba(def.dark ? pal.light : "#1a1a1a", 0.28);
      ctx.lineWidth = Math.max(1, W * 0.0016);
      ctx.strokeRect(pad, pad, W - pad * 2, Hh - pad * 2);
    } else if (kind === "corners") {
      var p2 = Math.round(W * 0.035);
      var len = Math.round(W * 0.04);
      ctx.strokeStyle = rgba(pal.accent, 0.5);
      ctx.lineWidth = Math.max(1.5, W * 0.002);
      ctx.beginPath();
      ctx.moveTo(p2, p2 + len); ctx.lineTo(p2, p2); ctx.lineTo(p2 + len, p2);
      ctx.moveTo(W - p2 - len, p2); ctx.lineTo(W - p2, p2); ctx.lineTo(W - p2, p2 + len);
      ctx.moveTo(p2, Hh - p2 - len); ctx.lineTo(p2, Hh - p2); ctx.lineTo(p2 + len, Hh - p2);
      ctx.moveTo(W - p2 - len, Hh - p2); ctx.lineTo(W - p2, Hh - p2); ctx.lineTo(W - p2, Hh - p2 - len);
      ctx.stroke();
    } else if (kind === "bars") {
      var bar = Math.round(Hh * 0.055);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, Hh - bar, W, bar);
    }
    ctx.restore();
  }

  /* ---------- 歌词 ---------- */

  function drawStyledLyric(ctx, W, Hh, api, def, pal) {
  if (window.CodeMV && window.CodeMV.__barMode) return;
    var line = api.line(api.t);
    if (!line || line.alpha <= 0.002) return;

    var LS = NS.lyricStyle;
    var ls = LS ? LS.load() : null;
    if (ls && ls.visible === false) return;

    var m = LS ? LS.metrics(W, Hh) : null;
    var size = m ? m.size : Math.round(W * 0.046);
    var maxW = W * (m ? m.s.maxWidth : 0.8);
    var pad = (W - maxW) / 2;
    var weight = m ? m.s.weight : 600;
    var family = m
      ? m.fontFamily
      : '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    var align = m ? m.s.align : "center";
    var tracking = m ? m.tracking : "0.06em";
    var y = m ? m.y : Hh * 0.72;
    var opacity = m ? m.opacity : 1;
    var glow = m ? m.glow : 0.5;
    var outline = m ? m.outline : 0;
    var anim = m ? m.anim : "highlight";

    var text = line.text || "";
    if (anim === "typewriter") {
      var n = Math.max(1, Math.floor(text.length * line.typeProgress));
      text = text.slice(0, n);
    }

    ctx.save();
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.font = weight + " " + size + "px " + family;
    try {
      ctx.letterSpacing = tracking;
    } catch (e) {}

    var measured = ctx.measureText(text).width;
    if (measured > maxW) {
      size = Math.max(10, Math.round(size * (maxW / measured)));
      ctx.font = weight + " " + size + "px " + family;
    }

    var rise =
      anim === "slide"
        ? (1 - U.easeOut(clamp(line.age / 0.6, 0, 1))) * size * 0.3
        : 0;
    var alpha = (anim === "none" ? 1 : line.alpha) * opacity;
    var color = def.dark ? "#ffffff" : "#1a1a1a";
    var x = align === "center" ? W / 2 : align === "right" ? W - pad : pad;

    if (def.lyric === "block") {
      var w = ctx.measureText(text).width;
      var bx = align === "center" ? W / 2 - w / 2 : align === "right" ? W - pad - w : pad;
      ctx.fillStyle = def.dark
        ? rgba(pal.primary, 0.85 * alpha)
        : "rgba(20,20,20,0.85)";
      ctx.fillRect(bx - size * 0.35, y - size * 0.72 + rise, w + size * 0.7, size * 1.44);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, x, y + rise);
    } else if (def.lyric === "outline" || outline > 0.004) {
      ctx.strokeStyle = rgba(pal.light, 0.85 * alpha);
      ctx.lineWidth = Math.max(1.4, size * Math.max(0.04, outline));
      ctx.strokeText(text, x, y + rise);
      if (def.lyric === "outline" && outline <= 0.004) {
        ctx.restore();
        return;
      }
    }

    if (def.lyric === "chrome") {
      var grad = ctx.createLinearGradient(0, y - size, 0, y + size);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.45, rgba(pal.accent, 0.95 * alpha));
      grad.addColorStop(0.55, rgba(pal.primary, 0.9 * alpha));
      grad.addColorStop(1, "#ffffff");
      ctx.fillStyle = grad;
      ctx.shadowColor = rgba(pal.primary, glow * alpha);
      ctx.shadowBlur = size * (0.2 + glow * 0.6);
      ctx.fillText(text, x, y + rise);
    } else if (def.lyric === "mono") {
      ctx.fillStyle = rgba(color, alpha);
      ctx.font = weight + " " + size + "px ui-monospace, Menlo, monospace";
      ctx.fillText(text, x, y + rise);
    } else if (def.lyric === "spaced") {
      ctx.fillStyle = rgba(color, 0.9 * alpha);
      ctx.fillText(text, x, y + rise);
    } else if (def.lyric === "glow") {
      ctx.shadowColor = rgba(pal.primary, glow * alpha);
      ctx.shadowBlur = size * (0.2 + glow * 0.6);
      ctx.fillStyle = rgba(color, alpha);
      ctx.fillText(text, x, y + rise);
    } else {
      ctx.fillStyle = rgba(color, alpha);
      ctx.fillText(text, x, y + rise);
    }

    ctx.restore();
  }

  /* ---------- 主入口 ---------- */

  function draw(ctx, W, Hh, api, def) {
    var pal = NS.styleLibrary.palette(def.id);
    var t = api.t;
    var beat = NS.live ? NS.live.beat(t, api) : 0;
    var e = 0;
    try {
      e = api.energy ? api.energy(t) : 0;
    } catch (err) {
      e = 0;
    }

    /* 背景 */
    var g = ctx.createLinearGradient(0, 0, W * 0.35, Hh);
    g.addColorStop(0, pal.bg[0]);
    g.addColorStop(1, pal.bg[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, Hh);

    /* 主色氛围光 */
    var glow = ctx.createRadialGradient(
      W * 0.5, Hh * 0.42, 0,
      W * 0.5, Hh * 0.42, Math.max(W, Hh) * 0.75
    );
    glow.addColorStop(0, rgba(pal.primary, 0.1 + e * 0.08 + beat * 0.04));
    glow.addColorStop(0.55, rgba(pal.primary, 0.03));
    glow.addColorStop(1, rgba(pal.primary, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, Hh);

    var clock = motionClock(t, def.motion);

    var fa = def.forms && def.forms[0];
    var fb = def.forms && def.forms[1];
    if (FORMS[fa]) FORMS[fa](ctx, W, Hh, clock, pal, beat);
    if (FORMS[fb]) FORMS[fb](ctx, W, Hh, clock * 1.3, pal, beat);

    texture(ctx, W, Hh, def.texture, pal);

    drawStyledLyric(ctx, W, Hh, api, def, pal);

    if (NS.scenes && NS.scenes.helpers && def.dark) {
      NS.scenes.helpers.drawIntroTitle(ctx, W, Hh, api, {});
    }

    overlay(ctx, W, Hh, def.overlay, pal, def);

    /* 拍点微闪 */
    if (NS.live) NS.live.flash(ctx, W, Hh, t, api, null, 0.02);
  }

  NS.styleRender = {
    draw: draw,
    FORMS: FORMS
  };
})(window.CodeMV);
