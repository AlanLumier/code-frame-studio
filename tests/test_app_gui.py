"""桌面界面冒烟测试与 MV AI 工作线程测试（离屏运行）。"""

from __future__ import annotations

import os
import shutil
import unittest
import uuid
from pathlib import Path
from unittest import mock

import numpy as np

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

try:
    from PySide6.QtWidgets import QApplication
except ImportError:  # pragma: no cover - 未安装 PySide6 时跳过
    QApplication = None  # type: ignore[assignment]

from codemv.app.settings import AppSettings
from codemv.audio import AudioAnalysis

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TEMP_ROOT = PROJECT_ROOT / "output" / ".test-tmp"

GOOD_MV_CODE = """from PIL import Image

def render_frame(t: float, ctx) -> Image.Image:
    width, height = ctx.width, ctx.height
    return Image.new("RGB", (width, height), (12, 20, 34))
"""


def make_analysis(duration: float = 2.0) -> AudioAnalysis:
    frames = max(10, int(duration * 43))
    return AudioAnalysis(
        duration=duration,
        bpm=120.0,
        beats=[0.5, 1.0, 1.5],
        frame_rate=43.0,
        env=np.full(frames, 0.5, dtype=np.float32),
        low=np.full(frames, 0.4, dtype=np.float32),
        mid=np.full(frames, 0.5, dtype=np.float32),
        high=np.full(frames, 0.3, dtype=np.float32),
    )


@unittest.skipIf(QApplication is None, "未安装 PySide6")
class GuiSmokeTest(unittest.TestCase):
    app = None

    @classmethod
    def setUpClass(cls) -> None:
        cls.app = QApplication.instance() or QApplication([])

    def test_icons_render(self) -> None:
        from codemv.app.icons import icon

        for name in (
            "sparkles",
            "music",
            "file-audio",
            "upload",
            "arrow-right",
            "refresh-ccw",
            "play",
            "settings",
        ):
            self.assertFalse(icon(name).isNull(), f"图标 {name} 渲染失败")

    def test_main_window_builds(self) -> None:
        from codemv.app.main_window import MainWindow

        window = MainWindow(settings=AppSettings(), auto_start=False)
        try:
            self.assertEqual(window.stack.count(), 3)
            self.assertEqual(len(window.step_frames), 3)
            self.assertFalse(window.next_button.isEnabled())
            self.assertFalse(window.update_banner.isVisible())
            self.assertEqual(window.ai_chip.text(), "AI 未配置")

            screenshot = PROJECT_ROOT / "output" / "ui_v4.png"
            screenshot.parent.mkdir(parents=True, exist_ok=True)
            self.assertTrue(window.grab().save(str(screenshot)))
        finally:
            window.close()

    def test_settings_dialog_roundtrip(self) -> None:
        from codemv.app.settings_dialog import SettingsDialog

        dialog = SettingsDialog(AppSettings(api_key="sk-demo", model="demo-model"))
        try:
            result = dialog.result_settings()
            self.assertEqual(result.api_key, "sk-demo")
            self.assertEqual(result.model, "demo-model")
        finally:
            dialog.deleteLater()


@unittest.skipIf(QApplication is None, "未安装 PySide6")
class MVAIWorkerTest(unittest.TestCase):
    def setUp(self) -> None:
        TEMP_ROOT.mkdir(parents=True, exist_ok=True)
        self.temp_dir = TEMP_ROOT / f"mv-ai-{uuid.uuid4().hex}"
        self.scenes = self.temp_dir / "scenes"
        self.output = self.temp_dir / "output"
        self.scenes.mkdir(parents=True)
        self.output.mkdir(parents=True)
        self.settings = AppSettings(api_key="sk-test", model="demo-model")

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _make_worker(self):
        from codemv.app.mv_workers import MVSceneAIWorker

        return MVSceneAIWorker(
            audio_name="song.mp3",
            analysis=make_analysis(),
            lyrics_path=None,
            idea="夜晚的海边",
            settings=self.settings,
            scenes_dir=self.scenes,
            output_dir=self.output,
            width=360,
            height=640,
        )

    def test_generates_scene_and_preview(self) -> None:
        from codemv.app import mv_workers

        worker = self._make_worker()
        done: list[tuple[str, str]] = []
        failed: list[str] = []
        worker.done.connect(lambda scene, preview: done.append((scene, preview)))
        worker.failed.connect(failed.append)

        fenced = "```python\n" + GOOD_MV_CODE + "\n```"
        with mock.patch.object(mv_workers, "chat_completion", return_value=fenced):
            worker.run()

        self.assertEqual(failed, [])
        self.assertEqual(len(done), 1)
        scene_path = Path(done[0][0])
        preview_path = Path(done[0][1])
        self.assertTrue(scene_path.exists())
        self.assertTrue(preview_path.exists())
        self.assertEqual(scene_path.parent, self.scenes)
        self.assertGreater(preview_path.stat().st_size, 100)

    def test_retries_after_broken_code(self) -> None:
        from codemv.app import mv_workers

        calls = {"count": 0}

        def fake_completion(*args, **kwargs) -> str:
            calls["count"] += 1
            if calls["count"] == 1:
                return "```python\ndef render_frame(t:\n    return 1\n```"
            return "```python\n" + GOOD_MV_CODE + "\n```"

        worker = self._make_worker()
        done: list[tuple[str, str]] = []
        worker.done.connect(lambda scene, preview: done.append((scene, preview)))

        with mock.patch.object(mv_workers, "chat_completion", side_effect=fake_completion):
            worker.run()

        self.assertEqual(calls["count"], 2)
        self.assertEqual(len(done), 1)
        self.assertTrue(Path(done[0][0]).exists())

    def test_reports_model_error(self) -> None:
        from codemv.app import mv_workers
        from codemv.app.ai_client import AIClientError

        worker = self._make_worker()
        failed: list[str] = []
        worker.failed.connect(failed.append)

        with mock.patch.object(mv_workers, "chat_completion", side_effect=AIClientError("接口不可用")):
            worker.run()

        self.assertEqual(len(failed), 1)
        self.assertIn("接口不可用", failed[0])


if __name__ == "__main__":
    unittest.main()
