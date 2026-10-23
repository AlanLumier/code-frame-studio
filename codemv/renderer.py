"""codemv 渲染内核。

职责：
1. 加载用户（或 AI 生成的）`scene.py` 场景文件；
2. 按 fps / duration 逐帧调用 `render_frame(t)` 生成 PNG；
3. 调用 ffmpeg 把帧序列合成为 mp4。

场景契约（写进 prompts/scene_prompt.md，也提供给 AI）：
    def render_frame(t: float) -> PIL.Image.Image
    - t: 0.0 ~ 1.0 的动画进度；
    - 返回 RGB / RGBA 图像，尺寸为 WIDTH x HEIGHT。
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Callable

from PIL import Image

DEFAULT_WIDTH = 960
DEFAULT_HEIGHT = 540
DEFAULT_FPS = 30
DEFAULT_DURATION = 6.0

RenderFrame = Callable[[float], Image.Image]


class SceneError(RuntimeError):
    """场景代码不符合契约、渲染失败或缺少 ffmpeg 时抛出。"""


def load_scene(scene_path: str | Path) -> RenderFrame:
    """从文件路径加载场景模块，返回其中的 render_frame 函数。"""
    path = Path(scene_path).expanduser().resolve()
    if not path.exists():
        raise SceneError(f"场景文件不存在：{path}")

    module_name = f"codemv_scene_{abs(hash(path))}"
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise SceneError(f"无法加载场景文件：{path}")

    module = importlib.util.module_from_spec(spec)
    # 允许场景文件 import 同目录下的辅助模块
    sys.path.insert(0, str(path.parent))
    try:
        spec.loader.exec_module(module)
    except Exception as exc:  # noqa: BLE001 - 把任何加载错误都转成用户可读信息
        raise SceneError(f"加载场景代码失败：{exc}") from exc
    finally:
        try:
            sys.path.remove(str(path.parent))
        except ValueError:
            pass

    render_frame = getattr(module, "render_frame", None)
    if not callable(render_frame):
        raise SceneError("场景文件必须定义 render_frame(t) 函数")
    return render_frame


def _normalize_frame(image: object, width: int, height: int) -> Image.Image:
    """校验并规范化一帧图像：确保是 PIL Image 且尺寸正确。"""
    if not isinstance(image, Image.Image):
        raise SceneError(
            "render_frame(t) 必须返回 PIL.Image.Image 对象，"
            f"实际返回了 {type(image).__name__}"
        )
    if image.size != (width, height):
        image = image.convert("RGB").resize((width, height), Image.LANCZOS)
    return image


def render_frames(
    render_frame: RenderFrame,
    out_dir: str | Path,
    *,
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
    fps: int = DEFAULT_FPS,
    duration: float = DEFAULT_DURATION,
    progress: bool = True,
    progress_callback: Callable[[int, int], None] | None = None,
) -> list[Path]:
    """逐帧渲染并保存为 PNG，返回帧文件列表。

    progress_callback 不为空时，每渲染完一帧回调 (已完成帧数, 总帧数)。
    """
    if fps <= 0:
        raise SceneError("fps 必须大于 0")
    if duration <= 0:
        raise SceneError("duration 必须大于 0")

    frame_count = max(1, round(fps * duration))
    target_dir = Path(out_dir).expanduser().resolve()
    target_dir.mkdir(parents=True, exist_ok=True)

    frames: list[Path] = []
    size_warned = False
    for index in range(frame_count):
        t = index / (frame_count - 1) if frame_count > 1 else 0.0
        frame_path = target_dir / f"frame_{index:05d}.png"
        try:
            raw_image = render_frame(t)
            if not size_warned and isinstance(raw_image, Image.Image):
                if raw_image.size != (width, height):
                    print(
                        f"注意：场景渲染尺寸 {raw_image.size} 与目标 ({width}, {height}) "
                        "不一致，已自动缩放。",
                        file=sys.stderr,
                    )
                    size_warned = True
            image = _normalize_frame(raw_image, width, height)
            image.convert("RGB").save(frame_path)
        except SceneError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise SceneError(f"渲染第 {index + 1}/{frame_count} 帧失败：{exc}") from exc
        frames.append(frame_path)

        if progress_callback is not None:
            progress_callback(index + 1, frame_count)
        elif progress:
            ratio = (index + 1) / frame_count
            bar = "#" * int(ratio * 24)
            print(f"\r渲染帧 {index + 1}/{frame_count} [{bar:<24}] {ratio:6.1%}", end="", file=sys.stderr)
    if progress and progress_callback is None:
        print(file=sys.stderr)

    return frames


def find_ffmpeg() -> str | None:
    """按优先级查找 ffmpeg：环境变量 > imageio-ffmpeg 自带 > PATH。"""
    explicit = os.environ.get("CODEMV_FFMPEG")
    if explicit and Path(explicit).exists():
        return explicit

    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001 - 没装就当没有，继续找
        pass

    return shutil.which("ffmpeg")


def compose_video(
    frames_dir: str | Path,
    out_path: str | Path,
    *,
    fps: int = DEFAULT_FPS,
    ffmpeg_exe: str | None = None,
) -> Path:
    """把 PNG 帧序列合成为 mp4 视频。"""
    ffmpeg = ffmpeg_exe or find_ffmpeg()
    if not ffmpeg:
        raise SceneError(
            "未找到 ffmpeg。请安装 imageio-ffmpeg（pip install imageio-ffmpeg），"
            "或安装系统 ffmpeg 并加入 PATH，或设置环境变量 CODEMV_FFMPEG 指向 ffmpeg.exe。"
        )

    frames_dir = Path(frames_dir).expanduser().resolve()
    pattern = str(frames_dir / "frame_%05d.png")
    output = Path(out_path).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    def build_command(codec_args: list[str]) -> list[str]:
        return [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-framerate",
            str(fps),
            "-i",
            pattern,
            *codec_args,
            "-pix_fmt",
            "yuv420p",
            str(output),
        ]

    # 优先 libx264，失败则回退到兼容性更好的 mpeg4
    attempts = [
        build_command(["-c:v", "libx264", "-preset", "medium", "-crf", "20"]),
        build_command(["-c:v", "mpeg4", "-q:v", "3"]),
    ]
    last_error = ""
    for command in attempts:
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        if result.returncode == 0 and output.exists() and output.stat().st_size > 0:
            return output
        last_error = (result.stderr or "").strip() or f"ffmpeg 退出码 {result.returncode}"

    raise SceneError(f"视频合成失败：{last_error}")


def render_video(
    scene_path: str | Path,
    out_path: str | Path,
    *,
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
    fps: int = DEFAULT_FPS,
    duration: float = DEFAULT_DURATION,
    frame_dir: str | Path | None = None,
    progress: bool = True,
    progress_callback: Callable[[int, int], None] | None = None,
) -> Path:
    """完整流程：加载场景 → 逐帧渲染 → 合成 mp4。

    frame_dir 为空时使用临时目录并自动清理；指定后保留逐帧 PNG。
    """
    render_frame = load_scene(scene_path)

    frame_directory = Path(frame_dir).expanduser().resolve() if frame_dir is not None else None
    output = Path(out_path).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    if frame_directory is not None:
        if frame_directory.exists():
            shutil.rmtree(frame_directory)
        frame_directory.mkdir(parents=True, exist_ok=True)
        render_frames(
            render_frame,
            frame_directory,
            width=width,
            height=height,
            fps=fps,
            duration=duration,
            progress=progress,
            progress_callback=progress_callback,
        )
        return compose_video(frame_directory, output, fps=fps)

    # 临时帧放在输出目录下，渲染完自动清理
    temp_directory = output.parent / f".codemv-frames-{uuid.uuid4().hex}"
    temp_directory.mkdir(parents=True, exist_ok=True)
    try:
        render_frames(
            render_frame,
            temp_directory,
            width=width,
            height=height,
            fps=fps,
            duration=duration,
            progress=progress,
            progress_callback=progress_callback,
        )
        return compose_video(temp_directory, output, fps=fps)
    finally:
        shutil.rmtree(temp_directory, ignore_errors=True)


def render_preview(
    scene_path: str | Path,
    out_path: str | Path,
    *,
    t: float = 0.5,
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
) -> Path:
    """只渲染指定进度 t 的单帧预览图。"""
    render_frame = load_scene(scene_path)
    image = _normalize_frame(render_frame(t), width, height).convert("RGB")
    output = Path(out_path).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)
    return output
