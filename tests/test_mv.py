"""音频分析、歌词解析与 MV 渲染测试。"""

from __future__ import annotations

import shutil
import subprocess
import unittest
import uuid
import wave
from pathlib import Path

import numpy as np
from PIL import Image

from codemv.audio import SAMPLE_RATE, AudioAnalysis, analyze_audio
from codemv.lyrics import LyricsTimeline, load_lyrics, parse_lrc
from codemv.mv import (
    build_context,
    draw_lyrics,
    load_mv_scene,
    render_mv,
    render_mv_preview,
)
from codemv.renderer import find_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
SCENES = ROOT / "scenes"
TEMP_ROOT = ROOT / "output" / ".test-tmp"


def make_temp_dir() -> Path:
    TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    path = TEMP_ROOT / f"mv-{uuid.uuid4().hex}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_click_track(path: Path, duration: float = 4.0, bpm: float = 120.0) -> None:
    """生成 120BPM 的点击音轨，用于节拍检测测试。"""
    count = int(duration * SAMPLE_RATE)
    samples = np.zeros(count, dtype=np.float32)
    interval = 60.0 / bpm
    for beat in np.arange(0.0, duration, interval):
        start = int(beat * SAMPLE_RATE)
        length = int(0.05 * SAMPLE_RATE)
        if start + length > count:
            break
        timeline = np.arange(length) / SAMPLE_RATE
        samples[start : start + length] += (
            0.8 * np.sin(2 * np.pi * 1000 * timeline) * np.exp(-35 * timeline)
        )
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(pcm.tobytes())


class AudioAnalysisTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = make_temp_dir()
        self.audio = self.temp_dir / "click.wav"
        write_click_track(self.audio)

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_duration_and_energy(self) -> None:
        analysis = analyze_audio(self.audio)
        self.assertAlmostEqual(analysis.duration, 4.0, delta=0.2)
        self.assertGreaterEqual(analysis.energy_at(0.0), 0.0)
        self.assertLessEqual(analysis.energy_at(2.0), 1.0)

    def test_detects_120_bpm(self) -> None:
        analysis = analyze_audio(self.audio)
        self.assertGreaterEqual(analysis.bpm, 105)
        self.assertLessEqual(analysis.bpm, 135)
        self.assertGreaterEqual(len(analysis.beats), 4)

    def test_beat_pulse_decays(self) -> None:
        analysis = analyze_audio(self.audio)
        first_beat = analysis.beats[0]
        self.assertGreater(analysis.beat_pulse(first_beat), 0.8)
        self.assertLess(analysis.beat_pulse(first_beat + 0.35), 0.2)


class LyricsTest(unittest.TestCase):
    LRC = """[ti:测试]
[offset:0]
[00:00.50]第一句歌词
[00:03.00][00:06.00]重复的句子
[00:09.00]最后一句
"""

    def test_parse_lrc(self) -> None:
        timeline = parse_lrc(self.LRC, duration=12.0)
        self.assertEqual(len(timeline.lines), 4)
        line, progress = timeline.line_at(3.2)
        self.assertIsNotNone(line)
        assert line is not None
        self.assertEqual(line.text, "重复的句子")
        self.assertAlmostEqual(progress, 0.2 / 3.0, places=3)
        self.assertEqual(timeline.line_at(9.5)[0].text, "最后一句")

    def test_plain_text_fallback(self) -> None:
        path = Path(make_temp_dir()) / "lyrics.txt"
        try:
            path.write_text("第一行\n第二行\n第三行\n", encoding="utf-8")
            timeline = load_lyrics(path, duration=9.0)
            assert timeline is not None
            self.assertEqual(len(timeline.lines), 3)
            self.assertAlmostEqual(timeline.lines[1].start, 3.0)
        finally:
            shutil.rmtree(path.parent, ignore_errors=True)


class SceneContractTest(unittest.TestCase):
    def test_mv_scene_renders_with_context(self) -> None:
        from codemv.mv import MVContext

        context = MVContext(
            t=0.5,
            seconds=2.0,
            duration=4.0,
            width=240,
            height=426,
            bpm=120.0,
            beat=0.8,
            energy=0.7,
            spectrum=(0.5, 0.6, 0.4),
            lyric_text="测试歌词",
            lyric_progress=0.5,
        )
        image = load_mv_scene(SCENES / "mv_night_sea.py")(0.5, context)
        self.assertIsInstance(image, Image.Image)
        self.assertEqual(image.size, (240, 426))


class MVRenderTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = make_temp_dir()
        self.audio = self.temp_dir / "click.wav"
        write_click_track(self.audio, duration=2.0)
        self.lyrics = self.temp_dir / "lyrics.lrc"
        self.lyrics.write_text(
            "[00:00.00]第一句\n[00:01.00]第二句\n",
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_render_mv_with_audio_and_lyrics(self) -> None:
        output = self.temp_dir / "out.mp4"
        render_mv(
            SCENES / "mv_night_sea.py",
            self.audio,
            output,
            lyrics_path=self.lyrics,
            fps=6,
            width=240,
            height=426,
            progress=False,
        )
        self.assertTrue(output.exists())
        self.assertGreater(output.stat().st_size, 1000)

        ffmpeg = find_ffmpeg()
        if ffmpeg:
            probe = subprocess.run(
                [ffmpeg, "-hide_banner", "-i", str(output)],
                capture_output=True,
                text=True,
                check=False,
            )
            metadata = probe.stderr
            self.assertIn("Audio:", metadata)
            self.assertIn("Video:", metadata)

    def test_render_mv_preview(self) -> None:
        output = self.temp_dir / "preview.png"
        context = render_mv_preview(
            SCENES / "mv_night_sea.py",
            self.audio,
            output,
            seconds=1.2,
            lyrics_path=self.lyrics,
            width=240,
            height=426,
        )
        self.assertTrue(context.exists())
        with Image.open(context) as image:
            self.assertEqual(image.size, (240, 426))


class P5BackendTest(unittest.TestCase):
    def test_environment_status_shape(self) -> None:
        from codemv.p5_backend import environment_status

        available, message = environment_status()
        self.assertIsInstance(available, bool)
        self.assertIsInstance(message, str)

    def test_build_frames_for_p5(self) -> None:
        from codemv.p5_backend import build_frames

        analysis = AudioAnalysis(
            duration=2.0,
            bpm=120.0,
            beats=[0.5, 1.0, 1.5],
            frame_rate=43.0,
            env=np.full(86, 0.5, dtype=np.float32),
            low=np.full(86, 0.4, dtype=np.float32),
            mid=np.full(86, 0.5, dtype=np.float32),
            high=np.full(86, 0.3, dtype=np.float32),
        )
        frames = build_frames(analysis, None, total_seconds=1.0, fps=6, width=240, height=426)
        self.assertEqual(len(frames), 6)
        self.assertIn("t", frames[0])
        self.assertEqual(frames[0]["ctx"]["width"], 240)
        self.assertIsInstance(frames[0]["ctx"]["spectrum"], list)
        self.assertTrue(0.0 <= frames[-1]["t"] <= 1.0)

    def test_p5_prompt_contains_song_context(self) -> None:
        from codemv.prompt import build_p5_generation_prompt

        prompt = build_p5_generation_prompt(
            song_name="月光",
            duration=24.0,
            bpm=120,
            beat_count=48,
            lyrics_lines=["[00:03] 月光洒在海面"],
            idea="夜晚海边",
        )
        self.assertIn("drawScene", prompt)
        self.assertIn("p5.brush", prompt)
        self.assertIn("月光洒在海面", prompt)
        self.assertIn("120", prompt)


if __name__ == "__main__":
    unittest.main()
