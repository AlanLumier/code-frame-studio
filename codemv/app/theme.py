"""界面主题：深色配色与全局 QSS 样式。"""

from __future__ import annotations

# 基础色板
BG = "#0B1018"
PANEL = "#121A27"
PANEL_ALT = "#182335"
BORDER = "#233149"
TEXT = "#E8EEF7"
MUTED = "#93A4BF"
ACCENT = "#5B8CFF"
ACCENT_HOVER = "#79A2FF"
ACCENT_SOFT = "#1B2A4A"
SUCCESS = "#4ADE80"
DANGER = "#F87171"
WARNING = "#FBBF24"

FONT_FAMILY = '"Microsoft YaHei UI", "Segoe UI", "Noto Sans SC", sans-serif'


def stylesheet() -> str:
    """返回整个应用的 QSS 样式。"""
    return f"""
QMainWindow {{
    background-color: {BG};
}}
QWidget {{
    color: {TEXT};
    font-family: {FONT_FAMILY};
    font-size: 13px;
}}

QWidget#header {{
    background-color: {PANEL};
    border-bottom: 1px solid {BORDER};
}}
QLabel#title {{
    font-size: 20px;
    font-weight: 700;
    color: {TEXT};
    letter-spacing: 0.4px;
}}
QLabel#subtitle {{
    color: {MUTED};
    font-size: 12px;
}}
QLabel#version {{
    color: {MUTED};
    font-size: 12px;
    padding: 3px 9px;
    border: 1px solid {BORDER};
    border-radius: 10px;
}}
QLabel#section {{
    font-size: 13px;
    font-weight: 600;
    color: {TEXT};
}}
QLabel#status {{
    color: {MUTED};
    font-size: 12px;
}}
QLabel#preview {{
    background-color: #070B12;
    border: none;
    border-radius: 10px;
    color: {MUTED};
}}

QFrame#panel {{
    background-color: {PANEL};
    border: 1px solid {BORDER};
    border-radius: 12px;
}}
QFrame#previewFrame {{
    background-color: {PANEL};
    border: 1px solid {BORDER};
    border-radius: 12px;
}}
QFrame#updateBanner {{
    background-color: {ACCENT_SOFT};
    border: 1px solid {BORDER};
    border-radius: 10px;
}}
QFrame#divider {{
    background-color: {BORDER};
    max-height: 1px;
    border: none;
}}

QPushButton {{
    background-color: {PANEL_ALT};
    color: {TEXT};
    border: 1px solid {BORDER};
    border-radius: 8px;
    padding: 7px 12px;
}}
QPushButton:hover {{
    background-color: #21304a;
    border-color: #2f446a;
}}
QPushButton:pressed {{
    background-color: #17223a;
}}
QPushButton:disabled {{
    color: #5b6a83;
    background-color: #141c2b;
}}
QPushButton#primary {{
    background-color: {ACCENT};
    border: 1px solid {ACCENT};
    color: #ffffff;
    font-weight: 600;
    padding: 9px 14px;
}}
QPushButton#primary:hover {{
    background-color: {ACCENT_HOVER};
    border-color: {ACCENT_HOVER};
}}
QPushButton#primary:disabled {{
    background-color: #2b3d63;
    border-color: #2b3d63;
    color: #9aa9c2;
}}
QPushButton#ghost {{
    background-color: transparent;
    border: 1px solid transparent;
    color: {MUTED};
    padding: 6px 8px;
}}
QPushButton#ghost:hover {{
    background-color: {PANEL_ALT};
    color: {TEXT};
}}
QToolButton {{
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: 7px;
    padding: 6px;
}}
QToolButton:hover {{
    background-color: {PANEL_ALT};
    border-color: {BORDER};
}}
QToolButton:pressed {{
    background-color: #17223a;
}}

QListWidget {{
    background-color: {BG};
    border: 1px solid {BORDER};
    border-radius: 8px;
    padding: 4px;
    outline: none;
}}
QListWidget::item {{
    padding: 7px 8px;
    border-radius: 6px;
    color: {TEXT};
}}
QListWidget::item:hover {{
    background-color: {PANEL_ALT};
}}
QListWidget::item:selected {{
    background-color: {ACCENT_SOFT};
    color: {TEXT};
    border: 1px solid #2f446a;
}}

QTextEdit, QLineEdit, QComboBox {{
    background-color: {BG};
    color: {TEXT};
    border: 1px solid {BORDER};
    border-radius: 8px;
    padding: 7px 9px;
    selection-background-color: {ACCENT};
}}
QTextEdit:focus, QLineEdit:focus, QComboBox:focus {{
    border-color: {ACCENT};
}}
QComboBox QAbstractItemView {{
    background-color: {PANEL};
    color: {TEXT};
    selection-background-color: {ACCENT};
    border: 1px solid {BORDER};
}}

QSlider::groove:horizontal {{
    height: 4px;
    background: {BORDER};
    border-radius: 2px;
}}
QSlider::sub-page:horizontal {{
    background: {ACCENT};
    border-radius: 2px;
}}
QSlider::handle:horizontal {{
    background: #ffffff;
    width: 14px;
    height: 14px;
    margin: -5px 0;
    border-radius: 7px;
    border: 2px solid {ACCENT};
}}

QProgressBar {{
    background-color: {BG};
    border: 1px solid {BORDER};
    border-radius: 6px;
    text-align: center;
    color: {MUTED};
    height: 14px;
}}
QProgressBar::chunk {{
    background-color: {ACCENT};
    border-radius: 5px;
}}

QCheckBox {{
    color: {TEXT};
    spacing: 8px;
}}

QDialog {{
    background-color: {PANEL};
}}

QScrollBar:vertical {{
    background: transparent;
    width: 10px;
    margin: 2px;
}}
QScrollBar::handle:vertical {{
    background: #2b3b57;
    border-radius: 5px;
    min-height: 30px;
}}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
    height: 0px;
}}

QLabel#bannerText {{
    color: {TEXT};
    font-size: 13px;
}}
"""
