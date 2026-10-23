"""歌词解析：LRC（带时间轴）与纯文本（自动平均分配时间）。"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

LRC_LINE = re.compile(r"\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]")
META_LINE = re.compile(r"^\[(ar|ti|al|by|offset|re|ve):(.*)\]$", re.IGNORECASE)


@dataclass
class LyricLine:
    start: float
    end: float
    text: str

    @property
    def duration(self) -> float:
        return max(0.01, self.end - self.start)


@dataclass
class LyricsTimeline:
    lines: list[LyricLine]

    def line_at(self, seconds: float) -> tuple[LyricLine | None, float]:
        """返回当前歌词行与该行进度（0~1）。"""
        for line in self.lines:
            if line.start <= seconds < line.end:
                progress = (seconds - line.start) / line.duration
                return line, max(0.0, min(1.0, progress))
        return None, 0.0

    def text_at(self, seconds: float) -> str:
        line, _ = self.line_at(seconds)
        return line.text if line else ""


def _parse_time(minutes: str, seconds: str, fraction: str | None) -> float:
    value = int(minutes) * 60 + int(seconds)
    if fraction:
        value += int(fraction) / (10 ** len(fraction))
    return value


def parse_lrc(content: str, duration: float | None = None) -> LyricsTimeline:
    """解析 LRC 文本。支持一行多个时间戳、offset 与元信息标签。"""
    offset = 0.0
    entries: list[tuple[float, str]] = []

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        meta = META_LINE.match(line)
        if meta:
            if meta.group(1).lower() == "offset":
                try:
                    offset = -float(meta.group(2).strip()) / 1000.0
                except ValueError:
                    offset = 0.0
            continue

        stamps = LRC_LINE.findall(line)
        if not stamps:
            continue
        text = LRC_LINE.sub("", line).strip()
        if not text:
            continue
        for minutes, seconds, fraction in stamps:
            entries.append((_parse_time(minutes, seconds, fraction), text))

    if not entries:
        raise ValueError("没有解析到带时间轴的歌词行（需要 [mm:ss.xx] 格式）")

    entries.sort(key=lambda item: item[0])
    lines: list[LyricLine] = []
    for index, (start, text) in enumerate(entries):
        start += offset
        if index + 1 < len(entries):
            end = entries[index + 1][0] + offset
        else:
            end = (duration if duration else start + 4.0)
        end = min(end, duration) if duration else end
        if end <= start:
            end = start + 0.5
        lines.append(LyricLine(start=max(0.0, start), end=end, text=text))
    return LyricsTimeline(lines=lines)


def load_lyrics(path: str | Path | None, duration: float | None = None) -> LyricsTimeline | None:
    """读取 .lrc 歌词文件；纯文本会自动按时间平均分配（仅作兜底）。"""
    if path is None:
        return None
    target = Path(path).expanduser().resolve()
    if not target.exists():
        raise FileNotFoundError(f"歌词文件不存在：{target}")
    content = target.read_text(encoding="utf-8-sig", errors="replace")

    if target.suffix.lower() == ".lrc" or LRC_LINE.search(content):
        return parse_lrc(content, duration=duration)

    texts = [line.strip() for line in content.splitlines() if line.strip()]
    if not texts:
        return None
    if not duration:
        raise ValueError("纯文本歌词需要在渲染时提供音频时长，才能分配时间")
    step = duration / len(texts)
    lines = [
        LyricLine(start=index * step, end=(index + 1) * step, text=text)
        for index, text in enumerate(texts)
    ]
    return LyricsTimeline(lines=lines)
