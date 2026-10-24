/* ==========================================================================
   Code MV · 歌词样式设置
   --------------------------------------------------------------------------
   参考 Folia（全屏沉浸式歌词播放器）的思路：歌词不只是「显示出来」，
   而是可以调排版与动效的舞台元素。

   可调项：
     显示 / 位置Y / 字号 / 字距 / 行距 / 对齐 / 字重 / 字体 /
     透明度 / 发光 / 描边 / 动效（逐字高亮、淡入、打字机、上滑、无）

   设置保存在 localStorage，所有渲染器共用。
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var U = NS.utils;
  var KEY = "codemv.lyricStyle";

  var FONTS = {
    system: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif',
    sans: '"Microsoft YaHei","PingFang SC",system-ui,sans-serif',
    serif: '"Songti SC","SimSun",serif',
    mono: 'ui-monospace,SFMono-Regular,Menlo,monospace',
    hand: '"Kaiti SC","KaiTi",cursive'
  };

  var FONT_LABELS = [
    { id: "system", name: "系统默认" },
    { id: "sans", name: "黑体" },
    { id: "serif", name: "宋体" },
    { id: "mono", name: "等宽" },
    { id: "hand", name: "楷体" }
  ];

  var ANIMS = [
    { id: "highlight", name: "逐字高亮" },
    { id: "fade", name: "淡入" },
    { id: "typewriter", name: "打字机" },
    { id: "slide", name: "上滑" },
    { id: "none", name: "无动效" }
  ];

  var PRESETS = [
    {
      id: "center",
      name: "居中",
      style: { y: 50, size: 4.6, tracking: 0.06, lineHeight: 1.34, align: "center", weight: 600, font: "system", opacity: 1, glow: 0.55, outline: 0 }
    },
    {
      id: "bottom",
      name: "底部",
      style: { y: 78, size: 3.8, tracking: 0.04, lineHeight: 1.3, align: "center", weight: 500, font: "system", opacity: 0.95, glow: 0.35, outline: 0 }
    },
    {
      id: "big",
      name: "大字",
      style: { y: 46, size: 7.2, tracking: 0.02, lineHeight: 1.16, align: "center", weight: 700, font: "sans", opacity: 1, glow: 0.7, outline: 0 }
    },
    {
      id: "minimal",
      name: "极简",
      style: { y: 62, size: 3.2, tracking: 0.14, lineHeight: 1.5, align: "center", weight: 400, font: "mono", opacity: 0.85, glow: 0, outline: 0 }
    },
    {
      id: "kala",
      name: "卡拉OK",
      style: { y: 82, size: 4.2, tracking: 0.05, lineHeight: 1.3, align: "center", weight: 700, font: "sans", opacity: 1, glow: 0.5, outline: 0.06 }
    }
  ];

  var TITLE_DEFAULTS = {
    visible: true,
    showArtist: true,
    sep: " - ",
    y: 50,
    size: 5.2,
    weight: 700,
    opacity: 1,
    glow: 0.35
  };

  var TITLE_KEY = "codemv.titleStyle";
  var titleStyle = null;

  var DEFAULTS = {
    visible: true,
    y: 50, /* 垂直位置 0~100（百分比） */
    size: 4.6, /* 字号（相对画面宽度的百分比） */
    tracking: 0.06, /* 字距 em */
    lineHeight: 1.34,
    align: "center", /* left / center / right */
    weight: 600,
    font: "system",
    opacity: 1,
    glow: 0.55, /* 发光强度 0~1 */
    outline: 0, /* 描边宽度（相对字号）0~0.2 */
    anim: "highlight",
    maxWidth: 0.8 /* 单行最大宽度（相对画面宽度） */
  };

  var style = null;

  function clampNum(v, min, max, fallback) {
    v = Number(v);
    if (!isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, v));
  }

  function sanitize(raw) {
    raw = raw || {};
    var out = {};
    for (var k in DEFAULTS) out[k] = DEFAULTS[k];

    out.visible = raw.visible !== false;
    out.y = clampNum(raw.y, 0, 100, DEFAULTS.y);
    out.size = clampNum(raw.size, 1.6, 12, DEFAULTS.size);
    out.tracking = clampNum(raw.tracking, -0.05, 0.5, DEFAULTS.tracking);
    out.lineHeight = clampNum(raw.lineHeight, 1, 2.4, DEFAULTS.lineHeight);
    out.align = ["left", "center", "right"].indexOf(raw.align) >= 0 ? raw.align : DEFAULTS.align;
    out.weight = [300, 400, 500, 600, 700, 800].indexOf(Number(raw.weight)) >= 0 ? Number(raw.weight) : DEFAULTS.weight;
    out.font = FONTS[raw.font] ? raw.font : DEFAULTS.font;
    out.opacity = clampNum(raw.opacity, 0.2, 1, DEFAULTS.opacity);
    out.glow = clampNum(raw.glow, 0, 1, DEFAULTS.glow);
    out.outline = clampNum(raw.outline, 0, 0.2, DEFAULTS.outline);
    out.anim = ANIMS.some(function (a) { return a.id === raw.anim; }) ? raw.anim : DEFAULTS.anim;
    out.maxWidth = clampNum(raw.maxWidth, 0.4, 1, DEFAULTS.maxWidth);
    return out;
  }

  function load() {
    if (style) return style;
    var raw = null;
    try {
      raw = JSON.parse(U.storageGet("localStorage", KEY) || "null");
    } catch (e) {
      raw = null;
    }
    style = sanitize(raw);
    return style;
  }

  function save(next) {
    style = sanitize(Object.assign({}, style || DEFAULTS, next || {}));
    U.storageSet("localStorage", KEY, JSON.stringify(style));
    return style;
  }

  function set(patch) {
    return save(patch);
  }

  function reset() {
    style = sanitize(null);
    U.storageSet("localStorage", KEY, JSON.stringify(style));
    return style;
  }

  function applyPreset(id) {
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id === id) return save(PRESETS[i].style);
    }
    return load();
  }

  function fontFamily() {
    return FONTS[(load() || DEFAULTS).font] || FONTS.system;
  }

  /** 渲染器用：把设置换算成像素参数 */
  function metrics(W, H) {
    var s = load();
    var size = Math.round((W * s.size) / 100);
    return {
      s: s,
      size: size,
      y: (H * s.y) / 100,
      font: (s.weight || 600) + " " + size + "px " + fontFamily(),
      fontFamily: fontFamily(),
      tracking: (s.tracking || 0) + "em",
      align: s.align,
      lineHeight: size * (s.lineHeight || 1.34),
      maxWidth: W * (s.maxWidth || 0.8),
      opacity: s.opacity,
      glow: s.glow,
      outline: s.outline,
      anim: s.anim
    };
  }

  /* ---------- 歌名卡（没有歌词时显示） ---------- */

  function sanitizeTitle(raw) {
    raw = raw || {};
    var out = {};
    for (var k in TITLE_DEFAULTS) out[k] = TITLE_DEFAULTS[k];
    out.visible = raw.visible !== false;
    out.showArtist = raw.showArtist !== false;
    out.sep = [" - ", " · ", " / ", " | ", "  "].indexOf(raw.sep) >= 0 ? raw.sep : TITLE_DEFAULTS.sep;
    out.y = clampNum(raw.y, 0, 100, TITLE_DEFAULTS.y);
    out.size = clampNum(raw.size, 2, 14, TITLE_DEFAULTS.size);
    out.weight = [400, 500, 600, 700, 800].indexOf(Number(raw.weight)) >= 0 ? Number(raw.weight) : TITLE_DEFAULTS.weight;
    out.opacity = clampNum(raw.opacity, 0.2, 1, TITLE_DEFAULTS.opacity);
    out.glow = clampNum(raw.glow, 0, 1, TITLE_DEFAULTS.glow);
    return out;
  }

  function loadTitle() {
    if (titleStyle) return titleStyle;
    var raw = null;
    try {
      raw = JSON.parse(U.storageGet("localStorage", TITLE_KEY) || "null");
    } catch (e) {
      raw = null;
    }
    titleStyle = sanitizeTitle(raw);
    return titleStyle;
  }

  function saveTitle(patch) {
    titleStyle = sanitizeTitle(Object.assign({}, titleStyle || TITLE_DEFAULTS, patch || {}));
    U.storageSet("localStorage", TITLE_KEY, JSON.stringify(titleStyle));
    return titleStyle;
  }

  /** 画「歌名 - 歌手」标题卡（无歌词时持久显示） */
  function drawTitleCard(ctx, W, H, api) {
    var ts = loadTitle();
    if (!ts.visible) return;

    var title = String(api.title || "").trim();
    if (!title) return;
    var artist = String(api.artist || "").trim();
    var text = ts.showArtist && artist ? title + ts.sep + artist : title;

    var size = Math.round((W * ts.size) / 100);
    var fam = fontFamily();
    var maxW = W * 0.82;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = ts.weight + " " + size + "px " + fam;

    var measured = ctx.measureText(text).width;
    if (measured > maxW) {
      size = Math.max(12, Math.round(size * (maxW / measured)));
      ctx.font = ts.weight + " " + size + "px " + fam;
    }

    var y = (H * ts.y) / 100;

    /* 副标题：一个小圆点指示 */
    ctx.globalAlpha = ts.opacity;
    if (ts.glow > 0.02) {
      ctx.shadowColor = "rgba(255,255,255," + 0.35 * ts.glow + ")";
      ctx.shadowBlur = size * (0.2 + ts.glow * 0.7);
    }
    ctx.fillStyle = "rgba(255,255,255," + ts.opacity + ")";
    ctx.fillText(text, W / 2, y);

    /* 装饰横线 */
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.5 * ts.opacity;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = Math.max(1, size * 0.03);
    var lineW = Math.min(W * 0.16, size * 4);
    ctx.beginPath();
    ctx.moveTo(W / 2 - lineW / 2, y + size * 0.95);
    ctx.lineTo(W / 2 + lineW / 2, y + size * 0.95);
    ctx.stroke();

    ctx.restore();
  }

  NS.lyricStyle = {
    DEFAULTS: DEFAULTS,
    FONTS: FONTS,
    FONT_LABELS: FONT_LABELS,
    ANIMS: ANIMS,
    PRESETS: PRESETS,
    TITLE_DEFAULTS: TITLE_DEFAULTS,
    loadTitle: loadTitle,
    saveTitle: saveTitle,
    sanitizeTitle: sanitizeTitle,
    drawTitleCard: drawTitleCard,
    load: load,
    save: save,
    set: set,
    reset: reset,
    applyPreset: applyPreset,
    sanitize: sanitize,
    fontFamily: fontFamily,
    metrics: metrics
  };
})(window.CodeMV);
