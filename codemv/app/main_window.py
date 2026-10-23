"""codemv 桌面主窗口。"""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

from PySide6.QtCore import QFileSystemWatcher, QSize, Qt, QTimer, QUrl
from PySide6.QtGui import QDesktopServices, QPixmap
from PySide6.QtWidgets import (
    QApplication,
    QDialog,
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QSlider,
    QTextEdit,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from codemv import __version__
from codemv.prompt import build_scene_prompt
from codemv.renderer import DEFAULT_HEIGHT, DEFAULT_WIDTH

from . import theme
from .icons import icon
from .settings import PROJECT_ROOT, AppSettings
from .settings_dialog import SettingsDialog
from .updater import REPO_URL
from .widgets import ToggleSwitch
from .workers import (
    AIWorker,
    InstallUpdateWorker,
    PreviewWorker,
    RenderWorker,
    UpdateCheckWorker,
)

SCENES_DIR = PROJECT_ROOT / "scenes"
OUTPUT_DIR = PROJECT_ROOT / "output"

NEW_SCENE_TEMPLATE = '''"""新场景：{name}"""

from PIL import Image, ImageDraw

WIDTH, HEIGHT = 960, 540


def render_frame(t: float) -> Image.Image:
    """t: 0.0 → 1.0 的动画进度。"""
    image = Image.new("RGB", (WIDTH, HEIGHT), (10, 14, 26))
    draw = ImageDraw.Draw(image)

    radius = 40 + 60 * t
    cx, cy = WIDTH / 2, HEIGHT / 2
    draw.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        fill=(110, 168, 255),
    )
    return image
'''


class MainWindow(QMainWindow):
    """应用主窗口：场景管理、AI 生成、预览、渲染与更新。"""

    def __init__(self, settings: AppSettings | None = None, auto_start: bool = True) -> None:
        super().__init__()
        self.settings = settings or AppSettings.load()
        self.current_scene: Path | None = None
        self.pending_update = None
        self._workers: list = []
        self._preview_token = 0
        self._preview_source: QPixmap | None = None
        self._checking_updates = False

        self.setWindowTitle("codemv — AI 逐帧渲染工作台")
        self.setWindowIcon(icon("sparkles", theme.ACCENT, 32))
        self.setStyleSheet(theme.stylesheet())
        self.resize(1280, 820)
        self.setMinimumSize(1080, 700)

        SCENES_DIR.mkdir(parents=True, exist_ok=True)
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        self._build_ui()
        self._setup_watcher()
        self._reload_scenes()
        self._update_api_hint()

        if auto_start:
            QTimer.singleShot(900, self._startup_checks)

    # ------------------------------------------------------------------ UI
    def _build_ui(self) -> None:
        central = QWidget()
        self.setCentralWidget(central)
        root = QVBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        root.addWidget(self._build_header())

        self.update_banner = self._build_update_banner()
        root.addWidget(self.update_banner)

        content = QWidget()
        content_layout = QHBoxLayout(content)
        content_layout.setContentsMargins(18, 16, 18, 16)
        content_layout.setSpacing(16)
        content_layout.addWidget(self._build_left_panel())
        content_layout.addWidget(self._build_preview_panel(), 1)
        root.addWidget(content, 1)

    def _build_header(self) -> QWidget:
        header = QWidget()
        header.setObjectName("header")
        layout = QHBoxLayout(header)
        layout.setContentsMargins(20, 12, 20, 12)
        layout.setSpacing(10)

        logo = QLabel()
        logo.setPixmap(icon("sparkles", theme.ACCENT, 26).pixmap(26, 26))
        layout.addWidget(logo)

        title = QLabel("codemv")
        title.setObjectName("title")
        layout.addWidget(title)

        subtitle = QLabel("AI 逐帧渲染工作台")
        subtitle.setObjectName("subtitle")
        layout.addWidget(subtitle)

        layout.addStretch(1)

        version = QLabel(f"v{__version__}")
        version.setObjectName("version")
        layout.addWidget(version)

        self.update_button = QPushButton("检查更新")
        self.update_button.setIcon(icon("refresh-cw", theme.TEXT, 16))
        self.update_button.clicked.connect(lambda: self._check_updates(manual=True))
        layout.addWidget(self.update_button)

        self.settings_button = QToolButton()
        self.settings_button.setIcon(icon("settings", theme.TEXT, 20))
        self.settings_button.setIconSize(QSize(20, 20))
        self.settings_button.setToolTip("设置")
        self.settings_button.clicked.connect(self._open_settings)
        layout.addWidget(self.settings_button)
        return header

    def _build_update_banner(self) -> QFrame:
        banner = QFrame()
        banner.setObjectName("updateBanner")
        banner.setVisible(False)
        layout = QHBoxLayout(banner)
        layout.setContentsMargins(16, 8, 12, 8)
        layout.setSpacing(10)

        icon_label = QLabel()
        icon_label.setPixmap(icon("download", theme.ACCENT, 18).pixmap(18, 18))
        layout.addWidget(icon_label)

        self.banner_text = QLabel("发现新版本")
        self.banner_text.setObjectName("bannerText")
        layout.addWidget(self.banner_text)
        layout.addStretch(1)

        self.install_button = QPushButton("立即更新")
        self.install_button.setObjectName("primary")
        self.install_button.setIcon(icon("download", "#FFFFFF", 16))
        self.install_button.clicked.connect(self._install_update)
        layout.addWidget(self.install_button)

        dismiss = QToolButton()
        dismiss.setIcon(icon("x", theme.MUTED, 16))
        dismiss.setIconSize(QSize(16, 16))
        dismiss.setToolTip("暂时忽略")
        dismiss.clicked.connect(lambda: banner.setVisible(False))
        layout.addWidget(dismiss)
        return banner

    def _build_left_panel(self) -> QWidget:
        panel = QFrame()
        panel.setObjectName("panel")
        panel.setFixedWidth(360)
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(10)

        scene_header = QHBoxLayout()
        scene_title = QLabel("场景")
        scene_title.setObjectName("section")
        scene_header.addWidget(scene_title)
        scene_header.addStretch(1)

        new_button = self._tool_button("plus", "新建场景", self._create_scene)
        code_button = self._tool_button("file-code", "用默认编辑器打开代码", self._open_scene_code)
        folder_button = self._tool_button("folder-open", "打开场景目录", lambda: self._open_folder(SCENES_DIR))
        delete_button = self._tool_button("trash-2", "删除场景", self._delete_scene)
        for button in (new_button, code_button, folder_button, delete_button):
            scene_header.addWidget(button)
        layout.addLayout(scene_header)

        self.scene_list = QListWidget()
        self.scene_list.setIconSize(QSize(16, 16))
        self.scene_list.setMinimumHeight(200)
        self.scene_list.currentItemChanged.connect(lambda *_: self._on_scene_selected())
        layout.addWidget(self.scene_list, 1)

        hint = QLabel("选中场景会自动生成预览帧")
        hint.setObjectName("status")
        layout.addWidget(hint)

        divider = QFrame()
        divider.setObjectName("divider")
        divider.setFixedHeight(1)
        layout.addWidget(divider)

        ai_header = QHBoxLayout()
        ai_icon = QLabel()
        ai_icon.setPixmap(icon("sparkles", theme.ACCENT_SOFT, 16).pixmap(16, 16))
        ai_title = QLabel("AI 生成场景")
        ai_title.setObjectName("section")
        ai_header.addWidget(ai_icon)
        ai_header.addWidget(ai_title)
        ai_header.addStretch(1)
        layout.addLayout(ai_header)

        self.description_edit = QTextEdit()
        self.description_edit.setPlaceholderText(
            "描述你想要的画面，例如：\n夕阳下的赛博城市，霓虹灯闪烁，镜头缓慢推进"
        )
        self.description_edit.setMinimumHeight(96)
        self.description_edit.setMaximumHeight(150)
        layout.addWidget(self.description_edit)

        self.generate_button = QPushButton("生成并预览")
        self.generate_button.setObjectName("primary")
        self.generate_button.setIcon(icon("sparkles", "#FFFFFF", 16))
        self.generate_button.clicked.connect(self._generate_scene)
        layout.addWidget(self.generate_button)

        self.ai_status = QLabel("未配置 API Key 时，请先在设置中填写。")
        self.ai_status.setObjectName("status")
        self.ai_status.setWordWrap(True)
        layout.addWidget(self.ai_status)

        layout.addStretch(1)
        return panel

    def _build_preview_panel(self) -> QWidget:
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        frame = QFrame()
        frame.setObjectName("previewFrame")
        frame_layout = QVBoxLayout(frame)
        frame_layout.setContentsMargins(12, 12, 12, 12)

        self.preview_label = QLabel("还没有预览图\n选择左侧场景，或先用 AI 生成一个")
        self.preview_label.setObjectName("preview")
        self.preview_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.preview_label.setMinimumSize(520, 340)
        frame_layout.addWidget(self.preview_label)
        layout.addWidget(frame, 1)

        controls = QHBoxLayout()
        controls.setSpacing(10)

        progress_title = QLabel("动画进度")
        progress_title.setObjectName("status")
        controls.addWidget(progress_title)

        self.time_slider = QSlider(Qt.Orientation.Horizontal)
        self.time_slider.setRange(0, 1000)
        self.time_slider.setValue(500)
        self.time_slider.valueChanged.connect(self._on_slider_changed)
        self.time_slider.sliderReleased.connect(self._request_preview)
        controls.addWidget(self.time_slider, 1)

        self.time_label = QLabel("0.50")
        self.time_label.setObjectName("status")
        self.time_label.setFixedWidth(42)
        controls.addWidget(self.time_label)

        self.preview_button = QPushButton("预览帧")
        self.preview_button.setIcon(icon("eye", theme.TEXT, 16))
        self.preview_button.clicked.connect(self._request_preview)
        controls.addWidget(self.preview_button)

        self.render_button = QPushButton("渲染视频")
        self.render_button.setObjectName("primary")
        self.render_button.setIcon(icon("play", "#FFFFFF", 16))
        self.render_button.clicked.connect(self._render_video)
        controls.addWidget(self.render_button)

        self.open_output_button = QToolButton()
        self.open_output_button.setIcon(icon("folder-open", theme.TEXT, 20))
        self.open_output_button.setIconSize(QSize(20, 20))
        self.open_output_button.setToolTip("打开输出目录")
        self.open_output_button.clicked.connect(lambda: self._open_folder(OUTPUT_DIR))
        controls.addWidget(self.open_output_button)
        layout.addLayout(controls)

        status_row = QHBoxLayout()
        status_row.setSpacing(10)
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        self.progress_bar.setFixedHeight(14)
        self.progress_bar.setTextVisible(False)
        status_row.addWidget(self.progress_bar, 1)

        self.status_label = QLabel("就绪")
        self.status_label.setObjectName("status")
        self.status_label.setWordWrap(True)
        status_row.addWidget(self.status_label, 2)
        layout.addLayout(status_row)
        return container

    @staticmethod
    def _tool_button(icon_name: str, tooltip: str, handler) -> QToolButton:
        button = QToolButton()
        button.setIcon(icon(icon_name, theme.MUTED, 18))
        button.setIconSize(QSize(18, 18))
        button.setToolTip(tooltip)
        button.clicked.connect(handler)
        return button

    # ------------------------------------------------------------- 状态辅助
    def _set_status(self, text: str, level: str = "info") -> None:
        colors = {
            "info": theme.MUTED,
            "success": theme.SUCCESS,
            "error": theme.DANGER,
            "warning": theme.WARNING,
        }
        self.status_label.setStyleSheet(f"color: {colors.get(level, theme.MUTED)};")
        self.status_label.setText(text)

    def _update_api_hint(self) -> None:
        if self.settings.api_key.strip():
            self.ai_status.setText(f"模型：{self.settings.model or '未填写'}，已配置 API Key。")
            self.ai_status.setStyleSheet(f"color: {theme.MUTED};")
        else:
            self.ai_status.setText("尚未配置 API Key：点击右上角设置按钮填写。")
            self.ai_status.setStyleSheet(f"color: {theme.WARNING};")

    # ------------------------------------------------------------- 场景管理
    def _setup_watcher(self) -> None:
        self._watcher = QFileSystemWatcher([str(SCENES_DIR)], self)
        self._watcher.directoryChanged.connect(self._on_scenes_changed)

    def _on_scenes_changed(self) -> None:
        QTimer.singleShot(300, self._reload_scenes)

    def _reload_scenes(self) -> None:
        current = self.current_scene
        self.scene_list.blockSignals(True)
        self.scene_list.clear()
        for path in sorted(SCENES_DIR.glob("*.py")):
            item = QListWidgetItem(icon("image", theme.MUTED, 16), path.name)
            item.setData(Qt.ItemDataRole.UserRole, str(path))
            self.scene_list.addItem(item)
        self.scene_list.blockSignals(False)

        if self.scene_list.count() == 0:
            self.current_scene = None
            self.preview_label.setText("还没有场景\n用左侧 AI 生成，或点击 + 新建一个")
            return

        target_row = 0
        if current is not None:
            for row in range(self.scene_list.count()):
                item = self.scene_list.item(row)
                if item is not None and item.data(Qt.ItemDataRole.UserRole) == str(current):
                    target_row = row
                    break
        self.scene_list.setCurrentRow(target_row)
        self._on_scene_selected()

    def _on_scene_selected(self) -> None:
        item = self.scene_list.currentItem()
        if item is None:
            return
        path = Path(str(item.data(Qt.ItemDataRole.UserRole)))
        self.current_scene = path
        self._request_preview()

    def _create_scene(self) -> None:
        index = 1
        while (SCENES_DIR / f"untitled_{index}.py").exists():
            index += 1
        path = SCENES_DIR / f"untitled_{index}.py"
        path.write_text(NEW_SCENE_TEMPLATE.format(name=path.stem), encoding="utf-8")
        self._reload_scenes()
        for row in range(self.scene_list.count()):
            item = self.scene_list.item(row)
            if item is not None and item.data(Qt.ItemDataRole.UserRole) == str(path):
                self.scene_list.setCurrentRow(row)
                break
        self._set_status(f"已新建场景：{path.name}", "success")

    def _delete_scene(self) -> None:
        if self.current_scene is None:
            self._set_status("请先选择一个场景", "warning")
            return
        answer = QMessageBox.question(
            self,
            "删除场景",
            f"确定删除 {self.current_scene.name} 吗？此操作不可撤销。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        if answer != QMessageBox.StandardButton.Yes:
            return
        self.current_scene.unlink(missing_ok=True)
        self.current_scene = None
        self._reload_scenes()
        self._set_status("场景已删除", "info")

    def _open_scene_code(self) -> None:
        if self.current_scene is None:
            self._set_status("请先选择一个场景", "warning")
            return
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(self.current_scene)))

    @staticmethod
    def _open_folder(path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)
        if os.name == "nt":
            os.startfile(str(path))  # type: ignore[attr-defined]
        else:
            QDesktopServices.openUrl(QUrl.fromLocalFile(str(path)))

    def _scene_output_name(self, suffix: str) -> Path:
        stem = self.current_scene.stem if self.current_scene else "scene"
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return OUTPUT_DIR / f"{stem}_{stamp}{suffix}"

    # ------------------------------------------------------------- 预览
    def _on_slider_changed(self, value: int) -> None:
        self.time_label.setText(f"{value / 1000:.2f}")

    def _request_preview(self) -> None:
        if self.current_scene is None:
            return
        self._preview_token += 1
        token = self._preview_token
        out_path = OUTPUT_DIR / f".preview_{self.current_scene.stem}.png"
        self._set_status("正在渲染预览帧…")
        worker = PreviewWorker(
            self.current_scene,
            out_path,
            self.time_slider.value() / 1000.0,
            DEFAULT_WIDTH,
            DEFAULT_HEIGHT,
            token=token,
        )
        worker.done.connect(self._on_preview_done)
        worker.failed.connect(self._on_preview_failed)
        worker.finished.connect(lambda: self._release_worker(worker))
        self._track_worker(worker)
        worker.start()

    def _on_preview_done(self, path: str, token: int) -> None:
        if token != self._preview_token:
            return
        pixmap = QPixmap(path)
        if pixmap.isNull():
            self._set_status("预览图加载失败", "error")
            return
        self._preview_source = pixmap
        self._rescale_preview()
        self._set_status(f"预览：{self.current_scene.name if self.current_scene else ''}  t = {self.time_slider.value() / 1000:.2f}")

    def _on_preview_failed(self, message: str, token: int) -> None:
        if token != self._preview_token:
            return
        self._set_status(f"预览失败：{message}", "error")

    def _rescale_preview(self) -> None:
        if self._preview_source is None:
            return
        available = self.preview_label.size() - QSize(8, 8)
        if available.width() < 10 or available.height() < 10:
            return
        self.preview_label.setPixmap(
            self._preview_source.scaled(
                available,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation,
            )
        )

    def resizeEvent(self, event) -> None:  # noqa: N802 - Qt 命名
        super().resizeEvent(event)
        self._rescale_preview()

    # ------------------------------------------------------------- 渲染视频
    def _render_video(self) -> None:
        if self.current_scene is None:
            self._set_status("请先选择一个场景", "warning")
            return
        out_path = self._scene_output_name(".mp4")
        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        self.render_button.setEnabled(False)
        self.preview_button.setEnabled(False)
        self._set_status("正在渲染视频…")

        worker = RenderWorker(self.current_scene, out_path)
        worker.progress.connect(self._on_render_progress)
        worker.done.connect(self._on_render_done)
        worker.failed.connect(self._on_render_failed)
        worker.finished.connect(lambda: self._release_worker(worker))
        self._track_worker(worker)
        worker.start()

    def _on_render_progress(self, current: int, total: int) -> None:
        percent = int(current * 100 / total) if total else 0
        self.progress_bar.setValue(percent)
        self.progress_bar.setFormat(f"{percent}%")

    def _on_render_done(self, path: str) -> None:
        self.progress_bar.setVisible(False)
        self.render_button.setEnabled(True)
        self.preview_button.setEnabled(True)
        self._set_status(f"视频已生成：{path}", "success")

    def _on_render_failed(self, message: str) -> None:
        self.progress_bar.setVisible(False)
        self.render_button.setEnabled(True)
        self.preview_button.setEnabled(True)
        self._set_status(f"渲染失败：{message}", "error")
        QMessageBox.warning(self, "渲染失败", message)

    # ------------------------------------------------------------- AI 生成
    def _generate_scene(self) -> None:
        description = self.description_edit.toPlainText().strip()
        if not description:
            self._set_status("请先填写画面描述", "warning")
            return
        if not self.settings.api_key.strip():
            self._set_status("还没有配置 API Key", "warning")
            self._open_settings()
            if not self.settings.api_key.strip():
                return

        self.generate_button.setEnabled(False)
        self.ai_status.setText("正在请求模型…")
        worker = AIWorker(description, self.settings, SCENES_DIR)
        worker.status.connect(self._on_ai_status)
        worker.done.connect(self._on_ai_done)
        worker.failed.connect(self._on_ai_failed)
        worker.finished.connect(lambda: self._release_worker(worker))
        self._track_worker(worker)
        worker.start()

    def _on_ai_status(self, message: str) -> None:
        self.ai_status.setText(message)

    def _on_ai_done(self, path: str) -> None:
        self.generate_button.setEnabled(True)
        self.ai_status.setText(f"生成成功：{Path(path).name}")
        self.ai_status.setStyleSheet(f"color: {theme.SUCCESS};")
        self.current_scene = Path(path)
        self._reload_scenes()
        self._set_status("AI 场景已生成并自动预览", "success")

    def _on_ai_failed(self, message: str) -> None:
        self.generate_button.setEnabled(True)
        self.ai_status.setText(f"生成失败：{message}")
        self.ai_status.setStyleSheet(f"color: {theme.DANGER};")
        self._set_status("AI 生成失败", "error")
        QMessageBox.warning(self, "AI 生成失败", message)

    # ------------------------------------------------------------- 设置与更新
    def _open_settings(self) -> None:
        dialog = SettingsDialog(self.settings, self)
        if dialog.exec() != QDialog.DialogCode.Accepted:
            return
        self.settings = dialog.result_settings()
        try:
            self.settings.save()
        except OSError as exc:
            QMessageBox.warning(self, "保存失败", str(exc))
        self._update_api_hint()
        self._set_status("设置已保存", "success")
        if self.settings.auto_check_updates:
            self._check_updates(manual=False)

    def _startup_checks(self) -> None:
        if self.settings.auto_check_updates:
            self._check_updates(manual=False)

    def _check_updates(self, manual: bool = False) -> None:
        if self._checking_updates:
            return
        self._checking_updates = True
        self.update_button.setEnabled(False)
        if manual:
            self._set_status("正在检查更新…")

        worker = UpdateCheckWorker()
        worker.result.connect(lambda info: self._on_update_result(info, manual))
        worker.failed.connect(lambda message: self._on_update_failed(message, manual))
        worker.finished.connect(lambda: self._release_worker(worker))
        self._track_worker(worker)
        worker.start()

    def _on_update_result(self, info, manual: bool) -> None:
        self._checking_updates = False
        self.update_button.setEnabled(True)
        self.settings.last_update_check = datetime.now().isoformat(timespec="seconds")
        try:
            self.settings.save()
        except OSError:
            pass

        if info is None:
            if manual:
                self._set_status(f"已是最新版本（v{__version__}）", "success")
            return

        self.pending_update = info
        self.banner_text.setText(
            f"发现新版本 v{info.version}（当前 v{__version__}）"
        )
        self.update_banner.setVisible(True)
        self._set_status(f"发现新版本 v{info.version}", "warning")
        if self.settings.auto_install_updates:
            self._install_update()

    def _on_update_failed(self, message: str, manual: bool) -> None:
        self._checking_updates = False
        self.update_button.setEnabled(True)
        if manual:
            self._set_status(f"检查更新失败：{message}", "error")

    def _install_update(self) -> None:
        self.install_button.setEnabled(False)
        self._set_status("正在更新，请稍候…")
        worker = InstallUpdateWorker()
        worker.done.connect(self._on_update_installed)
        worker.failed.connect(self._on_update_install_failed)
        worker.finished.connect(lambda: self._release_worker(worker))
        self._track_worker(worker)
        worker.start()

    def _on_update_installed(self, message: str) -> None:
        self.install_button.setEnabled(True)
        self.update_banner.setVisible(False)
        self._set_status("更新完成", "success")
        QMessageBox.information(
            self,
            "更新完成",
            "更新已完成，请重启 codemv 以使用新版本。\n\n" + (message or ""),
        )

    def _on_update_install_failed(self, message: str) -> None:
        self.install_button.setEnabled(True)
        self._set_status(f"更新失败：{message}", "error")
        QMessageBox.warning(self, "更新失败", message)

    # ------------------------------------------------------------- 线程管理
    def _track_worker(self, worker) -> None:
        self._workers.append(worker)

    def _release_worker(self, worker) -> None:
        if worker in self._workers:
            self._workers.remove(worker)

    def closeEvent(self, event) -> None:  # noqa: N802 - Qt 命名
        for worker in list(self._workers):
            if worker.isRunning():
                worker.requestInterruption()
                worker.wait(1500)
        super().closeEvent(event)


def launch(argv: list[str] | None = None) -> int:
    """创建 QApplication 与主窗口并进入事件循环。"""
    app = QApplication.instance() or QApplication(argv or [])
    app.setApplicationName("codemv")
    app.setOrganizationName("codemv")
    app.setStyle("Fusion")
    app.setStyleSheet(theme.stylesheet())
    window = MainWindow()
    window.show()
    return app.exec()
