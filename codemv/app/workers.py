"""后台线程：预览、渲染、AI 生成、更新检查与安装。"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from PIL import Image
from PySide6.QtCore import QThread, Signal

from codemv.prompt import build_scene_prompt
from codemv.renderer import SceneError, load_scene, render_preview, render_video

from .ai_client import AIClientError, chat_completion, extract_python_code, scene_messages
from .settings import AppSettings
from .updater import ReleaseInfo, apply_update, check_for_updates


class PreviewWorker(QThread):
    """渲染单帧预览图。token 用于丢弃过期的预览结果。"""

    done = Signal(str, int)
    failed = Signal(str, int)

    def __init__(
        self,
        scene_path: Path,
        out_path: Path,
        t: float,
        width: int,
        height: int,
        token: int = 0,
    ) -> None:
        super().__init__()
        self._scene_path = scene_path
        self._out_path = out_path
        self._t = t
        self._width = width
        self._height = height
        self._token = token

    def run(self) -> None:  # noqa: D401 - Qt 线程入口
        try:
            output = render_preview(
                self._scene_path,
                self._out_path,
                t=self._t,
                width=self._width,
                height=self._height,
            )
            self.done.emit(str(output), self._token)
        except Exception as exc:  # noqa: BLE001 - 统一转成界面提示
            self.failed.emit(str(exc), self._token)


class RenderWorker(QThread):
    """渲染完整视频。"""

    progress = Signal(int, int)
    done = Signal(str)
    failed = Signal(str)

    def __init__(
        self,
        scene_path: Path,
        out_path: Path,
        *,
        fps: int = 30,
        duration: float = 6.0,
        width: int = 960,
        height: int = 540,
    ) -> None:
        super().__init__()
        self._scene_path = scene_path
        self._out_path = out_path
        self._fps = fps
        self._duration = duration
        self._width = width
        self._height = height

    def run(self) -> None:
        try:
            output = render_video(
                self._scene_path,
                self._out_path,
                width=self._width,
                height=self._height,
                fps=self._fps,
                duration=self._duration,
                progress=False,
                progress_callback=lambda current, total: self.progress.emit(current, total),
            )
            self.done.emit(str(output))
        except SceneError as exc:
            self.failed.emit(str(exc))
        except Exception as exc:  # noqa: BLE001
            self.failed.emit(f"渲染失败：{exc}")


class AIWorker(QThread):
    """调用大模型生成场景代码；渲染失败时把报错回传给模型自动修复。"""

    status = Signal(str)
    done = Signal(str)
    failed = Signal(str)

    MAX_ATTEMPTS = 3

    def __init__(self, description: str, settings: AppSettings, scenes_dir: Path) -> None:
        super().__init__()
        self._description = description
        self._settings = settings
        self._scenes_dir = scenes_dir

    def run(self) -> None:
        try:
            messages = scene_messages(
                self._description,
                scene_prompt=build_scene_prompt(self._description),
            )
        except AIClientError as exc:
            self.failed.emit(str(exc))
            return

        last_error = ""
        for attempt in range(1, self.MAX_ATTEMPTS + 1):
            self.status.emit(f"正在请求模型生成场景（第 {attempt}/{self.MAX_ATTEMPTS} 次）…")
            try:
                reply = chat_completion(
                    messages,
                    base_url=self._settings.api_base_url,
                    api_key=self._settings.api_key,
                    model=self._settings.model,
                )
                code = extract_python_code(reply)
            except AIClientError as exc:
                self.failed.emit(str(exc))
                return

            scene_path = self._scenes_dir / self._next_filename()
            try:
                scene_path.write_text(code, encoding="utf-8")
                render_frame = load_scene(scene_path)
                image = render_frame(0.5)
                if not isinstance(image, Image.Image):
                    raise SceneError(
                        "render_frame(t) 必须返回 PIL.Image.Image，"
                        f"实际返回 {type(image).__name__}"
                    )
            except Exception as exc:  # noqa: BLE001 - 代码错误需要回传给模型
                last_error = str(exc)
                scene_path.unlink(missing_ok=True)
                messages.append({"role": "assistant", "content": reply})
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            "上面的代码运行时报错了：\n"
                            f"{last_error}\n"
                            "请修复问题，并输出修复后的完整 Python 代码，不要输出其他内容。"
                        ),
                    }
                )
                self.status.emit(f"生成的代码运行失败，正在让模型修复（{attempt}/{self.MAX_ATTEMPTS}）…")
                continue

            self.status.emit("场景代码校验通过。")
            self.done.emit(str(scene_path))
            return

        self.failed.emit(f"生成失败，最后一次错误：{last_error}")

    def _next_filename(self) -> str:
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        candidate = self._scenes_dir / f"generated_{stamp}.py"
        suffix = 1
        while candidate.exists():
            candidate = self._scenes_dir / f"generated_{stamp}_{suffix}.py"
            suffix += 1
        return candidate.name


class UpdateCheckWorker(QThread):
    """检查 GitHub 上是否有新版本。"""

    result = Signal(object)
    failed = Signal(str)

    def run(self) -> None:
        try:
            info = check_for_updates()
        except Exception as exc:  # noqa: BLE001
            self.failed.emit(str(exc))
            return
        self.result.emit(info if isinstance(info, ReleaseInfo) else None)


class InstallUpdateWorker(QThread):
    """执行 git pull 安装更新。"""

    done = Signal(str)
    failed = Signal(str)

    def run(self) -> None:
        try:
            message = apply_update()
        except Exception as exc:  # noqa: BLE001
            self.failed.emit(str(exc))
            return
        self.done.emit(message)
