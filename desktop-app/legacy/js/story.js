/* ==========================================================================
   CodeMV · 歌词情景引擎（内容层）
   --------------------------------------------------------------------------
   这是补上的关键一层：把「歌词内容」翻译成「具体画面元素」。

   之前的 7 种风格只是「滤镜 + 排版」，不管歌词在唱什么；
   这里改成「歌词意象 → 情景图层」：

     夜色落在窗前        → 夜空 + 月亮 + 窗框剪影 + 光束
     灯火把影子拉长      → 城市楼群灯火 + 拉长的人影
     我听见城市的呼吸    → 城市天际线 + 呼吸般的明灭
     像潮水涌向月亮      → 海面波浪 + 月光倒影
     如果风也会记得      → 流动风线
     请把我的名字带走    → 歌词文字逐字飘散

   所有绘制都是 t 的纯函数，可实时播放，也可逐帧导出。
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var TAU = Math.PI * 2;

  /* ---------- 基础工具 ---------- */

  function hash(n) {
    var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453123;
    return x - Math.floor(x);
  }

  function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rgba(c, a) {
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }

  function rgbOf(hex) {
    if (Array.isArray(hex)) return hex;
    var h = String(hex || "#ffffff").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mixColor(a, b, t) {
    var A = rgbOf(a);
    var B = rgbOf(b);
    return [
      Math.round(lerp(A[0], B[0], t)),
      Math.round(lerp(A[1], B[1], t)),
      Math.round(lerp(A[2], B[2], t))
    ];
  }

  /* ---------- 意象词表 ---------- */

  var MOTIFS = [
    { id: "moon", words: ["月", "夜", "星", "空"] },
    { id: "window", words: ["窗", "门", "房", "屋", "阳台"] },
    { id: "city", words: ["城市", "街", "楼", "霓虹", "人海", "路口", "灯"] },
    { id: "sea", words: ["海", "潮", "浪", "水", "河", "湖", "涌"] },
    { id: "rain", words: ["雨", "泪", "湿", "伞", "淋"] },
    { id: "wind", words: ["风", "吹", "飘", "散"] },
    { id: "letters", words: ["名字", "信", "字", "话", "记得", "忘"] },
    { id: "fire", words: ["火", "燃", "焰", "炽", "烧"] },
    { id: "flower", words: ["花", "春", "叶", "绽放", "盛开"] },
    { id: "snow", words: ["雪", "冬", "冷", "冰"] },
    { id: "road", words: ["路", "跑", "远行", "离开", "旅程", "车站"] },
    { id: "clock", words: ["时", "钟", "秒", "年", "昨天", "从前"] },
    { id: "shadow", words: ["影", "黑", "背"] },
    { id: "light", words: ["光", "亮", "阳", "暖"] }
  ];

  var MOTIF_IDS = MOTIFS.map(function (m) {
    return m.id;
  });

  /** 从一段歌词里识别意象（可被 AI 分镜覆盖） */
  function detect(text) {
    var hits = [];
    if (!text) return hits;

    MOTIFS.forEach(function (group) {
      for (var i = 0; i < group.words.length; i++) {
        if (text.indexOf(group.words[i]) >= 0) {
          if (hits.indexOf(group.id) < 0) hits.push(group.id);
          break;
        }
      }
    });

    return hits;
  }

  /* ---------- 意象配色 ---------- */

  var MOTIF_PALETTE = {
    moon: ["#040818", "#7c9cff", "#e8efff"],
    window: ["#070a16", "#8fb8ff", "#eef4ff"],
    city: ["#0a0a12", "#ffb347", "#7dd3fc"],
    sea: ["#03121c", "#2dd4bf", "#9be7ff"],
    rain: ["#080c14", "#7dd3fc", "#b6c7d8"],
    wind: ["#06101a", "#a5f3fc", "#e0f2fe"],
    letters: ["#0a0a14", "#ffd166", "#fff3c4"],
    fire: ["#120404", "#ff7a18", "#ffd166"],
    flower: ["#140a12", "#ff9ecb", "#ffd6e8"],
    snow: ["#0b0f18", "#dbeafe", "#ffffff"],
    road: ["#0a0a12", "#ffb347", "#6ee7ff"],
    clock: ["#0b0b12", "#c9b48a", "#f5e9c9"],
    shadow: ["#08080c", "#8a93b0", "#dfe6ff"],
    light: ["#0a0a12", "#ffd166", "#fff3c4"]
  };

  function paletteFor(motifs, scriptPalette) {
    var base = rgbOf((scriptPalette && scriptPalette[0]) || "#04060e");

    var primary = rgbOf("#6ee7ff");
    var accent = rgbOf("#a78bfa");
    var used = 0;

    (motifs || []).forEach(function (id) {
      var p = MOTIF_PALETTE[id];
      if (!p) return;
      var a = rgbOf(p[1]);
      var b = rgbOf(p[2]);
      primary = used === 0 ? a : mixColor(primary, a, 0.45);
      accent = used === 0 ? b : mixColor(accent, b, 0.35);
      used += 1;
    });

    return {
      deep: mixColor(base, [0, 0, 0], 0.35),
      primary: primary,
      accent: accent,
      light: mixColor(accent, [255, 255, 255], 0.55)
    };
  }

  /* ---------- 情景构建 ---------- */

  function build(lines, duration, script) {
    var scenes = [];
    var list = lines || [];

    if (!list.length) {
      return [
        {
          start: 0,
          end: duration || 1,
          text: "",
          motifs: ["light"],
          palette: paletteFor(["light"], script && script.palette)
        }
      ];
    }

    for (var i = 0; i < list.length; i++) {
      var line = list[i];
      var next = list[i + 1];
      var start = line.time;
      var end = next ? Math.min(next.time, duration) : duration;

      /* 优先用「这一句自己」识别出的意象，分镜只作为兜底 */
      var section = script ? NS.script.sectionAt(script, start) : null;
      var lineMotifs = detect(line.text);
      var sectionMotifs = section && section.motifs ? section.motifs : [];

      var motifs = lineMotifs.length ? lineMotifs : sectionMotifs.slice();

      /* 最多 3 个意象，避免画面堆得太乱 */
      motifs = motifs.slice(0, 3);
      if (!motifs.length) motifs = ["light"];

      scenes.push({
        start: start,
        end: end,
        text: line.text,
        motifs: motifs,
        palette: paletteFor(motifs, script && script.palette)
      });
    }

    /* 补开头 */
    if (scenes.length && scenes[0].start > 0.4) {
      scenes.unshift({
        start: 0,
        end: scenes[0].start,
        text: "",
        motifs: scenes[0].motifs,
        palette: scenes[0].palette
      });
    }

    return scenes;
  }

  function sceneIndexAt(scenes, t) {
    var found = 0;
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].start <= t) found = i;
      else break;
    }
    return found;
  }

  /* ======================================================================
     各意象的绘制
     ====================================================================== */

  function drawSky(ctx, W, H, t, pal, hasStars) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(mixColor(pal.deep, [0, 0, 0], 0.25), 1));
    g.addColorStop(0.55, rgba(pal.deep, 1));
    g.addColorStop(1, "rgba(2,3,8,1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (hasStars) {
      for (var i = 0; i < 90; i++) {
        var x = hash(i * 3.1) * W;
        var y = hash(i * 7.7) * H * 0.55;
        var tw = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.4 + hash(i) * 1.6) + i));
        ctx.fillStyle = rgba(pal.light, 0.15 + 0.55 * tw);
        ctx.fillRect(x, y, 1.6, 1.6);
      }
    }
  }

  function drawCity(ctx, W, H, t, pal, energy) {
    var baseY = H * 0.8;
    var n = 24;

    for (var i = 0; i < n; i++) {
      var bw = (W / n) * (0.72 + hash(i * 3.1) * 0.5);
      var bx = (i / n) * W;
      var bh = H * (0.07 + hash(i * 7.3) * 0.3) * (1 + 0.04 * energy);

      ctx.fillStyle = "rgba(3,5,11,0.94)";
      ctx.fillRect(bx, baseY - bh, bw, bh + H * 0.25);

      for (var wy = 0; wy < 4; wy++) {
        for (var wx = 0; wx < 3; wx++) {
          if (hash(i * 11.7 + wy * 3.1 + wx * 1.7) < 0.45) continue;
          var flick =
            0.5 + 0.5 * Math.sin(t * (0.4 + hash(i + wx) * 1.3) + i * 0.7 + wx);
          ctx.fillStyle = rgba(pal.primary, 0.12 + 0.4 * flick);
          ctx.fillRect(
            bx + bw * (0.18 + wx * 0.26),
            baseY - bh + bh * (0.1 + wy * 0.21),
            Math.max(2, bw * 0.12),
            Math.max(2, bh * 0.055)
          );
        }
      }
    }

    /* 城市光雾 */
    var haze = ctx.createLinearGradient(0, baseY - H * 0.22, 0, baseY + H * 0.05);
    haze.addColorStop(0, rgba(pal.primary, 0));
    haze.addColorStop(1, rgba(pal.primary, 0.18));
    ctx.fillStyle = haze;
    ctx.fillRect(0, baseY - H * 0.22, W, H * 0.27);
  }

  function drawSea(ctx, W, H, t, pal, energy) {
    var baseY = H * 0.6;

    var g = ctx.createLinearGradient(0, baseY, 0, H);
    g.addColorStop(0, rgba(pal.primary, 0.18));
    g.addColorStop(1, "rgba(2,6,14,0.98)");
    ctx.fillStyle = g;
    ctx.fillRect(0, baseY, W, H - baseY);

    for (var layer = 0; layer < 5; layer++) {
      ctx.beginPath();
      var amp = H * (0.012 + layer * 0.009) * (1 + 0.35 * energy);
      var yBase = baseY + layer * H * 0.07;

      for (var x = 0; x <= W; x += 10) {
        var y =
          yBase +
          Math.sin(x * 0.004 * (1 + layer * 0.3) + t * (0.5 + layer * 0.18) + layer * 1.7) * amp +
          Math.sin(x * 0.011 - t * 0.7 + layer) * amp * 0.4;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.strokeStyle = rgba(pal.accent, 0.1 + layer * 0.035);
      ctx.lineWidth = 1.4 + layer * 0.8;
      ctx.stroke();
    }
  }

  /** 月光在水面拉出一条倒影 */
  function drawMoonReflection(ctx, W, H, t, pal) {
    var cx = W * 0.72;
    var top = H * 0.62;
    var h = H * 0.36;

    for (var i = 0; i < 26; i++) {
      var p = i / 26;
      var y = top + p * h;
      var w = (10 + p * 60) * (0.6 + 0.4 * Math.abs(Math.sin(t * 1.2 + i)));
      var a = 0.16 * (1 - p) * (0.6 + 0.4 * Math.sin(t * 2 + i * 0.7));
      ctx.fillStyle = rgba(pal.light, a);
      ctx.fillRect(cx - w / 2, y, w, 1.6);
    }
  }

  function drawMoon(ctx, W, H, t, pal) {
    var cx = W * 0.72;
    var cy = H * 0.2 + Math.sin(t * 0.15) * H * 0.008;
    var r = H * 0.062;

    var glow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 5);
    glow.addColorStop(0, rgba(pal.light, 0.55));
    glow.addColorStop(0.35, rgba(pal.accent, 0.16));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 5, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "rgba(246,248,255,0.97)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();

    /* 环形山（低对比，避免像脸） */
    for (var i = 0; i < 4; i++) {
      var a = hash(i * 4.3) * TAU;
      var d = r * (0.35 + hash(i * 8.1) * 0.45);
      var cr = r * (0.07 + hash(i * 2.9) * 0.09);
      ctx.fillStyle = "rgba(214,222,242,0.34)";
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, cr, 0, TAU);
      ctx.fill();
    }
  }

  /** 窗框剪影 + 透进来的光 */
  function drawWindow(ctx, W, H, t, pal) {
    var wx = W * 0.06;
    var wy = H * 0.1;
    var ww = W * 0.42;
    var wh = H * 0.66;

    /* 窗内透光 */
    var g = ctx.createLinearGradient(wx, wy, wx, wy + wh);
    g.addColorStop(0, rgba(pal.accent, 0.3));
    g.addColorStop(0.6, rgba(pal.primary, 0.08));
    g.addColorStop(1, rgba(pal.primary, 0));
    ctx.fillStyle = g;
    ctx.fillRect(wx, wy, ww, wh);

    /* 光束 */
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < 3; i++) {
      var bx = wx + ww * (0.2 + i * 0.3);
      var beam = ctx.createLinearGradient(bx, wy, bx + W * 0.12, H);
      beam.addColorStop(0, rgba(pal.accent, 0.12));
      beam.addColorStop(1, rgba(pal.accent, 0));
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(bx, wy + wh * 0.2);
      ctx.lineTo(bx + ww * 0.16, wy + wh * 0.2);
      ctx.lineTo(bx + ww * 0.16 + W * 0.16, H);
      ctx.lineTo(bx + W * 0.1, H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    /* 窗框 */
    var lw = Math.max(7, W * 0.009);
    ctx.strokeStyle = "rgba(5,7,13,0.96)";
    ctx.lineWidth = lw;
    ctx.strokeRect(wx, wy, ww, wh);

    ctx.beginPath();
    ctx.moveTo(wx + ww / 2, wy);
    ctx.lineTo(wx + ww / 2, wy + wh);
    ctx.moveTo(wx, wy + wh * 0.42);
    ctx.lineTo(wx + ww, wy + wh * 0.42);
    ctx.lineWidth = lw * 0.7;
    ctx.stroke();

    /* 窗帘 */
    ctx.fillStyle = "rgba(6,8,15,0.9)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W * 0.09, 0);
    ctx.quadraticCurveTo(W * 0.05, H * 0.5, W * 0.1, H * 0.82);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawRain(ctx, W, H, t, pal, intensity) {
    var count = Math.round(120 * (0.6 + intensity * 0.8));
    ctx.strokeStyle = rgba(pal.accent, 0.3);
    ctx.lineWidth = 1.1;

    for (var i = 0; i < count; i++) {
      var speed = 900 + hash(i * 3.3) * 700;
      var x = (hash(i * 7.1) * W + t * speed * 0.25) % (W + 200) - 100;
      var y = (hash(i * 5.9) * H + t * speed) % (H + 200) - 100;
      var len = 14 + hash(i * 2.7) * 26;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * 0.22, y + len);
      ctx.stroke();
    }
  }

  function drawWind(ctx, W, H, t, pal) {
    for (var k = 0; k < 7; k++) {
      var baseY = H * (0.15 + 0.75 * hash(k * 3.7));
      var speed = 0.5 + hash(k * 2.3) * 0.5;

      ctx.beginPath();
      for (var x = -40; x <= W + 40; x += 16) {
        var y =
          baseY +
          Math.sin(x * 0.0032 + t * speed + k) * H * 0.04 +
          Math.sin(x * 0.0011 - t * speed * 0.6) * H * 0.03;
        if (x === -40) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba(pal.accent, 0.14 + 0.1 * hash(k));
      ctx.lineWidth = 1 + hash(k * 5.1) * 1.6;
      ctx.stroke();
    }
  }

  /** 歌词文字从画面中间升起、旋转、飘散 */
  function drawLetters(ctx, W, H, t, pal, text) {
    if (!text) return;

    var chars = text.split("");
    var size = W * 0.028;
    var lineY = H * 0.64;

    ctx.save();
    ctx.font =
      "500 " + Math.round(size) + 'px "Songti SC","STSong","SimSun",serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      if (ch === " " || ch === "\u3000") continue;

      var p = (t * 0.16 + hash(i * 3.1) * 0.9) % 1;
      var startX = W * (0.5 + (i - chars.length / 2) * 0.045);
      var x = startX + Math.sin(t * 0.5 + i * 1.7) * W * 0.02 * (1 + p * 3);
      var y = lineY - p * H * 0.44 + Math.sin(t * 0.7 + i) * H * 0.01;
      var alpha = (1 - p) * 0.75 * clamp((t - 1) * 0.5, 0, 1);
      var rot = (hash(i * 7.3) - 0.5) * 0.5 + p * 0.5;
      var sc = 1 - p * 0.35;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(sc, sc);
      ctx.fillStyle = rgba(pal.light, alpha);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawFire(ctx, W, H, t, pal, energy) {
    var cx = W * 0.5;
    var baseY = H * 0.86;

    var glow = ctx.createRadialGradient(cx, baseY - H * 0.1, 0, cx, baseY - H * 0.1, H * 0.5);
    glow.addColorStop(0, rgba(pal.primary, 0.32));
    glow.addColorStop(0.5, rgba(pal.primary, 0.1));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    for (var i = 0; i < 30; i++) {
      var p = (hash(i * 7.7) + t * 0.35) % 1;
      var x = cx + (hash(i * 3.3) - 0.5) * W * 0.35 * (1 - p * 0.5);
      var y = baseY - p * H * 0.5;
      var r = (1 - p) * 16 * (0.6 + 0.4 * energy);
      ctx.fillStyle = rgba(i % 2 ? pal.primary : pal.accent, (1 - p) * 0.7);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.5, r), 0, TAU);
      ctx.fill();
    }
  }

  function drawFlower(ctx, W, H, t, pal) {
    for (var i = 0; i < 40; i++) {
      var p = (hash(i * 2.9) + t * 0.06) % 1;
      var x = hash(i * 5.7) * W + Math.sin(t * 0.5 + i) * W * 0.02;
      var y = p * (H + 80) - 40;
      var r = 2 + hash(i * 8.3) * 3.5;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 0.4 + i);
      ctx.fillStyle = rgba(pal.primary, 0.35);
      for (var k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.ellipse(0, -r * 1.4, r * 0.55, r * 1.2, (k / 5) * TAU, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawSnow(ctx, W, H, t, pal) {
    for (var i = 0; i < 110; i++) {
      var x = (hash(i * 3.7) * W + Math.sin(t * 0.4 + i) * 26 + W) % W;
      var y = (hash(i * 6.1) * H + t * (18 + hash(i) * 40)) % (H + 20) - 10;
      var r = 0.8 + hash(i * 9.3) * 2;
      ctx.fillStyle = rgba(pal.light, 0.25 + 0.4 * hash(i * 4.1));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  function drawShadow(ctx, W, H, t, pal) {
    var cx = W * 0.58;
    var baseY = H * 0.9;
    var sway = Math.sin(t * 0.6) * H * 0.005;
    var h = H * 0.3;

    /* 被灯光拉长的影子 */
    var shadow = ctx.createLinearGradient(cx, baseY, cx - W * 0.5, baseY + H * 0.04);
    shadow.addColorStop(0, "rgba(0,0,0,0.55)");
    shadow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.02, baseY + sway);
    ctx.lineTo(cx - W * 0.52, baseY + H * 0.02);
    ctx.lineTo(cx - W * 0.42, baseY + H * 0.055);
    ctx.lineTo(cx + W * 0.03, baseY + H * 0.01);
    ctx.closePath();
    ctx.fill();

    /* 人形剪影 */
    ctx.fillStyle = "rgba(1,2,5,0.9)";
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.02, baseY + sway);
    ctx.quadraticCurveTo(cx - W * 0.035, baseY - h * 0.5, cx - W * 0.022, baseY - h * 0.72);
    ctx.quadraticCurveTo(cx, baseY - h * 0.86, cx + W * 0.022, baseY - h * 0.72);
    ctx.quadraticCurveTo(cx + W * 0.035, baseY - h * 0.5, cx + W * 0.02, baseY + sway);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, baseY - h * 0.84 + sway, W * 0.016, 0, TAU);
    ctx.fill();
  }

  function drawRoad(ctx, W, H, t, pal) {
    var horizon = H * 0.55;
    var cx = W * 0.5;

    var g = ctx.createLinearGradient(0, horizon, 0, H);
    g.addColorStop(0, rgba(pal.primary, 0));
    g.addColorStop(1, rgba(pal.primary, 0.16));
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon, W, H - horizon);

    ctx.strokeStyle = rgba(pal.accent, 0.25);
    ctx.lineWidth = 1.4;
    for (var i = -6; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * W * 0.012, horizon);
      ctx.lineTo(cx + i * W * 0.09, H);
      ctx.stroke();
    }

    /* 中心虚线 */
    for (var d = 0; d < 9; d++) {
      var p = ((d / 9) + (t * 0.35) % (1 / 9)) % 1;
      var y = horizon + p * (H - horizon);
      var w = 2 + p * 8;
      ctx.fillStyle = rgba(pal.light, 0.35);
      ctx.fillRect(cx - w / 2, y, w, 6 + p * 14);
    }
  }

  function drawClock(ctx, W, H, t, pal) {
    var cx = W * 0.5;
    var cy = H * 0.42;
    var r = Math.min(W, H) * 0.16;

    ctx.strokeStyle = rgba(pal.accent, 0.45);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();

    for (var i = 0; i < 12; i++) {
      var a = (i / 12) * TAU;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
      ctx.lineTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78);
      ctx.stroke();
    }

    var minuteA = (t / 60) * TAU - Math.PI / 2;
    var secondA = (t % 60 / 60) * TAU - Math.PI / 2;

    ctx.strokeStyle = rgba(pal.light, 0.75);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(minuteA) * r * 0.62, cy + Math.sin(minuteA) * r * 0.62);
    ctx.stroke();

    ctx.strokeStyle = rgba(pal.primary, 0.85);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(secondA) * r * 0.82, cy + Math.sin(secondA) * r * 0.82);
    ctx.stroke();
  }

  function drawFireflies(ctx, W, H, t, pal, energy) {
    for (var i = 0; i < 46; i++) {
      var x = hash(i * 3.3) * W + Math.sin(t * (0.3 + hash(i) * 0.4) + i) * W * 0.05;
      var y = hash(i * 6.7) * H + Math.cos(t * (0.25 + hash(i) * 0.35) + i) * H * 0.05;
      var pulse = 0.5 + 0.5 * Math.sin(t * (1.2 + hash(i) * 1.5) + i * 2);
      var r = 1 + hash(i * 8.1) * 2 + energy * 1.4;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
      g.addColorStop(0, rgba(pal.light, 0.55 * pulse));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 6, 0, TAU);
      ctx.fill();
    }
  }

  function drawVignette(ctx, W, H) {
    var vg = ctx.createRadialGradient(
      W / 2, H / 2, H * 0.3,
      W / 2, H / 2, H * 1.05
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.68)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  /* ======================================================================
     单场景绘制
     ====================================================================== */

  function drawScene(ctx, W, H, scene, t, api) {
    var pal = scene.palette;
    var motifs = scene.motifs || [];
    var energy = api.energy(t);
    var has = function (id) {
      return motifs.indexOf(id) >= 0;
    };

    /* 背景 */
    drawSky(ctx, W, H, t, pal, has("moon") || has("light") || has("shadow"));

    /* 远层 */
    if (has("city")) drawCity(ctx, W, H, t, pal, energy);
    if (has("road")) drawRoad(ctx, W, H, t, pal);

    /* 中层 */
    if (has("sea")) {
      drawSea(ctx, W, H, t, pal, energy);
      if (has("moon")) drawMoonReflection(ctx, W, H, t, pal);
    }
    if (has("clock")) drawClock(ctx, W, H, t, pal);
    if (has("fire")) drawFire(ctx, W, H, t, pal, energy);

    /* 光 */
    if (has("moon")) drawMoon(ctx, W, H, t, pal);

    /* 近层 */
    if (has("window")) drawWindow(ctx, W, H, t, pal);
    if (has("shadow")) drawShadow(ctx, W, H, t, pal);
    if (has("rain")) drawRain(ctx, W, H, t, pal, energy);
    if (has("wind")) drawWind(ctx, W, H, t, pal);
    if (has("snow")) drawSnow(ctx, W, H, t, pal);
    if (has("flower")) drawFlower(ctx, W, H, t, pal);
    if (has("letters")) drawLetters(ctx, W, H, t, pal, scene.text);

    /* 氛围粒子 */
    if (has("light") || has("moon") || has("window")) {
      drawFireflies(ctx, W, H, t, pal, energy);
    }

    /* 拍点火花，避免整幅场景太静 */
    if (NS.live) {
      NS.live.burst(ctx, W / 2, H * 0.52, t, api, pal.primary, {
        count: 18,
        radius: H * 0.3
      });
    }

    drawVignette(ctx, W, H);
  }

  /* ======================================================================
     渲染入口
     ====================================================================== */

  function render(ctx, W, H, api) {
    var story = api.story;
    if (!story || !story.length) return;

    var t = api.t;
    var idx = sceneIndexAt(story, t);
    var scene = story[idx];
    var prev = idx > 0 ? story[idx - 1] : null;

    var blend = prev ? clamp((t - scene.start) / 0.55, 0, 1) : 1;

    if (prev && blend < 1) {
      ctx.save();
      drawScene(ctx, W, H, prev, t, api);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = blend;
      drawScene(ctx, W, H, scene, t, api);
      ctx.restore();
    } else {
      drawScene(ctx, W, H, scene, t, api);
    }

    var helpers = NS.scenes.helpers;

    helpers.drawLyric(ctx, W, H, api, {
      y: H * 0.5,
      glow: [240, 246, 255],
      weight: 500,
      size: Math.round(W * 0.045)
    });

    helpers.drawIntroTitle(ctx, W, H, api, {});
  }

  NS.story = {
    MOTIFS: MOTIFS,
    MOTIF_IDS: MOTIF_IDS,
    detect: detect,
    build: build,
    render: render,
    paletteFor: paletteFor,
    sceneIndexAt: sceneIndexAt,
    /* 供「逐字生成引擎」复用的画笔 */
    painters: {
      sky: drawSky,
      city: drawCity,
      sea: drawSea,
      moonReflection: drawMoonReflection,
      moon: drawMoon,
      window: drawWindow,
      rain: drawRain,
      wind: drawWind,
      letters: drawLetters,
      fire: drawFire,
      flower: drawFlower,
      snow: drawSnow,
      road: drawRoad,
      clock: drawClock,
      shadow: drawShadow,
      fireflies: drawFireflies,
      vignette: drawVignette
    },
    helpers: { hash: hash, clamp: clamp, lerp: lerp, rgba: rgba, rgbOf: rgbOf, mixColor: mixColor }
  };
})(window.CodeMV);
