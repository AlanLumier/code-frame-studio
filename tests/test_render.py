"""codemv 最小测试集：场景契约、逐帧渲染、视频合成、CLI 与提示词。"""

from __future__ import annotations

import shutil
import unittest
import uuid
from contextlib import contextmanager
from pathlib import Path

from PIL import Image

from codemv.cli import main
from codemv.prompt import build_scene_prompt
from codemv.renderer import (
    SceneError,
    find_ffmpeg,
    load_scene,
    render_frames,
    render_preview,
    render_video,
)

ROOT = Path(__file__).resolve().parent.parent
SCENES_DIR = ROOT / "scenes"
TEMP_ROOT = ROOT / "output" / ".test-tmp"


@contextmanager
def make_temp_dir():
    """测试临时目录放在项目 output/ 下；清理失败（如 Windows 权限差异）时忽略。"""
    TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    path = TEMP_ROOT / f"case-{uuid.uuid4().hex}"
    path.mkdir(parents=True, exist_ok=True)
    try:
        yield str(path)
    finally:
        shutil.rmtree(path, ignore_errors=True)


class SceneContractTest(unittest.TestCase):
    def test_has_at_least_three_scenes(self) -> None:
        self.assertGreaterEqual(len(list(SCENES_DIR.glob("*.py"))), 3)

    def test_each_scene_renders_valid_frame(self) -> None:
        for scene in sorted(SCENES_DIR.glob("*.py")):
            with self.subTest(scene=scene.name):
                render_frame = load_scene(scene)
                image = render_frame(0.5)
                self.assertIsInstance(image, Image.Image)
                self.assertEqual(image.size, (960, 540))

    def test_bad_scene_raises_readable_error(self) -> None:
        with make_temp_dir() as temp_dir:
            bad_scene = Path(temp_dir) / "bad_scene.py"
            bad_scene.write_text("value = 1\n", encoding="utf-8")
            with self.assertRaises(SceneError):
                load_scene(bad_scene)

    def test_missing_scene_raises_readable_error(self) -> None:
        with self.assertRaises(SceneError):
            load_scene(SCENES_DIR / "does_not_exist.py")


class RenderPipelineTest(unittest.TestCase):
    def test_render_frames_writes_expected_count(self) -> None:
        with make_temp_dir() as temp_dir:
            render_frame = load_scene(SCENES_DIR / "waves.py")
            frames = render_frames(
                render_frame,
                temp_dir,
                width=160,
                height=90,
                fps=10,
                duration=0.6,
                progress=False,
            )
            self.assertEqual(len(frames), 6)
            for frame in frames:
                with Image.open(frame) as image:
                    self.assertEqual(image.size, (160, 90))

    def test_render_preview_writes_png(self) -> None:
        with make_temp_dir() as temp_dir:
            output = Path(temp_dir) / "preview.png"
            result = render_preview(
                SCENES_DIR / "gradients.py",
                output,
                t=0.3,
                width=320,
                height=180,
            )
            self.assertTrue(Path(result).exists())
            with Image.open(result) as image:
                self.assertEqual(image.size, (320, 180))

    @unittest.skipIf(find_ffmpeg() is None, "未找到 ffmpeg，跳过视频合成测试")
    def test_render_video_produces_mp4(self) -> None:
        with make_temp_dir() as temp_dir:
            output = Path(temp_dir) / "out.mp4"
            render_video(
                SCENES_DIR / "particles.py",
                output,
                width=160,
                height=90,
                fps=10,
                duration=0.5,
                progress=False,
            )
            self.assertTrue(output.exists())
            self.assertGreater(output.stat().st_size, 1000)


class PromptTest(unittest.TestCase):
    def test_prompt_contains_description(self) -> None:
        prompt = build_scene_prompt("夕阳下的赛博城市")
        self.assertIn("夕阳下的赛博城市", prompt)
        self.assertIn("render_frame", prompt)

    def test_empty_description_rejected(self) -> None:
        with self.assertRaises(ValueError):
            build_scene_prompt("   ")


class CliTest(unittest.TestCase):
    def test_preview_command(self) -> None:
        with make_temp_dir() as temp_dir:
            output = Path(temp_dir) / "cli preview.png"
            code = main(
                [
                    "preview",
                    str(SCENES_DIR / "waves.py"),
                    "-o",
                    str(output),
                    "--width",
                    "320",
                    "--height",
                    "180",
                ]
            )
            self.assertEqual(code, 0)
            self.assertTrue(output.exists())

    def test_missing_scene_returns_error_code(self) -> None:
        with make_temp_dir() as temp_dir:
            code = main(
                [
                    "preview",
                    str(SCENES_DIR / "does_not_exist.py"),
                    "-o",
                    str(Path(temp_dir) / "x.png"),
                ]
            )
            self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
