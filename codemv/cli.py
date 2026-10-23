"""codemv 命令行入口。"""

from __future__ import annotations

import argparse
import sys

from . import __version__
from .mv import render_mv, render_mv_preview
from .prompt import build_mv_prompt, build_scene_prompt
from .renderer import (
    DEFAULT_DURATION,
    DEFAULT_FPS,
    DEFAULT_HEIGHT,
    DEFAULT_WIDTH,
    SceneError,
    render_preview,
    render_video,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="codemv",
        description="让 AI 用代码逐帧渲染画面，并合成为 mp4 视频。",
    )
    parser.add_argument("--version", action="version", version=f"codemv {__version__}")
    subparsers = parser.add_subparsers(dest="command", required=True)

    render = subparsers.add_parser("render", help="渲染场景并合成 mp4")
    render.add_argument("scene", help="场景文件路径，例如 scenes/gradients.py")
    render.add_argument("-o", "--output", default="output/video.mp4", help="输出 mp4 路径")
    render.add_argument("--fps", type=int, default=DEFAULT_FPS, help="帧率（默认 30）")
    render.add_argument("--duration", type=float, default=DEFAULT_DURATION, help="时长秒数（默认 6）")
    render.add_argument("--width", type=int, default=DEFAULT_WIDTH, help="画面宽度（默认 960）")
    render.add_argument("--height", type=int, default=DEFAULT_HEIGHT, help="画面高度（默认 540）")
    render.add_argument(
        "--frame-dir",
        default=None,
        help="保留逐帧 PNG 的目录；不指定则渲染后自动清理临时帧",
    )

    preview = subparsers.add_parser("preview", help="只渲染一帧预览图（调参最快）")
    preview.add_argument("scene", help="场景文件路径，例如 scenes/waves.py")
    preview.add_argument("-t", "--time", type=float, default=0.5, help="动画进度 0~1（默认 0.5）")
    preview.add_argument("-o", "--output", default="output/preview.png", help="输出图片路径")
    preview.add_argument("--width", type=int, default=DEFAULT_WIDTH, help="画面宽度（默认 960）")
    preview.add_argument("--height", type=int, default=DEFAULT_HEIGHT, help="画面高度（默认 540）")

    prompt = subparsers.add_parser("prompt", help="输出给 AI 的场景生成提示词")
    prompt.add_argument("description", help="你想要的画面描述，例如：夕阳下的赛博城市")
    prompt.add_argument("--mv", action="store_true", help="输出 MV 场景提示词（含音频卡点上下文说明）")

    mv = subparsers.add_parser("mv", help="根据音频渲染带歌词与卡点的 MV")
    mv.add_argument("scene", help="MV 场景文件路径，例如 scenes/mv_night_sea.py")
    mv.add_argument("--audio", required=True, help="音频文件路径（mp3 / wav / m4a 等）")
    mv.add_argument("--lyrics", default=None, help="歌词文件路径（.lrc）；留空则不显示歌词")
    mv.add_argument("--engine", choices=["python", "p5"], default="python", help="渲染引擎（python=内置矢量，p5=p5.brush 手绘）")
    mv.add_argument("-o", "--output", default="output/mv.mp4", help="输出 mp4 路径")
    mv.add_argument("--fps", type=int, default=24, help="帧率（默认 24）")
    mv.add_argument("--width", type=int, default=1080, help="画面宽度（默认 1080）")
    mv.add_argument("--height", type=int, default=1920, help="画面高度（默认 1920）")

    mv_preview = subparsers.add_parser("mv-preview", help="渲染 MV 指定秒数的预览帧")
    mv_preview.add_argument("scene", help="MV 场景文件路径")
    mv_preview.add_argument("--audio", required=True, help="音频文件路径")
    mv_preview.add_argument("--lyrics", default=None, help="歌词文件路径（.lrc）")
    mv_preview.add_argument("--engine", choices=["python", "p5"], default="python", help="渲染引擎（python / p5）")
    mv_preview.add_argument("-t", "--seconds", type=float, default=0.0, help="秒数（默认 0）")
    mv_preview.add_argument("-o", "--output", default="output/mv_preview.png", help="输出图片路径")
    mv_preview.add_argument("--width", type=int, default=1080, help="画面宽度（默认 1080）")
    mv_preview.add_argument("--height", type=int, default=1920, help="画面高度（默认 1920）")

    subparsers.add_parser("gui", help="启动桌面图形界面（需要 PySide6）")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    try:
        if args.command == "render":
            output = render_video(
                args.scene,
                args.output,
                width=args.width,
                height=args.height,
                fps=args.fps,
                duration=args.duration,
                frame_dir=args.frame_dir,
            )
            print(f"视频已生成：{output}")
        elif args.command == "preview":
            output = render_preview(
                args.scene,
                args.output,
                t=args.time,
                width=args.width,
                height=args.height,
            )
            print(f"预览帧已生成：{output}")
        elif args.command == "prompt":
            if args.mv:
                print(build_mv_prompt(args.description))
            else:
                print(build_scene_prompt(args.description))
        elif args.command == "mv":
            if args.engine == "p5":
                from .p5_backend import render_p5_mv

                output = render_p5_mv(
                    args.scene,
                    args.audio,
                    args.output,
                    lyrics_path=args.lyrics,
                    fps=args.fps,
                    width=args.width,
                    height=args.height,
                )
            else:
                output = render_mv(
                    args.scene,
                    args.audio,
                    args.output,
                    lyrics_path=args.lyrics,
                    fps=args.fps,
                    width=args.width,
                    height=args.height,
                )
            print(f"MV 已生成：{output}")
        elif args.command == "mv-preview":
            if args.engine == "p5":
                from .audio import analyze_audio
                from .lyrics import load_lyrics
                from .p5_backend import render_p5_preview

                analysis = analyze_audio(args.audio)
                lyrics = load_lyrics(args.lyrics, duration=analysis.duration) if args.lyrics else None
                output = render_p5_preview(
                    args.scene,
                    analysis,
                    lyrics,
                    args.seconds,
                    args.output,
                    width=args.width,
                    height=args.height,
                )
            else:
                output = render_mv_preview(
                    args.scene,
                    args.audio,
                    args.output,
                    seconds=args.seconds,
                    lyrics_path=args.lyrics,
                    width=args.width,
                    height=args.height,
                )
            print(f"MV 预览帧已生成：{output}")
        elif args.command == "gui":
            try:
                from .app.main_window import launch
            except ImportError as exc:
                print(
                    "错误：启动图形界面需要 PySide6，请先执行 pip install -r requirements.txt"
                    f"（{exc}）",
                    file=sys.stderr,
                )
                return 1
            return launch()
        return 0
    except SceneError as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\n已取消。", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
