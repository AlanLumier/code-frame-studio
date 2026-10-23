"""界面小组件：开关按钮等。"""

from __future__ import annotations

from PySide6.QtCore import Property, QPropertyAnimation, QSize, Qt
from PySide6.QtGui import QColor, QPainter
from PySide6.QtWidgets import QAbstractButton

from . import theme


class ToggleSwitch(QAbstractButton):
    """iOS 风格的开关按钮，替代 QCheckBox 的默认外观。"""

    def __init__(self, parent=None, checked: bool = False) -> None:
        super().__init__(parent)
        self._offset = 22.0 if checked else 2.0
        self._animation = QPropertyAnimation(self, b"offset", self)
        self._animation.setDuration(140)
        self.setCheckable(True)
        self.setChecked(checked)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFixedSize(QSize(44, 24))

    def sizeHint(self) -> QSize:  # noqa: N802 - Qt 命名
        return QSize(44, 24)

    def _get_offset(self) -> float:
        return self._offset

    def _set_offset(self, value: float) -> None:
        self._offset = float(value)
        self.update()

    offset = Property(float, _get_offset, _set_offset)

    def nextCheckState(self) -> None:  # noqa: N802 - Qt 命名
        super().nextCheckState()
        self._animate()

    def setChecked(self, checked: bool) -> None:  # noqa: N802 - Qt 命名
        super().setChecked(checked)
        self._animate()

    def _animate(self) -> None:
        target = 22.0 if self.isChecked() else 2.0
        self._animation.stop()
        self._animation.setStartValue(self._offset)
        self._animation.setEndValue(target)
        self._animation.start()

    def paintEvent(self, event) -> None:  # noqa: N802 - Qt 命名
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setPen(Qt.PenStyle.NoPen)

        track = QColor(theme.ACCENT if self.isChecked() else "#2A3650")
        painter.setBrush(track)
        painter.drawRoundedRect(0, 0, self.width(), self.height(), 12, 12)

        painter.setBrush(QColor("#FFFFFF"))
        painter.drawEllipse(int(self._offset), 2, 20, 20)
        painter.end()
