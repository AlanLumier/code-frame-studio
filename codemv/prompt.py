"""AI 提示词构建：把用户的画面描述拼成场景代码生成指令。"""

from __future__ import annotations

from pathlib import Path

TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "prompts" / "scene_prompt.md"
MV_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "prompts" / "mv_prompt.md"

_FALLBACK_TEMPLATE = """# 场景代码生成任务

请根据下面的画面描述，编写一个逐帧渲染的 Python 文件。

画面描述：{{description}}

要求：
- 只输出一个完整的 Python 文件内容，不要 Markdown 代码围栏，不要解释；
- 定义 WIDTH, HEIGHT = 960, 540；
- 定义 def render_frame(t: float) -> PIL.Image.Image，t 从 0.0 到 1.0；
- 只使用标准库 + Pillow + numpy，禁止网络与外部素材；
- 随机数固定种子，保证每次渲染结果一致。
"""


def build_scene_prompt(description: str) -> str:
    """把用户描述填入场景生成提示词模板。"""
    description = (description or "").strip()
    if not description:
        raise ValueError("画面描述不能为空")

    try:
        template = TEMPLATE_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        template = _FALLBACK_TEMPLATE
    return template.replace("{{description}}", description)


def build_mv_prompt(description: str, orientation: str = "竖屏 1080×1920（9:16）") -> str:
    """把歌曲描述填入 MV 场景生成提示词模板。"""
    description = (description or "").strip()
    if not description:
        raise ValueError("歌曲描述不能为空")

    try:
        template = MV_TEMPLATE_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        template = "请生成一个 MV 场景：{{description}}（{{orientation}}）"
    return template.replace("{{description}}", description).replace("{{orientation}}", orientation)


def build_mv_generation_prompt(
    *,
    song_name: str,
    duration: float,
    bpm: float,
    beat_count: int,
    lyrics_lines: list[str],
    idea: str = "",
) -> str:
    """把歌曲信息与歌词注入 MV 场景生成模板，交给 AI 生成画面代码。"""
    idea = (idea or "").strip() or f"围绕《{song_name}》的情绪与歌词意象自由创作"
    base = build_mv_prompt(idea)

    lyrics_block = "\n".join(lyrics_lines) if lyrics_lines else "（这首歌没有提供歌词）"
    context = f"""

## 这首歌的真实数据（请严格据此设计画面）

- 歌名：{song_name}
- 时长：{duration:.1f} 秒
- BPM：{bpm}
- 节拍数量：{beat_count}

## 歌词（时间戳 → 歌词）

{lyrics_block}

## 额外要求

1. 画面意象必须来自上面的歌词与歌曲情绪，不要用无关的通用背景。
2. 在节拍点（ctx.beat 接近 1 时）让光晕、波浪、镜头或元素有明显的反馈，做到卡点。
3. 歌名、歌手、歌词文字都不要画进画面（歌词由渲染器统一叠加）。
4. 只输出完整的 Python 代码。
"""
    return base + context
