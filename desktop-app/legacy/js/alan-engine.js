/* ==========================================================================
   AlanLumier · 逐字生成引擎
   --------------------------------------------------------------------------
   和之前的「每句一个固定意象」不同，这一层是真正的逐字驱动：

     1. 把每句歌词拆成「词元」，给每个词元分配时间片（按语义权重分配，
        概念词停留久、虚词一带而过）
     2. 每个字/词查词典 → 概念（月亮/窗/海/火/名字/心…）+ 修饰（大/小/明/暗/冷/暖/长/短…）
     3. 渲染时按时间累积所有已唱过的概念，做指数衰减 + 当前字加权
        → 画面是连续变化的，而不是一句一换
     4. 当前唱到的词元会高亮：歌词文字逐字点亮，对应物象同时增强
        （唱到「月」月亮变亮，唱到「影」影子拉长，唱到「带走」文字飞走）

   所有计算都是 t 的纯函数，可实时播放，也可逐帧导出。
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var TAU = Math.PI * 2;

  function hash(n) {
    var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453123;
    return x - Math.floor(x);
  }

  function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
  }

  function lerp(a, b, k) {
    return a + (b - a) * k;
  }

  function ease(k) {
    return 1 - Math.pow(1 - k, 3);
  }

  function rgba(c, a) {
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (a == null ? 1 : a) + ")";
  }

  function mixRgb(a, b, k) {
    return [
      Math.round(lerp(a[0], b[0], k)),
      Math.round(lerp(a[1], b[1], k)),
      Math.round(lerp(a[2], b[2], k))
    ];
  }

  function rgbOf(hex) {
    if (Array.isArray(hex)) return hex;
    var h = String(hex || "#ffffff").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /* ======================================================================
     概念词典
     ----------------------------------------------------------------------
     layer: bg 背景 / mid 中景 / fg 前景（贴脸的元素）
     color: 这个物象的主色
     painter: 复用 story.js 的画笔
     ====================================================================== */

  var CONCEPTS = {
    night: { layer: "bg", color: "#18224a", weight: 1.0 },
    moon: { layer: "bg", color: "#8fadff", weight: 1.0, painter: "moon" },
    star: { layer: "bg", color: "#d8e4ff", weight: 0.6 },
    sky: { layer: "bg", color: "#202c5a", weight: 0.5 },
    dream: { layer: "bg", color: "#a78bfa", weight: 0.8 },
    sad: { layer: "bg", color: "#3b4a7a", weight: 0.7 },
    cold: { layer: "bg", color: "#7dd3fc", weight: 0.6 },
    sun: { layer: "bg", color: "#ffd166", weight: 0.8 },
    warm: { layer: "bg", color: "#ffb366", weight: 0.7 },

    window: { layer: "mid", color: "#a8c8ff", weight: 0.9, painter: "window" },
    room: { layer: "mid", color: "#2a2430", weight: 0.6 },
    city: { layer: "mid", color: "#ffb366", weight: 0.9, painter: "city" },
    light: { layer: "mid", color: "#ffd166", weight: 0.8 },
    sea: { layer: "mid", color: "#2dd4bf", weight: 0.9, painter: "sea" },
    water: { layer: "mid", color: "#7dd3fc", weight: 0.7 },
    fire: { layer: "mid", color: "#ff7a18", weight: 0.9, painter: "fire" },
    road: { layer: "mid", color: "#6ee7ff", weight: 0.6, painter: "road" },
    clock: { layer: "mid", color: "#c9b48a", weight: 0.6, painter: "clock" },
    crowd: { layer: "mid", color: "#ffb366", weight: 0.6 },

    rain: { layer: "fg", color: "#9dc8ff", weight: 0.8, painter: "rain" },
    tear: { layer: "fg", color: "#9dc8ff", weight: 0.6, painter: "rain" },
    wind: { layer: "fg", color: "#a5f3fc", weight: 0.6, painter: "wind" },
    snow: { layer: "fg", color: "#dbeafe", weight: 0.7, painter: "snow" },
    flower: { layer: "fg", color: "#ff9ecb", weight: 0.7, painter: "flower" },
    shadow: { layer: "fg", color: "#6b748c", weight: 0.7, painter: "shadow" },
    letter: { layer: "fg", color: "#ffd166", weight: 0.6, painter: "letters" },
    heart: { layer: "fg", color: "#ff6ec7", weight: 0.8 },
    you: { layer: "fg", color: "#ffe9c9", weight: 0.7 },
    me: { layer: "fg", color: "#c9f7ff", weight: 0.5 },
    smile: { layer: "fg", color: "#ffd166", weight: 0.6 },
    fly: { layer: "fg", color: "#bfe9ff", weight: 0.5 },
    fall: { layer: "fg", color: "#9ab0d6", weight: 0.5 },
    rise: { layer: "fg", color: "#ffe9c9", weight: 0.5 },
    hold: { layer: "fg", color: "#ffd6e8", weight: 0.5 },
    lost: { layer: "fg", color: "#8a93b0", weight: 0.6 }
  };

  /* 单字 / 词 → 概念 */
  var WORD_MAP = {
    月: "moon", 月亮: "moon", 星光: "star", 星: "star",
    夜: "night", 黑夜: "night", 夜色: "night", 深夜: "night",
    天: "sky", 天空: "sky", 云: "sky",
    梦: "dream", 幻: "dream", 梦境: "dream",
    悲: "sad", 伤: "sad", 痛: "sad", 孤独: "sad", 寂寞: "sad",
    冷: "cold", 冰: "cold", 寒: "cold",
    阳: "sun", 太阳: "sun", 阳光: "sun",
    暖: "warm", 温柔: "warm",

    窗: "window", 窗户: "window", 窗前: "window", 窗口: "window",
    门: "window", 门框: "window",
    房: "room", 房间: "room", 屋子: "room", 家: "room",
    城: "city", 城市: "city", 街: "city", 街道: "city", 楼: "city",
    霓虹: "city", 人海: "crowd", 人群: "crowd",
    灯: "light", 灯火: "light", 灯光: "light", 光: "light",
    海: "sea", 大海: "sea", 潮: "sea", 潮水: "sea", 浪: "sea",
    水: "water", 河: "water", 湖: "water", 雨: "rain", 下雨: "rain",
    火: "fire", 燃烧: "fire", 焰: "fire", 烧: "fire", 篝火: "fire",
    路: "road", 马路: "road", 远: "road", 远方: "road",
    钟: "clock", 时钟: "clock", 时间: "clock", 秒: "clock",
    风: "wind", 吹: "wind", 飘: "fly", 飞: "fly",
    雪: "snow", 冬: "snow", 花: "flower", 春: "flower", 叶: "flower",
    影: "shadow", 影子: "shadow",
    泪: "tear", 哭: "tear", 眼泪: "tear",
    字: "letter", 名字: "letter", 信: "letter", 话: "letter",
    心: "heart", 爱: "heart", 想: "heart", 念: "heart", 恋: "heart",
    你: "you", 我: "me", 他: "you", 她: "you",
    笑: "smile", 微笑: "smile",
    落: "fall", 坠: "fall", 飘落: "fall",
    升: "rise", 起: "rise",
    握: "hold", 抱: "hold", 牵手: "hold",
    丢: "lost", 失: "lost", 离开: "lost", 走: "lost",
    带: "fly", 带走: "fly"
  };

  /* 修饰词 → 影响 */
  var MODIFIERS = {
    大: { scale: 1.5 },
    小: { scale: 0.6 },
    巨: { scale: 2.0 },
    满: { density: 1.6 },
    空: { density: 0.35 },
    明: { bright: 1.35 },
    亮: { bright: 1.25 },
    暗: { bright: 0.6 },
    黑: { bright: 0.4 },
    冷: { hue: -0.15 },
    暖: { hue: 0.15 },
    长: { stretch: 1.7 },
    短: { stretch: 0.6 },
    慢: { speed: 0.55 },
    快: { speed: 1.6 },
    远: { depth: 1.5 },
    近: { depth: 0.6 },
    深: { depth: 1.3 },
    浅: { depth: 0.7 },
    静: { speed: 0.4 },
    动: { speed: 1.5 },
    万: { density: 2.2 },
    千: { density: 1.8 }
  };

  /* 不算画面、但占时间 */
  var FILLER = "的了在是我你他她它们着过和与就都还很也把被让给对从向";

  /* ======================================================================
     分词 + 时间轴
     ====================================================================== */

  function tokenize(text) {
    var tokens = [];
    var chars = String(text || "").split("");
    var i = 0;

    while (i < chars.length) {
      var matched = null;

      /* 优先匹配二字词 */
      if (i + 1 < chars.length) {
        var two = chars[i] + chars[i + 1];
        if (WORD_MAP[two]) matched = { text: two, concepts: [WORD_MAP[two]], mods: {}, len: 2 };
      }

      if (!matched) {
        var one = chars[i];
        if (WORD_MAP[one]) {
          matched = { text: one, concepts: [WORD_MAP[one]], mods: {}, len: 1 };
        } else if (MODIFIERS[one]) {
          matched = { text: one, concepts: [], mods: MODIFIERS[one], len: 1 };
        } else if (FILLER.indexOf(one) >= 0 || one.trim() === "") {
          matched = { text: one, concepts: [], mods: {}, len: 1 };
        } else {
          matched = { text: one, concepts: [], mods: {}, len: 1 };
        }
      }

      tokens.push(matched);
      i += matched.len;
    }

    return tokens;
  }

  function tokenWeight(tok) {
    if (tok.concepts.length) return 2.4;
    if (Object.keys(tok.mods).length) return 1.1;
    if (FILLER.indexOf(tok.text) >= 0) return 0.45;
    return 0.8;
  }

  /**
   * 构建逐字时间轴
   * → { tokens: [[{text,t,dur,concepts,mods}]], events: [...] }
   */
  function build(lines, duration, script) {
    var rows = [];
    var events = [];
    var list = lines || [];

    for (var li = 0; li < list.length; li++) {
      var line = list[li];
      var next = list[li + 1];
      var end = next ? Math.min(next.time, duration) : duration;
      var dur = Math.max(0.5, end - line.time);

      var toks = tokenize(line.text);
      if (!toks.length) {
        rows.push([]);
        continue;
      }

      var total = 0;
      for (var a = 0; a < toks.length; a++) total += tokenWeight(toks[a]);

      var cursor = line.time;
      var row = [];
      var pendingMods = {};

      for (var b = 0; b < toks.length; b++) {
        var tok = toks[b];
        var slice = (dur * tokenWeight(tok)) / total;
        slice = Math.max(0.1, slice);

        /* 修饰词作用于它后面的第一个概念词 */
        if (!tok.concepts.length && Object.keys(tok.mods).length) {
          for (var mk in tok.mods) pendingMods[mk] = tok.mods[mk];
        }

        var mods = {};
        if (tok.concepts.length && Object.keys(pendingMods).length) {
          mods = pendingMods;
          pendingMods = {};
        }

        var item = {
          text: tok.text,
          t: cursor,
          dur: slice,
          concepts: tok.concepts.slice(),
          mods: mods
        };
        row.push(item);
        cursor += slice;

        if (item.concepts.length || Object.keys(mods).length) {
          events.push({
            t: item.t,
            dur: item.dur,
            text: item.text,
            concepts: item.concepts.slice(),
            mods: mods
          });
        }
      }

      /* 行尾对齐：把最后一片拉到 end */
      if (row.length) {
        var lastTok = row[row.length - 1];
        lastTok.dur = Math.max(0.1, end - lastTok.t);
      }

      rows.push(row);

      /* AI 分镜给的概念也作为额外事件（加权较低） */
      if (script && script.sections) {
        var sec = NS.script.sectionAt(script, line.time);
        if (sec && sec.motifs && sec.motifs.length) {
          sec.motifs.forEach(function (m, mi) {
            if (!CONCEPTS[m]) return;
            events.push({
              t: line.time + mi * 0.05,
              dur: 0.2,
              text: "",
              concepts: [m],
              mods: {},
              ai: true
            });
          });
        }
      }
    }

    events.sort(function (x, y) {
      return x.t - y.t;
    });

    return { rows: rows, events: events, lines: list, duration: duration };
  }

  /* ======================================================================
     状态：按时间累积概念权重
     ====================================================================== */

  function stateAt(alan, t, opts) {
    opts = opts || {};
    var decaySec = opts.decay || 6.5;
    var scores = {};
    var modsByConcept = {};
    var current = null;

    var events = alan.events || [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.t > t) break;

      var age = t - ev.t;
      var decay = Math.exp(-age / decaySec);
      var isCurrent = t >= ev.t && t < ev.t + ev.dur;
      var boost = isCurrent ? 2.1 : ev.ai ? 0.5 : 1;

      for (var c = 0; c < ev.concepts.length; c++) {
        var id = ev.concepts[c];
        var cfg = CONCEPTS[id] || { weight: 0.5, layer: "fg", color: "#9db4ff" };
        scores[id] = (scores[id] || 0) + cfg.weight * decay * boost;

        if (ev.mods && Object.keys(ev.mods).length) {
          var prev = modsByConcept[id] || {};
          for (var k in ev.mods) prev[k] = ev.mods[k];
          modsByConcept[id] = prev;
        }
      }

      if (isCurrent) current = ev;
    }

    /* 当前词元若没有概念（虚词/修饰词），也保留它的修饰影响 */
    if (current && !current.concepts.length && current.mods) {
      for (var id2 in scores) {
        var prev2 = modsByConcept[id2] || {};
        for (var k2 in current.mods) prev2[k2] = current.mods[k2];
        modsByConcept[id2] = prev2;
      }
    }

    var entries = [];
    for (var key in scores) {
      entries.push({
        id: key,
        score: scores[key],
        cfg: CONCEPTS[key] || { layer: "fg", color: "#9db4ff", weight: 0.5 },
        mods: modsByConcept[key] || {}
      });
    }
    entries.sort(function (a, b) {
      return b.score - a.score;
    });

    /* 混合主色 */
    var total = 0;
    var col = [0, 0, 0];
    for (var e = 0; e < entries.length; e++) {
      var w = entries[e].score;
      if (w <= 0) continue;
      var c2 = rgbOf(entries[e].cfg.color);
      col[0] += c2[0] * w;
      col[1] += c2[1] * w;
      col[2] += c2[2] * w;
      total += w;
    }

    if (total > 0) {
      col = [Math.round(col[0] / total), Math.round(col[1] / total), Math.round(col[2] / total)];
    } else {
      col = [110, 231, 255];
    }

    return {
      t: t,
      entries: entries,
      current: current,
      color: col,
      byLayer: {
        bg: entries.filter(function (x) { return x.cfg.layer === "bg"; }).slice(0, 2),
        mid: entries.filter(function (x) { return x.cfg.layer === "mid"; }).slice(0, 3),
        fg: entries.filter(function (x) { return x.cfg.layer === "fg"; }).slice(0, 3)
      }
    };
  }

  /* ======================================================================
     绘制
     ====================================================================== */

  function conceptAlpha(score) {
    return clamp(Math.pow(score, 0.75) * 0.42, 0.06, 0.92);
  }

  /** 没有专属画笔的概念：画成发光粒子团 */
  function drawOrb(ctx, W, H, t, color, alpha, seed, mods) {
    var cx = W * (0.2 + hash(seed * 3.1) * 0.6);
    var cy = H * (0.2 + hash(seed * 7.7) * 0.45);
    var baseR = H * (0.1 + hash(seed * 5.3) * 0.12);
    var r = baseR * (mods.scale || 1);
    var n = Math.round(18 * (mods.density || 1) * (0.6 + alpha));

    for (var i = 0; i < n; i++) {
      var a = hash(seed + i * 1.7) * TAU + t * (0.2 + hash(i) * 0.2) * (mods.speed || 1);
      var rr = r * (0.3 + hash(seed + i * 3.3) * 0.9);
      var x = cx + Math.cos(a) * rr;
      var y = cy + Math.sin(a) * rr * 0.85;
      ctx.fillStyle = rgba(color, alpha * (0.25 + hash(i * 7.1) * 0.5));
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + hash(i * 2.3) * 2.4, 0, TAU);
      ctx.fill();
    }

    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.6);
    g.addColorStop(0, rgba(color, alpha * 0.35));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.6, 0, TAU);
    ctx.fill();
  }

  /** 逐字歌词：唱到哪个字，哪个字点亮 */
  function drawPerCharLyric(ctx, W, H, api, alan, opts) {
    opts = opts || {};
    var line = api.line(api.t);
    if (!line || line.alpha <= 0.02) return;

    var LS = NS.lyricStyle;
    var ls = LS ? LS.load() : null;
    if (ls && ls.visible === false) return;

    var m = LS ? LS.metrics(W, H) : null;
    var anim = m ? m.anim : "highlight";

    var rows = alan.rows[line.index] || [];
    var text = line.text;
    if (!text) return;

    /* 打字机：只画到当前进度 */
    if (anim === "typewriter") {
      var count = Math.max(1, Math.floor(text.length * line.typeProgress));
      text = text.slice(0, count);
    }

    var size = Math.round(W * ((m ? m.s.size : 5) / 100));
    var weight = m ? m.s.weight : opts.weight || 600;
    var family = m
      ? m.fontFamily
      : '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    var align = m ? m.s.align : "center";
    var tracking = m ? m.tracking : "0em";
    var baseY = opts.y != null ? opts.y : m ? m.y : H * 0.5;
    var opacity = m ? m.opacity : 1;
    var glow = m ? m.glow : 0.6;
    var outline = m ? m.outline : 0;
    var maxW = W * (m ? m.s.maxWidth : 0.8);
    var pad = (W - maxW) / 2;

    var font = weight + " " + size + "px " + family;

    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = font;
    try {
      ctx.letterSpacing = tracking;
    } catch (e) {}

    var measured = ctx.measureText(text).width;
    if (measured > maxW) {
      size = Math.max(10, Math.round(size * (maxW / measured)));
      font = weight + " " + size + "px " + family;
      ctx.font = font;
    }

    var rise =
      anim === "slide"
        ? (1 - ease(clamp(line.age / 0.5, 0, 1))) * size * 0.25
        : 0;
    var y = baseY + rise;
    var totalW = ctx.measureText(text).width;
    var x =
      align === "center"
        ? W / 2 - totalW / 2
        : align === "right"
        ? W - pad - totalW
        : pad;

    /* 当前唱到的词元 */
    var currentIdx = -1;
    for (var r = 0; r < rows.length; r++) {
      if (api.t >= rows[r].t && api.t < rows[r].t + rows[r].dur) {
        currentIdx = r;
        break;
      }
    }

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      var chW = ctx.measureText(ch).width;

      var tokenIdx = -1;
      var acc = 0;
      for (var r2 = 0; r2 < rows.length; r2++) {
        acc += rows[r2].text.length;
        if (i < acc) {
          tokenIdx = r2;
          break;
        }
      }

      var isActive = anim === "highlight" && tokenIdx === currentIdx;
      var isPast = tokenIdx < currentIdx;
      var alpha =
        (anim === "none" ? 1 : line.alpha) *
        opacity *
        (isActive ? 1 : isPast ? 1 : anim === "highlight" ? 0.38 : 0.92);
      var scale = isActive ? 1.14 : 1;

      ctx.save();
      ctx.translate(x + chW / 2, y);
      ctx.scale(scale, scale);
      ctx.font = font;
      ctx.textAlign = "center";

      if (outline > 0.004) {
        ctx.strokeStyle = "rgba(255,255,255," + alpha * 0.8 + ")";
        ctx.lineWidth = Math.max(1, size * outline);
        ctx.strokeText(ch, 0, 0);
      }

      if (isActive) {
        ctx.shadowColor = "rgba(255,209,102," + 0.95 * Math.max(glow, 0.3) + ")";
        ctx.shadowBlur = size * (0.2 + glow * 0.6);
        ctx.fillStyle = "rgba(255,222,140," + Math.min(1, alpha) + ")";
      } else {
        ctx.shadowColor = "rgba(230,240,255," + 0.5 * glow + ")";
        ctx.shadowBlur = size * 0.3 * glow;
        ctx.fillStyle = "rgba(246,249,255," + Math.min(1, alpha) + ")";
      }

      ctx.fillText(ch, 0, 0);
      ctx.restore();

      x += chW;
    }

    ctx.restore();
  }

  /** 主渲染 */
  function render(ctx, W, H, api) {
    var alan = api.alan;
    if (!alan) return;

    var t = api.t;
    var st = stateAt(alan, t, { decay: api.decay || 6.5 });
    var painters = NS.story.painters;
    var beatPulse = NS.live ? NS.live.beat(t, api) : 0;

    /* 主色：概念混合色 → 压暗成背景 */
    var base = st.color;
    var deep = mixRgb(base, [3, 4, 10], 0.72);

    /* 1. 背景 */
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(mixRgb(deep, base, 0.35), 1));
    g.addColorStop(0.6, rgba(deep, 1));
    g.addColorStop(1, "rgba(2,3,8,1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    /* 2. 背景层概念 */
    var bg = st.byLayer.bg;
    bg.forEach(function (item, i) {
      var alpha = Math.min(1, conceptAlpha(item.score) * (1 + beatPulse * 0.25));
      var pal = makePal(item, st);

      if (item.id === "moon" && painters.moon) {
        painters.moon(ctx, W, H, t, pal);
        return;
      }

      if (item.id === "night" || item.id === "dream" || item.id === "sad" || item.id === "cold" || item.id === "sky") {
        /* 氛围色块 */
        var cx = W * (0.3 + hash(i * 5.1) * 0.4);
        var cy = H * (0.2 + hash(i * 3.7) * 0.3);
        var r = H * (0.5 + hash(i * 7.3) * 0.4);
        var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        rg.addColorStop(0, rgba(mixRgb(base, [255, 255, 255], 0.1), alpha * 0.5));
        rg.addColorStop(1, rgba(base, 0));
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, W, H);
        return;
      }

      drawOrb(ctx, W, H, t, rgbOf(item.cfg.color), alpha * 0.6, i + 11, item.mods);
    });

    /* 3. 中景层 */
    st.byLayer.mid.forEach(function (item, i) {
      var alpha = Math.min(1, conceptAlpha(item.score) * (1 + beatPulse * 0.25));
      var pal = makePal(item, st);
      var fn = item.cfg.painter ? painters[item.cfg.painter] : null;

      ctx.save();
      ctx.globalAlpha = alpha;
      if (fn) {
        fn(ctx, W, H, t, pal, api.energy ? api.energy(t) : 0.5);
      } else {
        drawOrb(ctx, W, H, t, rgbOf(item.cfg.color), alpha * 0.9, i + 31, item.mods);
      }
      ctx.restore();
    });

    /* 4. 前景层 */
    st.byLayer.fg.forEach(function (item, i) {
      var alpha = Math.min(1, conceptAlpha(item.score) * (1 + beatPulse * 0.25));
      var pal = makePal(item, st);
      var fn = item.cfg.painter ? painters[item.cfg.painter] : null;

      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha * 1.1);
      if (fn) {
        fn(ctx, W, H, t, pal, api.energy ? api.energy(t) : 0.5);
      } else {
        drawOrb(ctx, W, H, t, rgbOf(item.cfg.color), alpha, i + 51, item.mods);
      }
      ctx.restore();
    });

    /* 拍点火花 */
    if (NS.live) {
      NS.live.burst(ctx, W / 2, H * 0.52, t, api, base, { count: 20, radius: H * 0.32 });
    }

    /* 5. 当前字触发的小爆发（确定性） */
    if (st.current) {
      var cv = rgbOf((st.current.concepts.length && CONCEPTS[st.current.concepts[0]]
        ? CONCEPTS[st.current.concepts[0]].color
        : base));
      var burst = clamp(1 - (t - st.current.t) / Math.max(0.2, st.current.dur), 0, 1);
      if (burst > 0.05) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (var b = 0; b < 14; b++) {
          var ang = hash(b * 3.1) * TAU + t;
          var dist = (1 - burst) * H * 0.18 + hash(b * 7.7) * H * 0.05;
          ctx.fillStyle = rgba(cv, burst * 0.5);
          ctx.beginPath();
          ctx.arc(
            W / 2 + Math.cos(ang) * dist,
            H * 0.5 + Math.sin(ang) * dist * 0.6,
            1 + hash(b) * 2.5,
            0,
            TAU
          );
          ctx.fill();
        }
        ctx.restore();
      }
    }

    /* 6. 暗角 + 歌词 + 标题 */
    painters.vignette(ctx, W, H);
    drawPerCharLyric(ctx, W, H, api, alan, { y: H * 0.6 });
    NS.scenes.helpers.drawIntroTitle(ctx, W, H, api, {});
  }

  /** 由概念生成画笔需要的调色板 */
  function makePal(item, st) {
    var c = rgbOf(item.cfg.color);
    var mods = item.mods || {};
    if (mods.bright) c = mixRgb([0, 0, 0], c, clamp(mods.bright, 0.2, 1.6) / 1.6);
    if (mods.hue) {
      c = mods.hue > 0 ? mixRgb(c, [255, 170, 90], 0.3) : mixRgb(c, [110, 200, 255], 0.3);
    }

    return {
      deep: mixRgb(c, [2, 3, 8], 0.8),
      primary: c,
      accent: mixRgb(c, [255, 255, 255], 0.45),
      light: mixRgb(c, [255, 255, 255], 0.75)
    };
  }

  NS.alan = {
    CONCEPTS: CONCEPTS,
    WORD_MAP: WORD_MAP,
    MODIFIERS: MODIFIERS,
    build: build,
    stateAt: stateAt,
    render: render,
    tokenize: tokenize,
    paintOrb: drawOrb
  };
})(window.CodeMV);
