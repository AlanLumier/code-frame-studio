/* 旧 CodeMV 风格精简 + 新增差异化主题。
   Lemo 59 种参考风格移到 AI 面板，不再混在画面风格里。 */
(function (NS) {
  if (!NS.styleLibrary || !NS.styleLibrary.list) return;

  var EXTRA = [
    { id: "new-aurora", name: "极光帷幕", palette: "aurora", forms: ["ribbons", "halo"], motion: "flow", texture: "grain", overlay: "vignette", lyric: "glow", desc: "极光像帷幕一样垂落，色带缓慢流动", dark: true },
    { id: "new-ink", name: "水墨远山", palette: "paper", forms: ["waves", "arcs"], motion: "sway", texture: "grain", overlay: "frame", lyric: "plain", desc: "宣纸上的远山与留白，墨色缓慢晕开", dark: false },
    { id: "new-crt", name: "CRT 终端", palette: "mono", forms: ["grid", "scan"], motion: "wipe", texture: "scanlines", overlay: "bars", lyric: "mono", desc: "老式显像管扫描线、字符网格与横向撕裂", dark: true },
    { id: "new-brutal", name: "粗野海报", palette: "rust", forms: ["blocks", "steps"], motion: "wipe", texture: "halftone", overlay: "corners", lyric: "block", desc: "大色块、粗黑边、错位的海报排版", dark: true },
    { id: "new-prism", name: "玻璃棱镜", palette: "ice", forms: ["shards", "arcs"], motion: "spin", texture: "grain", overlay: "frame", lyric: "chrome", desc: "折射的玻璃碎片与彩虹色散", dark: true },
    { id: "new-dune", name: "沙丘蜃景", palette: "sand", forms: ["waves", "orbs"], motion: "flow", texture: "grain", overlay: "vignette", lyric: "glow", desc: "沙丘起伏、热浪扭曲与远处蜃景", dark: true },
    { id: "new-abyss", name: "深海回声", palette: "teal", forms: ["rings", "waves"], motion: "orbit", texture: "noise", overlay: "vignette", lyric: "glow", desc: "深海的同心涟漪与缓慢下潜的光", dark: true },
    { id: "new-raincity", name: "雨夜城市", palette: "steel", forms: ["blocks", "lines"], motion: "fall", texture: "scanlines", overlay: "vignette", lyric: "plain", desc: "楼群剪影、雨线、湿地反光与车灯", dark: true },
    { id: "new-sunset", name: "落日脉冲", palette: "sunset", forms: ["orbs", "burst"], motion: "pulse", texture: "none", overlay: "frame", lyric: "glow", desc: "巨大落日与放射光，随低频呼吸", dark: true },
    { id: "new-bauhaus", name: "包豪斯构成", palette: "retro", forms: ["blocks", "grid"], motion: "pulse", texture: "none", overlay: "frame", lyric: "block", desc: "三原色几何、网格与构成主义错位", dark: true }
  ];

  var existing = {};
  NS.styleLibrary.list.forEach(function (s) { existing[s.id] = true; });
  EXTRA.forEach(function (s) {
    if (!existing[s.id]) NS.styleLibrary.list.push(s);
  });

  var featured = NS.styleLibrary.FEATURED || [];
  NS.styleLibrary.list = NS.styleLibrary.list.filter(function (s) {
    return featured.indexOf(s.id) >= 0 || s.id.indexOf("new-") === 0;
  });
  NS.styleLibrary.CATEGORIES.length = 0;
  NS.styleLibrary.CATEGORIES.push(
    { id: "scene", name: "逐字生成", desc: "按歌词内容实时渲染（内置引擎）" },
    { id: "new", name: "新增主题", desc: "10 套差异化画面，不是换色" },
    { id: "featured", name: "精选主题", desc: "10 套最有辨识度的旧主题" }
  );

  var originalGet = NS.styleLibrary.get;
  NS.styleLibrary.get = function (id) {
    var found = originalGet(id);
    if (found) return found;
    for (var i = 0; i < NS.styleLibrary.list.length; i++) {
      if (NS.styleLibrary.list[i].id === id) return NS.styleLibrary.list[i];
    }
    return null;
  };
  var originalPalette = NS.styleLibrary.palette;
  NS.styleLibrary.palette = function (id) {
    var def = NS.styleLibrary.get(id);
    if (def && NS.styleLibrary.PALETTES[def.palette]) return NS.styleLibrary.PALETTES[def.palette];
    return originalPalette(id);
  };
})(window.CodeMV);
