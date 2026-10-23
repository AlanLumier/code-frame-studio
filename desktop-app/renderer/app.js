/* codemv desktop renderer: 导入歌曲/歌词 → AI 逐句生成画面代码 → 实时预览 */

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_SETTINGS = {
  theme: "dark",
  accent: "#7fb2ff",
  subtitleMode: "karaoke",
  subtitleSize: 1,
  subtitlePos: "bottom",
  mood: "",
};

const state = {
  audioFile: null,
  audioUrl: null,
  duration: 0,
  lyricsRaw: "",
  lines: [],
  scenes: new Map(),
  analysis: null,
  settings: loadSettings(),
  currentLine: -2,
  previewTime: 0,
  generating: false,
};

const canvas = $("stage");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

/* ------------------------------------------------------------------ 工具 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fmtTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function stripExt(name) {
  return name.replace(/\.[^.]+$/, "");
}

function toast(message, duration = 2600) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove("show"), duration);
}

function palette() {
  return ["#0b1020", state.settings.accent, "#ffd08a", "#f6f1e7", "#3b4a7a"];
}

function hashRand(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

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

function applySettings() {
  document.body.dataset.theme = state.settings.theme;
  document.body.dataset.subpos = state.settings.subtitlePos;
  document.documentElement.style.setProperty("--accent", state.settings.accent);
  document.documentElement.style.setProperty("--sub-scale", String(state.settings.subtitleSize));
  $("lyricCur").classList.toggle("karaoke", state.settings.subtitleMode === "karaoke");
  $("moodInput").value = state.settings.mood;
}

/* ------------------------------------------------------------------ 歌词解析 */
function parseLyrics(raw, duration) {
  const text = String(raw || "");
  const entries = [];
  const stampRe = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  const offsetMatch = text.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  const offset = offsetMatch ? -parseInt(offsetMatch[1], 10) / 1000 : 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^\[(ar|ti|al|by|offset|re|ve):/i.test(line)) continue;
    const stamps = [...line.matchAll(stampRe)];
    if (!stamps.length) continue;
    const content = line.replace(stampRe, "").trim();
    if (!content) continue;
    for (const match of stamps) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const fraction = match[3] ? parseInt(match[3].padEnd(3, "0").slice(0, 3), 10) / 1000 : 0;
      entries.push({ start: Math.max(0, minutes * 60 + seconds + fraction + offset), text: content });
    }
  }

  if (entries.length) {
    entries.sort((a, b) => a.start - b.start);
    for (let index = 0; index < entries.length; index += 1) {
      const next = index + 1 < entries.length ? entries[index + 1].start : null;
      const end = next !== null ? next : duration ? Math.min(duration, entries[index].start + 6) : entries[index].start + 4;
      entries[index].end = Math.max(entries[index].start + 0.6, end);
    }
    return entries;
  }

  const plain = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!plain.length) return [];
  const total = duration || plain.length * 4;
  const step = total / plain.length;
  return plain.map((line, index) => ({
    start: index * step,
    end: Math.min(total, (index + 1) * step),
    text: line,
  }));
}

/* ------------------------------------------------------------------ 音频分析 */
async function analyzeAudio(arrayBuffer) {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtor();
  const buffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  await audioCtx.close();

  const hop = Math.max(256, Math.round(sampleRate / 100));
  const win = hop * 2;
  const frames = Math.max(1, Math.floor((data.length - win) / hop));
  const rms = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    const offset = frame * hop;
    for (let i = 0; i < win; i += 2) {
      const value = data[offset + i];
      sum += value * value;
    }
    rms[frame] = Math.sqrt(sum / (win / 2));
  }

  const sorted = Array.from(rms).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1;
  for (let i = 0; i < frames; i += 1) rms[i] = Math.min(1, rms[i] / p95);

  const onset = new Float32Array(frames);
  for (let i = 1; i < frames; i += 1) onset[i] = Math.max(0, rms[i] - rms[i - 1]);

  const frameRate = 100;
  let bestLag = 0;
  let bestScore = 0;
  const minLag = Math.floor((60 / 180) * frameRate);
  const maxLag = Math.floor((60 / 60) * frameRate);
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let score = 0;
    for (let i = lag; i < frames; i += 1) score += onset[i] * onset[i - lag];
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  let bpm = bestLag ? (60 * frameRate) / bestLag : 120;
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;

  const maxOnset = Math.max(...onset);
  const threshold = Math.max(0.02, maxOnset * 0.32);
  const beats = [];
  let lastBeat = -10;
  for (let i = 1; i < frames - 1; i += 1) {
    if (onset[i] >= threshold && onset[i] >= onset[i - 1] && onset[i] >= onset[i + 1]) {
      const time = i / frameRate;
      if (time - lastBeat > 0.22) {
        beats.push(time);
        lastBeat = time;
      }
    }
  }

  return { duration: buffer.duration, bpm: Math.round(bpm), beats, energy: rms, frameRate };
}

function energyAt(seconds) {
  const analysis = state.analysis;
  if (!analysis) return 0.5;
  const pos = seconds * analysis.frameRate;
  const index = Math.floor(pos);
  if (index < 0) return 0;
  if (index >= analysis.energy.length - 1) return analysis.energy[analysis.energy.length - 1];
  const fraction = pos - index;
  return analysis.energy[index] * (1 - fraction) + analysis.energy[index + 1] * fraction;
}

function beatPulse(seconds) {
  const beats = state.analysis && state.analysis.beats;
  if (!beats || !beats.length) return 0;
  let low = 0;
  let high = beats.length - 1;
  let answer = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (beats[mid] <= seconds) {
      answer = beats[mid];
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (answer < 0) return 0;
  return Math.max(0, Math.exp(-6 * (seconds - answer)));
}

/* ------------------------------------------------------------------ 引入文件 */
function routeFile(file) {
  if (!file) return;
  const name = file.name.toLowerCase();
  if (/\.(lrc|txt)$/.test(name)) {
    handleLyricsFile(file);
  } else {
    handleAudioFile(file);
  }
}

async function handleAudioFile(file) {
  state.audioFile = file;
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  state.audioUrl = URL.createObjectURL(file);
  const audio = $("audio");
  audio.src = state.audioUrl;
  $("songTitle").textContent = stripExt(file.name);
  $("songSub").textContent = "正在分析节奏…";
  $("stageHint").style.display = "none";

  try {
    const buffer = await file.arrayBuffer();
    state.analysis = await analyzeAudio(buffer);
    state.duration = state.analysis.duration;
    $("songSub").textContent = `${fmtTime(state.duration)} · ${state.analysis.bpm} BPM · ${state.analysis.beats.length} 个节拍`;
    $("timeTotal").textContent = fmtTime(state.duration);
    if (state.lyricsRaw) {
      state.lines = parseLyrics(state.lyricsRaw, state.duration);
      state.scenes.clear();
      renderLyricList();
    }
    updateGenerateButton();
    toast("音乐已导入");
  } catch (error) {
    console.error(error);
    $("songSub").textContent = "音频分析失败";
    toast(`音频分析失败：${error.message}`);
  }
}

async function handleLyricsFile(file) {
  state.lyricsRaw = await file.text();
  state.lines = parseLyrics(state.lyricsRaw, state.duration);
  state.scenes.clear();
  state.currentLine = -2;
  renderLyricList();
  updateGenerateButton();
  $("lineCount").textContent = `${state.lines.length} 句`;
  if (!state.lines.length) {
    toast("没有解析到歌词，请确认是 .lrc 文件");
  } else {
    toast(`歌词已导入（${state.lines.length} 句）`);
  }
}

function updateGenerateButton() {
  const btn = $("btnGenerate");
  btn.disabled = state.generating || !state.lines.length;
}

/* ------------------------------------------------------------------ 歌词列表 */
function renderLyricList() {
  const list = $("lyricList");
  list.innerHTML = "";
  state.lineNodes = [];
  state.lines.forEach((line, index) => {
    const item = document.createElement("div");
    item.className = "lyric-item";
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = fmtTime(line.start);
    const text = document.createElement("span");
    text.className = "text";
    text.textContent = line.text;
    const dot = document.createElement("span");
    dot.className = "dot";
    item.append(time, text, dot);
    item.addEventListener("click", () => seekTo(line.start));
    list.appendChild(item);
    state.lineNodes.push({ item, dot });
  });
}

function setLineStatus(index, status) {
  const node = state.lineNodes && state.lineNodes[index];
  if (!node) return;
  node.dot.className = `dot ${status}`;
}

/* ------------------------------------------------------------------ 生成画面 */
function extractCode(raw) {
  let code = String(raw || "").trim();
  code = code.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  const start = code.indexOf("function drawScene");
  if (start >= 0) code = code.slice(start);
  const end = code.lastIndexOf("}");
  if (end >= 0) code = code.slice(0, end + 1);
  return code;
}

function compileScene(raw) {
  const code = extractCode(raw);
  if (!code) throw new Error("AI 没有返回代码");
  if (/\b(fetch|XMLHttpRequest|document|window|localStorage|sessionStorage|eval|import|require|Worker|WebSocket|navigator|setTimeout|setInterval)\b/.test(code)) {
    throw new Error("代码包含不允许的 API");
  }
  const factory = new Function(`"use strict";\n${code}\nreturn drawScene;`);
  const fn = factory();
  if (typeof fn !== "function") throw new Error("没有找到 drawScene 函数");
  return fn;
}

function testScene(fn) {
  const testCanvas = document.createElement("canvas");
  testCanvas.width = 320;
  testCanvas.height = 180;
  const testCtx = testCanvas.getContext("2d");
  fn(testCtx, {
    t: 0.4,
    lineDuration: 3,
    beat: 0.5,
    energy: 0.5,
    progress: 0.2,
    line: "测试",
    palette: palette(),
    w: 320,
    h: 180,
    rand: hashRand,
  });
}

async function generateScenes() {
  if (state.generating) return;
  if (!state.lines.length) {
    toast("先导入歌词");
    return;
  }
  if (!window.codemv) {
    toast("应用接口未加载，请重启应用");
    return;
  }

  state.generating = true;
  updateGenerateButton();
  $("btnGenerate").textContent = "生成中…";
  let ready = 0;

  for (let index = 0; index < state.lines.length; index += 1) {
    if (!state.generating) break;
    if (index > 0) await sleep(31000);
    const line = state.lines[index];
    setLineStatus(index, "generating");
    $("genStatus").textContent = `正在生成第 ${index + 1}/${state.lines.length} 句画面…`;
    try {
      const payload = {
        line: line.text,
        prev: index > 0 ? state.lines[index - 1].text : "",
        next: index + 1 < state.lines.length ? state.lines[index + 1].text : "",
        lineStart: line.start,
        lineEnd: line.end,
        bpm: state.analysis ? state.analysis.bpm : 0,
        duration: state.duration,
        mood: state.settings.mood,
        palette: palette(),
      };
      const result = await window.codemv.generateScene(payload);
      const fn = compileScene(result.text);
      testScene(fn);
      state.scenes.set(index, fn);
      ready += 1;
      setLineStatus(index, "ready");
      state.currentLine = -2;
    } catch (error) {
      console.error(error);
      setLineStatus(index, "failed");
    }
  }

  state.generating = false;
  $("btnGenerate").textContent = "AI 生成画面";
  $("genStatus").textContent = `已生成 ${ready}/${state.lines.length} 句画面`;
  updateGenerateButton();
  toast(`画面生成完成：${ready}/${state.lines.length} 句`);
}

/* ------------------------------------------------------------------ 渲染 */
function drawFallback(seconds) {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#070b16");
  gradient.addColorStop(0.55, "#101a2e");
  gradient.addColorStop(1, "#050811");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  const accent = state.settings.accent;
  for (let i = 0; i < 3; i += 1) {
    const x = W * (0.3 + 0.2 * i) + Math.sin(seconds * 0.5 + i) * 40;
    const y = H * 0.45 + Math.cos(seconds * 0.4 + i * 2) * 30;
    const radius = 140 + i * 70;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `${accent}33`);
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }
}

function currentLineIndex(seconds) {
  if (!state.lines.length) return -1;
  let low = 0;
  let high = state.lines.length - 1;
  let answer = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (state.lines[mid].start <= seconds) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return answer;
}

function buildFrame(line, seconds) {
  const lineT = seconds - line.start;
  const duration = Math.max(0.6, line.end - line.start);
  return {
    t: Math.max(0, lineT),
    lineDuration: duration,
    beat: beatPulse(seconds),
    energy: energyAt(seconds),
    progress: clamp(lineT / duration, 0, 1),
    line: line.text,
    palette: palette(),
    w: W,
    h: H,
    rand: hashRand,
  };
}

function draw(seconds) {
  ctx.clearRect(0, 0, W, H);
  const index = currentLineIndex(seconds);
  const line = index >= 0 ? state.lines[index] : null;
  if (line && state.scenes.has(index)) {
    const fn = state.scenes.get(index);
    ctx.save();
    try {
      fn(ctx, buildFrame(line, seconds));
    } catch (error) {
      console.error("场景运行失败", error);
      drawFallback(seconds);
    } finally {
      ctx.restore();
    }
  } else {
    drawFallback(seconds);
  }
  updateLyricUI(index, seconds);
}

function updateLyricUI(index, seconds) {
  const prevEl = $("lyricPrev");
  const curEl = $("lyricCur");
  const nextEl = $("lyricNext");

  if (index !== state.currentLine) {
    state.currentLine = index;
    const line = index >= 0 ? state.lines[index] : null;
    prevEl.textContent = index > 0 ? state.lines[index - 1].text : "";
    curEl.textContent = line ? line.text : state.lines.length ? "" : "导入歌词后开始";
    nextEl.textContent = index >= 0 && index + 1 < state.lines.length ? state.lines[index + 1].text : "";
    state.lineNodes.forEach((node, i) => node.item.classList.toggle("active", i === index));
  }

  if (index >= 0) {
    const line = state.lines[index];
    const duration = Math.max(0.6, line.end - line.start);
    const progress = clamp((seconds - line.start) / duration, 0, 1);
    curEl.style.setProperty("--p", progress.toFixed(4));
  }
}

/* ------------------------------------------------------------------ 播放控制 */
function seekTo(seconds) {
  const audio = $("audio");
  const target = clamp(seconds, 0, state.duration || 0);
  if (state.audioUrl && state.duration) {
    audio.currentTime = target;
  }
  state.previewTime = target;
  state.currentLine = -2;
  updateTransport(target);
}

function updateTransport(seconds) {
  const duration = state.duration || 1;
  $("timeNow").textContent = fmtTime(seconds);
  $("seek").value = String(Math.round((seconds / duration) * 1000));
}

function setPlayIcon(playing) {
  $("playIcon").innerHTML = playing
    ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z" />'
    : '<path d="M8 5v14l11-7z" />';
}

function loop() {
  requestAnimationFrame(loop);
  const audio = $("audio");
  const seconds = audio.src ? audio.currentTime : state.previewTime || 0;
  draw(seconds);
  if (!audio.paused) updateTransport(seconds);
}

/* ------------------------------------------------------------------ 设置 */
function openSettings() {
  const dialog = $("settingsDialog");
  $("setTheme").value = state.settings.theme;
  $("setAccent").value = state.settings.accent;
  $("setSubtitleMode").value = state.settings.subtitleMode;
  $("setSubtitleSize").value = String(state.settings.subtitleSize);
  $("setSubtitlePos").value = state.settings.subtitlePos;
  if (!dialog.open) dialog.showModal();
}

function bindSettings() {
  $("btnSettings").addEventListener("click", openSettings);
  $("btnCloseSettings").addEventListener("click", () => $("settingsDialog").close());
  $("btnDoneSettings").addEventListener("click", () => $("settingsDialog").close());

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
  $("setSubtitleMode").addEventListener("change", (event) => {
    state.settings.subtitleMode = event.target.value;
    saveSettings();
    applySettings();
  });
  $("setSubtitleSize").addEventListener("input", (event) => {
    state.settings.subtitleSize = Number(event.target.value);
    saveSettings();
    applySettings();
  });
  $("setSubtitlePos").addEventListener("change", (event) => {
    state.settings.subtitlePos = event.target.value;
    saveSettings();
    applySettings();
  });
  $("btnResetSettings").addEventListener("click", () => {
    state.settings = { ...DEFAULT_SETTINGS };
    saveSettings();
    applySettings();
    openSettings();
    toast("已恢复默认设置");
  });

  $("moodInput").addEventListener("input", (event) => {
    state.settings.mood = event.target.value;
    saveSettings();
  });

  $("btnCheckUpdate").addEventListener("click", async () => {
    const status = $("updateStatus");
    status.textContent = "正在检查更新…";
    try {
      const info = await window.codemv.appInfo();
      $("versionText").textContent = `版本 ${info.version}`;
      const result = await window.codemv.checkUpdate();
      if (result.latest && result.latest !== info.version) {
        status.textContent = `发现新版本 v${result.latest}（当前 v${info.version}）`;
      } else {
        status.textContent = `已是最新版本（v${info.version}）`;
      }
    } catch (error) {
      status.textContent = `检查失败：${error.message}`;
    }
  });

  $("linkRepo").addEventListener("click", (event) => {
    event.preventDefault();
    window.codemv.openExternal("https://github.com/AlanLumier/code-frame-studio");
  });
}

/* ------------------------------------------------------------------ 事件绑定 */
function bindEvents() {
  $("btnAudio").addEventListener("click", () => $("fileAudio").click());
  $("btnLyrics").addEventListener("click", () => $("fileLyrics").click());
  $("btnGenerate").addEventListener("click", generateScenes);

  $("fileAudio").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) handleAudioFile(file);
    event.target.value = "";
  });
  $("fileLyrics").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) handleLyricsFile(file);
    event.target.value = "";
  });

  const zone = $("dropZone");
  ["dragenter", "dragover"].forEach((type) => {
    window.addEventListener(type, (event) => {
      event.preventDefault();
      zone.classList.add("drag-over");
    });
  });
  ["dragleave", "drop"].forEach((type) => {
    window.addEventListener(type, (event) => {
      event.preventDefault();
      if (type === "drop" && event.dataTransfer) {
        const file = event.dataTransfer.files && event.dataTransfer.files[0];
        if (file) routeFile(file);
      }
      zone.classList.remove("drag-over");
    });
  });

  $("btnPlay").addEventListener("click", () => {
    const audio = $("audio");
    if (!state.audioUrl) {
      toast("先导入音乐");
      return;
    }
    if (audio.paused) audio.play();
    else audio.pause();
  });
  const audio = $("audio");
  audio.addEventListener("play", () => setPlayIcon(true));
  audio.addEventListener("pause", () => setPlayIcon(false));
  audio.addEventListener("timeupdate", () => {
    if (!audio.paused) updateTransport(audio.currentTime);
  });
  audio.addEventListener("ended", () => {
    setPlayIcon(false);
    updateTransport(audio.duration || 0);
  });

  $("seek").addEventListener("input", (event) => {
    if (!state.duration) return;
    seekTo((Number(event.target.value) / 1000) * state.duration);
  });

  window.addEventListener("resize", () => {
    state.currentLine = -2;
  });
}

/* ------------------------------------------------------------------ 启动 */
async function init() {
  applySettings();
  bindEvents();
  bindSettings();
  try {
    const info = await window.codemv.appInfo();
    $("versionText").textContent = `版本 ${info.version}`;
  } catch (error) {
    console.warn(error);
  }
  requestAnimationFrame(loop);
}

init();
