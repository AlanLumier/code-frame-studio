"""应用设置：模型接口、更新选项与本地存储。

设置保存在项目根目录 `.codemv/settings.json`（已加入 .gitignore），
API Key 以明文保存，请勿把该文件提交到仓库。
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SETTINGS_DIR = PROJECT_ROOT / ".codemv"
SETTINGS_FILE = SETTINGS_DIR / "settings.json"

DEFAULT_BASE_URL = "https://api.deepseek.com/v1"
DEFAULT_MODEL = "deepseek-chat"


@dataclass
class AppSettings:
    """所有可持久化的用户设置。"""

    api_base_url: str = DEFAULT_BASE_URL
    api_key: str = ""
    model: str = DEFAULT_MODEL
    auto_check_updates: bool = True
    auto_install_updates: bool = False
    last_update_check: str = ""

    @classmethod
    def load(cls, path: Path | None = None) -> "AppSettings":
        """读取设置；文件不存在或损坏时返回默认值。"""
        target = Path(path) if path is not None else SETTINGS_FILE
        if not target.exists():
            return cls()
        try:
            data = json.loads(target.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return cls()

        defaults = cls()
        if not isinstance(data, dict):
            return defaults
        return cls(
            api_base_url=str(data.get("api_base_url", defaults.api_base_url)),
            api_key=str(data.get("api_key", defaults.api_key)),
            model=str(data.get("model", defaults.model)),
            auto_check_updates=bool(data.get("auto_check_updates", defaults.auto_check_updates)),
            auto_install_updates=bool(data.get("auto_install_updates", defaults.auto_install_updates)),
            last_update_check=str(data.get("last_update_check", defaults.last_update_check)),
        )

    def save(self, path: Path | None = None) -> None:
        """把设置写入 JSON 文件。"""
        target = Path(path) if path is not None else SETTINGS_FILE
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(asdict(self), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
