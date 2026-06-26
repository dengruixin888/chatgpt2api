from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from typing import Any

from services.config import DATA_DIR


RECOVERY_FILE = DATA_DIR / "register_recovery.json"
_lock = Lock()


def _read() -> list[dict[str, Any]]:
    try:
        data = json.loads(RECOVERY_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []
    return data if isinstance(data, list) else []


def _write(items: list[dict[str, Any]]) -> None:
    RECOVERY_FILE.parent.mkdir(parents=True, exist_ok=True)
    RECOVERY_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def list_records() -> list[dict[str, Any]]:
    with _lock:
        return _read()


def record_registered_account(mailbox: dict[str, Any], account: dict[str, Any]) -> None:
    record = {
        "provider": str(mailbox.get("provider") or "").strip(),
        "mailbox_base": str(mailbox.get("base_address") or "").strip().lower(),
        "mailbox_address": str(mailbox.get("address") or "").strip().lower(),
        "account_line": str(mailbox.get("account_line") or "").strip(),
        "email": str(account.get("email") or "").strip(),
        "password": str(account.get("password") or "").strip(),
        "access_token": str(account.get("access_token") or "").strip(),
        "refresh_token": str(account.get("refresh_token") or "").strip(),
        "id_token": str(account.get("id_token") or "").strip(),
        "source_type": str(account.get("source_type") or "web").strip(),
        "created_at": str(account.get("created_at") or "").strip(),
    }
    if not record["provider"] or not record["email"]:
        return
    with _lock:
        items = _read()
        items.append(record)
        _write(items)


def find_latest_record_for_line(account_line: str, mailbox_base: str) -> dict[str, Any] | None:
    normalized_line = str(account_line or "").strip()
    normalized_base = str(mailbox_base or "").strip().lower()
    with _lock:
        records = _read()
    matches = [
        item
        for item in records
        if str(item.get("provider") or "").strip() == "outlook"
        and (
            (normalized_line and str(item.get("account_line") or "").strip() == normalized_line)
            or (normalized_base and str(item.get("mailbox_base") or "").strip().lower() == normalized_base)
        )
    ]
    if not matches:
        return None
    matches.sort(key=lambda item: str(item.get("created_at") or ""))
    return dict(matches[-1])


def count_records_for_base(mailbox_base: str) -> int:
    normalized_base = str(mailbox_base or "").strip().lower()
    if not normalized_base:
        return 0
    with _lock:
        records = _read()
    emails = {
        str(item.get("email") or "").strip().lower()
        for item in records
        if str(item.get("provider") or "").strip() == "outlook"
        and str(item.get("mailbox_base") or "").strip().lower() == normalized_base
        and str(item.get("email") or "").strip()
    }
    return len(emails)
