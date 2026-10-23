"""MV 工作台后台线程：音频分析、AI 生成场景、单帧预览、整片渲染。"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from PySide6.QtCore import QThread, Signal

from codemv.audio import AudioAnalysis, analyze_audio
from codemv.lyrics import load_lyrics
from codemv.mv import build_context, draw_lyrics, load_mv_scene, render_mv
from codemv.prompt import build_mv_generation_prompt

from .ai_client import AIClientError, chat_completion, extract_python_code
from .settings import AppSettings


class AudioAnalyzeWorker(QThread):
    """分析音频的 BPM、节拍与能量。"""

    done = Signal(object)
    failed = Signal(str)

    def __init__(self, audio_path: Path) -> None:
        super().__init__()
        self._audio_path = audio_path

    def run(self) -> None:
        try:
            analysis = analyze_audio(self._audio_path)
        except Exception as exc:  # noqa: BLE001
            self.failed.emit(f"音频分析失败：{exc}")
            return
        self.done.emit(analysis)


class MVSceneAIWorker(QThread):
    """让 AI 根据歌曲信息生成 MV 场景代码，并试渲染预览帧。"""

    status = Signal(str)
    done = Signal(str, str)  # scene_path, preview_path
    failed = Signal(str)

    MAX_ATTEMPTS = 3

    def __init__(
        self,
        *,
        audio_name: str,
        analysis: AudioAnalysis,
        lyrics_path: Path | None,
        idea: str,
        settings: AppSettings,
        scenes_dir: Path,
        output_dir: Path,
        width: int = 1080,
        height: int = 1920,
    ) -> None:
        super().__init__()
        self._audio_name = audio_name
        self._analysis = analysis
        self._lyrics_path = lyrics_path
        self._idea = idea
        self._settings = settings
        self._scenes_dir = scenes_dir
        self._output_dir = output_dir
        self._width = width
        self._height = height

    def run(self) -> None:
        try:
            lyrics = (
                load_lyrics(self._lyrics_path, duration=self._analysis.duration)
                if self._lyrics_path
                else None
            )
        except Exception as exc:  # noqa: BLE001
            self.failed.emit(f"歌词读取失败：{exc}")
            return

        lyrics_lines = []
        if lyrics is not None:
            for line in lyrics.lines[:30]:
                minutes, seconds = divmod(int(line.start), 60)
                lyrics_lines.append(f"[{minutes:02d}:{seconds:02d}] {line.text}")

        prompt = build_mv_generation_prompt(
            song_name=Path(self._audio_name).stem,
            duration=self._analysis.duration,
            bpm=self._analysis.bpm,
            beat_count=len(self._analysis.beats),
            lyrics_lines=lyrics_lines,
            idea=self._idea,
        )
        messages = [
            {
                "role": "system",
                "content": (
                    "你是擅长用代码做逐帧手绘动画的图形程序员。"
                    "你只输出一个完整、可运行的 Python 文件，不要输出 Markdown 代码围栏之外的内容。"
                ),
            },
            {"role": "user", "content": prompt},
        ]

        preview_seconds = max(0.5, min(self._analysis.duration - 0.2, self._analysis.duration * 0.35))
        self._scenes_dir.mkdir(parents=True, exist_ok=True)
        self._output_dir.mkdir(parents=True, exist_ok=True)

        for attempt in range(1, self.MAX_ATTEMPTS + 1):
            self.status.emit(f"AI 正在设计画面（第 {attempt}/{self.MAX_ATTEMPTS} 次）…")
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

            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            scene_path = self._scenes_dir / f"generated_mv_{stamp}.py"
            scene_path.write_text(code, encoding="utf-8")

            self.status.emit("正在试渲染一帧，检查画面效果…")
            try:
                context = build_context(
                    self._analysis,
                    lyrics,
                    preview_seconds,
                    self._width,
                    self._height,
                )
                image = load_mv_scene(scene_path)(context.t, context)
                if image.size != (self._width, self._height):
                    image = image.convert("RGB").resize(
                        (self._width, self._height),
                        resample=3,
                    )
                else:
                    image = image.convert("RGB")
                if lyrics is not None:
                    image = draw_lyrics(image, lyrics, preview_seconds, self._width, self._height)
                preview_path = self._output_dir / f"{scene_path.stem}_preview.png"
                image.save(preview_path)
            except Exception as exc:  # noqa: BLE001 - 把错误交回给模型修复
                scene_path.unlink(missing_ok=True)
                messages.append({"role": "assistant", "content": reply})
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            "上面的代码试运行时出错：\n"
                            f"{exc}\n"
                            "请修复问题并输出修复后的完整 Python 代码，不要输出其他内容。"
                        ),
                    }
                )
                self.status.emit("画面代码运行出错，正在让 AI 修正…")
                continue

            self.status.emit("画面已生成，可以预览和调整。")
            self.done.emit(str(scene_path), str(preview_path))
            return

        self.failed.emit("生成失败：多次尝试后代码仍然无法运行，请换一个描述再试。")


class MVPreviewWorker(QThread):
    """渲染 MV 在指定秒数的预览帧。"""

    done = Signal(str)
    failed = Signal(str)

    def __init__(
        self,
        *,
        scene_path: Path,
        analysis: AudioAnalysis,
        lyrics_path: Path | None,
        seconds: float,
        out_path: Path,
        width: int = 1080,
        height: int = 1920,
    ) -> None:
        super().__init__()
        self._scene_path = scene_path
        self._analysis = analysis
        self._lyrics_path = lyrics_path
        self._seconds = seconds
        self._out_path = out_path
        self._width = width
        self._height = height

    def run(self) -> None:
        try:
            lyrics = (
                load_lyrics(self._lyrics_path, duration=self._analysis.duration)
                if self._lyrics_path
                else None
            )
            seconds = max(0.0, min(self._analysis.duration, self._seconds))
            context = build_context(self._analysis, lyrics, seconds, self._width, self._height)
            image = load_mv_scene(self._scene_path)(context.t, context)
            image = image.convert("RGB")
            if image.size != (self._width, self._height):
                image = image.resize((self._width, self._height), resample=3)
            if lyrics is not None:
                image = draw_lyrics(image, lyrics, seconds, self._width, self._height)
            self._out_path.parent.mkdir(parents=True, exist_ok=True)
            image.save(self._out_path)
            self.done.emit(str(self._out_path))
        except Exception as exc:  # noqa: BLE001
            self.failed.emit(f"预览渲染失败：{exc}")


class MVRenderWorker(QThread):
    """渲染整首 MV 并混入音频。"""

    progress = Signal(int, int)
    done = Signal(str)
    failed = Signal(str)

    def __init__(
        self,
        *,
        scene_path: Path,
        audio_path: Path,
        lyrics_path: Path | None,
        out_path: Path,
        fps: int,
        width: int,
        height: int,
        max_seconds: float | None,
    ) -> None:
        super().__init__()
        self._scene_path = scene_path
        self._audio_path = audio_path
        self._lyrics_path = lyrics_path
        self._out_path = out_path
        self._fps = fps
        self._width = width
        self._height = height
        self._max_seconds = max_seconds

    def run(self) -> None:
        try:
            output = render_mv(
                self._scene_path,
                self._audio_path,
                self._out_path,
                lyrics_path=self._lyrics_path,
                fps=self._fps,
                width=self._width,
                height=self._height,
                max_seconds=self._max_seconds,
                progress=False,
                progress_callback=lambda current, total: self.progress.emit(current, total),
            )
            self.done.emit(str(output))
        except Exception as exc:  # noqa: BLE001
            self.failed.emit(f"渲染失败：{exc}")
