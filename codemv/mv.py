"""音乐 MV 渲染：把音频分析、歌词与场景代码合成一支带声音的 MV。"""

from __future__ import annotations

import inspect
import math
import shutil
import subprocess
import sys
import uuid
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFont

from .audio import AudioAnalysis, analyze_audio
from .lyrics import LyricsTimeline, load_lyrics
from .renderer import SceneError, compose_video, find_ffmpeg, load_scene

FONT_CANDIDATES = [
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/simhei.ttf",
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
]


@dataclass
class MVContext:
    """交给 MV 场景每一帧的上下文。"""

    t: float
    seconds: float
    duration: float
    width: int
    height: int
    bpm: float
    beat: float
    energy: float
    spectrum: tuple[float, float, float]
    lyric_text: str
    lyric_progress: float


@lru_cache(maxsize=64)
def _load_font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in FONT_CANDIDATES:
        path = Path(candidate)
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size)
            except OSError:
                continue
    return ImageFont.load_default()


def _fit_font(text: str, width: int, height: int, max_width: float) -> ImageFont.FreeTypeFont:
    size = max(18, int(height * 0.040))
    font = _load_font(size)
    while size > 20 and font.getlength(text) > max_width:
        size -= 4
        font = _load_font(size)
    return font


def draw_lyrics(
    image: Image.Image,
    lyrics: LyricsTimeline,
    seconds: float,
    width: int,
    height: int,
) -> Image.Image:
    """在画面底部叠加卡拉 OK 样式歌词（带淡入淡出）。"""
    line, progress = lyrics.line_at(seconds)
    if line is None or not line.text:
        return image

    fade_in = min(1.0, (seconds - line.start) / 0.35)
    fade_out = min(1.0, (line.end - seconds) / 0.35)
    alpha = max(0.0, min(1.0, fade_in, fade_out))

    font = _fit_font(line.text, width, height, width * 0.84)
    text_width = font.getlength(line.text)
    x = (width - text_width) / 2
    y = height * 0.835

    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.text((x + 2, y + 3), line.text, font=font, fill=(4, 7, 14, 170))
    draw.text((x, y), line.text, font=font, fill=(246, 241, 231, 255))

    if progress > 0.001:
        colored = Image.new("RGBA", image.size, (0, 0, 0, 0))
        ImageDraw.Draw(colored).text((x, y), line.text, font=font, fill=(255, 199, 112, 255))
        mask = Image.new("L", image.size, 0)
        ImageDraw.Draw(mask).rectangle([0, 0, x + text_width * progress, height], fill=255)
        masked = Image.new("RGBA", image.size, (0, 0, 0, 0))
        masked.paste(colored, (0, 0), mask)
        layer = Image.alpha_composite(layer, masked)

    layer.putalpha(layer.getchannel("A").point(lambda value: int(value * alpha)))
    return Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB")


def load_mv_scene(scene_path: str | Path):
    """加载场景；render_frame 接受 (t, ctx) 时自动传入上下文。"""
    render_frame = load_scene(scene_path)
    try:
        parameters = [
            parameter
            for parameter in inspect.signature(render_frame).parameters.values()
            if parameter.kind in (parameter.POSITIONAL_ONLY, parameter.POSITIONAL_OR_KEYWORD)
        ]
        takes_context = len(parameters) >= 2
    except (TypeError, ValueError):
        takes_context = False

    if takes_context:
        return lambda t, ctx: render_frame(t, ctx)
    return lambda t, ctx: render_frame(t)


def build_context(
    analysis: AudioAnalysis,
    lyrics: LyricsTimeline | None,
    seconds: float,
    width: int,
    height: int,
) -> MVContext:
    seconds = max(0.0, min(analysis.duration, seconds))
    line, progress = lyrics.line_at(seconds) if lyrics else (None, 0.0)
    return MVContext(
        t=seconds / analysis.duration if analysis.duration else 0.0,
        seconds=seconds,
        duration=analysis.duration,
        width=width,
        height=height,
        bpm=analysis.bpm,
        beat=analysis.beat_pulse(seconds),
        energy=analysis.energy_at(seconds),
        spectrum=analysis.spectrum_at(seconds),
        lyric_text=line.text if line else "",
        lyric_progress=progress,
    )


def mux_audio(
    video_path: str | Path,
    audio_path: str | Path,
    out_path: str | Path,
    *,
    duration: float | None = None,
) -> Path:
    """把音频混流进无声视频；duration 不为空时只保留前 N 秒。"""
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        raise SceneError("未找到 ffmpeg，无法合成音频。请安装 imageio-ffmpeg。")
    output = Path(out_path).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(Path(video_path).expanduser().resolve()),
        "-i",
        str(Path(audio_path).expanduser().resolve()),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
    ]
    if duration is not None:
        command += ["-t", f"{max(0.1, duration):.3f}"]
    command.append(str(output))
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0 or not output.exists():
        message = (result.stderr or "").strip() or "ffmpeg 混流失败"
        raise SceneError(message)
    return output


def render_mv(
    scene_path: str | Path,
    audio_path: str | Path,
    out_path: str | Path,
    *,
    lyrics_path: str | Path | None = None,
    fps: int = 24,
    width: int = 1080,
    height: int = 1920,
    max_seconds: float | None = None,
    progress: bool = True,
    progress_callback: Callable[[int, int], None] | None = None,
) -> Path:
    """完整渲染一支 MV：逐帧场景 → 叠加歌词 → 合成视频 → 混入音频。

    max_seconds 不为空时只渲染前 N 秒（用于快速样片）。
    """
    analysis = analyze_audio(audio_path)
    lyrics = load_lyrics(lyrics_path, duration=analysis.duration) if lyrics_path else None
    render_frame = load_mv_scene(scene_path)

    total_seconds = analysis.duration if max_seconds is None else min(analysis.duration, max_seconds)
    frame_count = max(1, round(fps * total_seconds))
    output = Path(out_path).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    temp_dir = output.parent / f".codemv-mv-{uuid.uuid4().hex}"
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        for index in range(frame_count):
            seconds = index / fps
            context = build_context(analysis, lyrics, seconds, width, height)
            image = render_frame(context.t, context)
            if not isinstance(image, Image.Image):
                raise SceneError("MV 场景的 render_frame 必须返回 PIL.Image.Image")
            if image.size != (width, height):
                image = image.convert("RGB").resize((width, height), Image.LANCZOS)
            else:
                image = image.convert("RGB")
            if lyrics is not None:
                image = draw_lyrics(image, lyrics, seconds, width, height)
            image.save(temp_dir / f"frame_{index:05d}.png")

            if progress_callback is not None:
                progress_callback(index + 1, frame_count)
            elif progress:
                ratio = (index + 1) / frame_count
                bar = "#" * int(ratio * 20)
                print(
                    f"\r渲染 MV {index + 1}/{frame_count} [{bar:<20}] {ratio:6.1%}",
                    end="",
                    file=sys.stderr,
                )

        if progress and progress_callback is None:
            print(file=sys.stderr)

        silent_video = temp_dir / "silent.mp4"
        compose_video(temp_dir, silent_video, fps=fps)
        return mux_audio(silent_video, audio_path, output, duration=total_seconds)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def render_mv_preview(
    scene_path: str | Path,
    audio_path: str | Path,
    out_path: str | Path,
    *,
    seconds: float = 0.0,
    lyrics_path: str | Path | None = None,
    width: int = 1080,
    height: int = 1920,
) -> Path:
    """渲染某一秒的 MV 单帧预览（含歌词）。"""
    analysis = analyze_audio(audio_path)
    seconds = max(0.0, min(analysis.duration, seconds))
    lyrics = load_lyrics(lyrics_path, duration=analysis.duration) if lyrics_path else None
    context = build_context(analysis, lyrics, seconds, width, height)
    image = load_mv_scene(scene_path)(context.t, context)
    if not isinstance(image, Image.Image):
        raise SceneError("MV 场景的 render_frame 必须返回 PIL.Image.Image")
    image = image.convert("RGB").resize((width, height), Image.LANCZOS)
    if lyrics is not None:
        image = draw_lyrics(image, lyrics, seconds, width, height)

    output = Path(out_path).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)
    return output
