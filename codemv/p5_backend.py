"""p5.brush 手绘渲染后端：Node + headless Chrome/Edge 逐帧截图。"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import uuid
from pathlib import Path

from PIL import Image

from .audio import AudioAnalysis, analyze_audio
from .lyrics import LyricsTimeline, load_lyrics
from .mv import build_context, draw_lyrics, mux_audio
from .renderer import SceneError, compose_video

PROJECT_ROOT = Path(__file__).resolve().parents[1]
JS_ROOT = PROJECT_ROOT / "js"
RENDER_SCRIPT = JS_ROOT / "render.mjs"

BROWSER_CANDIDATES = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
]


def find_node() -> str | None:
    return shutil.which("node") or shutil.which("node.exe")


def find_browser() -> str | None:
    explicit = os.environ.get("CODEMV_BROWSER")
    candidates = [explicit, *BROWSER_CANDIDATES]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    return None


def environment_status() -> tuple[bool, str]:
    """检查 Node / 浏览器 / npm 依赖是否齐全。"""
    if find_node() is None:
        return False, "没有找到 Node.js。安装 Node 18+ 后重试。"
    if find_browser() is None:
        return False, "没有找到 Chrome 或 Edge 浏览器。"
    if not (JS_ROOT / "node_modules" / "puppeteer-core").exists():
        return False, "p5 渲染依赖未安装：请在 js 目录执行 npm install。"
    if not RENDER_SCRIPT.exists():
        return False, "缺少 js/render.mjs。"
    return True, "p5.brush 手绘渲染可用"


def build_frames(
    analysis: AudioAnalysis,
    lyrics: LyricsTimeline | None,
    total_seconds: float,
    fps: int,
    width: int,
    height: int,
) -> list[dict]:
    """生成每一帧的时间与上下文，交给 JS 渲染器。"""
    frame_count = max(1, round(fps * total_seconds))
    frames: list[dict] = []
    for index in range(frame_count):
        seconds = index / fps
        context = build_context(analysis, lyrics, seconds, width, height)
        frames.append(
            {
                "t": context.t,
                "ctx": {
                    "width": width,
                    "height": height,
                    "seconds": context.seconds,
                    "duration": context.duration,
                    "bpm": context.bpm,
                    "beat": context.beat,
                    "energy": context.energy,
                    "spectrum": list(context.spectrum),
                    "lyric_text": context.lyric_text,
                    "lyric_progress": context.lyric_progress,
                },
            }
        )
    return frames


def _run_renderer(
    scene_path: Path,
    frames: list[dict],
    out_dir: Path,
    width: int,
    height: int,
    progress_callback=None,
) -> None:
    available, message = environment_status()
    if not available:
        raise SceneError(message)
    node = find_node()
    browser = find_browser()
    assert node is not None and browser is not None

    out_dir.mkdir(parents=True, exist_ok=True)
    frames_file = out_dir / f".frames-{uuid.uuid4().hex}.json"
    frames_file.write_text(json.dumps(frames, ensure_ascii=False), encoding="utf-8")

    command = [
        node,
        str(RENDER_SCRIPT),
        f"--scene={scene_path}",
        f"--frames={frames_file}",
        f"--out={out_dir}",
        f"--width={width}",
        f"--height={height}",
        f"--browser={browser}",
    ]
    process = None
    try:
        process = subprocess.Popen(
            command,
            cwd=str(PROJECT_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        assert process.stdout is not None
        for line in process.stdout:
            line = line.strip()
            if line.startswith("FRAME "):
                parts = line.split()
                if len(parts) == 2 and "/" in parts[1]:
                    current, total = parts[1].split("/")
                    if progress_callback is not None:
                        progress_callback(int(current), int(total))
        _, stderr = process.communicate()
    except OSError as exc:
        raise SceneError(
            f"无法启动 p5 渲染器（{exc}）。请确认 Node 与 Chrome/Edge 可以正常运行。"
        ) from exc
    finally:
        frames_file.unlink(missing_ok=True)

    if process is None or process.returncode != 0:
        message = (stderr if process is not None else "").strip() or "p5 渲染器返回错误"
        raise SceneError(message)


def render_p5_mv(
    scene_path: str | Path,
    audio_path: str | Path,
    out_path: str | Path,
    *,
    lyrics_path: str | Path | None = None,
    fps: int = 24,
    width: int = 720,
    height: int = 1280,
    max_seconds: float | None = None,
    progress_callback=None,
) -> Path:
    """用 p5.brush 渲染整支 MV，再叠加歌词、混入音频。"""
    analysis = analyze_audio(audio_path)
    lyrics = load_lyrics(lyrics_path, duration=analysis.duration) if lyrics_path else None
    total_seconds = analysis.duration if max_seconds is None else min(analysis.duration, max_seconds)
    frames = build_frames(analysis, lyrics, total_seconds, fps, width, height)

    output = Path(out_path).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    temp_dir = output.parent / f".codemv-p5-{uuid.uuid4().hex}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    try:
        _run_renderer(
            Path(scene_path).expanduser().resolve(),
            frames,
            temp_dir,
            width,
            height,
            progress_callback=(
                (lambda current, total: progress_callback(current, total * 2))
                if progress_callback
                else None
            ),
        )
        if lyrics is not None:
            for index in range(len(frames)):
                frame_path = temp_dir / f"frame_{index:05d}.png"
                if not frame_path.exists():
                    continue
                seconds = index / fps
                with Image.open(frame_path) as image:
                    overlaid = draw_lyrics(image.convert("RGB"), lyrics, seconds, width, height)
                overlaid.save(frame_path)
                if progress_callback is not None:
                    progress_callback(len(frames) + index + 1, len(frames) * 2)

        silent_video = temp_dir / "silent.mp4"
        compose_video(temp_dir, silent_video, fps=fps)
        return mux_audio(silent_video, audio_path, output, duration=total_seconds)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def render_p5_preview(
    scene_path: str | Path,
    analysis: AudioAnalysis,
    lyrics: LyricsTimeline | None,
    seconds: float,
    out_path: str | Path,
    *,
    width: int = 720,
    height: int = 1280,
) -> Path:
    """用 p5.brush 渲染单帧预览。"""
    seconds = max(0.0, min(analysis.duration, seconds))
    context = build_context(analysis, lyrics, seconds, width, height)
    frames = [
        {
            "t": context.t,
            "ctx": {
                "width": width,
                "height": height,
                "seconds": context.seconds,
                "duration": context.duration,
                "bpm": context.bpm,
                "beat": context.beat,
                "energy": context.energy,
                "spectrum": list(context.spectrum),
                "lyric_text": context.lyric_text,
                "lyric_progress": context.lyric_progress,
            },
        }
    ]
    output = Path(out_path).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    temp_dir = output.parent / f".codemv-p5-preview-{uuid.uuid4().hex}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    try:
        _run_renderer(Path(scene_path).expanduser().resolve(), frames, temp_dir, width, height)
        frame_path = temp_dir / "frame_00000.png"
        if not frame_path.exists():
            raise SceneError("p5 渲染器没有输出预览帧")
        with Image.open(frame_path) as image:
            result = image.convert("RGB")
        if lyrics is not None:
            result = draw_lyrics(result, lyrics, seconds, width, height)
        result.save(output)
        return output
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
