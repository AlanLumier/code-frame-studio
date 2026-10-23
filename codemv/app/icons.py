"""SVG 图标加载器（Lucide 图标，ISC 协议）。

图标文件位于 `assets/icons/*.svg`，其中颜色使用 `currentColor`，
加载时替换为当前主题色，保证图标与主题一致。
"""

from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import QByteArray, Qt
from PySide6.QtGui import QIcon, QPainter, QPixmap
from PySide6.QtSvg import QSvgRenderer

ICON_DIR = Path(__file__).resolve().parents[2] / "assets" / "icons"

_icon_cache: dict[tuple[str, str, int], QIcon] = {}


def svg_text(name: str, color: str | None = None) -> str:
    """读取图标 SVG 文本，可替换 currentColor。"""
    path = ICON_DIR / f"{name}.svg"
    text = path.read_text(encoding="utf-8")
    if color:
        text = text.replace("currentColor", color)
    return text


def icon_pixmap(name: str, color: str = "#E8EEF7", size: int = 20, dpr: int = 2) -> QPixmap:
    """把 SVG 渲染成透明背景的 QPixmap。"""
    renderer = QSvgRenderer(QByteArray(svg_text(name, color).encode("utf-8")))
    pixmap = QPixmap(size * dpr, size * dpr)
    pixmap.fill(Qt.GlobalColor.transparent)
    painter = QPainter(pixmap)
    try:
        renderer.render(painter)
    finally:
        painter.end()
    pixmap.setDevicePixelRatio(dpr)
    return pixmap


def icon(name: str, color: str = "#E8EEF7", size: int = 20) -> QIcon:
    """按名称与颜色取 QIcon（带缓存）。"""
    key = (name, color, size)
    cached = _icon_cache.get(key)
    if cached is None:
        cached = QIcon(icon_pixmap(name, color=color, size=size))
        _icon_cache[key] = cached
    return cached
