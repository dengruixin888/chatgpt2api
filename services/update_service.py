from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from services.config import BASE_DIR, DATA_DIR


UPDATE_STATE_FILE = DATA_DIR / "update_state.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class UpdateService:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._runner: threading.Thread | None = None
        self._state = self._load_state()

    def _load_state(self) -> dict[str, Any]:
        try:
            data = json.loads(UPDATE_STATE_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except Exception:
            pass
        return {
            "available": False,
            "running": False,
            "status": "idle",
            "reason": "",
            "error": "",
            "started_at": None,
            "finished_at": None,
            "logs": [],
        }

    def _save_state(self) -> None:
        UPDATE_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        UPDATE_STATE_FILE.write_text(json.dumps(self._state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def _append_log(self, text: str) -> None:
        self._state["logs"] = [*list(self._state.get("logs") or []), {"time": _now(), "text": str(text)}][-200:]
        self._save_state()

    def _default_workdir(self) -> str:
        return str(BASE_DIR)

    def _find_git_workdir(self, candidate: str | Path | None = None) -> tuple[str, str]:
        start = Path(candidate or BASE_DIR).resolve()
        if shutil.which("git") is None:
            return "", "未检测到 git 命令"
        if not start.exists():
            return "", f"更新目录不存在: {start}"

        try:
            result = subprocess.run(
                ["git", "-C", str(start), "rev-parse", "--show-toplevel"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=5,
                check=False,
            )
        except Exception as exc:
            return "", f"检测 Git 目录失败: {exc}"

        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()
            suffix = f"，git 输出: {detail}" if detail else ""
            return "", f"未检测到 .git，当前运行目录不是可直接更新的源码目录: {start}{suffix}"

        workdir = (result.stdout or "").strip()
        if not workdir:
            return "", f"未检测到 Git 根目录: {start}"
        return workdir, ""

    def _default_command(self) -> tuple[str, str]:
        workdir, reason = self._find_git_workdir()
        if not workdir:
            return "", reason
        root = Path(workdir)
        if not (root / "docker-compose.yml").exists():
            return "", "未检测到 docker-compose.yml，无法自动更新"
        if shutil.which("docker") is None:
            return "", "未检测到 docker 命令"
        return "git pull && docker compose up -d --build app", workdir

    def _resolve_command(self) -> tuple[str, str, str]:
        env_command = str(os.getenv("CHATGPT2API_UPDATE_COMMAND") or "").strip()
        env_workdir = str(os.getenv("CHATGPT2API_UPDATE_WORKDIR") or "").strip()
        if env_command:
            workdir = env_workdir or self._default_workdir()
            if not Path(workdir).exists():
                return "", "", f"更新目录不存在: {workdir}"
            return env_command, workdir, ""

        if env_workdir:
            workdir, reason = self._find_git_workdir(env_workdir)
            if not workdir:
                return "", "", reason
            if not (Path(workdir) / "docker-compose.yml").exists():
                return "", "", "未检测到 docker-compose.yml，无法自动更新"
            if shutil.which("docker") is None:
                return "", "", "未检测到 docker 命令"
            return "git pull && docker compose up -d --build app", workdir, ""

        command_or_reason, workdir_or_reason = self._default_command()
        if not command_or_reason:
            return "", "", str(workdir_or_reason)
        return command_or_reason, str(workdir_or_reason), ""

    def get_status(self) -> dict[str, Any]:
        with self._lock:
            command, workdir, reason = self._resolve_command()
            state = dict(self._state)
            state["available"] = bool(command)
            state["reason"] = reason
            state["workdir"] = workdir
            state["base_dir"] = str(BASE_DIR)
            return state

    def start(self) -> dict[str, Any]:
        with self._lock:
            if self._runner and self._runner.is_alive():
                raise ValueError("更新任务已在运行中")
            command, workdir, reason = self._resolve_command()
            if not command:
                raise ValueError(reason or "当前环境不支持一键更新")

            self._state = {
                "available": True,
                "running": True,
                "status": "running",
                "reason": "",
                "error": "",
                "workdir": workdir,
                "started_at": _now(),
                "finished_at": None,
                "logs": [],
            }
            self._append_log(f"开始执行更新命令: {command}")
            self._runner = threading.Thread(target=self._run, args=(command, workdir), daemon=True, name="self-update")
            self._runner.start()
            return self.get_status()

    def _run(self, command: str, workdir: str) -> None:
        try:
            process = subprocess.Popen(
                command,
                cwd=workdir,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            assert process.stdout is not None
            for line in process.stdout:
                text = line.rstrip()
                if text:
                    with self._lock:
                        self._append_log(text)
            code = process.wait()
            with self._lock:
                self._state["running"] = False
                self._state["finished_at"] = _now()
                self._state["status"] = "success" if code == 0 else "failed"
                self._state["error"] = "" if code == 0 else f"exit_code={code}"
                self._append_log("更新完成" if code == 0 else f"更新失败，退出码 {code}")
        except Exception as exc:
            with self._lock:
                self._state["running"] = False
                self._state["finished_at"] = _now()
                self._state["status"] = "failed"
                self._state["error"] = str(exc)
                self._append_log(f"更新异常: {exc}")


update_service = UpdateService()
