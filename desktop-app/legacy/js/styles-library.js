/* ==========================================================================
   Code MV · 风格库（分类 + 100+ 风格）
   --------------------------------------------------------------------------
   风格不是 100 个手写函数，而是「参数化配方」：
     调色板 + 形状语言 + 运动方式 + 纹理 + 叠层 + 字体处理
   渲染器（js/style-render.js）按配方组合，所以新增风格只是加一行定义。

   风格定义字段：
     id        唯一 id（URL/存储用）
     name      中文名
     category  分类 id
     palette   调色板 id
     forms     [背景形状, 前景形状]
     motion    运动方式（drift/pulse/orbit/fall/flow/sway/rise/spin/wipe）
     texture   纹理（grain/scanlines/dots/halftone/none）
     overlay   叠层（vignette/frame/corners/bars/none）
     lyric     歌词处理（glow/plain/outline/block/mono/spaced）
     desc      一句话描述
     dark      true=深色底（默认），false=浅色底
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  /* ---------- 调色板 ---------- */

  var PALETTES = {
    night:    { bg: ["#050a1a", "#0b1a3a"], primary: "#7c9cff", accent: "#c9d8ff", light: "#eef3ff" },
    ink:      { bg: ["#07070a", "#14141b"], primary: "#e8e6df", accent: "#9a9288", light: "#ffffff" },
    paper:    { bg: ["#efe6d4", "#e2d2b6"], primary: "#2b2b2b", accent: "#b3541e", light: "#151515", dark: false },
    jade:     { bg: ["#04120f", "#0a241d"], primary: "#4fd1a5", accent: "#bff2dd", light: "#effffa" },
    crimson:  { bg: ["#140406", "#2a0a0f"], primary: "#ff5a6e", accent: "#ffd166", light: "#fff1f2" },
    sand:     { bg: ["#12100a", "#241d10"], primary: "#e0b877", accent: "#ffd9a0", light: "#fff7e6" },
    mono:     { bg: ["#0a0a0a", "#1a1a1a"], primary: "#d9d9d9", accent: "#8c8c8c", light: "#ffffff" },
    neon:     { bg: ["#050014", "#12002e"], primary: "#ff2fd0", accent: "#22d3ee", light: "#f5e9ff" },
    aurora:   { bg: ["#020c12", "#062a33"], primary: "#3ee6c1", accent: "#8b5cf6", light: "#e6fffb" },
    ember:    { bg: ["#120502", "#2b0d03"], primary: "#ff7a18", accent: "#ffd166", light: "#fff0e0" },
    ice:      { bg: ["#070d18", "#12233d"], primary: "#9be7ff", accent: "#e8f7ff", light: "#f2fbff" },
    rose:     { bg: ["#160714", "#2b0d24"], primary: "#ff8fbf", accent: "#ffd6e7", light: "#fff0f7" },
    forest:   { bg: ["#040f08", "#0b2415"], primary: "#5ddc83", accent: "#d6ffb0", light: "#effff2" },
    violet:   { bg: ["#0a0518", "#1c0f3a"], primary: "#a78bfa", accent: "#e8dcff", light: "#f6f0ff" },
    sunset:   { bg: ["#1a0710", "#3a1220"], primary: "#ff8a5c", accent: "#ffd166", light: "#fff4ec" },
    lime:     { bg: ["#0a1004", "#17240a"], primary: "#c2f24a", accent: "#eaff9e", light: "#f8ffe6" },
    cyan:     { bg: ["#020f14", "#062b36"], primary: "#22d3ee", accent: "#d0f9ff", light: "#ecfeff" },
    rust:     { bg: ["#150a05", "#2b150a"], primary: "#d97757", accent: "#ffc9a8", light: "#fff2e8" },
    teal:     { bg: ["#04100f", "#0b2422"], primary: "#2dd4bf", accent: "#c7fff6", light: "#effffc" },
    plum:     { bg: ["#140618", "#280c2e"], primary: "#d8b4fe", accent: "#f5d0fe", light: "#fdf4ff" },
    copper:   { bg: ["#120c06", "#2a1a0c"], primary: "#c98a4b", accent: "#ffd7a8", light: "#fff6ea" },
    steel:    { bg: ["#0a0d12", "#1c2530"], primary: "#93b4d6", accent: "#e2ecf7", light: "#f2f7fc" },
    candy:    { bg: ["#1a0716", "#2e0f28"], primary: "#ff7ac8", accent: "#7ce7ff", light: "#fff0fa" },
    retro:    { bg: ["#0b0712", "#1d1030"], primary: "#ffb86c", accent: "#8be9fd", light: "#fff3e0" }
  };

  /* ---------- 分类 ---------- */

  var CATEGORIES = [
    { id: "scene", name: "逐字生成", desc: "按歌词内容实时渲染（内置引擎）" },
    { id: "featured", name: "精选主题", desc: "10 套最有辨识度的主题" },
    { id: "folia", name: "Folia 还原", desc: "按上游调参/官方配色重实现（AGPL 模块）" },
    { id: "minimal", name: "极简", desc: "少即是多：留白、克制的颜色" },
    { id: "abstract", name: "抽象", desc: "形状与运动本身即画面" },
    { id: "oriental", name: "东方", desc: "水墨、宣纸、剪纸、敦煌" },
    { id: "retro", name: "复古", desc: "蒸汽波、CRT、Y2K、波普" },
    { id: "nature", name: "自然", desc: "海、雨、雪、雾、极光" },
    { id: "geo", name: "几何", desc: "包豪斯、瑞士网格、构成主义" },
    { id: "cyber", name: "赛博", desc: "霓虹、数据流、故障、激光" },
    { id: "handmade", name: "手绘", desc: "铅笔、水彩、蜡笔、涂鸦" },
    { id: "film", name: "电影", desc: "黑白、胶片、宽银幕、景深" },
    { id: "pop", name: "流行", desc: "大字报、糖果、贴纸、表情" }
  ];

  /* ---------- 风格 ---------- */

  var list = [];

  function S(id, name, cat, pal, forms, motion, texture, overlay, lyric, desc, dark) {
    list.push({
      id: id,
      name: name,
      category: cat,
      palette: PALETTES[pal] ? pal : "night",
      forms: forms,
      motion: motion,
      texture: texture,
      overlay: overlay,
      lyric: lyric,
      desc: desc,
      dark: dark !== false
    });
  }

  /* 极简 · 12 */
  S("min-white", "留白", "minimal", "mono", ["dots", "lines"], "drift", "none", "frame", "plain", "近乎空白，只有一条线和几点星");
  S("min-line", "一线", "minimal", "ink", ["lines", "arcs"], "sway", "none", "none", "plain", "单线条缓慢摆动");
  S("min-dot", "点阵", "minimal", "mono", ["dots", "none"], "pulse", "dots", "vignette", "plain", "点阵呼吸");
  S("min-bar", "横条", "minimal", "steel", ["steps", "lines"], "wipe", "scanlines", "none", "plain", "横向色块缓慢推移");
  S("min-frame", "画框", "minimal", "ink", ["none", "arcs"], "pulse", "grain", "frame", "outline", "只留一个画框，内容在框外流动");
  S("min-grid", "网格", "minimal", "mono", ["grid", "dots"], "drift", "dots", "vignette", "plain", "极细网格 + 少量点");
  S("min-sun", "一轮", "minimal", "sand", ["orbs", "lines"], "float", "none", "none", "glow", "一个圆，一条地平线");
  S("min-mono", "单色", "minimal", "ice", ["blocks", "lines"], "sway", "grain", "none", "plain", "同一颜色的不同透明度");
  S("min-type", "字距", "minimal", "ink", ["lines", "none"], "pulse", "none", "none", "spaced", "极度拉开的字距");
  S("min-fold", "折角", "minimal", "paper", ["shards", "lines"], "drift", "grain", "corners", "plain", "纸面折角与阴影");
  S("min-scan", "扫描", "minimal", "mono", ["scan", "lines"], "wipe", "scanlines", "none", "mono", "一道扫描线缓慢下移");
  S("min-vast", "空", "minimal", "night", ["dots", "none"], "drift", "none", "vignette", "plain", "几乎只有黑暗与几粒光");

  /* 抽象 · 14 */
  S("abs-liquid", "液态", "abstract", "neon", ["orbs", "ribbons"], "flow", "grain", "vignette", "glow", "流动的液态色彩");
  S("abs-shard", "碎片", "abstract", "violet", ["shards", "vortex"], "spin", "grain", "vignette", "glow", "碎片在漩涡中旋转");
  S("abs-wave", "波形", "abstract", "cyan", ["waves", "radialBars"], "flow", "none", "none", "glow", "正弦波与环形频谱");
  S("abs-ring", "涟漪", "abstract", "teal", ["rings", "halo"], "pulse", "none", "vignette", "glow", "同心圆与光晕扩散");
  S("abs-blob", "融合", "abstract", "rose", ["orbs", "orbs"], "flow", "grain", "vignette", "glow", "多个色块缓慢融合");
  S("abs-ribbon", "绸带", "abstract", "plum", ["ribbons", "halo"], "sway", "grain", "none", "glow", "长绸带与光晕翻卷");
  S("abs-burst", "爆发", "abstract", "ember", ["burst", "dots"], "pulse", "grain", "vignette", "glow", "放射状能量爆发");
  S("abs-plasma", "等离子", "abstract", "aurora", ["vortex", "orbs"], "flow", "noise", "vignette", "glow", "漩涡与流动色雾");
  S("abs-grid", "透视", "abstract", "steel", ["grid", "dots"], "drift", "scanlines", "vignette", "mono", "透视网格向远处延伸");
  S("abs-chrome", "铬", "abstract", "ice", ["orbs", "arcs"], "spin", "grain", "frame", "chrome", "金属反光的液态球");
  S("abs-void", "虚空", "abstract", "ink", ["dots", "none"], "drift", "noise", "vignette", "plain", "黑暗中的微尘");
  S("abs-fold", "折叠", "abstract", "sand", ["shards", "steps"], "sway", "grain", "frame", "plain", "纸面折叠的光影");
  S("abs-tide", "潮", "abstract", "teal", ["waves", "waves"], "flow", "grain", "vignette", "glow", "两层浪互相追赶");
  S("abs-orbit", "轨道", "abstract", "night", ["rings", "dots"], "orbit", "none", "none", "glow", "行星轨道与光点");

  /* 东方 · 12 */
  S("or-ink", "水墨", "oriental", "ink", ["smoke", "dunes"], "flow", "grain", "frame", "outline", "墨色在宣纸上晕开");
  S("or-paper", "宣纸", "oriental", "paper", ["none", "cracks"], "drift", "grain", "frame", "plain", "纸纹与淡淡墨迹");
  S("or-jade", "青绿山水", "oriental", "jade", ["mountains", "strands"], "drift", "grain", "vignette", "outline", "层叠远山与青绿丝线");
  S("or-dunhuang", "敦煌", "oriental", "sand", ["arcs", "burst"], "sway", "grain", "frame", "glow", "壁画色与飞天飘带");
  S("or-shadow", "皮影", "oriental", "ember", ["mountains", "blocks"], "sway", "grain", "frame", "plain", "皮影戏的剪影");
  S("or-cut", "剪纸", "oriental", "crimson", ["steps", "burst"], "pulse", "none", "frame", "block", "红色剪纸纹样");
  S("or-bamboo", "竹影", "oriental", "forest", ["strands", "smoke"], "sway", "grain", "vignette", "outline", "竹影在墙上摇");
  S("or-tea", "茶烟", "oriental", "copper", ["smoke", "dots"], "rise", "grain", "vignette", "plain", "茶烟袅袅上升");
  S("or-mountain", "远山", "oriental", "steel", ["mountains", "none"], "drift", "noise", "vignette", "outline", "层层远山隐入雾中");
  S("or-porcelain", "宋瓷", "oriental", "ice", ["arcs", "cracks"], "pulse", "grain", "frame", "plain", "开片瓷纹与冷色釉");
  S("or-red", "朱砂", "oriental", "crimson", ["orbs", "dots"], "pulse", "grain", "frame", "glow", "朱砂红与金点");
  S("or-calligraphy", "行书", "oriental", "ink", ["ribbons", "smoke"], "flow", "none", "none", "block", "笔势连带如行书");

  /* 复古 · 12 */
  S("re-vapor", "蒸汽波", "retro", "retro", ["grid", "orbs"], "drift", "scanlines", "vignette", "chrome", "粉色日落与网格地平线");
  S("re-crt", "CRT", "retro", "mono", ["scan", "cracks"], "wipe", "scanlines", "frame", "mono", "显像管扫描与噪点");
  S("re-y2k", "Y2K", "retro", "candy", ["orbs", "shards"], "spin", "grain", "frame", "chrome", "千禧年镀铬与泡泡");
  S("re-vhs", "录像带", "retro", "steel", ["scan", "dots"], "wipe", "noise", "bars", "mono", "VHS 噪点与偏移色");
  S("re-pixel", "像素", "retro", "lime", ["blocks", "steps"], "pulse", "dots", "frame", "mono", "低分辨率像素块");
  S("re-pop", "波普", "retro", "crimson", ["burst", "strips"], "pulse", "halftone", "frame", "block", "波普放射与印刷条纹");
  S("re-memphis", "孟菲斯", "retro", "candy", ["shards", "dots"], "sway", "dots", "frame", "block", "孟菲斯几何拼贴");
  S("re-80s", "80s 霓虹", "retro", "neon", ["grid", "burst"], "drift", "scanlines", "vignette", "glow", "霓虹紫与地平线");
  S("re-poster", "旧海报", "retro", "sand", ["cracks", "lines"], "drift", "grain", "frame", "block", "褪色印刷与折痕");
  S("re-film", "旧胶片", "retro", "copper", ["dots", "scan"], "wipe", "grain", "bars", "mono", "胶片划痕与漏光");
  S("re-arcade", "街机", "retro", "lime", ["blocks", "burst"], "pulse", "scanlines", "frame", "block", "街机像素光效");
  S("re-dotmatrix", "点阵", "retro", "mono", ["halftone", "scan"], "wipe", "halftone", "frame", "mono", "点阵打印机质感");

  /* 自然 · 12 */
  S("na-sea", "海面", "nature", "cyan", ["waves", "dunes"], "flow", "grain", "vignette", "glow", "月光下的海面与远岸");
  S("na-rain", "雨", "nature", "steel", ["lines", "bubbles"], "fall", "grain", "vignette", "glow", "密集的雨丝");
  S("na-snow", "雪", "nature", "ice", ["snow", "dots"], "fall", "grain", "vignette", "glow", "缓慢飘落的雪");
  S("na-fog", "雾", "nature", "steel", ["smoke", "halo"], "flow", "noise", "vignette", "plain", "浓雾中的轮廓");
  S("na-fire", "火", "nature", "ember", ["smoke", "burst"], "rise", "grain", "vignette", "glow", "火光与余烬");
  S("na-forest", "森林", "nature", "forest", ["lines", "smoke"], "sway", "grain", "vignette", "plain", "树影间的光斑");
  S("na-star", "星夜", "nature", "night", ["dots", "rings"], "drift", "none", "vignette", "glow", "星空缓慢旋转");
  S("na-aurora", "极光", "nature", "aurora", ["ribbons", "dots"], "flow", "noise", "vignette", "glow", "极光在夜空流动");
  S("na-dune", "沙漠", "nature", "sand", ["mountains", "dots"], "drift", "grain", "vignette", "plain", "沙丘的曲线");
  S("na-petal", "落花", "nature", "rose", ["petals", "smoke"], "fall", "grain", "vignette", "glow", "花瓣旋转落下");
  S("na-bubble", "水泡", "nature", "teal", ["bubbles", "rings"], "rise", "grain", "vignette", "glow", "水下上升的气泡");
  S("na-storm", "风暴", "nature", "steel", ["lines", "burst"], "spin", "noise", "vignette", "glow", "旋转的云与雨");

  /* 几何 · 12 */
  S("ge-bauhaus", "包豪斯", "geo", "crimson", ["blocks", "arcs"], "pulse", "none", "frame", "block", "三原色与基本形");
  S("ge-swiss", "瑞士网格", "geo", "mono", ["grid", "steps"], "wipe", "none", "none", "spaced", "严格网格与无衬线字");
  S("ge-construct", "构成主义", "geo", "crimson", ["shards", "burst"], "spin", "grain", "frame", "block", "斜线、圆、红黑");
  S("ge-op", "视错觉", "geo", "mono", ["mosaic", "rings"], "pulse", "none", "none", "plain", "马赛克与圆环的错觉");
  S("ge-tri", "三角", "geo", "violet", ["shards", "rings"], "spin", "grain", "vignette", "plain", "三角形阵列");
  S("ge-spiral", "螺旋", "geo", "sand", ["rings", "dots"], "orbit", "none", "vignette", "glow", "黄金螺旋");
  S("ge-check", "棋盘", "geo", "mono", ["blocks", "steps"], "wipe", "none", "frame", "block", "棋盘格递进");
  S("ge-arc", "弧", "geo", "teal", ["arcs", "arcs"], "sway", "grain", "vignette", "glow", "多层圆弧嵌套");
  S("ge-mono", "单色几何", "geo", "ice", ["blocks", "lines"], "drift", "grain", "frame", "plain", "一种颜色的几何拼图");
  S("ge-fold", "折叠", "geo", "paper", ["shards", "steps"], "sway", "grain", "frame", "plain", "折纸的明暗面");
  S("ge-grid", "网格系统", "geo", "steel", ["grid", "dots"], "drift", "dots", "frame", "spaced", "模块化网格排版");
  S("ge-halftone", "网点", "geo", "mono", ["halftone", "burst"], "pulse", "halftone", "vignette", "block", "网点构成的渐变");

  /* 赛博 · 12 */
  S("cy-neon", "霓虹", "cyber", "neon", ["columns", "burst"], "pulse", "scanlines", "vignette", "glow", "霓虹灯管与声柱");
  S("cy-data", "数据流", "cyber", "cyan", ["strips", "columns"], "fall", "scanlines", "vignette", "mono", "数据条与频谱柱");
  S("cy-glitch", "故障", "cyber", "candy", ["scan", "shards"], "wipe", "noise", "bars", "chrome", "RGB 错位与撕裂");
  S("cy-holo", "全息", "cyber", "ice", ["ribbons", "rings"], "flow", "scanlines", "frame", "chrome", "全息投影的干涉色");
  S("cy-matrix", "矩阵", "cyber", "forest", ["lines", "none"], "fall", "scanlines", "vignette", "mono", "绿色代码雨");
  S("cy-laser", "激光", "cyber", "neon", ["prism", "halo"], "spin", "grain", "vignette", "glow", "棱镜折射与光环");
  S("cy-dark", "暗网", "cyber", "ink", ["grid", "cracks"], "drift", "noise", "vignette", "mono", "黑暗中的数据网格");
  S("cy-city", "夜城", "cyber", "night", ["mountains", "dots"], "drift", "grain", "vignette", "glow", "午夜城市的灯火");
  S("cy-scan", "扫描线", "cyber", "teal", ["scan", "grid"], "wipe", "scanlines", "frame", "mono", "扫描线扫过网格");
  S("cy-pixel", "像素城", "cyber", "violet", ["blocks", "grid"], "pulse", "dots", "frame", "block", "等距像素城市");
  S("cy-wire", "线框", "cyber", "ice", ["grid", "rings"], "orbit", "scanlines", "none", "mono", "线框球与透视网格");
  S("cy-signal", "信号", "cyber", "cyan", ["columns", "scan"], "pulse", "noise", "frame", "mono", "示波器频谱柱");

  /* 手绘 · 12 */
  S("ha-pencil", "铅笔", "handmade", "mono", ["cracks", "lines"], "drift", "grain", "frame", "plain", "铅笔素描的排线");
  S("ha-crayon", "蜡笔", "handmade", "candy", ["lines", "dots"], "sway", "grain", "frame", "block", "蜡笔涂抹的颗粒");
  S("ha-water", "水彩", "handmade", "ice", ["orbs", "smoke"], "flow", "grain", "frame", "outline", "水彩晕染的边界");
  S("ha-marker", "马克笔", "handmade", "lime", ["blocks", "lines"], "wipe", "grain", "frame", "block", "马克笔高亮色块");
  S("ha-comic", "漫画", "handmade", "mono", ["burst", "halftone"], "pulse", "halftone", "frame", "block", "漫画分格与速度线");
  S("ha-graffiti", "涂鸦", "handmade", "neon", ["ribbons", "burst"], "spin", "grain", "vignette", "block", "街头涂鸦喷漆");
  S("ha-collage", "拼贴", "handmade", "sand", ["shards", "dots"], "drift", "grain", "frame", "block", "杂志剪贴拼贴");
  S("ha-stamp", "印章", "handmade", "crimson", ["arcs", "none"], "pulse", "grain", "corners", "block", "红色印章与落款");
  S("ha-notebook", "手账", "handmade", "paper", ["grid", "lines"], "drift", "grain", "frame", "plain", "横线本与便签");
  S("ha-charcoal", "炭笔", "handmade", "ink", ["smoke", "cracks"], "flow", "grain", "vignette", "plain", "炭笔的粗粝质感");
  S("ha-doodle", "简笔画", "handmade", "paper", ["dots", "lines"], "sway", "none", "frame", "plain", "随手画的小画");
  S("ha-scratch", "刮画", "handmade", "ink", ["cracks", "burst"], "pulse", "grain", "vignette", "glow", "刮开黑色露出金色");

  /* 电影 · 10 */
  S("fi-noir", "黑白电影", "film", "mono", ["lines", "smoke"], "drift", "grain", "bars", "plain", "高对比黑白与烟");
  S("fi-film", "胶片", "film", "copper", ["dots", "scan"], "wipe", "grain", "bars", "plain", "胶片颗粒与漏光");
  S("fi-wide", "宽银幕", "film", "steel", ["mountains", "smoke"], "drift", "grain", "bars", "glow", "超宽画幅的地平线");
  S("fi-dof", "浅景深", "film", "rose", ["orbs", "halo"], "flow", "grain", "vignette", "glow", "焦外光斑");
  S("fi-backlight", "逆光", "film", "sunset", ["burst", "smoke"], "rise", "grain", "vignette", "glow", "逆光下的剪影");
  S("fi-fog", "雾中", "film", "steel", ["smoke", "strands"], "flow", "noise", "bars", "plain", "雾里看不清的人影");
  S("fi-slow", "慢镜", "film", "night", ["rings", "dots"], "orbit", "grain", "vignette", "glow", "慢动作的光点");
  S("fi-studio", "影棚", "film", "mono", ["lines", "arcs"], "sway", "grain", "vignette", "chrome", "柔光箱打出的光");
  S("fi-vignette", "暗角", "film", "ink", ["orbs", "none"], "flow", "grain", "vignette", "plain", "中心亮四周暗");
  S("fi-subtitle", "字幕", "film", "night", ["none", "lines"], "pulse", "grain", "bars", "block", "极简字幕画面");

  /* 流行 · 10 */
  S("po-big", "大字报", "pop", "crimson", ["blocks", "burst"], "pulse", "halftone", "frame", "block", "巨大的字与撞色底");
  S("po-candy", "糖果", "pop", "candy", ["orbs", "dots"], "pulse", "grain", "vignette", "chrome", "糖果色的圆与光");
  S("po-balloon", "气球", "pop", "rose", ["bubbles", "dots"], "rise", "grain", "vignette", "glow", "上升的气球");
  S("po-confetti", "彩纸", "pop", "sunset", ["shards", "petals"], "fall", "grain", "vignette", "block", "飘落的彩纸");
  S("po-sticker", "贴纸", "pop", "lime", ["shards", "bloom"], "spin", "dots", "frame", "block", "贴纸与花瓣拼贴");
  S("po-emoji", "表情", "pop", "mono", ["orbs", "dots"], "pulse", "halftone", "frame", "mono", "大量圆脸表情的构图");
  S("po-neon-sign", "霓虹字", "pop", "neon", ["lines", "burst"], "pulse", "scanlines", "vignette", "glow", "发光字招牌");
  S("po-boom", "爆炸", "pop", "ember", ["burst", "shards"], "pulse", "halftone", "frame", "block", "漫画式爆炸");
  S("po-wave", "音浪", "pop", "cyan", ["radialBars", "bloom"], "flow", "grain", "vignette", "chrome", "环形频谱与花瓣");
  S("po-groovy", "迷幻", "pop", "retro", ["ribbons", "rings"], "spin", "noise", "frame", "chrome", "60 年代迷幻漩涡");

  /* ---------- Folia 灵感：致敬其主题气质，代码为独立实现 ---------- */

  S("fo-fume", "浮名", "folia", "steel", ["smoke", "strands"], "flow", "grain", "vignette", "plain", "烟雾里若隐若现的名字");
  S("fo-lumi", "流光", "folia", "ice", ["lightBands", "ribbons"], "flow", "grain", "vignette", "glow", "流动的光带与丝线");
  S("fo-cad", "心象", "folia", "violet", ["vortex", "radialBars"], "spin", "none", "vignette", "chrome", "心象的旋涡与频谱");
  S("fo-pat", "云阶", "folia", "sand", ["dunes", "steps"], "drift", "grain", "frame", "plain", "层叠云阶与台阶");
  S("fo-cappella", "群唱", "folia", "teal", ["choir", "halo"], "pulse", "grain", "vignette", "chrome", "多声部叠加的声浪");
  S("fo-tilt", "倾诉", "folia", "rose", ["strips", "strands"], "sway", "grain", "vignette", "plain", "倾斜的独白与丝线");
  S("fo-diorama", "镜台", "folia", "copper", ["reflection", "halo"], "drift", "grain", "frame", "outline", "镜像舞台与微光");
  S("fo-pendolo", "时计", "folia", "mono", ["pendulum", "rings"], "sway", "grain", "vignette", "mono", "摆锤、圆环与时间");
  S("fo-monet", "莫奈", "folia", "teal", ["lightBands", "ribbons"], "flow", "grain", "vignette", "glow", "竖向歌词轨道与水彩光斑");
  S("fo-sonnet", "十四行", "folia", "sand", ["mosaic", "strips"], "drift", "grain", "frame", "plain", "杂志排版与细密纸纹");
  S("fo-tempera", "蛋彩", "folia", "gold", ["mosaic", "columns"], "sway", "hatch", "frame", "block", "色块、网线与反白字");
  S("fo-claddagh", "克拉达", "folia", "forest", ["halo", "rings"], "spin", "none", "vignette", "glow", "环形字符与克拉达花纹");

  /* ---------- Folia 还原：绑定上游 visualizer 模式 ---------- */

  var FOLIA_MODES = {
    "fo-fume": "fume",
    "fo-lumi": "lumiere",
    "fo-cad": "cadenza",
    "fo-pat": "partita",
    "fo-cappella": "cappella",
    "fo-tilt": "tilt",
    "fo-diorama": "diorama",
    "fo-pendolo": "pendolo",
    "fo-monet": "monet",
    "fo-sonnet": "sonnet",
    "fo-tempera": "tempera",
    "fo-claddagh": "claddagh"
  };

  list.forEach(function (s) {
    if (FOLIA_MODES[s.id]) s.folia = FOLIA_MODES[s.id];
  });

  /* ---------- 精选主题（参考 Folia：每套主题有独立气质和命名） ---------- */

  var FEATURED = [
    "or-ink",
    "cy-neon",
    "na-sea",
    "fi-film",
    "abs-liquid",
    "ge-bauhaus",
    "re-vapor",
    "po-candy",
    "na-aurora",
    "min-sun"
  ];

  /* ---------- 精简：去掉近似重复，每类保留最有辨识度的几套 ---------- */

  var KEEP = [
    /* 极简 */
    "min-white", "min-line", "min-dot", "min-frame", "min-sun", "min-scan",
    /* 抽象 */
    "abs-liquid", "abs-shard", "abs-wave", "abs-ring", "abs-ribbon", "abs-burst",
    /* 东方 */
    "or-ink", "or-jade", "or-dunhuang", "or-shadow", "or-cut", "or-bamboo",
    /* 复古 */
    "re-vapor", "re-crt", "re-y2k", "re-vhs", "re-pixel", "re-pop",
    /* 自然 */
    "na-sea", "na-rain", "na-snow", "na-fog", "na-fire", "na-aurora",
    /* 几何 */
    "ge-bauhaus", "ge-swiss", "ge-construct", "ge-op", "ge-spiral", "ge-halftone",
    /* 赛博 */
    "cy-neon", "cy-data", "cy-glitch", "cy-holo", "cy-matrix", "cy-laser",
    /* 手绘 */
    "ha-pencil", "ha-crayon", "ha-water", "ha-comic", "ha-graffiti", "ha-notebook",
    /* 电影 */
    "fi-noir", "fi-film", "fi-wide", "fi-dof", "fi-backlight", "fi-fog",
    /* 流行 */
    "po-big", "po-candy", "po-confetti", "po-sticker", "po-neon-sign", "po-boom",
    /* Folia 灵感 */
    "fo-fume", "fo-lumi", "fo-cad", "fo-pat", "fo-cappella", "fo-tilt", "fo-diorama", "fo-pendolo",
    "fo-monet", "fo-sonnet", "fo-tempera", "fo-claddagh"
  ];

  (function prune() {
    var keep = {};
    KEEP.forEach(function (id) {
      keep[id] = true;
    });
    FEATURED.forEach(function (id) {
      keep[id] = true;
    });

    var filtered = list.filter(function (s) {
      return keep[s.id];
    });

    /* 保持定义顺序，同时去重 */
    var seen = {};
    list = filtered.filter(function (s) {
      if (seen[s.id]) return false;
      seen[s.id] = true;
      return true;
    });
  })();

  /* ---------- 查询 ---------- */

  var byId = {};
  list.forEach(function (s) {
    byId[s.id] = s;
  });

  function get(id) {
    return byId[id] || null;
  }

  function palette(id) {
    var def = get(id);
    var p = (def && PALETTES[def.palette]) || PALETTES.night;
    return p;
  }

  function count(cat) {
    if (!cat) return list.length;
    return list.filter(function (s) {
      return s.category === cat;
    }).length;
  }

  NS.styleLibrary = {
    PALETTES: PALETTES,
    CATEGORIES: CATEGORIES,
    list: list,
    FEATURED: FEATURED,
    get: get,
    palette: palette,
    count: count,
    /* 「逐字生成」不是参数化风格，由 alan-engine 渲染 */
    STORY_ID: "story"
  };
})(window.CodeMV);
