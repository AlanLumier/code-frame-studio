/* codemv 0.7 — 旧版 codemV 布局 + 独立搬入的 Folia 视觉库 + 网易云歌词 */

const $ = (id) => document.getElementById(id);
const audio = $("audio");
const stageFrame = $("stageFrame");

const DEFAULT_SETTINGS = { theme: "dark", accent: "#e8553a", mode: "fume" };
const state = {
  lines: [],
  duration: 0,
  title: "喜欢",
  artist: "阿肆",
  tab: "material",
  styles: [],
  category: "全部",
  styleQuery: "",
  selectedStyle: "",
  mode: "fume",
  settings: loadSettings(),
  stageReady: false,
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
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/* ------------------------------------------------------------------ LRC */
function parseLRC(text) {
  const out = [];
  const stamp = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^\[(ar|ti|al|by|offset|re|ve):/i.test(line)) continue;
    const stamps = [...line.matchAll(stamp)];
    if (!stamps.length) continue;
    const content = line.replace(stamp, "").trim();
    if (!content || /^(作词|作曲|编曲|词|曲)\s*[:：]/.test(content) || /^\S+\s+-\s+\S+$/.test(content)) continue;
    for (const m of stamps) {
      const frac = m[3] ? parseInt(m[3].padEnd(3, "0").slice(0, 3), 10) / 1000 : 0;
      out.push({ start: parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + frac, text: content });
    }
  }
  out.sort((a, b) => a.start - b.start);
  for (let i = 0; i < out.length; i += 1) {
    out[i].end = i + 1 < out.length ? out[i + 1].start : state.duration || 250;
  }
  return out;
}

function setLyrics(lines, meta = {}) {
  state.lines = lines;
  if (meta.title) state.title = meta.title;
  if (meta.artist) state.artist = meta.artist;
  if (meta.duration) state.duration = meta.duration;
  renderLyrics();
  updateMeta();
  pushStage();
}

function renderLyrics() {
  const list = $("lyricList");
  list.innerHTML = "";
  state.lines.forEach((line) => {
    const item = document.createElement("div");
    item.className = "lyric-item";
    item.dataset.time = String(line.start);
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
    ? `已加载 ${state.lines.length} 句 · 点击「歌词」标签查看并跳转。`
    : "还没有歌词，导入 LRC 或搜索网易云。";
}

function updateMeta() {
  $("songTitle").textContent = state.title || "未命名";
  $("cardTitle").textContent = state.title || "未命名";
  $("cardArtist").textContent = state.artist || "未知歌手";
  const meta = `${fmt(state.duration)} · ${state.lines.length} 句歌词`;
  $("songMeta").textContent = `${state.artist || "未知歌手"} · ${meta}`;
  $("cardMeta").textContent = meta;
  $("timeTotal").textContent = fmt(state.duration);
}

function activeLine(t) {
  let index = -1;
  for (let i = 0; i < state.lines.length; i += 1) {
    if (state.lines[i].start <= t + 0.02) index = i;
    else break;
  }
  return index;
}

let activeIndex = -1;
function highlightLyrics(t) {
  const index = activeLine(t);
  if (index === activeIndex) return;
  activeIndex = index;
  const items = $("lyricList").children;
  for (let i = 0; i < items.length; i += 1) items[i].classList.toggle("active", i === index);
  if (index >= 0 && state.tab === "lyrics" && items[index]) items[index].scrollIntoView({ block: "center", behavior: "smooth" });
}

/* ------------------------------------------------------------------ Folia stage */
function pushStage() {
  if (!state.stageReady || !stageFrame.contentWindow) return;
  const payload = {
    type: "codemv:state",
    t: audio.currentTime || 0,
    duration: state.duration || audio.duration || 0,
    playing: !audio.paused,
    lines: state.lines.map((l) => ({ text: l.text, time: l.start, translation: l.translation || "" })),
    title: state.title,
    artist: state.artist,
    coverUrl: "",
  };
  stageFrame.contentWindow.postMessage(payload, "*");
}

function setStageMode(mode) {
  state.mode = mode;
  if (state.stageReady && stageFrame.contentWindow) {
    stageFrame.contentWindow.postMessage({ type: "codemv:mode", mode }, "*");
    pushStage();
  }
  $("status").textContent = `Folia · ${mode}`;
}

stageFrame.addEventListener("load", () => {
  state.stageReady = true;
  setTimeout(() => {
    stageFrame.classList.add("ready");
    $("stageLoading").classList.add("hide");
    setStageMode(state.mode);
    pushStage();
  }, 500);
});

/* ------------------------------------------------------------------ audio */
function applySettings() {
  document.body.dataset.theme = state.settings.theme;
  document.documentElement.style.setProperty("--accent", state.settings.accent);
  $("setTheme").value = state.settings.theme;
  $("setAccent").value = state.settings.accent;
  $("setMode").value = state.settings.mode;
  setStageMode(state.settings.mode);
}

function setPlayIcon(playing) {
  $("playIcon").innerHTML = playing
    ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z" />'
    : '<path d="M8 5v14l11-7z" />';
}
function togglePlay() {
  if (audio.paused) audio.play().catch(() => toast("无法播放音频"));
  else audio.pause();
}
function seekTo(t) {
  audio.currentTime = Math.max(0, Math.min(t, state.duration || audio.duration || 0));
  $("seek").value = String(Math.round((audio.currentTime / (state.duration || 1)) * 1000));
  $("timeNow").textContent = fmt(audio.currentTime);
  pushStage();
  highlightLyrics(audio.currentTime);
}

audio.addEventListener("loadedmetadata", () => {
  state.duration = audio.duration || state.duration;
  $("timeTotal").textContent = fmt(state.duration);
  updateMeta();
  pushStage();
});
audio.addEventListener("timeupdate", () => {
  const t = audio.currentTime;
  $("timeNow").textContent = fmt(t);
  $("seek").value = String(Math.round((t / (state.duration || 1)) * 1000));
  highlightLyrics(t);
});
audio.addEventListener("play", () => {
  setPlayIcon(true);
  $("stageHint").classList.add("hide");
  pushStage();
});
audio.addEventListener("pause", () => {
  setPlayIcon(false);
  pushStage();
});
audio.addEventListener("ended", () => setPlayIcon(false));

$("seek").addEventListener("input", (event) => {
  const t = (Number(event.target.value) / 1000) * (state.duration || audio.duration || 0);
  seekTo(t);
});
$("btnPlay").addEventListener("click", togglePlay);
document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, select, textarea")) return;
  if (event.code === "Space") {
    event.preventDefault();
    togglePlay();
  }
  if (event.code === "ArrowRight") seekTo(audio.currentTime + 5);
  if (event.code === "ArrowLeft") seekTo(audio.currentTime - 5);
});

setInterval(() => {
  if (state.stageReady) pushStage();
}, 150);

/* ------------------------------------------------------------------ tabs */
function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".rail-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  document.querySelectorAll(".panel-page").forEach((page) => page.classList.toggle("active", page.dataset.page === tab));
  if (tab === "lyrics") highlightLyrics(audio.currentTime);
}
document.querySelectorAll(".rail-btn").forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));
$("btnSettings").addEventListener("click", () => setTab("settings"));

/* ------------------------------------------------------------------ files */
$("btnAudio").addEventListener("click", () => $("fileAudio").click());
$("btnAudio2").addEventListener("click", () => $("fileAudio").click());
$("btnLyrics").addEventListener("click", () => $("fileLyrics").click());
$("btnLyrics2").addEventListener("click", () => $("fileLyrics").click());

$("fileAudio").addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  audio.src = url;
  audio.load();
  state.title = file.name.replace(/\.[^.]+$/, "");
  state.artist = "本地音频";
  updateMeta();
  toast("音频已导入");
  event.target.value = "";
});
$("fileLyrics").addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const text = await file.text();
  const lines = parseLRC(text);
  if (!lines.length) toast("没有解析到歌词，请确认是 LRC 文件");
  else {
    setLyrics(lines);
    toast(`歌词已导入（${lines.length} 句）`);
  }
  event.target.value = "";
});

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
  if (!window.codemv || !window.codemv.neteaseLyric) return;
  try {
    const data = await window.codemv.neteaseLyric(song.id);
    const lines = parseLRC(data.lrc);
    if (!lines.length) throw new Error("歌词解析为空");
    setLyrics(lines, { title: song.name, artist: song.artists, duration: song.duration || state.duration });
    $("srcBadge").textContent = "网易云";
    setTab("lyrics");
    toast(`已载入《${song.name}》歌词`);
  } catch (error) {
    toast(`歌词加载失败：${error.message}`);
  }
}
$("nsSearch").addEventListener("click", searchNetease);
$("nsInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchNetease();
});

/* ------------------------------------------------------------------ styles */
async function loadStyles() {
  try {
    const response = await fetch("/style-library/catalog.json");
    const data = await response.json();
    state.styles = data;
    $("styleCount").textContent = `${data.length} 种`;
    renderChips();
    renderStyles();
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
    chip.addEventListener("click", () => {
      state.category = cat;
      renderChips();
      renderStyles();
    });
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
    card.className = `style-card${style.slug === state.selectedStyle ? " selected" : ""}`;
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = `/style-library/img/${style.slug}_0.jpg`;
    img.alt = style.cn;
    img.onerror = () => { img.style.background = "#111"; };
    const body = document.createElement("div");
    body.className = "sc-body";
    body.innerHTML = "<b></b><small></small>";
    body.querySelector("b").textContent = style.cn;
    body.querySelector("small").textContent = `${style.en} · ${style.cat}`;
    card.append(img, body);
    card.addEventListener("click", () => {
      state.selectedStyle = style.slug;
      renderStyles();
      $("styleFoot").textContent = `已选「${style.cn}」· ${style.en} — 适合：${style.uses || style.cat}`;
      toast(`已选择风格：${style.cn}`);
    });
    grid.appendChild(card);
  });
  if (!list.length) grid.innerHTML = '<p class="muted">没有匹配的风格。</p>';
}
$("styleSearch").addEventListener("input", (event) => {
  state.styleQuery = event.target.value;
  renderStyles();
});

/* ------------------------------------------------------------------ settings */
function bindSettings() {
  $("setTheme").addEventListener("change", (event) => {
    state.settings.theme = event.target.value;
    saveSettings();
    applySettings();
  });
  $("setAccent").addEventListener("input", (event) => {
    state.settings.accent = event.target.value;
    saveSettings();
    applySettings();
  });
  $("setMode").addEventListener("change", (event) => {
    state.settings.mode = event.target.value;
    saveSettings();
    setStageMode(event.target.value);
  });
  $("btnUpdate").addEventListener("click", async () => {
    const status = $("updateStatus");
    status.textContent = "正在检查更新…";
    try {
      const info = await window.codemv.appInfo();
      $("versionBadge").textContent = `v${info.version}`;
      const result = await window.codemv.checkUpdate();
      status.textContent = result.latest && result.latest !== info.version
        ? `发现新版本 v${result.latest}（当前 v${info.version}）`
        : `已是最新版本（v${info.version}）`;
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
  try {
    if (window.codemv) {
      const info = await window.codemv.appInfo();
      $("versionBadge").textContent = `v${info.version}`;
      $("updateStatus").textContent = `当前版本 v${info.version}`;
    }
  } catch (error) {
    console.warn(error);
  }
  try {
    const lrc = await (await fetch("/assets/xihuan.lrc")).text();
    const lines = parseLRC(lrc);
    setLyrics(lines);
  } catch (error) {
    console.warn("demo lyrics failed", error);
  }
  loadStyles();
  updateMeta();
  pushStage();
}

init();
