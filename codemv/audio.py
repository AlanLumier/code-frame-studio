"""音频分析：解码、能量包络、节拍（BPM / beats）与频段能量。

只依赖 numpy 与 ffmpeg（imageio-ffmpeg 自带），用于给 MV 场景提供
「卡点」所需的节奏信息。
"""

from __future__ import annotations

import bisect
import math
import subprocess
import wave
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .renderer import SceneError, find_ffmpeg

SAMPLE_RATE = 22050
HOP = 512
WIN = 1024


@dataclass
class AudioAnalysis:
    """一首歌的节奏与能量信息。"""

    duration: float
    bpm: float
    beats: list[float]
    frame_rate: float
    env: np.ndarray = field(repr=False)
    low: np.ndarray = field(repr=False)
    mid: np.ndarray = field(repr=False)
    high: np.ndarray = field(repr=False)

    def _interp(self, values: np.ndarray, seconds: float) -> float:
        if len(values) == 0:
            return 0.0
        position = max(0.0, seconds) * self.frame_rate
        index = int(position)
        if index >= len(values) - 1:
            return float(values[-1])
        fraction = position - index
        return float(values[index] * (1.0 - fraction) + values[index + 1] * fraction)

    def energy_at(self, seconds: float) -> float:
        """当前整体响度（0~1）。"""
        return max(0.0, min(1.0, self._interp(self.env, seconds)))

    def spectrum_at(self, seconds: float) -> tuple[float, float, float]:
        """低 / 中 / 高频能量（0~1）。"""
        return (
            self._interp(self.low, seconds),
            self._interp(self.mid, seconds),
            self._interp(self.high, seconds),
        )

    def beat_pulse(self, seconds: float, decay: float = 5.5) -> float:
        """距上一个节拍越近越接近 1，用于画面卡点脉冲。"""
        if not self.beats:
            return 0.0
        index = bisect.bisect_right(self.beats, seconds) - 1
        if index < 0:
            return 0.0
        delta = seconds - self.beats[index]
        return max(0.0, min(1.0, math.exp(-decay * delta)))


def decode_audio(audio_path: str | Path) -> np.ndarray:
    """用 ffmpeg 把音频解码成 22050Hz 单声道 float32 采样。"""
    path = Path(audio_path).expanduser().resolve()
    if not path.exists():
        raise SceneError(f"音频文件不存在：{path}")

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        raise SceneError(
            "未找到 ffmpeg，无法解码音频。请安装 imageio-ffmpeg（pip install imageio-ffmpeg）。"
        )

    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(SAMPLE_RATE),
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "-",
    ]
    result = subprocess.run(command, capture_output=True, check=False)
    if result.returncode != 0:
        message = result.stderr.decode("utf-8", errors="replace").strip()
        raise SceneError(f"音频解码失败：{message or 'ffmpeg 返回错误'}")
    samples = np.frombuffer(result.stdout, dtype=np.float32)
    if samples.size == 0:
        raise SceneError("音频解码结果为空，请检查文件格式")
    return samples


def _normalize(values: np.ndarray, percentile: float = 95.0) -> np.ndarray:
    scale = float(np.percentile(np.abs(values), percentile)) or 1.0
    return np.clip(values / scale, 0.0, 1.0)


def estimate_bpm(flux: np.ndarray, frame_rate: float) -> float:
    """用 onset 包络的自相关估计 BPM。"""
    if len(flux) < 8 or float(np.std(flux)) == 0.0:
        return 120.0
    signal = flux - float(np.mean(flux))
    correlation = np.correlate(signal, signal, mode="full")[len(signal) - 1 :]
    min_lag = max(2, int(frame_rate * 60 / 180))
    max_lag = min(len(correlation) - 1, int(frame_rate * 60 / 60))
    if max_lag <= min_lag:
        return 120.0
    segment = correlation[min_lag : max_lag + 1]
    lag = int(np.argmax(segment)) + min_lag
    bpm = 60.0 * frame_rate / lag
    while bpm < 70:
        bpm *= 2
    while bpm > 180:
        bpm /= 2
    return round(bpm, 1)


def _pick_beats(flux: np.ndarray, frame_rate: float, duration: float, bpm: float) -> list[float]:
    """在 onset 包络上找峰值；太少时用 BPM 网格兜底。"""
    beats: list[float] = []
    if len(flux) > 3 and float(np.max(flux)) > 0:
        threshold = float(np.percentile(flux, 80))
        min_gap = max(1, int(frame_rate * 0.18))
        last_peak = -min_gap
        for index in range(1, len(flux) - 1):
            if (
                flux[index] >= flux[index - 1]
                and flux[index] > flux[index + 1]
                and flux[index] >= threshold
                and index - last_peak >= min_gap
            ):
                beats.append(index / frame_rate)
                last_peak = index

    if len(beats) < 4:
        interval = 60.0 / max(bpm, 1.0)
        beats = list(np.arange(0.0, duration, interval).tolist())
    return [round(beat, 3) for beat in beats if 0.0 <= beat <= duration]


def analyze_audio(audio_path: str | Path) -> AudioAnalysis:
    """解码音频并计算 BPM、节拍、能量包络与频段能量。"""
    samples = decode_audio(audio_path)
    duration = float(len(samples)) / SAMPLE_RATE
    if duration < 0.5:
        raise SceneError("音频太短，至少需要 0.5 秒")

    window = np.hanning(WIN).astype(np.float32)
    frame_count = 1 + (len(samples) - WIN) // HOP if len(samples) >= WIN else 0
    if frame_count < 2:
        padded = np.pad(samples, (0, max(0, WIN - len(samples))))
        frame_count = 1
        samples = padded

    offsets = np.arange(frame_count)[:, None] * HOP + np.arange(WIN)[None, :]
    frames = samples[offsets] * window
    spectra = np.abs(np.fft.rfft(frames, axis=1))
    frequencies = np.fft.rfftfreq(WIN, 1.0 / SAMPLE_RATE)

    def band(low_hz: float, high_hz: float) -> np.ndarray:
        mask = (frequencies >= low_hz) & (frequencies < high_hz)
        if not np.any(mask):
            return np.zeros(frame_count, dtype=np.float32)
        return spectra[:, mask].mean(axis=1)

    low = _normalize(band(20, 250))
    mid = _normalize(band(250, 2000))
    high = _normalize(band(2000, 8000))

    rms = np.sqrt(np.mean(frames**2, axis=1))
    env = np.convolve(_normalize(rms), np.ones(5) / 5.0, mode="same")

    flux = np.maximum(0.0, np.diff(spectra, axis=0)).sum(axis=1)
    flux = np.concatenate([[0.0], flux])
    flux = _normalize(flux)

    frame_rate = SAMPLE_RATE / HOP
    bpm = estimate_bpm(flux, frame_rate)
    beats = _pick_beats(flux, frame_rate, duration, bpm)

    return AudioAnalysis(
        duration=duration,
        bpm=bpm,
        beats=beats,
        frame_rate=frame_rate,
        env=env,
        low=low,
        mid=mid,
        high=high,
    )
