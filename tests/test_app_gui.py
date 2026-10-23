"""桌面界面冒烟测试（离屏运行，不依赖显示器）。"""

from __future__ import annotations

import os
import unittest
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

try:
    from PySide6.QtWidgets import QApplication
except ImportError:  # pragma: no cover - 未安装 PySide6 时跳过
    QApplication = None  # type: ignore[assignment]

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


if __name__ == "__main__":
    unittest.main()
