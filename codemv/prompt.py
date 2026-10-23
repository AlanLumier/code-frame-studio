"""AI 提示词构建：把用户的画面描述拼成场景代码生成指令。"""

from __future__ import annotations

from pathlib import Path

TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "prompts" / "scene_prompt.md"

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
