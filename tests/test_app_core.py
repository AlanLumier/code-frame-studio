"""桌面应用核心逻辑测试：设置、AI 客户端、更新检查（不依赖真实网络）。"""

from __future__ import annotations

import io
import json
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

from codemv.app import ai_client, updater
from codemv.app.settings import AppSettings, PROJECT_ROOT


class SettingsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_root = PROJECT_ROOT / "output" / ".test-tmp"
        self.temp_root.mkdir(parents=True, exist_ok=True)
        self.path = self.temp_root / "settings-test.json"
        self.path.unlink(missing_ok=True)

    def test_roundtrip(self) -> None:
        settings = AppSettings(
            api_base_url="https://example.com/v1",
            api_key="sk-test",
            model="demo-model",
            auto_check_updates=False,
            auto_install_updates=True,
        )
        settings.save(self.path)
        loaded = AppSettings.load(self.path)
        self.assertEqual(loaded, settings)

    def test_missing_file_returns_defaults(self) -> None:
        loaded = AppSettings.load(self.temp_root / "does-not-exist.json")
        self.assertEqual(loaded, AppSettings())

    def test_corrupt_file_returns_defaults(self) -> None:
        self.path.write_text("{not valid json", encoding="utf-8")
        self.assertEqual(AppSettings.load(self.path), AppSettings())


class FakeResponse:
    def __init__(self, payload: bytes) -> None:
        self._payload = payload

    def read(self) -> bytes:
        return self._payload

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *args) -> bool:
        return False


class AIClientTest(unittest.TestCase):
    def test_completion_url(self) -> None:
        self.assertEqual(
            ai_client.completion_url("https://api.deepseek.com/v1"),
            "https://api.deepseek.com/v1/chat/completions",
        )
        self.assertEqual(
            ai_client.completion_url("https://api.deepseek.com/v1/"),
            "https://api.deepseek.com/v1/chat/completions",
        )
        self.assertEqual(
            ai_client.completion_url("https://x.com/chat/completions"),
            "https://x.com/chat/completions",
        )
        with self.assertRaises(ai_client.AIClientError):
            ai_client.completion_url("  ")

    def test_extract_code_from_fenced_text(self) -> None:
        text = '好的，下面是代码：\n```python\nprint("hello")\n```\n完毕。'
        self.assertEqual(ai_client.extract_python_code(text), 'print("hello")\n')

    def test_extract_code_from_plain_text(self) -> None:
        self.assertEqual(ai_client.extract_python_code("x = 1"), "x = 1\n")

    def test_empty_description_rejected(self) -> None:
        with self.assertRaises(ai_client.AIClientError):
            ai_client.scene_messages("   ", scene_prompt="prompt")

    def test_chat_completion_success(self) -> None:
        payload = {"choices": [{"message": {"content": "代码内容"}}]}
        response = FakeResponse(json.dumps(payload).encode("utf-8"))
        with mock.patch.object(ai_client.urllib.request, "urlopen", return_value=response):
            content = ai_client.chat_completion(
                [{"role": "user", "content": "hi"}],
                base_url="https://api.example.com/v1",
                api_key="sk-test",
                model="demo",
            )
        self.assertEqual(content, "代码内容")

    def test_chat_completion_http_error(self) -> None:
        error = urllib.error.HTTPError(
            "https://api.example.com",
            401,
            "Unauthorized",
            {},
            io.BytesIO(b'{"error": "invalid key"}'),
        )
        with mock.patch.object(ai_client.urllib.request, "urlopen", side_effect=error):
            with self.assertRaises(ai_client.AIClientError) as ctx:
                ai_client.chat_completion(
                    [{"role": "user", "content": "hi"}],
                    base_url="https://api.example.com/v1",
                    api_key="bad",
                    model="demo",
                )
        self.assertIn("HTTP 401", str(ctx.exception))

    def test_missing_api_key(self) -> None:
        with self.assertRaises(ai_client.AIClientError):
            ai_client.chat_completion(
                [{"role": "user", "content": "hi"}],
                base_url="https://api.example.com/v1",
                api_key=" ",
                model="demo",
            )


class UpdaterTest(unittest.TestCase):
    def test_parse_version(self) -> None:
        self.assertEqual(updater.parse_version("v0.2.0"), (0, 2, 0))
        self.assertEqual(updater.parse_version("0.10"), (0, 10, 0))
        self.assertEqual(updater.parse_version("1"), (1, 0, 0))

    def test_is_newer(self) -> None:
        self.assertTrue(updater.is_newer("v0.3.0", "0.2.0"))
        self.assertFalse(updater.is_newer("v0.2.0", "0.2.0"))
        self.assertFalse(updater.is_newer("v0.1.9", "0.2.0"))

    def test_check_returns_release_when_newer(self) -> None:
        release = {"tag_name": "v9.9.9", "html_url": "https://example.com/r", "body": "notes"}
        with mock.patch.object(updater, "_get_json", side_effect=[release]):
            info = updater.check_for_updates()
        self.assertIsNotNone(info)
        assert info is not None
        self.assertEqual(info.version, "9.9.9")

    def test_check_returns_none_when_latest(self) -> None:
        release = {"tag_name": f"v{updater.__version__}"}
        with mock.patch.object(updater, "_get_json", side_effect=[release]):
            info = updater.check_for_updates()
        self.assertIsNone(info)

    def test_tag_fallback(self) -> None:
        with mock.patch.object(updater, "_get_json", side_effect=[None, [{"name": "v9.0.0"}]]):
            info = updater.check_for_updates()
        self.assertIsNotNone(info)
        assert info is not None
        self.assertEqual(info.tag, "v9.0.0")

    def test_no_release_and_no_tags(self) -> None:
        with mock.patch.object(updater, "_get_json", side_effect=[None, []]):
            with self.assertRaises(updater.UpdateError):
                updater.check_for_updates()

    def test_apply_update_requires_git(self) -> None:
        with mock.patch.object(updater, "is_git_checkout", return_value=False):
            with self.assertRaises(updater.UpdateError):
                updater.apply_update()

    def test_apply_update_runs_git_pull(self) -> None:
        result = mock.Mock(returncode=0, stdout="Already up to date.", stderr="")
        with mock.patch.object(updater, "is_git_checkout", return_value=True), mock.patch.object(
            updater.subprocess, "run", return_value=result
        ) as run:
            message = updater.apply_update()
        self.assertIn("up to date", message)
        run.assert_called_once()


if __name__ == "__main__":
    unittest.main()
