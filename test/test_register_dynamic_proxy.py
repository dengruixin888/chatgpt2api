from __future__ import annotations

import unittest

from services.register import openai_register


class RegisterDynamicProxyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_proxy = openai_register.config.get("proxy")
        self.original_dynamic_proxy = dict(openai_register.config.get("dynamic_proxy") or {})

    def tearDown(self) -> None:
        openai_register.config["proxy"] = self.original_proxy
        openai_register.config["dynamic_proxy"] = self.original_dynamic_proxy

    def test_build_task_proxy_renders_dynamic_template(self) -> None:
        openai_register.config["proxy"] = ""
        openai_register.config["dynamic_proxy"] = {
            "enabled": True,
            "protocol": "http",
            "host": "gate.kookeey.info",
            "port": "1000",
            "username_template": "user-{index}",
            "password_template": "pass-{session}-5m",
            "session_length": 10,
        }

        proxy = openai_register.build_task_proxy(7)

        self.assertTrue(proxy.startswith("http://user-7:pass-"))
        self.assertTrue(proxy.endswith("-5m@gate.kookeey.info:1000"))

    def test_build_task_proxy_falls_back_to_static_proxy_when_disabled(self) -> None:
        openai_register.config["proxy"] = "http://127.0.0.1:7890"
        openai_register.config["dynamic_proxy"] = {"enabled": False}

        self.assertEqual(openai_register.build_task_proxy(1), "http://127.0.0.1:7890")


if __name__ == "__main__":
    unittest.main()
