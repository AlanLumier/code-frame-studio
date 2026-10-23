"""设置对话框：模型接口、更新选项。"""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QDialog,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from . import theme
from .icons import icon
from .settings import AppSettings
from .updater import REPO_URL
from .widgets import ToggleSwitch


class SettingsDialog(QDialog):
    """编辑 AppSettings 的模态对话框。"""

    def __init__(self, settings: AppSettings, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("设置")
        self.setModal(True)
        self.setMinimumWidth(560)
        self._settings = settings

        layout = QVBoxLayout(self)
        layout.setContentsMargins(22, 20, 22, 18)
        layout.setSpacing(14)

        title = QLabel("设置")
        title.setObjectName("title")
        title.setStyleSheet("font-size: 17px;")
        layout.addWidget(title)

        form = QFormLayout()
        form.setSpacing(12)
        form.setLabelAlignment(Qt.AlignmentFlag.AlignRight)

        self.base_url_edit = QLineEdit(settings.api_base_url)
        self.base_url_edit.setPlaceholderText("例如 https://api.deepseek.com/v1")
        form.addRow("API 地址", self.base_url_edit)

        self.model_edit = QLineEdit(settings.model)
        self.model_edit.setPlaceholderText("例如 deepseek-chat")
        form.addRow("模型名称", self.model_edit)

        key_row = QHBoxLayout()
        self.api_key_edit = QLineEdit(settings.api_key)
        self.api_key_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.api_key_edit.setPlaceholderText("sk-...")
        self.show_key_check = QCheckBox("显示")
        self.show_key_check.toggled.connect(self._toggle_key_visibility)
        key_row.addWidget(self.api_key_edit, 1)
        key_row.addWidget(self.show_key_check)
        form.addRow("API Key", self._wrap(key_row))

        self.auto_check_switch = ToggleSwitch(checked=settings.auto_check_updates)
        form.addRow("自动检查更新", self._switch_row(self.auto_check_switch, "启动时检查 GitHub 最新版本"))

        self.auto_install_switch = ToggleSwitch(checked=settings.auto_install_updates)
        form.addRow(
            "自动安装更新",
            self._switch_row(self.auto_install_switch, "发现新版本后自动执行更新（需是 git 仓库）"),
        )

        layout.addLayout(form)

        hint = QLabel(
            "API Key 保存在项目目录 .codemv/settings.json（已加入 .gitignore）。"
            f'<br>项目仓库：<a style="color:{theme.ACCENT}" href="{REPO_URL}">{REPO_URL}</a>'
        )
        hint.setOpenExternalLinks(True)
        hint.setWordWrap(True)
        hint.setStyleSheet(f"color: {theme.MUTED}; font-size: 12px;")
        layout.addWidget(hint)

        buttons = QHBoxLayout()
        buttons.addStretch(1)
        cancel_button = QPushButton("取消")
        cancel_button.clicked.connect(self.reject)
        save_button = QPushButton("保存")
        save_button.setObjectName("primary")
        save_button.setIcon(icon("save", "#FFFFFF", 16))
        save_button.clicked.connect(self.accept)
        buttons.addWidget(cancel_button)
        buttons.addWidget(save_button)
        layout.addLayout(buttons)

    @staticmethod
    def _wrap(layout: QHBoxLayout) -> QWidget:
        container = QWidget()
        container.setLayout(layout)
        layout.setContentsMargins(0, 0, 0, 0)
        return container

    @staticmethod
    def _switch_row(switch: ToggleSwitch, text: str) -> QWidget:
        container = QWidget()
        row = QHBoxLayout(container)
        row.setContentsMargins(0, 0, 0, 0)
        row.addWidget(switch)
        label = QLabel(text)
        label.setStyleSheet(f"color: {theme.MUTED}; font-size: 12px;")
        row.addWidget(label)
        row.addStretch(1)
        return container

    def _toggle_key_visibility(self, shown: bool) -> None:
        self.api_key_edit.setEchoMode(
            QLineEdit.EchoMode.Normal if shown else QLineEdit.EchoMode.Password
        )

    def result_settings(self) -> AppSettings:
        """按界面内容生成新的设置对象。"""
        return AppSettings(
            api_base_url=self.base_url_edit.text().strip(),
            api_key=self.api_key_edit.text().strip(),
            model=self.model_edit.text().strip(),
            auto_check_updates=self.auto_check_switch.isChecked(),
            auto_install_updates=self.auto_install_switch.isChecked(),
            last_update_check=self._settings.last_update_check,
        )
