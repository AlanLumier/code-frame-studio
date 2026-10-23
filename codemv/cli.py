"""codemv 命令行入口。"""

from __future__ import annotations

import argparse
import sys

from . import __version__
from .prompt import build_scene_prompt
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
            print(build_scene_prompt(args.description))
        return 0
    except SceneError as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\n已取消。", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
