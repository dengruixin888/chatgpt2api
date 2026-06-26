from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from services.account_service import account_service
from services.register.recovery_store import find_latest_record_for_line


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_outlook_line(value: str) -> dict[str, str]:
    text = str(value or "").strip()
    if not text:
        return {}
    parts = [item.strip() for item in text.split("----")]
    if len(parts) < 4:
        return {}
    return {
        "mailbox_base": parts[0].lower(),
        "mailbox_password": parts[1],
        "client_id": parts[2],
        "refresh_token": "----".join(parts[3:]).strip(),
    }


def recover_outlook_pool(account_lines: list[str]) -> dict[str, Any]:
    imported: list[dict[str, Any]] = []
    missing: list[str] = []
    errors: list[dict[str, str]] = []

    for line in account_lines:
        parsed_line = _parse_outlook_line(line)
        mailbox_base = str(parsed_line.get("mailbox_base") or "").strip().lower()
        if not mailbox_base:
            continue

        record = find_latest_record_for_line(line, mailbox_base)
        if record is None:
            missing.append(mailbox_base)
            continue

        email = str(record.get("email") or "").strip()
        password = str(record.get("password") or "").strip()
        if not email or not password:
            missing.append(mailbox_base)
            continue

        result = account_service._login_with_password(email, password)
        if not result.get("ok"):
            error_type = str(result.get("error") or "login_failed")
            if error_type in {"need_verification_code", "no_auth_code"}:
                missing.append(mailbox_base)
            else:
                errors.append({"email": email or mailbox_base, "error": error_type})
            continue

        payload = {
            "email": str(result.get("email") or email).strip(),
            "password": password,
            "access_token": str(result.get("access_token") or "").strip(),
            "refresh_token": str(result.get("refresh_token") or "").strip(),
            "id_token": str(result.get("id_token") or "").strip(),
            "source_type": "outlook_recover",
            "created_at": _now(),
            "mailbox_base": mailbox_base,
        }
        if not payload["access_token"]:
            errors.append({"email": email or mailbox_base, "error": "missing_access_token"})
            continue

        add_result = account_service.add_account_items([payload])
        refresh_result = account_service.refresh_accounts([payload["access_token"]])
        imported.append(
            {
                "mailbox_base": mailbox_base,
                "email": payload["email"],
                "added": int(add_result.get("added") or 0),
                "skipped": int(add_result.get("skipped") or 0),
                "refresh_errors": refresh_result.get("errors") or [],
            }
        )

    return {
        "imported": imported,
        "missing": list(dict.fromkeys(missing)),
        "errors": errors,
    }
