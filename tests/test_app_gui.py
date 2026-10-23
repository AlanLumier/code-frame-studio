"""桌面界面冒烟测试（离屏运行，不依赖显示器）。"""

from __future__ import annotations

import os
import shutil
import unittest
import uuid
from pathlib import Path
from unittest import mock

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

try:
    from PySide6.QtWidgets import QApplication
except ImportError:  # pragma: no cover - 未安装 PySide6 时跳过
    QApplication = None  # type: ignore[assignment]

from codemv.app import workers
from codemv.app.settings import AppSettings

PROJECT_ROOT = Path(__file__).resolve().parent.parent


@unittest.skipIf(QApplication is None, "未安装 PySide6")
class GuiSmokeTest(unittest.TestCase):
    app = None

    @classmethod
    def setUpClass(cls) -> None:
        cls.app = QApplication.instance() or QApplication([])

    def test_icons_render(self) -> None:
        from codemv.app.icons import icon

        for name in ("sparkles", "play", "eye", "settings", "refresh-cw", "download"):
            self.assertFalse(icon(name).isNull(), f"图标 {name} 渲染失败")

    def test_main_window_builds(self) -> None:
        from codemv.app.main_window import MainWindow

        window = MainWindow(settings=AppSettings(), auto_start=False)
        try:
            self.assertGreaterEqual(window.scene_list.count(), 3)
            self.assertTrue(window.render_button.isEnabled())
            self.assertFalse(window.update_banner.isVisible())

            screenshot = PROJECT_ROOT / "output" / "ui_smoke.png"
            screenshot.parent.mkdir(parents=True, exist_ok=True)
            self.assertTrue(window.grab().save(str(screenshot)), "截图保存失败")
            self.assertTrue(screenshot.exists())
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


class AIWorkerTest(unittest.TestCase):
    """验证 AIWorker 的生成、自动修复与错误上报（模型调用被打桩）。"""

    GOOD_CODE = '''from PIL import Image

WIDTH, HEIGHT = 960, 540


def render_frame(t: float) -> Image.Image:
    return Image.new("RGB", (WIDTH, HEIGHT), (10, 20, 30))
'''

    def setUp(self) -> None:
        self.temp_dir = PROJECT_ROOT / "output" / ".test-tmp" / f"ai-worker-{uuid.uuid4().hex}"
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self.settings = AppSettings(api_key="sk-test", model="demo-model")

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_generates_valid_scene(self) -> None:
        from PIL import Image

        from codemv.renderer import load_scene

        worker = workers.AIWorker("一颗发光的球", self.settings, self.temp_dir)
        done: list[str] = []
        failed: list[str] = []
        worker.done.connect(done.append)
        worker.failed.connect(failed.append)

        fenced = "```python\n" + self.GOOD_CODE + "\n```"
        with mock.patch.object(workers, "chat_completion", return_value=fenced):
            worker.run()

        self.assertEqual(failed, [])
        self.assertEqual(len(done), 1)
        scene_path = Path(done[0])
        self.assertTrue(scene_path.exists())
        self.assertEqual(scene_path.parent, self.temp_dir)
        self.assertIsInstance(load_scene(scene_path)(0.5), Image.Image)

    def test_retries_after_invalid_code(self) -> None:
        calls = {"count": 0}

        def fake_completion(*args, **kwargs) -> str:
            calls["count"] += 1
            if calls["count"] == 1:
                return "```python\ndef render_frame(t:\n    return 1\n```"
            return "```python\n" + self.GOOD_CODE + "\n```"

        worker = workers.AIWorker("测试画面", self.settings, self.temp_dir)
        done: list[str] = []
        worker.done.connect(done.append)

        with mock.patch.object(workers, "chat_completion", side_effect=fake_completion):
            worker.run()

        self.assertEqual(calls["count"], 2)
        self.assertEqual(len(done), 1)
        self.assertTrue(Path(done[0]).exists())

    def test_reports_model_error(self) -> None:
        from codemv.app.ai_client import AIClientError

        worker = workers.AIWorker("测试画面", self.settings, self.temp_dir)
        failed: list[str] = []
        worker.failed.connect(failed.append)

        with mock.patch.object(workers, "chat_completion", side_effect=AIClientError("接口不可用")):
            worker.run()

        self.assertEqual(len(failed), 1)
        self.assertIn("接口不可用", failed[0])


if __name__ == "__main__":
    unittest.main()
