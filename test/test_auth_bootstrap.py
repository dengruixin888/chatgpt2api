from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.system as system_module
from services import config as config_module


class AuthBootstrapTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.base_dir = Path(self.temp_dir.name)
        self.data_dir = self.base_dir / "data"
        self.config_file = self.base_dir / "config.json"
        self.config_file.write_text("{}", encoding="utf-8")

        self.old_base_dir = config_module.BASE_DIR
        self.old_data_dir = config_module.DATA_DIR
        self.old_config_file = config_module.CONFIG_FILE
        self.old_env_auth_key = config_module.os.environ.get("CHATGPT2API_AUTH_KEY")

        config_module.BASE_DIR = self.base_dir
        config_module.DATA_DIR = self.data_dir
        config_module.CONFIG_FILE = self.config_file
        config_module.os.environ.pop("CHATGPT2API_AUTH_KEY", None)
        config_module.config = config_module.ConfigStore(self.config_file)

        self.addCleanup(self._restore_config_module)

        self.auth_patch = mock.patch.object(system_module, "auth_service", SimpleNamespace(list_keys=lambda role=None: [], authenticate=lambda token: None))
        self.auth_patch.start()
        self.addCleanup(self.auth_patch.stop)

        self.original_config = system_module.config
        system_module.config = config_module.config
        self.addCleanup(self._restore_system_module)

        app = FastAPI()
        app.include_router(system_module.create_router("1.0.0"))
        self.client = TestClient(app)

    def _restore_config_module(self) -> None:
        config_module.BASE_DIR = self.old_base_dir
        config_module.DATA_DIR = self.old_data_dir
        config_module.CONFIG_FILE = self.old_config_file
        if self.old_env_auth_key is None:
            config_module.os.environ.pop("CHATGPT2API_AUTH_KEY", None)
        else:
            config_module.os.environ["CHATGPT2API_AUTH_KEY"] = self.old_env_auth_key

    def _restore_system_module(self) -> None:
        system_module.config = self.original_config

    def test_first_login_bootstraps_auth_key(self) -> None:
        response = self.client.post("/auth/login", headers={"Authorization": "Bearer 123456"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["persistent"], True)
        self.assertEqual(config_module.config.auth_key, "123456")
        self.assertEqual(
            self.config_file.read_text(encoding="utf-8").strip(),
            '{\n  "auth-key": "123456"\n}',
        )

    def test_placeholder_auth_key_is_treated_as_uninitialized(self) -> None:
        self.config_file.write_text('{ "auth-key": "chatgpt2api" }', encoding="utf-8")
        config_module.config = config_module.ConfigStore(self.config_file)
        system_module.config = config_module.config

        response = self.client.post("/auth/login", headers={"Authorization": "Bearer 123456"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(config_module.config.auth_key, "123456")


if __name__ == "__main__":
    unittest.main()
