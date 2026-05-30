from __future__ import annotations

import base64
import hashlib
import html
import html.parser
import hmac
import io
import json
import mimetypes
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import sys
import threading
import time
from http.cookies import SimpleCookie
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.parser import BytesParser
from email.policy import default as email_policy
from email.utils import formatdate
from pathlib import Path
from typing import Any
from urllib import error as urlerror, request as urlrequest
from urllib.parse import parse_qs, quote, unquote, urlparse

from .settings import *

def bridge_actor_from_session(item: dict[str, Any]) -> dict[str, Any]:
    if is_admin_session(item):
        return {"role": "admin", "username": item.get("username") or item.get("display_name") or "site"}
    if item.get("role") == "user" and item.get("trebnik_client_id"):
        return {
            "role": "client",
            "username": item.get("username") or item.get("display_name") or "client",
            "client_id": int(item.get("trebnik_client_id") or 0),
        }
    raise ApiError(403, "Кабинет Требника ещё не открыт для этого профиля.")

def parse_bridge_response(raw: bytes) -> dict[str, Any]:
    try:
        data = json.loads(raw.decode("utf-8") or "{}")
    except Exception as exc:
        raise ApiError(502, "Мост Требника ответил непонятно. Действие остановлено.") from exc
    return data if isinstance(data, dict) else {}

def bridge_error_from_http(exc: urlerror.HTTPError) -> ApiError:
    data = parse_bridge_response(exc.read())
    message = clean_text(data.get("error"), 500) or "Мост Требника отклонил действие."
    return ApiError(int(exc.code or 502), message)

def trebnik_bridge_command(command: str, payload: dict[str, Any], headers: Any) -> dict[str, Any]:
    item = require_session(headers)
    actor = bridge_actor_from_session(item)
    if not TREBNIK_BRIDGE_TOKEN:
        raise ApiError(503, "Связь с ботом Требник не настроена. Действие не записано.", {"code": "live_error", "source": "live_service"})
    body = json.dumps(
        {"command": command, "actor": actor, "payload": json_safe(payload or {})},
        ensure_ascii=False,
    ).encode("utf-8")
    request = urlrequest.Request(
        f"{TREBNIK_BRIDGE_URL}/command",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "X-Trebnik-Bridge-Token": TREBNIK_BRIDGE_TOKEN,
        },
    )
    try:
        with urlrequest.urlopen(request, timeout=TREBNIK_BRIDGE_TIMEOUT_SECONDS) as response:
            data = parse_bridge_response(response.read())
    except urlerror.HTTPError as exc:
        raise bridge_error_from_http(exc) from exc
    except (urlerror.URLError, TimeoutError, OSError) as exc:
        raise ApiError(503, "Бот Требник сейчас недоступен. Действие не записано, попробуйте позже.", {"code": "live_error", "source": "live_service"}) from exc
    if not data.get("ok"):
        raise ApiError(502, clean_text(data.get("error"), 500) or "Мост Требника не подтвердил действие.")
    result = data.get("result") if isinstance(data.get("result"), dict) else {}
    revision = result.get("revision") or result.get("trebnik_revision") or data.get("revision") or data.get("trebnik_revision")
    return {
        "ok": True,
        "bridge": result,
        "revision": revision,
        "trebnik_revision": revision,
        "sync": {"status": "live_service", "revision": revision},
        "warning": "",
    }

def trebnik_bridge_query(command: str, payload: dict[str, Any], headers: Any) -> dict[str, Any] | None:
    item = require_session(headers)
    actor = bridge_actor_from_session(item)
    if not TREBNIK_BRIDGE_TOKEN:
        return None
    body = json.dumps(
        {"command": command, "actor": actor, "payload": json_safe(payload or {})},
        ensure_ascii=False,
    ).encode("utf-8")
    request = urlrequest.Request(
        f"{TREBNIK_BRIDGE_URL}/command",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "X-Trebnik-Bridge-Token": TREBNIK_BRIDGE_TOKEN,
        },
    )
    try:
        with urlrequest.urlopen(request, timeout=TREBNIK_BRIDGE_TIMEOUT_SECONDS) as response:
            data = parse_bridge_response(response.read())
    except urlerror.HTTPError:
        return None
    except (urlerror.URLError, TimeoutError, OSError):
        return None
    if not data.get("ok"):
        return None
    result = data.get("result")
    if not isinstance(result, dict):
        return None
    revision = result.get("revision") or result.get("trebnik_revision") or data.get("revision") or data.get("trebnik_revision")
    if revision is not None:
        result.setdefault("revision", revision)
        result.setdefault("trebnik_revision", revision)
    return result

def trebnik_bridge_query_required(command: str, payload: dict[str, Any], headers: Any) -> dict[str, Any]:
    item = require_session(headers)
    actor = bridge_actor_from_session(item)
    if not TREBNIK_BRIDGE_TOKEN:
        raise ApiError(503, "Служба Требника не подключена. Данные не показаны, чтобы не выдать устаревший снимок.", {"code": "live_error", "source": "live_service"})
    body = json.dumps(
        {"command": command, "actor": actor, "payload": json_safe(payload or {})},
        ensure_ascii=False,
    ).encode("utf-8")
    request = urlrequest.Request(
        f"{TREBNIK_BRIDGE_URL}/command",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "X-Trebnik-Bridge-Token": TREBNIK_BRIDGE_TOKEN,
        },
    )
    try:
        with urlrequest.urlopen(request, timeout=TREBNIK_BRIDGE_TIMEOUT_SECONDS) as response:
            data = parse_bridge_response(response.read())
    except urlerror.HTTPError as exc:
        raise bridge_error_from_http(exc) from exc
    except (urlerror.URLError, TimeoutError, OSError) as exc:
        raise ApiError(503, "Служба Требника сейчас недоступна. Данные не показаны, чтобы не выдать устаревший снимок.", {"code": "live_error", "source": "live_service"}) from exc
    if not data.get("ok"):
        raise ApiError(502, clean_text(data.get("error"), 500) or "Служба Требника не подтвердила данные.")
    result = data.get("result")
    if not isinstance(result, dict):
        raise ApiError(502, "Служба Требника ответила непонятно. Данные не показаны.")
    result.setdefault("source", "bot")
    revision = result.get("revision") or result.get("trebnik_revision") or data.get("revision") or data.get("trebnik_revision")
    if revision is not None:
        result.setdefault("revision", revision)
        result.setdefault("trebnik_revision", revision)
    return result

def trebnik_bridge_binary_required(path: str) -> tuple[bytes, str]:
    if not TREBNIK_BRIDGE_TOKEN:
        raise ApiError(503, "Служба Требника не подключена. Вложение пока не открыть.", {"code": "live_error", "source": "live_service"})
    request = urlrequest.Request(
        f"{TREBNIK_BRIDGE_URL}{path}",
        method="GET",
        headers={
            "X-Trebnik-Bridge-Token": TREBNIK_BRIDGE_TOKEN,
        },
    )
    try:
        with urlrequest.urlopen(request, timeout=TREBNIK_BRIDGE_TIMEOUT_SECONDS) as response:
            content_type = str(response.headers.get("Content-Type") or "application/octet-stream").split(";", 1)[0].strip() or "application/octet-stream"
            return response.read(), content_type
    except urlerror.HTTPError as exc:
        raise bridge_error_from_http(exc) from exc
    except (urlerror.URLError, TimeoutError, OSError) as exc:
        raise ApiError(503, "Служба Требника сейчас недоступна. Вложение не открыто.", {"code": "live_error", "source": "live_service"}) from exc

def trebnik_bridge_health() -> dict[str, Any] | None:
    if not TREBNIK_BRIDGE_TOKEN:
        return {
            "ok": False,
            "status": "not_configured",
            "source": "not_configured",
            "bridge_error": {"code": "not_configured", "message": "Связь с живой службой Требника не настроена."},
        }
    request = urlrequest.Request(
        f"{TREBNIK_BRIDGE_URL}/health",
        method="GET",
        headers={"X-Trebnik-Bridge-Token": TREBNIK_BRIDGE_TOKEN},
    )
    try:
        with urlrequest.urlopen(request, timeout=min(5, TREBNIK_BRIDGE_TIMEOUT_SECONDS)) as response:
            data = parse_bridge_response(response.read())
    except urlerror.HTTPError as exc:
        try:
            data = parse_bridge_response(exc.read())
        except Exception:
            data = {}
        return {
            "ok": False,
            "status": "live_error",
            "source": "live_service",
            "bridge_error": {
                "code": "http_error",
                "status": int(exc.code or 502),
                "message": clean_text(data.get("error"), 500) or "Живая служба Требника отклонила проверку.",
            },
        }
    except (urlerror.URLError, TimeoutError, OSError) as exc:
        return {
            "ok": False,
            "status": "live_error",
            "source": "live_service",
            "bridge_error": {"code": type(exc).__name__, "message": "Живая служба Требника сейчас недоступна."},
        }
    if not isinstance(data, dict):
        return {
            "ok": False,
            "status": "live_error",
            "source": "live_service",
            "bridge_error": {"code": "bad_response", "message": "Живая служба Требника ответила непонятно."},
        }
    data.setdefault("source", "live_service")
    data.setdefault("status", "ok" if data.get("ok") else "live_error")
    return data

def trebnik_site_health() -> dict[str, Any]:
    bridge = trebnik_bridge_health()
    live_available = bool(bridge and bridge.get("ok"))
    db_identity = bridge.get("db") if isinstance(bridge, dict) and isinstance(bridge.get("db"), dict) else {}
    revision = None
    if isinstance(bridge, dict):
        revision = bridge.get("revision") or bridge.get("trebnik_revision") or db_identity.get("trebnik_revision")
    return {
        "ok": live_available,
        "status": "ok" if live_available else "live_error",
        "source": "live_service" if TREBNIK_BRIDGE_TOKEN else "not_configured",
        "live_available": live_available,
        "mode": bridge.get("mode") if isinstance(bridge, dict) else None,
        "revision": revision,
        "trebnik_revision": revision,
        "revision_updated_at": (bridge.get("revision_updated_at") if isinstance(bridge, dict) else None) or db_identity.get("trebnik_revision_updated_at"),
        "last_event_at": (bridge.get("last_event_at") if isinstance(bridge, dict) else None) or db_identity.get("last_event_at"),
        "counts": (bridge.get("counts") if isinstance(bridge, dict) and isinstance(bridge.get("counts"), dict) else None) or db_identity.get("counts") or {},
        "db": db_identity,
        "bridge": bridge,
        "bridge_error": bridge.get("bridge_error") if isinstance(bridge, dict) else {"code": "missing_bridge", "message": "Нет ответа от живой службы Требника."},
    }

def _sse_write(handler: Any, event_type: str, data: dict[str, Any]) -> None:
    raw = f"event: {event_type}\ndata: {json.dumps(json_safe(data), ensure_ascii=False)}\n\n".encode("utf-8")
    handler.wfile.write(raw)
    handler.wfile.flush()

def trebnik_events_stream(handler: Any) -> None:
    require_admin(handler.headers)
    handler.send_response(200)
    handler.send_header("Content-Type", "text/event-stream; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Connection", "keep-alive")
    handler.add_security_headers()
    handler.add_cors()
    handler.end_headers()

    last_revision: int | None = None
    started = time.time()
    while time.time() - started < 300:
        health = trebnik_bridge_health()
        if not health or not health.get("ok"):
            _sse_write(handler, "trebnik.revision.changed", {"type": "trebnik.revision.changed", "revision": last_revision or 0, "areas": []})
            return
        revision_value = health.get("revision") or health.get("trebnik_revision")
        try:
            revision = int(revision_value or 0)
        except (TypeError, ValueError):
            revision = 0
        if last_revision is None:
            last_revision = revision
            _sse_write(handler, "finance.changed", {"type": "finance.changed", "revision": revision, "areas": ["summary", "debts", "payments"]})
        elif revision != last_revision:
            last_revision = revision
            _sse_write(handler, "finance.changed", {"type": "finance.changed", "revision": revision, "areas": ["summary", "debts", "payments"]})
            _sse_write(handler, "trebnik.revision.changed", {"type": "trebnik.revision.changed", "revision": revision, "areas": ["trebnik"]})
        else:
            handler.wfile.write(b": keepalive\n\n")
            handler.wfile.flush()
        time.sleep(10)

def trebnik_live_meta(live: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(live, dict):
        return {}
    meta: dict[str, Any] = {}
    revision = live.get("revision") or live.get("trebnik_revision")
    if revision is not None:
        meta["revision"] = revision
        meta["trebnik_revision"] = revision
    if live.get("revision_updated_at") is not None:
        meta["revision_updated_at"] = live.get("revision_updated_at")
    return meta

def merge_live_payload(fallback: dict[str, Any], live: dict[str, Any] | None) -> dict[str, Any]:
    if not live:
        fallback.setdefault("source", "copy")
        return fallback
    payload = dict(fallback)
    for key, value in live.items():
        if value is not None:
            payload[key] = value
    for key, value in fallback.items():
        payload.setdefault(key, value)
    payload["source"] = "bot"
    return payload

__all__ = ['bridge_actor_from_session', 'parse_bridge_response', 'bridge_error_from_http', 'trebnik_bridge_command', 'trebnik_bridge_query', 'trebnik_bridge_query_required', 'trebnik_bridge_binary_required', 'trebnik_bridge_health', 'trebnik_site_health', '_sse_write', 'trebnik_events_stream', 'trebnik_live_meta', 'merge_live_payload']
