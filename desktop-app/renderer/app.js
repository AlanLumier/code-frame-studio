/* codemv 0.8 — 旧 codemV 布局 + 本地 Canvas 歌词舞台 + 网易云歌词 + 59 风格库 */

const $ = (id) => document.getElementById(id);
const audio = $("audio");
const canvas = $("stageCanvas");
const ctx = canvas.getContext("2d");

const DEFAULT_SETTINGS = {
  theme: "dark",
  accent: "#ffb35c",
  size: 100,
  pos: "bottom",
  mode: "fume",
  preset: "center",
  offset: 0,
  style: "",
};
const PRESETS = [
  { id: "center", name: "居中", desc: "经典居中 / 白字", font: '"PingFang SC","Microsoft YaHei",sans-serif', weight: 700, color: "#ffffff", glow: 0, pos: "center" },
  { id: "bottom", name: "底部", desc: "播放器底部字幕", font: '"PingFang SC","Microsoft YaHei",sans-serif', weight: 600, color: "#ffffff", glow: 10, pos: "bottom" },
  { id: "big", name: "大字", desc: "海报感大字", font: '"Arial Black","Microsoft YaHei",sans-serif', weight: 800, color: "#ffffff", glow: 0, pos: "center" },
  { id: "minimal", name: "极简", desc: "细字 / 大留白", font: '"Segoe UI","Microsoft YaHei",sans-serif', weight: 300, color: "rgba(255,255,255,.86)", glow: 0, pos: "bottom" },
  { id: "kala", name: "卡拉OK", desc: "逐字高亮", font: '"PingFang SC","Microsoft YaHei",sans-serif', weight: 700, color: "#ffffff", glow: 16, pos: "bottom" },
  { id: "neon", name: "霓虹", desc: "青色发光", font: '"PingFang SC","Microsoft YaHei",sans-serif', weight: 700, color: "#6ee7ff", glow: 30, pos: "center" },
  { id: "sunset", name: "日落", desc: "暖橙 / 柔光", font: '"PingFang SC","Microsoft YaHei",sans-serif', weight: 700, color: "#ffb35c", glow: 26, pos: "center" },
  { id: "serif", name: "宋体", desc: "文学感衬线", font: '"Songti SC","SimSun",serif', weight: 600, color: "#f6f1e7", glow: 6, pos: "center" },
  { id: "hand", name: "手写", desc: "楷体 / 日记感", font: '"Kaiti SC","KaiTi",cursive', weight: 500, color: "#f4e6c6", glow: 4, pos: "bottom" },
  { id: "mono", name: "等宽", desc: "终端 / 代码感", font: '"Cascadia Code",Consolas,monospace', weight: 500, color: "#d7ffe9", glow: 12, pos: "center" },
  { id: "outline", name: "描边", desc: "空心字", font: '"PingFang SC","Microsoft YaHei",sans-serif', weight: 800, color: "transparent", glow: 0, stroke: true, pos: "center" },
  { id: "left", name: "左对齐", desc: "纪录片字幕", font: '"PingFang SC","Microsoft YaHei",sans-serif', weight: 600, color: "#ffffff", glow: 0, align: "left", pos: "bottom" },
  { id: "double", name: "双行", desc: "当前句 + 下一句", font: '"PingFang SC","Microsoft YaHei",sans-serif', weight: 600, color: "#ffffff", glow: 8, pos: "center" },
  { id: "retro", name: "复古", desc: "胶片颗粒感", font: '"Songti SC","SimSun",serif', weight: 700, color: "#ffe0a3", glow: 18, pos: "bottom" },
  { id: "quiet", name: "安静", desc: "低透明度", font: '"PingFang SC","Microsoft YaHei",sans-serif', weight: 400, color: "rgba(255,255,255,.55)", glow: 0, pos: "bottom" },
  { id: "poster", name: "海报", desc: "超大 / 居中", font: '"PingFang SC","Microsoft YaHei",sans-serif', weight: 900, color: "#ffffff", glow: 0, size: 1.45, pos: "center" },
];
const STYLE_COLORS = {
  "剪辑与纪实": "#e8553a", "实证影像": "#4aa3a2", "手绘与绘画": "#e0a458",
  "东方传统": "#b4463c", "印刷与版画": "#d05a7a", "图形与排版": "#5b8def",
  "信息与发布": "#3fa7d6", "卡通与动画": "#f0b429", "游戏": "#7ac74f",
  "电影与时代": "#a78bfa", "材质与 3D": "#ff8a65",
};

const state = {
  lines: [],
  duration: 0,
  title: "",
  artist: "",
  audioFile: null,
  audioPath: "",
  lrcText: "",
  tab: "material",
  styles: [],
  category: "全部",
  styleQuery: "",
  selectedStyle: null,
  settings: loadSettings(),
  activeIndex: -1,
  stageW: 960,
  stageH: 540,
  lrcMeta: { title: "", artist: "" },
  recording: false,
};

/* ------------------------------------------------------------------ utils */
function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("codemv.settings") || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function saveSettings() {
  localStorage.setItem("codemv.settings", JSON.stringify(state.settings));
}
function fmt(sec) {
  sec = Math.max(0, Number(sec) || 0);
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}
let toastTimer = null;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}
function semver(v) {
  return String(v || "").replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
}
function newer(a, b) {
  const x = semver(a), y = semver(b);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

/* ------------------------------------------------------------------ LRC */
function parseLRC(text) {
  const out = [];
  const meta = { title: "", artist: "", offset: 0 };
  const stamp = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    const tag = line.match(/^\[(ti|ar|al|offset):\s*(.+?)\]\s*$/i);
    if (tag) {
      const key = tag[1].toLowerCase();
      if (key === "ti") meta.title = tag[2].trim();
      else if (key === "ar") meta.artist = tag[2].trim();
      else if (key === "offset") meta.offset = parseInt(tag[2], 10) || 0;
      continue;
    }
    if (!line || /^\[(ar|ti|al|by|offset|re|ve):/i.test(line)) continue;
    const stamps = [...line.matchAll(stamp)];
    if (!stamps.length) continue;
    const content = line.replace(stamp, "").trim();
    if (!content || /^(作词|作曲|编曲|词|曲)\s*[:：]/.test(content) || /^\S+\s+-\s+\S+$/.test(content)) continue;
    for (const m of stamps) {
      const frac = m[3] ? parseInt(m[3].padEnd(3, "0").slice(0, 3), 10) / 1000 : 0;
      out.push({ base: parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + frac, text: content });
    }
  }
  out.sort((a, b) => a.base - b.base);
  state.lrcMeta = meta;
  return out;
}

function applyOffset(lines) {
  const offset = Number(state.settings.offset) || 0;
  const result = lines.map((line) => ({ ...line, start: Math.max(0, (line.base ?? line.start) + offset / 1000) }));
  result.sort((a, b) => a.start - b.start);
  for (let i = 0; i < result.length; i += 1) {
    result[i].end = i + 1 < result.length ? result[i + 1].start : state.duration || 250;
  }
  return result;
}

function buildLRC() {
  return state.lines.map((line) => `[${String(Math.floor(line.start / 60)).padStart(2, "0")}:${String(Math.floor(line.start % 60)).padStart(2, "0")}.${String(Math.round((line.start % 1) * 100)).padStart(2, "0")}]${line.text}`).join("\n");
}

function setLyrics(lines, meta = {}) {
  state.lines = applyOffset(lines);
  if (meta.title) state.title = meta.title;
  if (meta.artist) state.artist = meta.artist;
  if (meta.duration) state.duration = meta.duration;
  renderLyrics();
  updateMeta();
  $("btnExportLyrics").disabled = !state.lines.length;
  $("welcome").classList.toggle("hide", !!(state.lines.length || state.audioFile));
  draw(true);
}

function renderLyrics() {
  const list = $("lyricList");
  list.innerHTML = "";
  state.lines.forEach((line) => {
    const item = document.createElement("div");
    item.className = "lyric-item";
    const time = document.createElement("span");
    time.className = "t";
    time.textContent = fmt(line.start);
    const text = document.createElement("span");
    text.className = "x";
    text.textContent = line.text;
    item.append(time, text);
    item.addEventListener("click", () => seekTo(line.start));
    list.appendChild(item);
  });
  $("lineCount").textContent = `${state.lines.length} 句`;
  $("lyricSummary").textContent = state.lines.length
    ? `已加载 ${state.lines.length} 句，点击「歌词」标签查看。`
    : "还没有导入歌词。";
}

function updateMeta() {
  const title = state.title || "未导入音乐";
  $("songTitle").textContent = title;
  $("cardTitle").textContent = title;
  $("cardArtist").textContent = state.artist || "支持 MP3 / WAV / FLAC + LRC";
  const meta = state.audioFile
    ? `${fmt(state.duration)} · ${state.lines.length} 句歌词`
    : state.lines.length
      ? `${state.lines.length} 句歌词 · 未导入音频`
      : "导入后自动对齐歌词";
  $("songMeta").textContent = state.audioFile ? `${state.artist || "本地音频"} · ${meta}` : meta;
  $("cardMeta").textContent = meta;
  $("timeTotal").textContent = fmt(state.duration);
}

/* ------------------------------------------------------------------ stage */
function resizeCanvas() {
  const frame = canvas.parentElement;
  const rect = frame.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  state.stageW = Math.max(320, rect.width);
  state.stageH = Math.max(180, rect.height);
  canvas.width = Math.round(state.stageW * dpr);
  canvas.height = Math.round(state.stageH * dpr);
  canvas.style.width = `${state.stageW}px`;
  canvas.style.height = `${state.stageH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function palette() {
  const accent = state.settings.accent || "#e8553a";
  const base = state.selectedStyle ? STYLE_COLORS[state.selectedStyle.cat] || accent : accent;
  return { accent, base };
}

function activeLine(t) {
  let index = -1;
  for (let i = 0; i < state.lines.length; i += 1) {
    if (state.lines[i].start <= t + 0.02) index = i;
    else break;
  }
  return index;
}

function draw(force = false) {
  const { accent, base } = palette();
  const w = state.stageW;
  const h = state.stageH;
  const t = audio.currentTime || 0;
  const index = activeLine(t);
  if (index !== state.activeIndex || force) {
    state.activeIndex = index;
    const items = $("lyricList").children;
    for (let i = 0; i < items.length; i += 1) items[i].classList.toggle("active", i === index);
    if (index >= 0 && state.tab === "lyrics" && items[index]) items[index].scrollIntoView({ block: "center", behavior: "smooth" });
  }

  // background
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#070b14");
  bg.addColorStop(0.55, "#0d1524");
  bg.addColorStop(1, "#050811");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const anim = state.settings.mode === "still" ? 0 : 1;
  const time = performance.now() / 1000;
  for (let i = 0; i < 3; i += 1) {
    const x = w * (0.22 + i * 0.28) + Math.sin(time * 0.22 + i) * 40 * anim;
    const y = h * (0.4 + 0.16 * Math.sin(time * 0.18 + i * 2)) * anim;
    const radius = Math.max(w, h) * (0.34 + i * 0.08);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `${base}${i === 1 ? "2e" : "18"}`);
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  }

  if (!state.lines.length) return;

  const line = state.lines[Math.max(0, index)];
  if (!line) return;
  const preset = PRESETS.find((p) => p.id === state.settings.preset) || PRESETS[0];
  const scale = (state.settings.size / 100) * (preset.size || 1);
  const fontSize = Math.round(Math.min(w, h) * 0.062 * scale);
  const posKey = state.settings.pos || preset.pos || "bottom";
  const posFactor = posKey === "top" ? 0.32 : posKey === "center" ? 0.5 : 0.72;
  const cy = h * posFactor;
  const align = preset.align || "center";
  const tx = align === "left" ? w * 0.08 : w / 2;
  const textAlign = align === "left" ? "left" : "center";
  const fontOf = (weight, size) => `${weight} ${size}px ${preset.font}`;

  ctx.save();
  ctx.textAlign = textAlign;
  ctx.textBaseline = "middle";
  ctx.font = fontOf(500, Math.round(fontSize * 0.42));
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  const prev = index > 0 ? state.lines[index - 1].text : "";
  const next = index + 1 < state.lines.length ? state.lines[index + 1].text : "";
  if (prev) ctx.fillText(prev, tx, cy - fontSize * 1.35);
  if (next) ctx.fillText(next, tx, cy + fontSize * 1.35);

  ctx.font = fontOf(preset.weight, fontSize);
  const maxWidth = w * 0.84;
  const text = line.text;
  const textWidth = Math.min(ctx.measureText(text).width, maxWidth);
  if (preset.glow > 0) {
    ctx.shadowColor = preset.color && preset.color !== "transparent" ? preset.color : base;
    ctx.shadowBlur = preset.glow;
  }
  if (preset.stroke) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(2, fontSize * 0.035);
    ctx.strokeText(text, tx, cy);
  } else {
    ctx.fillStyle = preset.color || "rgba(255,255,255,0.94)";
    ctx.fillText(text, tx, cy);
  }
  // progress highlight
  const duration = Math.max(0.4, line.end - line.start);
  const progress = Math.max(0, Math.min(1, (t - line.start) / duration));
  if (progress > 0) {
    const clipX = align === "left" ? tx : tx - textWidth / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX, cy - fontSize, textWidth * progress, fontSize * 2);
    ctx.clip();
    ctx.shadowBlur = 0;
    if (preset.stroke) {
      ctx.strokeStyle = accent;
      ctx.strokeText(text, tx, cy);
    } else {
      ctx.fillStyle = accent;
      ctx.fillText(text, tx, cy);
    }
    ctx.restore();
  }
  ctx.restore();

  // title / artist
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = `600 ${Math.round(fontSize * 0.28)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillText(`${state.title || ""}${state.artist ? " · " + state.artist : ""}`, w * 0.045, h * 0.06);
  ctx.restore();
}

let lastFrame = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  if (document.hidden) return;
  const interval = audio.paused ? 120 : 33;
  if (ts - lastFrame < interval) return;
  lastFrame = ts;
  draw();
}

/* ------------------------------------------------------------------ transport */
function setPlayIcon(playing) {
  $("playIcon").innerHTML = playing
    ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z" />'
    : '<path d="M8 5v14l11-7z" />';
}
function togglePlay() {
  if (!state.audioFile) return toast("先导入音乐");
  if (audio.paused) audio.play().catch(() => toast("无法播放音频"));
  else audio.pause();
}
function seekTo(t) {
  if (!state.audioFile) return;
  audio.currentTime = Math.max(0, Math.min(t, state.duration || audio.duration || 0));
  draw(true);
}
audio.addEventListener("loadedmetadata", () => {
  state.duration = audio.duration || state.duration;
  $("timeTotal").textContent = fmt(state.duration);
  if (state.lines.length) state.lines = applyOffset(state.lines);
  updateMeta();
  draw(true);
});
audio.addEventListener("timeupdate", () => {
  const t = audio.currentTime;
  $("timeNow").textContent = fmt(t);
  $("seek").value = String(Math.round((t / (state.duration || 1)) * 1000));
});
audio.addEventListener("play", () => {
  setPlayIcon(true);
  $("status").textContent = "正在播放 · 本地歌词舞台";
});
audio.addEventListener("pause", () => {
  setPlayIcon(false);
  $("status").textContent = state.lines.length ? "已暂停" : "等待导入素材";
});
audio.addEventListener("ended", () => setPlayIcon(false));
$("seek").addEventListener("input", (event) => seekTo((Number(event.target.value) / 1000) * (state.duration || 1)));
$("btnPlay").addEventListener("click", togglePlay);
document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, select, textarea")) return;
  if (event.code === "Space") { event.preventDefault(); togglePlay(); }
  if (event.code === "ArrowRight") seekTo(audio.currentTime + 5);
  if (event.code === "ArrowLeft") seekTo(audio.currentTime - 5);
});

/* ------------------------------------------------------------------ tabs */
function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".rail-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  document.querySelectorAll(".panel-page").forEach((page) => page.classList.toggle("active", page.dataset.page === tab));
  if (tab === "lyrics" && state.activeIndex >= 0) {
    const items = $("lyricList").children;
    if (items[state.activeIndex]) items[state.activeIndex].scrollIntoView({ block: "center" });
  }
}
document.querySelectorAll(".rail-btn").forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));
$("btnSettings").addEventListener("click", () => setTab("settings"));

/* ------------------------------------------------------------------ files */
$("btnAudio").addEventListener("click", () => $("fileAudio").click());
$("btnLyrics").addEventListener("click", () => $("fileLyrics").click());
$("fileAudio").addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  state.audioFile = file;
  state.audioPath = (window.codemv && window.codemv.getPathForFile && window.codemv.getPathForFile(file)) || file.path || "";
  state.title = file.name.replace(/\.[^.]+$/, "");
  state.artist = "本地音频";
  audio.src = URL.createObjectURL(file);
  audio.load();
  $("btnExportAudio").disabled = false;
  $("btnExportVideo").disabled = false;
  $("srcBadge").textContent = "本地音频";
  $("welcome").classList.add("hide");
  updateMeta();
  setTab("lyrics");
  toast("音频已导入");
  event.target.value = "";
});
$("fileLyrics").addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const text = await file.text();
  state.lrcText = text;
  const lines = parseLRC(text);
  if (!lines.length) toast("没有解析到歌词，请确认是 LRC 文件");
  else {
    const meta = state.lrcMeta || {};
    setLyrics(lines, { title: meta.title || state.title, artist: meta.artist || state.artist });
    $("srcBadge").textContent = "本地 LRC";
    setTab("lyrics");
    toast(`歌词已导入（${lines.length} 句）`);
  }
  event.target.value = "";
});
$("btnClear").addEventListener("click", () => {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  state.audioFile = null;
  state.audioPath = "";
  state.lines = [];
  state.lrcText = "";
  state.title = "";
  state.artist = "";
  state.duration = 0;
  state.activeIndex = -1;
  $("welcome").classList.remove("hide");
  $("btnExportAudio").disabled = true;
  $("btnExportLyrics").disabled = true;
  $("btnExportVideo").disabled = true;
  $("timeNow").textContent = "00:00";
  $("timeTotal").textContent = "00:00";
  $("seek").value = "0";
  renderLyrics();
  updateMeta();
  draw(true);
  toast("已清空");
});

/* ------------------------------------------------------------------ export */
async function exportAudio() {
  if (!state.audioFile) return toast("先导入音乐");
  if (!window.codemv || !window.codemv.saveFile) return toast("导出需要在桌面应用中使用");
  if (!state.audioPath) return toast("这个音频没有本地路径，暂时无法导出");
  const ext = (state.audioPath.split(".").pop() || "mp3").toLowerCase();
  const file = await window.codemv.saveFile({
    defaultName: `${state.title || "codemv"}.${ext}`,
    filters: [{ name: "音频", extensions: [ext] }],
    sourcePath: state.audioPath,
  });
  if (file) toast("音乐已导出");
}
async function exportLyrics() {
  if (!state.lines.length) return toast("还没有歌词");
  if (!window.codemv || !window.codemv.saveFile) return toast("导出需要在桌面应用中使用");
  const file = await window.codemv.saveFile({
    defaultName: `${state.title || "codemv"}.lrc`,
    filters: [{ name: "LRC 歌词", extensions: ["lrc"] }],
    text: state.lrcText || buildLRC(),
  });
  if (file) toast("歌词已导出");
}
$("btnExportAudio").addEventListener("click", exportAudio);
$("btnExportLyrics").addEventListener("click", exportLyrics);

/* ------------------------------------------------------------------ 导出视频 */
let recorder = null;
let recordChunks = [];
function stopRecording() {
  if (recorder && recorder.state !== "inactive") recorder.stop();
}
async function exportVideo() {
  if (!state.audioFile) return toast("先导入音乐");
  if (state.recording) return stopRecording();
  if (!window.codemv || !window.codemv.exportVideo) return toast("视频导出需要在桌面应用中使用");
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";
  try {
    recordChunks = [];
    const stream = canvas.captureStream(30);
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 });
    recorder.ondataavailable = (event) => { if (event.data && event.data.size) recordChunks.push(event.data); };
    recorder.onstop = async () => {
      state.recording = false;
      $("btnExportVideo").textContent = "导出视频";
      $("status").textContent = "正在封装视频…";
      audio.pause();
      try {
        const blob = new Blob(recordChunks, { type: mime });
        const data = await blob.arrayBuffer();
        const file = await window.codemv.exportVideo({
          data,
          audioPath: state.audioPath,
          title: state.title || "codemv",
        });
        if (file) toast("视频已导出：" + file);
        $("status").textContent = file ? "视频已导出" : "已取消导出";
      } catch (error) {
        toast("视频导出失败：" + error.message);
        $("status").textContent = "视频导出失败";
      }
    };
    state.recording = true;
    $("btnExportVideo").textContent = "停止并保存";
    $("status").textContent = "正在录制视频（实时）…";
    audio.currentTime = 0;
    audio.addEventListener("ended", stopRecording, { once: true });
    recorder.start(1000);
    await audio.play();
  } catch (error) {
    state.recording = false;
    $("btnExportVideo").textContent = "导出视频";
    toast("无法开始录制：" + error.message);
  }
}
$("btnExportVideo").addEventListener("click", exportVideo);

/* ------------------------------------------------------------------ NetEase */
async function searchNetease() {
  const query = $("nsInput").value.trim();
  if (!query) return toast("先输入歌名或歌手");
  if (!window.codemv || !window.codemv.neteaseSearch) {
    toast("网易云搜索在桌面版中可用");
    return;
  }
  const box = $("nsResults");
  box.innerHTML = '<p class="muted">搜索中…</p>';
  try {
    const songs = await window.codemv.neteaseSearch(query);
    box.innerHTML = "";
    if (!songs.length) {
      box.innerHTML = '<p class="muted">没有找到，换个关键词试试。</p>';
      return;
    }
    songs.forEach((song) => {
      const item = document.createElement("div");
      item.className = "ns-item";
      item.innerHTML = "<b></b><small></small>";
      item.querySelector("b").textContent = song.name;
      item.querySelector("small").textContent = `${song.artists} · ${song.album || "未知专辑"} · ${fmt(song.duration)}`;
      item.addEventListener("click", () => loadNeteaseLyric(song));
      box.appendChild(item);
    });
  } catch (error) {
    box.innerHTML = `<p class="muted">搜索失败：${error.message}</p>`;
  }
}
async function loadNeteaseLyric(song) {
  try {
    const data = await window.codemv.neteaseLyric(song.id);
    const lines = parseLRC(data.lrc);
    if (!lines.length) throw new Error("歌词解析为空");
    state.lrcText = data.lrc;
    setLyrics(lines, { title: song.name, artist: song.artists, duration: song.duration || state.duration });
    $("srcBadge").textContent = "网易云歌词";
    setTab("lyrics");
    toast(`已载入《${song.name}》歌词`);
  } catch (error) {
    toast(`歌词加载失败：${error.message}`);
  }
}
$("nsSearch").addEventListener("click", searchNetease);
$("nsInput").addEventListener("keydown", (event) => { if (event.key === "Enter") searchNetease(); });

/* ------------------------------------------------------------------ styles */
async function loadStyles() {
  try {
    const response = await fetch("/style-library/catalog.json");
    state.styles = await response.json();
    $("styleCount").textContent = `${state.styles.length} 种`;
    renderChips();
    renderStyles();
    if (state.settings.style) {
      const selected = state.styles.find((s) => s.slug === state.settings.style);
      if (selected) applyStyle(selected, false);
    }
  } catch (error) {
    $("styleGrid").innerHTML = `<p class="muted">风格库加载失败：${error.message}</p>`;
  }
}
function renderChips() {
  const cats = ["全部", ...new Set(state.styles.map((s) => s.cat))];
  const box = $("styleChips");
  box.innerHTML = "";
  cats.forEach((cat) => {
    const chip = document.createElement("button");
    chip.className = `chip${cat === state.category ? " active" : ""}`;
    chip.textContent = cat;
    chip.addEventListener("click", () => { state.category = cat; renderChips(); renderStyles(); });
    box.appendChild(chip);
  });
}
function renderStyles() {
  const grid = $("styleGrid");
  const query = state.styleQuery.trim().toLowerCase();
  const list = state.styles.filter((style) => {
    const inCat = state.category === "全部" || style.cat === state.category;
    const hay = `${style.cn} ${style.en} ${style.slug} ${style.cat}`.toLowerCase();
    return inCat && (!query || hay.includes(query));
  });
  grid.innerHTML = "";
  list.forEach((style) => {
    const card = document.createElement("div");
    card.className = `style-card${state.selectedStyle && style.slug === state.selectedStyle.slug ? " selected" : ""}`;
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = `/style-library/img/${style.slug}_0.jpg`;
    img.alt = style.cn;
    const body = document.createElement("div");
    body.className = "sc-body";
    body.innerHTML = "<b></b><small></small>";
    body.querySelector("b").textContent = style.cn;
    body.querySelector("small").textContent = `${style.en} · ${style.cat}`;
    card.append(img, body);
    card.addEventListener("click", () => applyStyle(style));
    grid.appendChild(card);
  });
  if (!list.length) grid.innerHTML = '<p class="muted">没有匹配的风格。</p>';
}
function applyStyle(style, notify = true) {
  state.selectedStyle = style;
  state.settings.style = style.slug;
  state.settings.accent = STYLE_COLORS[style.cat] || state.settings.accent;
  saveSettings();
  applySettings();
  renderStyles();
  $("styleFoot").textContent = `已应用「${style.cn}」· ${style.en} — ${style.uses || style.cat}`;
  draw(true);
  if (notify) toast(`已应用风格：${style.cn}`);
}
$("styleSearch").addEventListener("input", (event) => { state.styleQuery = event.target.value; renderStyles(); });

/* ------------------------------------------------------------------ settings */
function renderPresets() {
  const grid = $("presetGrid");
  if (!grid) return;
  grid.innerHTML = "";
  PRESETS.forEach((preset) => {
    const card = document.createElement("button");
    card.className = `preset-card${state.settings.preset === preset.id ? " active" : ""}`;
    card.innerHTML = "<b></b><span></span>";
    card.querySelector("b").textContent = preset.name;
    card.querySelector("span").textContent = preset.desc;
    card.addEventListener("click", () => {
      state.settings.preset = preset.id;
      saveSettings();
      renderPresets();
      draw(true);
      toast(`文字画布：${preset.name}`);
    });
    grid.appendChild(card);
  });
}

function applySettings() {
  document.body.dataset.theme = state.settings.theme;
  document.documentElement.style.setProperty("--accent", state.settings.accent);
  $("setTheme").value = state.settings.theme;
  $("setAccent").value = state.settings.accent;
  $("setSize").value = String(state.settings.size);
  $("setPos").value = state.settings.pos;
  $("setMode").value = state.settings.mode;
  $("setOffset").value = String(state.settings.offset || 0);
  draw(true);
}
function bindSettings() {
  $("setTheme").addEventListener("change", (event) => { state.settings.theme = event.target.value; saveSettings(); applySettings(); });
  $("setAccent").addEventListener("input", (event) => { state.settings.accent = event.target.value; saveSettings(); applySettings(); });
  $("setSize").addEventListener("input", (event) => { state.settings.size = Number(event.target.value); saveSettings(); draw(true); });
  $("setPos").addEventListener("change", (event) => { state.settings.pos = event.target.value; saveSettings(); draw(true); });
  $("setMode").addEventListener("change", (event) => { state.settings.mode = event.target.value; saveSettings(); draw(true); });
  $("setOffset").addEventListener("change", (event) => {
    state.settings.offset = Number(event.target.value) || 0;
    saveSettings();
    if (state.lines.length) {
      state.lines = applyOffset(state.lines);
      renderLyrics();
      updateMeta();
      draw(true);
    }
  });

  $("btnTheme").addEventListener("click", () => {
    state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
    saveSettings();
    applySettings();
    toast(state.settings.theme === "dark" ? "已切换深色主题" : "已切换浅色主题");
  });
  $("btnImmersive").addEventListener("click", () => {
    document.body.classList.toggle("immersive");
  });
  document.addEventListener("keydown", (event) => {
    if (event.code === "Escape") document.body.classList.remove("immersive");
  });

  $("btnUpdate").addEventListener("click", async () => {
    const status = $("updateStatus");
    const download = $("btnDownload");
    download.classList.add("hidden");
    status.textContent = "正在检查更新…";
    try {
      const info = await window.codemv.appInfo();
      $("versionBadge").textContent = `v${info.version}`;
      const result = await window.codemv.checkUpdate();
      if (result.latest && newer(result.latest, info.version)) {
        status.textContent = `发现新版本 v${result.latest}（当前 v${info.version}）`;
        download.classList.remove("hidden");
        download.onclick = () => window.codemv.openExternal(result.url);
      } else if (result.latest) {
        status.textContent = `已是最新（当前 v${info.version}，线上 v${result.latest}）`;
      } else {
        status.textContent = `已是最新（v${info.version}）`;
      }
    } catch (error) {
      status.textContent = `检查失败：${error.message}`;
    }
  });
  $("linkRepo").addEventListener("click", () => {
    if (window.codemv) window.codemv.openExternal("https://github.com/AlanLumier/code-frame-studio");
  });
}

/* ------------------------------------------------------------------ init */
async function init() {
  applySettings();
  bindSettings();
  renderPresets();
  resizeCanvas();
  window.addEventListener("resize", () => { resizeCanvas(); draw(true); });
  try {
    if (window.codemv) {
      const info = await window.codemv.appInfo();
      $("versionBadge").textContent = `v${info.version}`;
      $("updateStatus").textContent = `当前版本 v${info.version}`;
    }
  } catch (error) {
    console.warn(error);
  }
  loadStyles();
  updateMeta();
  requestAnimationFrame(loop);
}
init();
