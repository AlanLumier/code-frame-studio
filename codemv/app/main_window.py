"""codemv 音乐 MV 工作台主窗口（面向全年龄的向导式界面）。"""

from __future__ import annotations

import os
from pathlib import Path

from PySide6.QtCore import QSize, Qt, QTimer, QUrl, Signal
from PySide6.QtGui import QDesktopServices, QPixmap
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QDialog,
    QFileDialog,
    QFormLayout,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPlainTextEdit,
    QProgressBar,
    QPushButton,
    QSlider,
    QStackedWidget,
    QTextEdit,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from codemv import __version__
from codemv.audio import AudioAnalysis
from codemv.lyrics import load_lyrics
from codemv.p5_backend import environment_status as p5_environment_status

from . import theme
from .icons import icon
from .mv_workers import (
    AudioAnalyzeWorker,
    MVPreviewWorker,
    MVRenderWorker,
    MVSceneAIWorker,
    P5PreviewWorker,
    P5RenderWorker,
    P5SceneAIWorker,
)
from .settings import PROJECT_ROOT, AppSettings
from .settings_dialog import SettingsDialog
from .updater import REPO_URL, ReleaseInfo
from .workers import InstallUpdateWorker, UpdateCheckWorker

SCENES_DIR = PROJECT_ROOT / "scenes"
OUTPUT_DIR = PROJECT_ROOT / "output"

STEPS = ["导入歌曲", "AI 生成画面", "渲染导出"]

AUDIO_FILTER = "音频文件 (*.mp3 *.wav *.m4a *.flac *.aac *.ogg)"
LYRICS_FILTER = "歌词文件 (*.lrc *.txt)"


def _format_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    minutes = int(seconds // 60)
    remain = int(seconds % 60)
    return f"{minutes:02d}:{remain:02d}"


class DropZone(QFrame):
    """可拖拽 / 可点击的文件选择区域。"""

    fileSelected = Signal(str)

    def __init__(
        self,
        icon_name: str,
        title: str,
        hint: str,
        file_filter: str,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.setObjectName("dropzone")
        self.setAcceptDrops(True)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setMinimumHeight(140)
        self._filter = file_filter
        self._default_title = title

        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 18, 20, 18)
        layout.setSpacing(6)
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self._icon_label = QLabel()
        self._icon_label.setPixmap(icon(icon_name, theme.ACCENT, 30).pixmap(30, 30))
        self._icon_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self._icon_label)

        self._title_label = QLabel(title)
        self._title_label.setObjectName("dropTitle")
        self._title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self._title_label)

        self._hint_label = QLabel(hint)
        self._hint_label.setObjectName("dropHint")
        self._hint_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._hint_label.setWordWrap(True)
        layout.addWidget(self._hint_label)

    def set_file_text(self, text: str) -> None:
        self._title_label.setText(text)

    def reset_text(self) -> None:
        self._title_label.setText(self._default_title)

    def mouseReleaseEvent(self, event) -> None:  # noqa: N802 - Qt 命名
        if event.button() == Qt.MouseButton.LeftButton:
            path, _ = QFileDialog.getOpenFileName(self, "选择文件", "", self._filter)
            if path:
                self.fileSelected.emit(path)
        super().mouseReleaseEvent(event)

    def dragEnterEvent(self, event) -> None:  # noqa: N802 - Qt 命名
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
            self.setProperty("dragOver", True)
            self._repolish()

    def dragLeaveEvent(self, event) -> None:  # noqa: N802 - Qt 命名
        self.setProperty("dragOver", False)
        self._repolish()
        super().dragLeaveEvent(event)

    def dropEvent(self, event) -> None:  # noqa: N802 - Qt 命名
        self.setProperty("dragOver", False)
        self._repolish()
        urls = event.mimeData().urls()
        if urls:
            path = urls[0].toLocalFile()
            if path:
                self.fileSelected.emit(path)
        event.acceptProposedAction()

    def _repolish(self) -> None:
        self.style().unpolish(self)
        self.style().polish(self)


class MainWindow(QMainWindow):
    """三步式 MV 创作向导。"""

    def __init__(self, settings: AppSettings | None = None, auto_start: bool = True) -> None:
        super().__init__()
        self.settings = settings or AppSettings.load()
        self.audio_path: Path | None = None
        self.lyrics_path: Path | None = None
        self.analysis: AudioAnalysis | None = None
        self.scene_path: Path | None = None
        self.renderer = "python"
        self.preview_source: QPixmap | None = None
        self.pending_update: ReleaseInfo | None = None
        self._workers: list = []
        self._checking_updates = False
        self._ai_busy = False
        self._rendering = False

        self.setWindowTitle("codemv — AI 音乐 MV 工作台")
        self.setWindowIcon(icon("sparkles", theme.ACCENT, 32))
        self.setStyleSheet(theme.stylesheet())
        self.resize(1280, 840)
        self.setMinimumSize(1100, 720)

        SCENES_DIR.mkdir(parents=True, exist_ok=True)
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        self._build_ui()
        self._set_step(0)
        self._update_ai_chip()

        if auto_start:
            QTimer.singleShot(900, self._startup_checks)

    # ------------------------------------------------------------------ 界面
    def _build_ui(self) -> None:
        central = QWidget()
        self.setCentralWidget(central)
        root = QVBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        root.addWidget(self._build_header())

        self.update_banner = self._build_update_banner()
        root.addWidget(self.update_banner)

        step_bar = QWidget()
        step_layout = QHBoxLayout(step_bar)
        step_layout.setContentsMargins(28, 16, 28, 4)
        step_layout.setSpacing(12)
        self.step_frames: list[QFrame] = []
        self.step_numbers: list[QLabel] = []
        for index, label in enumerate(STEPS):
            frame = QFrame()
            frame.setObjectName("step")
            frame.setCursor(Qt.CursorShape.PointingHandCursor)
            frame.mouseReleaseEvent = lambda event, i=index: self._on_step_clicked(i)  # type: ignore[assignment]
            frame_layout = QHBoxLayout(frame)
            frame_layout.setContentsMargins(12, 8, 14, 8)
            frame_layout.setSpacing(10)
            number = QLabel(str(index + 1))
            number.setObjectName("stepNumber")
            text = QLabel(label)
            text.setObjectName("stepLabel")
            frame_layout.addWidget(number)
            frame_layout.addWidget(text)
            frame_layout.addStretch(1)
            self.step_frames.append(frame)
            self.step_numbers.append(number)
            step_layout.addWidget(frame, 1)
        root.addWidget(step_bar)

        self.stack = QStackedWidget()
        self.stack.addWidget(self._build_import_page())
        self.stack.addWidget(self._build_ai_page())
        self.stack.addWidget(self._build_export_page())
        root.addWidget(self.stack, 1)

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

        subtitle = QLabel("AI 音乐 MV 工作台")
        subtitle.setObjectName("subtitle")
        layout.addWidget(subtitle)
        layout.addStretch(1)

        self.ai_chip = QLabel("AI 未配置")
        self.ai_chip.setObjectName("chip")
        layout.addWidget(self.ai_chip)

        version = QLabel(f"v{__version__}")
        version.setObjectName("version")
        layout.addWidget(version)

        self.update_button = QPushButton("检查更新")
        self.update_button.setIcon(icon("refresh-cw", theme.TEXT, 16))
        self.update_button.clicked.connect(lambda: self._check_updates(manual=True))
        layout.addWidget(self.update_button)

        settings_button = QToolButton()
        settings_button.setIcon(icon("settings", theme.TEXT, 20))
        settings_button.setIconSize(QSize(20, 20))
        settings_button.setToolTip("设置")
        settings_button.clicked.connect(self._open_settings)
        layout.addWidget(settings_button)
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
        dismiss.clicked.connect(lambda: banner.setVisible(False))
        layout.addWidget(dismiss)
        return banner

    # ------------------------------------------------------------------ 第 1 步
    def _build_import_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(32, 22, 32, 26)
        layout.setSpacing(16)

        title = QLabel("先选一首歌")
        title.setObjectName("pageTitle")
        layout.addWidget(title)
        hint = QLabel("支持 mp3 / wav / m4a / flac。歌词可选：.lrc 能精确卡点，.txt 会按时间平均分配。")
        hint.setObjectName("pageHint")
        hint.setWordWrap(True)
        layout.addWidget(hint)

        self.audio_drop = DropZone(
            "music",
            "把音乐拖到这里",
            "或点击选择文件",
            AUDIO_FILTER,
        )
        self.audio_drop.fileSelected.connect(self._load_audio)
        layout.addWidget(self.audio_drop, 2)

        self.lyrics_drop = DropZone(
            "file-audio",
            "歌词（可选）",
            "拖入 .lrc（精确卡点）或 .txt",
            LYRICS_FILTER,
        )
        self.lyrics_drop.fileSelected.connect(self._load_lyrics)
        layout.addWidget(self.lyrics_drop, 1)

        info_row = QHBoxLayout()
        info_row.setSpacing(10)
        self.duration_chip = QLabel("时长 —")
        self.bpm_chip = QLabel("BPM —")
        self.beat_chip = QLabel("节拍 —")
        self.lyric_chip = QLabel("歌词 —")
        for chip in (self.duration_chip, self.bpm_chip, self.beat_chip, self.lyric_chip):
            chip.setObjectName("infoChip")
            info_row.addWidget(chip)
        info_row.addStretch(1)
        self.next_button = QPushButton("开始 AI 创作")
        self.next_button.setObjectName("primary")
        self.next_button.setIcon(icon("arrow-right", "#FFFFFF", 16))
        self.next_button.setMinimumHeight(42)
        self.next_button.setEnabled(False)
        self.next_button.clicked.connect(self._go_to_ai_page)
        info_row.addWidget(self.next_button)
        layout.addLayout(info_row)
        return page

    def _load_audio(self, path: str) -> None:
        audio = Path(path)
        if not audio.exists():
            QMessageBox.warning(self, "文件不存在", str(audio))
            return
        self.audio_path = audio
        self.analysis = None
        self.scene_path = None
        self.audio_drop.set_file_text(audio.name)
        self.next_button.setEnabled(False)
        self.duration_chip.setText("时长 分析中…")
        self.bpm_chip.setText("BPM 分析中…")
        self.beat_chip.setText("节拍 分析中…")
        if self.lyrics_path is None:
            self.lyric_chip.setText("歌词 未导入")

        worker = AudioAnalyzeWorker(audio)
        worker.done.connect(self._on_audio_analyzed)
        worker.failed.connect(self._on_audio_failed)
        worker.finished.connect(lambda: self._release_worker(worker))
        self._track_worker(worker)
        worker.start()

    def _on_audio_analyzed(self, analysis: AudioAnalysis) -> None:
        self.analysis = analysis
        self.duration_chip.setText(f"时长 {_format_time(analysis.duration)}")
        self.bpm_chip.setText(f"BPM {analysis.bpm:.0f}")
        self.beat_chip.setText(f"节拍 {len(analysis.beats)} 个")
        if self.lyrics_path is not None:
            self._refresh_lyric_info()
        self.next_button.setEnabled(True)
        self._on_slider_changed(self.time_slider.value())
        self._log(f"音频分析完成：{_format_time(analysis.duration)}，约 {analysis.bpm:.0f} BPM。")

    def _on_audio_failed(self, message: str) -> None:
        QMessageBox.warning(self, "音频分析失败", message)
        self._log(message)
        self.duration_chip.setText("时长 —")

    def _load_lyrics(self, path: str) -> None:
        lyrics_file = Path(path)
        if not lyrics_file.exists():
            QMessageBox.warning(self, "文件不存在", str(lyrics_file))
            return
        self.lyrics_path = lyrics_file
        self.lyrics_drop.set_file_text(lyrics_file.name)
        self._refresh_lyric_info()

    def _refresh_lyric_info(self) -> None:
        if self.lyrics_path is None:
            self.lyric_chip.setText("歌词 未导入")
            self.lyrics_list.clear()
            return
        duration = self.analysis.duration if self.analysis else None
        try:
            timeline = load_lyrics(self.lyrics_path, duration=duration)
        except Exception as exc:  # noqa: BLE001
            self.lyric_chip.setText("歌词 读取失败")
            self._log(f"歌词读取失败：{exc}")
            return
        count = len(timeline.lines) if timeline else 0
        self.lyric_chip.setText(f"歌词 {count} 行")
        self.lyrics_list.clear()
        if timeline:
            for line in timeline.lines[:20]:
                item = QListWidgetItem(f"{_format_time(line.start)}  {line.text}")
                self.lyrics_list.addItem(item)

    def _go_to_ai_page(self) -> None:
        if self.analysis is None or self.audio_path is None:
            self._log("请先选择音乐文件。")
            return
        self._set_step(1)
        self.stack.setCurrentIndex(1)
        if self.scene_path is None:
            self._start_ai_generation()
        else:
            self._request_preview()

    # ------------------------------------------------------------------ 第 2 步
    def _build_ai_page(self) -> QWidget:
        page = QWidget()
        layout = QHBoxLayout(page)
        layout.setContentsMargins(28, 18, 28, 22)
        layout.setSpacing(18)

        left = QFrame()
        left.setObjectName("panel")
        left.setFixedWidth(380)
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(16, 16, 16, 16)
        left_layout.setSpacing(10)

        engine_title = QLabel("画面引擎")
        engine_title.setObjectName("sectionTitle")
        left_layout.addWidget(engine_title)
        self.renderer_combo = QComboBox()
        self.renderer_combo.addItem("内置矢量 · 速度快", "python")
        self.renderer_combo.addItem("p5.brush 手绘 · 更有手绘感", "p5")
        self.renderer_combo.currentIndexChanged.connect(self._on_renderer_changed)
        left_layout.addWidget(self.renderer_combo)
        self.engine_hint = QLabel("内置矢量引擎：速度快，画面由 AI 用代码绘制。")
        self.engine_hint.setObjectName("status")
        self.engine_hint.setWordWrap(True)
        left_layout.addWidget(self.engine_hint)

        idea_title = QLabel("给 AI 一点灵感（可选）")
        idea_title.setObjectName("sectionTitle")
        left_layout.addWidget(idea_title)
        self.idea_edit = QTextEdit()
        self.idea_edit.setPlaceholderText(
            "例如：想要手绘水彩风格，画面跟着副歌的情绪变暖；或者：以歌词里的“月亮”为主线。"
        )
        self.idea_edit.setMinimumHeight(84)
        self.idea_edit.setMaximumHeight(120)
        left_layout.addWidget(self.idea_edit)

        lyric_title = QLabel("歌词预览")
        lyric_title.setObjectName("sectionTitle")
        left_layout.addWidget(lyric_title)
        self.lyrics_list = QListWidget()
        self.lyrics_list.setMinimumHeight(120)
        left_layout.addWidget(self.lyrics_list, 1)

        button_row = QHBoxLayout()
        self.regenerate_button = QPushButton("重新生成")
        self.regenerate_button.setIcon(icon("refresh-ccw", theme.TEXT, 16))
        self.regenerate_button.clicked.connect(self._start_ai_generation)
        button_row.addWidget(self.regenerate_button)
        self.continue_button = QPushButton("下一步：渲染导出")
        self.continue_button.setObjectName("primary")
        self.continue_button.setIcon(icon("arrow-right", "#FFFFFF", 16))
        self.continue_button.setEnabled(False)
        self.continue_button.clicked.connect(self._go_to_export_page)
        button_row.addWidget(self.continue_button)
        left_layout.addLayout(button_row)

        right = QFrame()
        right.setObjectName("panel")
        right_layout = QVBoxLayout(right)
        right_layout.setContentsMargins(14, 14, 14, 14)
        right_layout.setSpacing(10)

        self.preview_label = QLabel("AI 生成画面后会显示在这里")
        self.preview_label.setObjectName("mvPreview")
        self.preview_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.preview_label.setMinimumSize(360, 420)
        right_layout.addWidget(self.preview_label, 1)

        controls = QHBoxLayout()
        controls.setSpacing(10)
        self.time_slider = QSlider(Qt.Orientation.Horizontal)
        self.time_slider.setRange(0, 1000)
        self.time_slider.setValue(350)
        self.time_slider.setEnabled(False)
        self.time_slider.valueChanged.connect(self._on_slider_changed)
        self.time_slider.sliderReleased.connect(self._request_preview)
        controls.addWidget(self.time_slider, 1)
        self.time_label = QLabel("00:00")
        self.time_label.setObjectName("chip")
        controls.addWidget(self.time_label)
        self.preview_button = QPushButton("刷新预览")
        self.preview_button.setIcon(icon("eye", theme.TEXT, 16))
        self.preview_button.setEnabled(False)
        self.preview_button.clicked.connect(self._request_preview)
        controls.addWidget(self.preview_button)
        right_layout.addLayout(controls)

        self.ai_progress = QProgressBar()
        self.ai_progress.setRange(0, 0)
        self.ai_progress.setVisible(False)
        self.ai_progress.setFixedHeight(12)
        self.ai_progress.setTextVisible(False)
        right_layout.addWidget(self.ai_progress)

        self.log_view = QPlainTextEdit()
        self.log_view.setObjectName("logView")
        self.log_view.setReadOnly(True)
        self.log_view.setMaximumHeight(96)
        right_layout.addWidget(self.log_view)

        layout.addWidget(left)
        layout.addWidget(right, 1)
        return page

    def _on_renderer_changed(self) -> None:
        renderer = self.renderer_combo.currentData()
        if renderer == "p5":
            available, message = p5_environment_status()
            if not available:
                QMessageBox.warning(
                    self,
                    "手绘引擎不可用",
                    message
                    + "\n\n可以在 js 目录双击 install_p5.cmd 安装依赖；也可以先使用内置矢量引擎。",
                )
                self.renderer_combo.setCurrentIndex(0)
                return
            self.engine_hint.setText("手绘引擎：p5.brush 水彩笔触，画面更有手绘感，渲染较慢。")
        else:
            self.engine_hint.setText("内置矢量引擎：速度快，画面由 AI 用代码绘制。")

        if self.scene_path is not None:
            self.scene_path = None
            self.continue_button.setEnabled(False)
            self.preview_label.setPixmap(QPixmap())
            self.preview_label.setText("切换引擎后需要重新生成画面")

    def _start_ai_generation(self) -> None:
        if self._ai_busy:
            return
        if self.analysis is None or self.audio_path is None:
            self._log("请先导入音乐。")
            return
        if not self.settings.api_key.strip():
            QMessageBox.information(
                self,
                "需要配置 AI",
                "请先在设置中填写 API Key，AI 才能生成画面。\n\n默认支持 DeepSeek，也可以填任何 OpenAI 兼容服务。",
            )
            self._open_settings()
            if not self.settings.api_key.strip():
                return

        renderer = self.renderer_combo.currentData()
        if renderer == "p5":
            available, message = p5_environment_status()
            if not available:
                QMessageBox.warning(self, "手绘引擎不可用", message)
                return
        self.renderer = renderer

        self._ai_busy = True
        self._set_step(1)
        self.preview_source = None
        self.preview_label.setPixmap(QPixmap())
        self.preview_label.setText("AI 正在创作，请稍候…")
        self.regenerate_button.setEnabled(False)
        self.continue_button.setEnabled(False)
        self.preview_button.setEnabled(False)
        self.ai_progress.setVisible(True)
        self.log_view.clear()
        self._log("开始理解这首歌的节奏和歌词…")

        if renderer == "p5":
            worker = P5SceneAIWorker(
                audio_name=self.audio_path.name,
                analysis=self.analysis,
                lyrics_path=self.lyrics_path,
                idea=self.idea_edit.toPlainText(),
                settings=self.settings,
                scenes_dir=PROJECT_ROOT / "js" / "scenes",
                output_dir=OUTPUT_DIR,
            )
        else:
            worker = MVSceneAIWorker(
                audio_name=self.audio_path.name,
                analysis=self.analysis,
                lyrics_path=self.lyrics_path,
                idea=self.idea_edit.toPlainText(),
                settings=self.settings,
                scenes_dir=SCENES_DIR,
                output_dir=OUTPUT_DIR,
            )
        worker.status.connect(self._log)
        worker.done.connect(self._on_ai_done)
        worker.failed.connect(self._on_ai_failed)
        worker.finished.connect(lambda: self._release_worker(worker))
        self._track_worker(worker)
        worker.start()

    def _on_ai_done(self, scene_path: str, preview_path: str) -> None:
        self._ai_busy = False
        self.scene_path = Path(scene_path)
        self.ai_progress.setVisible(False)
        self.regenerate_button.setEnabled(True)
        self.continue_button.setEnabled(True)
        self.preview_button.setEnabled(True)
        self.time_slider.setEnabled(True)
        if self.analysis is not None:
            seconds = max(0.5, min(self.analysis.duration - 0.2, self.analysis.duration * 0.35))
            self.time_slider.setValue(int(seconds / self.analysis.duration * 1000))
            self._on_slider_changed(self.time_slider.value())
        self._show_preview(preview_path)
        self._log("画面已生成。可以拖动时间轴查看不同段落，或点“重新生成”换一版。")

    def _on_ai_failed(self, message: str) -> None:
        self._ai_busy = False
        self.ai_progress.setVisible(False)
        self.regenerate_button.setEnabled(True)
        self._log(message)
        QMessageBox.warning(self, "AI 生成失败", message)

    def _on_slider_changed(self, value: int) -> None:
        if self.analysis is not None:
            self.time_label.setText(_format_time(self.analysis.duration * value / 1000))

    def _request_preview(self) -> None:
        if self.scene_path is None or self.analysis is None:
            return
        seconds = self.analysis.duration * self.time_slider.value() / 1000
        out_path = OUTPUT_DIR / "mv_preview.png"
        if self.renderer == "p5":
            worker = P5PreviewWorker(
                scene_path=self.scene_path,
                analysis=self.analysis,
                lyrics_path=self.lyrics_path,
                seconds=seconds,
                out_path=out_path,
                width=540,
                height=960,
            )
        else:
            worker = MVPreviewWorker(
                scene_path=self.scene_path,
                analysis=self.analysis,
                lyrics_path=self.lyrics_path,
                seconds=seconds,
                out_path=out_path,
            )
        worker.done.connect(self._show_preview)
        worker.failed.connect(self._log)
        worker.finished.connect(lambda: self._release_worker(worker))
        self._track_worker(worker)
        worker.start()

    def _show_preview(self, path: str) -> None:
        pixmap = QPixmap(path)
        if pixmap.isNull():
            self._log("预览图加载失败。")
            return
        self.preview_source = pixmap
        self._rescale_preview()

    def _rescale_preview(self) -> None:
        if self.preview_source is None:
            return
        available = self.preview_label.size() - QSize(10, 10)
        if available.width() < 10 or available.height() < 10:
            return
        self.preview_label.setPixmap(
            self.preview_source.scaled(
                available,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation,
            )
        )

    def resizeEvent(self, event) -> None:  # noqa: N802 - Qt 命名
        super().resizeEvent(event)
        self._rescale_preview()

    # ------------------------------------------------------------------ 第 3 步
    def _build_export_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(32, 22, 32, 26)
        layout.setSpacing(14)

        title = QLabel("渲染导出")
        title.setObjectName("pageTitle")
        layout.addWidget(title)
        hint = QLabel("确认参数后开始渲染。长歌曲需要一些时间，可以先用“30 秒样片”快速看效果。")
        hint.setObjectName("pageHint")
        hint.setWordWrap(True)
        layout.addWidget(hint)

        card = QFrame()
        card.setObjectName("panel")
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(18, 18, 18, 18)
        card_layout.setSpacing(12)

        form = QFormLayout()
        form.setSpacing(12)
        form.setLabelAlignment(Qt.AlignmentFlag.AlignRight)

        self.resolution_combo = QComboBox()
        self.resolution_combo.addItem("1080 × 1920（竖屏推荐）", (1080, 1920))
        self.resolution_combo.addItem("720 × 1280（更快）", (720, 1280))
        self.resolution_combo.addItem("1080 × 1080（方形）", (1080, 1080))
        form.addRow("分辨率", self.resolution_combo)

        self.fps_combo = QComboBox()
        self.fps_combo.addItem("24 帧/秒（有电影感）", 24)
        self.fps_combo.addItem("30 帧/秒（更流畅）", 30)
        form.addRow("帧率", self.fps_combo)

        output_row = QHBoxLayout()
        self.output_edit = QLineEdit()
        self.output_edit.setPlaceholderText("留空则自动保存到 output 目录")
        output_row.addWidget(self.output_edit, 1)
        browse_button = QPushButton("浏览…")
        browse_button.clicked.connect(self._choose_output)
        output_row.addWidget(browse_button)
        output_container = QWidget()
        output_container.setLayout(output_row)
        output_row.setContentsMargins(0, 0, 0, 0)
        form.addRow("输出文件", output_container)

        self.sample_checkbox = QCheckBox("先导出 30 秒样片（更快试用）")
        form.addRow("", self.sample_checkbox)
        card_layout.addLayout(form)

        self.render_button = QPushButton("开始渲染 MV")
        self.render_button.setObjectName("primary")
        self.render_button.setIcon(icon("play", "#FFFFFF", 18))
        self.render_button.setMinimumHeight(46)
        self.render_button.clicked.connect(self._start_render)
        card_layout.addWidget(self.render_button)

        self.render_progress = QProgressBar()
        self.render_progress.setRange(0, 100)
        self.render_progress.setValue(0)
        self.render_progress.setVisible(False)
        self.render_progress.setFixedHeight(16)
        card_layout.addWidget(self.render_progress)

        self.render_status = QLabel("等待开始")
        self.render_status.setObjectName("status")
        self.render_status.setWordWrap(True)
        card_layout.addWidget(self.render_status)

        done_row = QHBoxLayout()
        self.open_video_button = QPushButton("打开视频")
        self.open_video_button.setIcon(icon("play", theme.TEXT, 16))
        self.open_video_button.setVisible(False)
        self.open_video_button.clicked.connect(lambda: self._open_folder(OUTPUT_DIR))
        done_row.addWidget(self.open_video_button)
        self.open_folder_button = QPushButton("打开输出目录")
        self.open_folder_button.setIcon(icon("folder-open", theme.TEXT, 16))
        self.open_folder_button.clicked.connect(lambda: self._open_folder(OUTPUT_DIR))
        done_row.addWidget(self.open_folder_button)
        done_row.addStretch(1)
        self.restart_button = QPushButton("再做一首")
        self.restart_button.setIcon(icon("refresh-ccw", theme.TEXT, 16))
        self.restart_button.clicked.connect(self._restart)
        done_row.addWidget(self.restart_button)
        card_layout.addLayout(done_row)

        layout.addWidget(card)
        layout.addStretch(1)
        return page

    def _go_to_export_page(self) -> None:
        if self.scene_path is None:
            self._log("还没有生成画面，请先让 AI 创作。")
            return
        self._set_step(2)
        self.stack.setCurrentIndex(2)
        if not self.output_edit.text().strip():
            stem = self.audio_path.stem if self.audio_path else "mv"
            self.output_edit.setText(str(OUTPUT_DIR / f"mv_{stem}.mp4"))
        if self.renderer == "p5":
            self.resolution_combo.setCurrentIndex(1)
            self.render_status.setText("手绘引擎渲染较慢，建议先用 720×1280 或 30 秒样片。")
        else:
            self.render_status.setText("等待开始")

    def _choose_output(self) -> None:
        path, _ = QFileDialog.getSaveFileName(self, "保存 MV", self.output_edit.text(), "MP4 视频 (*.mp4)")
        if path:
            self.output_edit.setText(path)

    def _start_render(self) -> None:
        if self._rendering:
            return
        if self.scene_path is None or self.audio_path is None or self.analysis is None:
            self._log("缺少音乐或画面，请返回上一步。")
            return

        width, height = self.resolution_combo.currentData()
        fps = int(self.fps_combo.currentData())
        output_text = self.output_edit.text().strip()
        output = Path(output_text) if output_text else OUTPUT_DIR / f"mv_{self.audio_path.stem}.mp4"
        if not output.is_absolute():
            output = PROJECT_ROOT / output
        max_seconds = 30.0 if self.sample_checkbox.isChecked() else None

        self._rendering = True
        self.render_button.setEnabled(False)
        self.render_progress.setVisible(True)
        self.render_progress.setValue(0)
        self.open_video_button.setVisible(False)
        if self.renderer == "p5":
            self.render_status.setText("正在用 p5.brush 逐帧绘制…手绘渲染比较慢，请耐心等待。")
            worker = P5RenderWorker(
                scene_path=self.scene_path,
                audio_path=self.audio_path,
                lyrics_path=self.lyrics_path,
                out_path=output,
                fps=fps,
                width=width,
                height=height,
                max_seconds=max_seconds,
            )
        else:
            self.render_status.setText("正在渲染…首次使用可能需要几分钟。")
            worker = MVRenderWorker(
                scene_path=self.scene_path,
                audio_path=self.audio_path,
                lyrics_path=self.lyrics_path,
                out_path=output,
                fps=fps,
                width=width,
                height=height,
                max_seconds=max_seconds,
            )
        worker.progress.connect(self._on_render_progress)
        worker.done.connect(self._on_render_done)
        worker.failed.connect(self._on_render_failed)
        worker.finished.connect(lambda: self._release_worker(worker))
        self._track_worker(worker)
        worker.start()

    def _on_render_progress(self, current: int, total: int) -> None:
        percent = int(current * 100 / total) if total else 0
        self.render_progress.setValue(percent)
        self.render_status.setText(f"正在渲染 {current}/{total} 帧（{percent}%）…")

    def _on_render_done(self, path: str) -> None:
        self._rendering = False
        self.render_button.setEnabled(True)
        self.render_progress.setValue(100)
        self.render_status.setText(f"渲染完成：{path}")
        self.open_video_button.setVisible(True)
        QMessageBox.information(self, "渲染完成", f"MV 已生成：\n{path}")

    def _on_render_failed(self, message: str) -> None:
        self._rendering = False
        self.render_button.setEnabled(True)
        self.render_progress.setVisible(False)
        self.render_status.setText(message)
        QMessageBox.warning(self, "渲染失败", message)

    def _restart(self) -> None:
        self.audio_path = None
        self.lyrics_path = None
        self.analysis = None
        self.scene_path = None
        self.preview_source = None
        self.audio_drop.reset_text()
        self.lyrics_drop.reset_text()
        self.preview_label.clear()
        self.preview_label.setText("AI 生成画面后会显示在这里")
        self.log_view.clear()
        self.lyrics_list.clear()
        self.time_slider.setValue(350)
        self.time_slider.setEnabled(False)
        self.time_label.setText("00:00")
        self.duration_chip.setText("时长 —")
        self.bpm_chip.setText("BPM —")
        self.beat_chip.setText("节拍 —")
        self.lyric_chip.setText("歌词 —")
        self.next_button.setEnabled(False)
        self.continue_button.setEnabled(False)
        self.preview_button.setEnabled(False)
        self.render_progress.setVisible(False)
        self.render_status.setText("等待开始")
        self.renderer = self.renderer_combo.currentData()
        self.stack.setCurrentIndex(0)
        self._set_step(0)

    # ------------------------------------------------------------------ 步骤条
    def _set_step(self, active: int) -> None:
        for index, frame in enumerate(self.step_frames):
            state = "done" if index < active else ("active" if index == active else "todo")
            frame.setProperty("state", state)
            if index < active:
                self.step_numbers[index].setText("")
                self.step_numbers[index].setPixmap(
                    icon("check", "#FFFFFF", 14).pixmap(14, 14)
                )
            else:
                self.step_numbers[index].setPixmap(QPixmap())
                self.step_numbers[index].setText(str(index + 1))
            frame.style().unpolish(frame)
            frame.style().polish(frame)

    def _on_step_clicked(self, index: int) -> None:
        if index == 0:
            self.stack.setCurrentIndex(0)
            self._set_step(0)
        elif index == 1 and self.analysis is not None:
            self.stack.setCurrentIndex(1)
            self._set_step(1)
        elif index == 2 and self.scene_path is not None:
            self._go_to_export_page()

    # ------------------------------------------------------------------ 通用
    def _log(self, message: str) -> None:
        self.log_view.appendPlainText(message)

    def _update_ai_chip(self) -> None:
        if self.settings.api_key.strip():
            self.ai_chip.setText(f"AI 就绪 · {self.settings.model or '默认模型'}")
            self.ai_chip.setStyleSheet(f"color: {theme.SUCCESS};")
        else:
            self.ai_chip.setText("AI 未配置")
            self.ai_chip.setStyleSheet(f"color: {theme.WARNING};")

    def _open_settings(self) -> None:
        dialog = SettingsDialog(self.settings, self)
        if dialog.exec() != QDialog.DialogCode.Accepted:
            return
        self.settings = dialog.result_settings()
        try:
            self.settings.save()
        except OSError as exc:
            QMessageBox.warning(self, "保存失败", str(exc))
        self._update_ai_chip()
        if self.settings.auto_check_updates:
            self._check_updates(manual=False)

    @staticmethod
    def _open_folder(path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)
        if os.name == "nt":
            os.startfile(str(path))  # type: ignore[attr-defined]
        else:
            QDesktopServices.openUrl(QUrl.fromLocalFile(str(path)))

    # ------------------------------------------------------------------ 更新
    def _startup_checks(self) -> None:
        if self.settings.auto_check_updates:
            self._check_updates(manual=False)

    def _check_updates(self, manual: bool = False) -> None:
        if self._checking_updates:
            return
        self._checking_updates = True
        self.update_button.setEnabled(False)
        worker = UpdateCheckWorker()
        worker.result.connect(lambda info: self._on_update_result(info, manual))
        worker.failed.connect(lambda message: self._on_update_failed(message, manual))
        worker.finished.connect(lambda: self._release_worker(worker))
        self._track_worker(worker)
        worker.start()

    def _on_update_result(self, info: ReleaseInfo | None, manual: bool) -> None:
        self._checking_updates = False
        self.update_button.setEnabled(True)
        if info is None:
            if manual:
                QMessageBox.information(self, "检查更新", f"已经是最新版本（v{__version__}）。")
            return
        self.pending_update = info
        self.banner_text.setText(f"发现新版本 v{info.version}（当前 v{__version__}）")
        self.update_banner.setVisible(True)
        if self.settings.auto_install_updates:
            self._install_update()

    def _on_update_failed(self, message: str, manual: bool) -> None:
        self._checking_updates = False
        self.update_button.setEnabled(True)
        if manual:
            QMessageBox.warning(self, "检查更新失败", message)

    def _install_update(self) -> None:
        self.install_button.setEnabled(False)
        worker = InstallUpdateWorker()
        worker.done.connect(self._on_update_installed)
        worker.failed.connect(self._on_update_install_failed)
        worker.finished.connect(lambda: self._release_worker(worker))
        self._track_worker(worker)
        worker.start()

    def _on_update_installed(self, message: str) -> None:
        self.install_button.setEnabled(True)
        self.update_banner.setVisible(False)
        QMessageBox.information(
            self,
            "更新完成",
            "更新已完成，请重启 codemv 使用新版本。\n\n" + (message or ""),
        )

    def _on_update_install_failed(self, message: str) -> None:
        self.install_button.setEnabled(True)
        QMessageBox.warning(self, "更新失败", message)

    # ------------------------------------------------------------------ 线程
    def _track_worker(self, worker) -> None:
        self._workers.append(worker)

    def _release_worker(self, worker) -> None:
        if worker in self._workers:
            self._workers.remove(worker)

    def shutdown(self) -> None:
        for worker in list(self._workers):
            if worker.isRunning():
                worker.requestInterruption()
                worker.wait(30000)
        self._workers.clear()

    def closeEvent(self, event) -> None:  # noqa: N802 - Qt 命名
        self.shutdown()
        super().closeEvent(event)


def launch(argv: list[str] | None = None) -> int:
    """创建 QApplication 与主窗口并进入事件循环。"""
    app = QApplication.instance() or QApplication(argv or [])
    app.setApplicationName("codemv")
    app.setOrganizationName("codemv")
    app.setStyle("Fusion")
    app.setStyleSheet(theme.stylesheet())
    window = MainWindow()
    app.aboutToQuit.connect(window.shutdown)
    window.show()
    return app.exec()
