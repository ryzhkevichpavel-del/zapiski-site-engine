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

SITE_STATE_LIST_KEYS = ("notes", "events", "inquiries", "client_messages", "payment_receipts", "service_extend_requests", "payment_reviews")
SITE_STATE_DICT_KEYS = ("work_catalog_overrides",)

def site_store_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(SITE_STORE_DB), timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=NORMAL")
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS site_kv (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS site_sessions (
            token TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            expires_at TEXT,
            last_seen TEXT,
            updated_at TEXT NOT NULL
        )
        """
    )
    con.execute("CREATE INDEX IF NOT EXISTS idx_site_sessions_expires ON site_sessions(expires_at)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_site_sessions_last_seen ON site_sessions(last_seen)")
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS site_visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            day_key TEXT NOT NULL,
            visitor_hash TEXT NOT NULL,
            first_seen_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            pageviews INTEGER NOT NULL DEFAULT 1,
            last_path TEXT NOT NULL DEFAULT '',
            user_id INTEGER,
            role TEXT NOT NULL DEFAULT '',
            UNIQUE(day_key, visitor_hash)
        )
        """
    )
    con.execute("CREATE INDEX IF NOT EXISTS idx_site_visits_day ON site_visits(day_key, last_seen_at)")
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS site_pageviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            day_key TEXT NOT NULL,
            visitor_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            path TEXT NOT NULL DEFAULT '',
            user_id INTEGER,
            role TEXT NOT NULL DEFAULT ''
        )
        """
    )
    con.execute("CREATE INDEX IF NOT EXISTS idx_site_pageviews_day ON site_pageviews(day_key, created_at)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_site_pageviews_path ON site_pageviews(day_key, path)")
    return con

def site_store_get(key: str) -> Any | None:
    try:
        with FILE_LOCK, site_store_connection() as con:
            row = con.execute("SELECT value FROM site_kv WHERE key = ?", (key,)).fetchone()
    except sqlite3.DatabaseError as exc:
        backup_file(SITE_STORE_DB, SITE_STORE_BACKUP_DIR, "поврежденное-хранилище")
        raise ApiError(500, "Внутреннее хранилище сайта повреждено. Я сохранил копию и остановил действие.") from exc
    if not row:
        return None
    try:
        return json.loads(row["value"])
    except Exception as exc:
        backup_file(SITE_STORE_DB, SITE_STORE_BACKUP_DIR, "нечитаемая-запись")
        raise ApiError(500, "Запись во внутреннем хранилище сайта повреждена. Я сохранил копию и остановил действие.") from exc

def site_store_set(key: str, data: Any) -> None:
    payload = json.dumps(json_safe(data), ensure_ascii=False, separators=(",", ":"))
    try:
        with FILE_LOCK, site_store_connection() as con:
            con.execute(
                """
                INSERT INTO site_kv(key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """,
                (key, payload, now_iso()),
            )
    except sqlite3.DatabaseError as exc:
        backup_file(SITE_STORE_DB, SITE_STORE_BACKUP_DIR, "ошибка-записи")
        raise ApiError(500, "Не удалось записать внутреннее хранилище сайта. Я сохранил копию и остановил действие.") from exc

def site_sessions_all() -> dict[str, Any]:
    try:
        with FILE_LOCK, site_store_connection() as con:
            rows = con.execute("SELECT token, value FROM site_sessions").fetchall()
    except sqlite3.DatabaseError as exc:
        backup_file(SITE_STORE_DB, SITE_STORE_BACKUP_DIR, "ошибка-чтения-сессий")
        raise ApiError(500, "Не удалось прочитать сессии сайта. Я сохранил копию и остановил действие.") from exc
    sessions: dict[str, Any] = {}
    try:
        for row in rows:
            sessions[str(row["token"])] = json.loads(row["value"])
    except Exception as exc:
        backup_file(SITE_STORE_DB, SITE_STORE_BACKUP_DIR, "нечитаемые-сессии")
        raise ApiError(500, "Запись сессии повреждена. Я сохранил копию и остановил действие.") from exc
    return sessions

def site_session_get(token: str) -> Any | None:
    if not token:
        return None
    try:
        with FILE_LOCK, site_store_connection() as con:
            row = con.execute("SELECT value FROM site_sessions WHERE token = ?", (token,)).fetchone()
    except sqlite3.DatabaseError as exc:
        backup_file(SITE_STORE_DB, SITE_STORE_BACKUP_DIR, "ошибка-чтения-сессии")
        raise ApiError(500, "Не удалось прочитать сессию сайта. Я сохранил копию и остановил действие.") from exc
    if not row:
        return None
    try:
        return json.loads(row["value"])
    except Exception as exc:
        backup_file(SITE_STORE_DB, SITE_STORE_BACKUP_DIR, "нечитаемая-сессия")
        raise ApiError(500, "Запись сессии повреждена. Я сохранил копию и остановил действие.") from exc

def site_session_upsert(token: str, data: Any) -> None:
    if not token or not isinstance(data, dict):
        return
    item = dict(data)
    item.pop("token", None)
    payload = json.dumps(json_safe(item), ensure_ascii=False, separators=(",", ":"))
    try:
        with FILE_LOCK, site_store_connection() as con:
            con.execute(
                """
                INSERT INTO site_sessions(token, value, expires_at, last_seen, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(token) DO UPDATE SET
                    value = excluded.value,
                    expires_at = excluded.expires_at,
                    last_seen = excluded.last_seen,
                    updated_at = excluded.updated_at
                """,
                (token, payload, item.get("expires_at") or "", item.get("last_seen") or "", now_iso()),
            )
    except sqlite3.DatabaseError as exc:
        backup_file(SITE_STORE_DB, SITE_STORE_BACKUP_DIR, "ошибка-записи-сессии")
        raise ApiError(500, "Не удалось записать сессию сайта. Я сохранил копию и остановил действие.") from exc

def site_session_delete(token: str) -> None:
    if not token:
        return
    try:
        with FILE_LOCK, site_store_connection() as con:
            con.execute("DELETE FROM site_sessions WHERE token = ?", (token,))
    except sqlite3.DatabaseError as exc:
        backup_file(SITE_STORE_DB, SITE_STORE_BACKUP_DIR, "ошибка-удаления-сессии")
        raise ApiError(500, "Не удалось удалить сессию сайта. Я сохранил копию и остановил действие.") from exc

def site_sessions_delete(tokens: list[str] | tuple[str, ...]) -> int:
    clean_tokens = [str(token) for token in tokens if token]
    if not clean_tokens:
        return 0
    try:
        with FILE_LOCK, site_store_connection() as con:
            return sum(con.execute("DELETE FROM site_sessions WHERE token = ?", (token,)).rowcount for token in clean_tokens)
    except sqlite3.DatabaseError as exc:
        backup_file(SITE_STORE_DB, SITE_STORE_BACKUP_DIR, "ошибка-удаления-сессий")
        raise ApiError(500, "Не удалось удалить сессии сайта. Я сохранил копию и остановил действие.") from exc

def default_state() -> dict[str, Any]:
    data = {key: [] for key in SITE_STATE_LIST_KEYS}
    data.update({key: {} for key in SITE_STATE_DICT_KEYS})
    return data

def normalize_state_store(data: Any) -> tuple[dict[str, Any], bool]:
    if not isinstance(data, dict):
        data = default_state()
        changed = True
    else:
        changed = False
    for key in SITE_STATE_LIST_KEYS:
        if not isinstance(data.get(key), list):
            data[key] = []
            changed = True
    for key in SITE_STATE_DICT_KEYS:
        if not isinstance(data.get(key), dict):
            data[key] = {}
            changed = True
    return data, changed

def load_state() -> dict[str, Any]:
    data = site_store_get("state")
    migrated = data is None
    if migrated:
        default = default_state()
        data = read_protected_json(STATE_FILE, default, STATE_BACKUP_DIR, "рабочего журнала") if STATE_FILE.exists() else clone_json(default)
    data, changed = normalize_state_store(data)
    if changed:
        save_state(data)
    elif migrated:
        site_store_set("state", data)
    return data

def save_state(data: dict[str, Any]) -> None:
    data, _ = normalize_state_store(data)
    site_store_set("state", data)

def log_event(event: str, **payload: Any) -> None:
    state = load_state()
    state.setdefault("events", [])
    state["events"].append({"event": event, "created_at": now_iso(), **json_safe(payload)})
    state["events"] = state["events"][-500:]
    save_state(state)

__all__ = ['SITE_STATE_LIST_KEYS', 'SITE_STATE_DICT_KEYS', 'site_store_connection', 'site_store_get', 'site_store_set', 'site_sessions_all', 'site_session_get', 'site_session_upsert', 'site_session_delete', 'site_sessions_delete', 'default_state', 'normalize_state_store', 'load_state', 'save_state', 'log_event']
