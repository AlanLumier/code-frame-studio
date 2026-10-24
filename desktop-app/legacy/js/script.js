/* ==========================================================================
   CodeMV · AI 分镜脚本
   --------------------------------------------------------------------------
   这是「AI 生成画面」的中间层：把歌词交给大模型，产出一份结构化的
   visualScript（风格 / 配色 / 分段氛围 / 画面意象），再由场景渲染器执行。

   工作方式（不需要任何 API Key）：
     1. 点「复制 AI 提示词」→ 得到一段带歌词和 JSON 格式要求的提示词
     2. 粘到任意大模型（Claude / GPT / 本地模型都行）→ 拿回 JSON
     3. 贴回页面 → 画面按分镜变化
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  /* ---------- 可选风格 ---------- */

  var STYLES = [
    {
      id: "story",
      name: "逐字生成",
      desc: "按歌词内容实时渲染（内置引擎）",
      swatch: "linear-gradient(135deg, #040818, #7c9cff 55%, #e8efff)"
    }
  ];

  var MOODS = {
    night: { label: "夜色", palette: ["#0b1026", "#6ee7ff", "#a78bfa", "#f4f7ff"] },
    dream: { label: "梦境", palette: ["#12061f", "#ff9ecb", "#a78bfa", "#d6f6ff"] },
    rain: { label: "雨天", palette: ["#060f14", "#7dd3fc", "#94a3b8", "#e2f3ff"] },
    warm: { label: "暖阳", palette: ["#1a0d06", "#ffb347", "#ff6b6b", "#ffe9c9"] },
    fire: { label: "炽烈", palette: ["#120404", "#ff7a18", "#ff3d6e", "#ffd166"] },
    sea: { label: "深海", palette: ["#03121c", "#38bdf8", "#2dd4bf", "#e0fbff"] }
  };

  var KEYWORDS = [
    { mood: "rain", words: ["雨", "淋", "伞", "潮湿", "雾"] },
    { mood: "sea", words: ["海", "浪", "潮", "蓝", "鲸", "潜水"] },
    { mood: "fire", words: ["火", "燃", "烧", "焰", "炽", "光"] },
    { mood: "warm", words: ["夏", "暖", "阳", "糖", "笑", "甜"] },
    { mood: "dream", words: ["梦", "幻", "飘", "云", "星", "空"] },
    { mood: "night", words: ["夜", "黑", "月", "静", "孤独", "失眠"] }
  ];

  /* ---------- 工具 ---------- */

  function detectMood(text) {
    var scores = {};
    var best = "night";
    var bestScore = 0;

    KEYWORDS.forEach(function (group) {
      var score = 0;
      group.words.forEach(function (w) {
        if (text.indexOf(w) >= 0) score += 1;
      });
      if (score > 0) scores[group.mood] = score;
      if (score > bestScore) {
        bestScore = score;
        best = group.mood;
      }
    });

    return best;
  }

  function pickMotif(text) {
    for (var i = 0; i < KEYWORDS.length; i++) {
      for (var j = 0; j < KEYWORDS[i].words.length; j++) {
        if (text.indexOf(KEYWORDS[i].words[j]) >= 0) {
          return KEYWORDS[i].words[j];
        }
      }
    }
    return "";
  }

  function isHex(v) {
    return typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
  }

  /* ---------- 自动分镜（没有 AI 返回 JSON 时的兜底） ---------- */

  function makeDefaultScript(opts) {
    var lines = opts.lines || [];
    var duration = opts.duration || 0;
    var style = opts.style || "liquid";

    var allText = lines
      .map(function (l) {
        return l.text;
      })
      .join(" ");

    var mood = detectMood(allText);
    var palette = MOODS[mood].palette.slice();

    var sections = [];
    var groupSize = 4;

    for (var i = 0; i < lines.length; i += groupSize) {
      var start = lines[i].time;
      var endLine = lines[Math.min(i + groupSize, lines.length - 1)];
      var nextStart = lines[i + groupSize] ? lines[i + groupSize].time : duration;
      var end = Math.max(start + 1, Math.min(nextStart, duration || nextStart));

      var chunk = lines
        .slice(i, i + groupSize)
        .map(function (l) {
          return l.text;
        })
        .join(" ");

      /* 从歌词里识别画面意象（可被 AI 分镜覆盖） */
      var motifs = NS.story ? NS.story.detect(chunk) : [];
      if (!motifs.length) motifs = ["light"];

      sections.push({
        start: round2(start),
        end: round2(end),
        motion: i === 0 ? "drift" : i % (groupSize * 2) === 0 ? "pulse" : "drift",
        hint: pickMotif(chunk),
        motifs: motifs
      });
    }

    if (!sections.length) {
      sections.push({ start: 0, end: round2(duration || 1), motion: "drift", hint: "" });
    }

    return {
      version: 1,
      style: style,
      mood: mood,
      palette: palette,
      sections: sections
    };
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  /* ---------- AI 提示词 ---------- */

  /* ---------- 解析 AI 返回的 JSON ---------- */

  function parseScript(text) {
    if (!text) throw new Error("没有内容");

    var raw = String(text).trim();

    /* 去掉可能出现的 ```json ``` 包裹 */
    raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

    /* 截取第一个 { 到最后一个 } */
    var start = raw.indexOf("{");
    var end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("没有找到 JSON 对象");
    raw = raw.slice(start, end + 1);

    var data = JSON.parse(raw);

    var styleId = "liquid";
    for (var i = 0; i < STYLES.length; i++) {
      if (STYLES[i].id === data.style) styleId = data.style;
    }

    var palette = Array.isArray(data.palette)
      ? data.palette.filter(isHex).slice(0, 6)
      : [];

    if (palette.length < 2) {
      palette = MOODS[MOODS[data.mood] ? data.mood : "night"].palette.slice();
    }

    while (palette.length < 4) palette.push("#ffffff");

    var sections = Array.isArray(data.sections) ? data.sections : [];
    sections = sections
      .filter(function (s) {
        return s && isFinite(s.start) && isFinite(s.end) && s.end > s.start;
      })
      .map(function (s) {
        var validMotifs = NS.story ? NS.story.MOTIF_IDS : [];
        var motifs = Array.isArray(s.motifs)
          ? s.motifs.filter(function (m) {
              return validMotifs.indexOf(m) >= 0;
            })
          : [];

        return {
          start: round2(Math.max(0, s.start)),
          end: round2(s.end),
          motion: ["drift", "pulse", "zoom"].indexOf(s.motion) >= 0 ? s.motion : "drift",
          hint: String(s.hint || "").slice(0, 12),
          motifs: motifs
        };
      })
      .sort(function (a, b) {
        return a.start - b.start;
      });

    if (!sections.length) throw new Error("sections 为空或不合法");

    return {
      version: 1,
      style: styleId,
      mood: data.mood || "night",
      palette: palette,
      sections: sections
    };
  }

  /* ---------- 按时间取当前段落 ---------- */

  function sectionAt(script, t) {
    if (!script || !script.sections || !script.sections.length) return null;
    var sections = script.sections;
    var found = sections[0];
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].start <= t) found = sections[i];
      else break;
    }
    return found;
  }

  /* ---------- 颜色工具 ---------- */

  function hexToRgb(hex) {
    var h = String(hex).replace("#", "").trim();
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function paletteRgb(script) {
    var id = script && script.style;
    if (id && NS.styleLibrary && NS.styleLibrary.get(id)) {
      var p = NS.styleLibrary.palette(id);
      return [p.bg[0], p.primary, p.accent, p.light].map(hexToRgb);
    }
    return (script && script.palette ? script.palette : MOODS.night.palette).map(
      hexToRgb
    );
  }

  NS.script = {
    STYLES: STYLES,
    MOODS: MOODS,
    detectMood: detectMood,
    makeDefaultScript: makeDefaultScript,
    parseScript: parseScript,
    sectionAt: sectionAt,
    paletteRgb: paletteRgb,
    hexToRgb: hexToRgb
  };
})(window.CodeMV);
