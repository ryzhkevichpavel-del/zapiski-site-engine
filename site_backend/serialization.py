from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from .errors import ApiError

def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")

def money_safe(value: Any) -> Any:
    if value is None:
        return None
    try:
        number = round(float(value), 2)
    except (TypeError, ValueError):
        return value
    return int(number) if number.is_integer() else number

def json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [json_safe(item) for item in value]
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds")
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    if isinstance(value, float):
        return money_safe(value)
    return value

def parse_body(raw: bytes) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ApiError(400, "Не удалось прочитать JSON.") from exc
    if not isinstance(data, dict):
        raise ApiError(400, "JSON должен быть объектом.")
    return data

def parse_date(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip().replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(text[:19] if fmt.endswith("%S") else text[:10], fmt)
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(str(value))
    except Exception:
        return None

def parse_iso_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value))
    except Exception:
        return parse_date(value)

def make_slug(text: Any, fallback: str) -> str:
    raw = str(text or "").strip().lower().replace("ё", "е")
    raw = re.sub(r"[^0-9a-zа-я_]+", "-", raw, flags=re.IGNORECASE).strip("-")
    raw = re.sub(r"-+", "-", raw)[:80].strip("-")
    return raw or fallback

def clone_json(value: Any) -> Any:
    return json.loads(json.dumps(json_safe(value), ensure_ascii=False))

__all__ = ['now_iso', 'money_safe', 'json_safe', 'parse_body', 'parse_date', 'parse_iso_datetime', 'make_slug', 'clone_json']
