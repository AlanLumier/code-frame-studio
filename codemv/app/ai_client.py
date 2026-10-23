"""OpenAI 兼容的大模型客户端，只用 Python 标准库实现。

支持 DeepSeek / OpenAI / 其他兼容 `/chat/completions` 的服务。
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from typing import Any

DEFAULT_TIMEOUT = 120


class AIClientError(RuntimeError):
    """调用模型接口失败、返回格式异常或内容为空时抛出。"""


def completion_url(base_url: str) -> str:
    """把用户填写的 API 地址规范化为 chat/completions 地址。"""
    base = (base_url or "").strip().rstrip("/")
    if not base:
        raise AIClientError("API 地址为空，请在设置里填写")
    if base.endswith("/chat/completions"):
        return base
    return base + "/chat/completions"


def chat_completion(
    messages: list[dict[str, Any]],
    *,
    base_url: str,
    api_key: str,
    model: str,
    timeout: int = DEFAULT_TIMEOUT,
) -> str:
    """调用 OpenAI 兼容接口，返回助手回复的文本内容。"""
    if not api_key.strip():
        raise AIClientError("API Key 为空，请在设置里填写")
    if not model.strip():
        raise AIClientError("模型名称为空，请在设置里填写")

    payload = {
        "model": model.strip(),
        "messages": messages,
        "temperature": 0.8,
        "max_tokens": 4000,
    }
    request = urllib.request.Request(
        completion_url(base_url),
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key.strip()}",
            "User-Agent": "codemv-app",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:500]
        raise AIClientError(f"模型接口返回 HTTP {exc.code}：{body}") from exc
    except urllib.error.URLError as exc:
        raise AIClientError(f"无法连接模型接口：{exc.reason}") from exc
    except TimeoutError as exc:
        raise AIClientError("模型接口请求超时") from exc

    try:
        data = json.loads(raw)
    except ValueError as exc:
        raise AIClientError(f"模型返回的不是合法 JSON：{raw[:200]}") from exc

    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise AIClientError(f"模型返回格式异常：{raw[:300]}") from exc

    if not isinstance(content, str) or not content.strip():
        raise AIClientError("模型返回内容为空")
    return content


def extract_python_code(text: str) -> str:
    """从模型回复中提取 Python 代码（去掉 Markdown 代码围栏与多余说明）。"""
    fenced = re.search(r"```(?:python)?[ \t]*\r?\n(.*?)```", text, re.DOTALL | re.IGNORECASE)
    code = fenced.group(1) if fenced else text
    code = code.strip()
    if not code:
        raise AIClientError("模型没有返回任何代码")
    return code + "\n"


def scene_messages(description: str, *, scene_prompt: str) -> list[dict[str, Any]]:
    """构建生成场景代码的消息列表。"""
    if not description.strip():
        raise AIClientError("请先填写画面描述")
    return [
        {
            "role": "system",
            "content": (
                "你是一名资深 Python 图形程序员。你只输出一个完整的、可直接运行的 Python 文件，"
                "不要输出 Markdown 代码围栏之外的任何解释。"
            ),
        },
        {"role": "user", "content": scene_prompt},
    ]


def generate_scene_code(
    description: str,
    *,
    base_url: str,
    api_key: str,
    model: str,
    scene_prompt: str,
    timeout: int = DEFAULT_TIMEOUT,
) -> str:
    """根据画面描述生成场景代码。"""
    messages = scene_messages(description, scene_prompt=scene_prompt)
    reply = chat_completion(
        messages,
        base_url=base_url,
        api_key=api_key,
        model=model,
        timeout=timeout,
    )
    return extract_python_code(reply)
