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

from .errors import ApiError
from .media_service import file_info
from .serialization import now_iso
from .settings import *

def first_existing(paths: list[Path]) -> Path | None:
    for path in paths:
        if path.exists() and path.is_file() and path.stat().st_size > 0:
            return path
    return None

def find_packaged_db() -> Path | None:
    candidates: list[Path] = []
    for folder in (DATA_DIR, LEGACY_DATA_DIR, WEB_ROOT):
        if folder.exists():
            candidates.extend(sorted(folder.glob("*.sqlite")))
            candidates.extend(sorted(folder.glob("*.sqlite3")))
            candidates.extend(sorted(folder.glob("*.db")))
    for path in candidates:
        if path.name not in {AUTH_FILE.name, CONTENT_FILE.name, STATE_FILE.name} and path.resolve() != COPY_DB_PATH.resolve():
            return path
    return None

def backup_sqlite(source: Path, target: Path) -> None:
    """Copy a SQLite database with SQLite's backup API so WAL data is included safely."""
    source = source.resolve()
    target = target.resolve()
    if source == target:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".tmp")
    try:
        tmp.unlink()
    except FileNotFoundError:
        pass
    src_uri = f"file:{source.as_posix()}?mode=ro"
    with sqlite3.connect(src_uri, uri=True, timeout=30) as src, sqlite3.connect(str(tmp), timeout=30) as dst:
        src.backup(dst)
    tmp.replace(target)

def sqlite_scalar(path: Path, sql: str, params: tuple[Any, ...] = ()) -> Any:
    uri = f"file:{path.resolve().as_posix()}?mode=ro"
    with sqlite3.connect(uri, uri=True, timeout=10) as con:
        return con.execute(sql, params).fetchone()[0]

def sqlite_sync_fingerprint(path: Path) -> tuple:
    """Small content signature so a newer file time cannot hide older Требник data."""
    tables = (
        "clients",
        "requests",
        "works",
        "work_logs",
        "updates",
        "payments",
        "client_services",
        "service_payments",
        "service_more_time_requests",
    )
    signature: list[tuple[str, Any, Any, Any]] = []
    for table in tables:
        try:
            exists = sqlite_scalar(path, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", (table,))
            if not exists:
                signature.append((table, None, None, None))
                continue
            count = sqlite_scalar(path, f"SELECT COUNT(*) FROM {table}")
            max_id = sqlite_scalar(path, f"SELECT MAX(id) FROM {table}")
            max_created = sqlite_scalar(path, f"SELECT MAX(created_at) FROM {table}")
            signature.append((table, count, max_id, max_created))
        except Exception:
            signature.append((table, "error", None, None))
    return tuple(signature)

def ensure_db_copy(force: bool = False) -> dict[str, Any]:
    global resolved_copy_db_path, resolved_source_db_path, last_sync_info
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    source = first_existing(SOURCE_DB_CANDIDATES)
    packaged = find_packaged_db()
    checked_at = now_iso()

    resolved_source_db_path = source.resolve() if source else None

    if force:
        if not source:
            raise ApiError(404, "Живая база для синхронизации не найдена рядом с проектом.")
        backup_sqlite(source, COPY_DB_PATH)
        resolved_copy_db_path = COPY_DB_PATH.resolve()
        last_sync_info = {
            "status": "backed_up_from_project",
            "reason": "forced_sqlite_backup",
            "checked_at": checked_at,
            "source_db": file_info(source),
            "copy_db": file_info(COPY_DB_PATH),
        }
        return last_sync_info

    if not COPY_DB_PATH.exists():
        if source:
            backup_sqlite(source, COPY_DB_PATH)
            resolved_copy_db_path = COPY_DB_PATH.resolve()
            last_sync_info = {
                "status": "backed_up_from_project",
                "reason": "canonical_copy_missing",
                "checked_at": checked_at,
                "source_db": file_info(source),
                "copy_db": file_info(COPY_DB_PATH),
            }
            return last_sync_info
        if packaged:
            backup_sqlite(packaged, COPY_DB_PATH)
            resolved_copy_db_path = COPY_DB_PATH.resolve()
            last_sync_info = {
                "status": "backed_up_from_package",
                "reason": "canonical_copy_missing",
                "checked_at": checked_at,
                "source_db": file_info(source) if source else None,
                "copy_db": file_info(COPY_DB_PATH),
            }
            return last_sync_info

    if COPY_DB_PATH.exists():
        resolved_copy_db_path = COPY_DB_PATH.resolve()
        reason = "ready"
        source_has_newer_file = source and source.exists() and source.stat().st_mtime_ns > COPY_DB_PATH.stat().st_mtime_ns
        source_has_newer_content = False
        if source and source.exists():
            try:
                source_has_newer_content = sqlite_sync_fingerprint(source) != sqlite_sync_fingerprint(COPY_DB_PATH)
            except Exception:
                source_has_newer_content = False
        if source and source.exists() and (source_has_newer_file or source_has_newer_content):
            backup_sqlite(source, COPY_DB_PATH)
            reason = "source_content_auto_sync" if source_has_newer_content else "source_newer_auto_sync"
        last_sync_info = {
            "status": "using_copy",
            "reason": reason,
            "checked_at": checked_at,
            "source_db": file_info(source) if source else None,
            "copy_db": file_info(COPY_DB_PATH),
        }
        return last_sync_info

    raise ApiError(500, "Копия базы не найдена. Положите SQLite-файл в папку data и назовите его trebnik_web.sqlite.")

def db() -> sqlite3.Connection:
    path = resolved_copy_db_path
    if not path or not path.exists():
        raise ApiError(
            503,
            "Диагностический снимок базы не подготовлен. Интерфейс Требника работает только через живую службу.",
            {"code": "snapshot_unavailable", "source": "snapshot"},
        )
    uri = f"file:{path.resolve().as_posix()}?mode=ro"
    con = sqlite3.connect(uri, timeout=30, uri=True)
    con.row_factory = sqlite3.Row
    return con

def all_rows(sql: str, params: tuple[Any, ...] = (), con: sqlite3.Connection | None = None) -> list[dict[str, Any]]:
    if con is not None:
        return [dict(row) for row in con.execute(sql, params).fetchall()]
    with db() as local_con:
        return [dict(row) for row in local_con.execute(sql, params).fetchall()]

def one_row(sql: str, params: tuple[Any, ...] = (), con: sqlite3.Connection | None = None) -> dict[str, Any] | None:
    if con is not None:
        row = con.execute(sql, params).fetchone()
        return dict(row) if row else None
    with db() as local_con:
        row = local_con.execute(sql, params).fetchone()
    return dict(row) if row else None

__all__ = ['first_existing', 'find_packaged_db', 'backup_sqlite', 'sqlite_scalar', 'sqlite_sync_fingerprint', 'ensure_db_copy', 'db', 'all_rows', 'one_row']
