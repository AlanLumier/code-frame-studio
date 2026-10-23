"""GitHub 更新检查与自动更新（基于 git pull）。"""

from __future__ import annotations

import json
import re
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from codemv import __version__

REPO_OWNER = "AlanLumier"
REPO_NAME = "code-frame-studio"
REPO_URL = f"https://github.com/{REPO_OWNER}/{REPO_NAME}"

API_LATEST_RELEASE = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases/latest"
API_TAGS = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/tags?per_page=1"

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class UpdateError(RuntimeError):
    """检查或安装更新失败时抛出。"""


@dataclass
class ReleaseInfo:
    version: str
    tag: str
    html_url: str = f"{REPO_URL}/releases"
    notes: str = ""


def parse_version(text: str) -> tuple[int, int, int]:
    """把 v0.2.0 / 0.2 之类的版本号转成可比较的元组。"""
    numbers = re.findall(r"\d+", (text or "").strip())
    values = [int(item) for item in numbers[:3]]
    while len(values) < 3:
        values.append(0)
    return values[0], values[1], values[2]


def is_newer(latest: str, current: str = __version__) -> bool:
    """判断 latest 是否比当前版本新。"""
    return parse_version(latest) > parse_version(current)


def _get_json(url: str, timeout: int = 10) -> object | None:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": f"codemv/{__version__}",
            "Accept": "application/vnd.github+json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise UpdateError(f"GitHub 返回 HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise UpdateError(f"无法连接 GitHub：{exc.reason}") from exc
    except TimeoutError as exc:
        raise UpdateError("连接 GitHub 超时") from exc


def fetch_latest_release(timeout: int = 10) -> ReleaseInfo:
    """读取最新 Release；仓库没有 Release 时回退到最新 Tag。"""
    release = _get_json(API_LATEST_RELEASE, timeout=timeout)
    if isinstance(release, dict) and release.get("tag_name"):
        return ReleaseInfo(
            version=str(release["tag_name"]).lstrip("vV"),
            tag=str(release["tag_name"]),
            html_url=str(release.get("html_url") or f"{REPO_URL}/releases"),
            notes=str(release.get("body") or "").strip(),
        )

    tags = _get_json(API_TAGS, timeout=timeout)
    if isinstance(tags, list) and tags and isinstance(tags[0], dict):
        name = str(tags[0].get("name") or "")
        if name:
            return ReleaseInfo(
                version=name.lstrip("vV"),
                tag=name,
                html_url=f"{REPO_URL}/releases/tag/{name}",
            )

    raise UpdateError("GitHub 仓库暂无发布版本或标签")


def check_for_updates(timeout: int = 10) -> ReleaseInfo | None:
    """检查是否有新版本；已是最新时返回 None。"""
    latest = fetch_latest_release(timeout=timeout)
    if is_newer(latest.version):
        return latest
    return None


def is_git_checkout(repo_root: Path = PROJECT_ROOT) -> bool:
    """判断目录是否是 git 工作区。"""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0 and result.stdout.strip() == "true"


def apply_update(repo_root: Path = PROJECT_ROOT, timeout: int = 120) -> str:
    """执行 git pull --ff-only 安装更新，返回命令输出。"""
    if not is_git_checkout(repo_root):
        raise UpdateError("当前目录不是 git 仓库，无法自动更新；请手动下载最新版本")

    result = subprocess.run(
        ["git", "pull", "--ff-only"],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )
    output = (result.stdout or "").strip()
    error = (result.stderr or "").strip()
    if result.returncode != 0:
        raise UpdateError(error or output or "git pull 执行失败")
    return output or error or "已是最新版本"
