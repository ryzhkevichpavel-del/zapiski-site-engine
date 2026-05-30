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
from .site_store import site_store_connection
from .traffic import moscow_day_key, moscow_now, request_ip

MESSAGE_CHANNELS = {"owner", "support"}
MESSAGE_CHANNEL_LABELS = {"owner": "Владелец", "support": "Поддержка"}
COMMUNITY_ATTACHMENT_ARCHIVE_EXTENSIONS = {".zip", ".rar", ".7z"}
COMMUNITY_ATTACHMENT_DOCUMENT_EXTENSIONS = COMMUNITY_ATTACHMENT_ALLOWED_EXTENSIONS - COMMUNITY_ATTACHMENT_IMAGE_EXTENSIONS - COMMUNITY_ATTACHMENT_ARCHIVE_EXTENSIONS

def clean_text(value: Any, limit: int | None = None) -> str:
    text = str(value or "").strip()
    return text[:limit] if limit else text

def normalize_message_channel(value: Any) -> str:
    channel = str(value or "owner").strip().lower()
    return channel if channel in MESSAGE_CHANNELS else "owner"

def community_attachment_safe_name(value: Any) -> str:
    name = Path(str(value or "file")).name.strip().replace("\x00", "")
    name = re.sub(r"[\r\n\t]+", " ", name)
    name = re.sub(r"\s+", " ", name).strip(" .")
    if not name:
        name = "file"
    stem = Path(name).stem.strip(" .")[:90] or "file"
    suffix = Path(name).suffix.lower()[:12]
    return f"{stem}{suffix}"[:120]

def community_attachment_kind(extension: str) -> str:
    ext = str(extension or "").lower()
    if ext in COMMUNITY_ATTACHMENT_IMAGE_EXTENSIONS:
        return "image"
    if ext in COMMUNITY_ATTACHMENT_ARCHIVE_EXTENSIONS:
        return "archive"
    if ext in COMMUNITY_ATTACHMENT_DOCUMENT_EXTENSIONS:
        return "document"
    return "file"

def community_attachment_content_type(name: str, header_value: Any = None) -> str:
    guessed = mimetypes.guess_type(name)[0]
    clean_header = str(header_value or "").split(";", 1)[0].strip().lower()
    if guessed:
        return guessed
    if clean_header and "/" in clean_header:
        return clean_header
    return "application/octet-stream"

def validate_community_attachment(raw: bytes, original_name: str) -> tuple[str, str, str, int | None, int | None]:
    if not raw:
        raise ApiError(400, "Файл пустой.")
    if len(raw) > COMMUNITY_ATTACHMENT_LIMIT_BYTES:
        raise ApiError(400, f"Файл слишком большой. Выберите файл до {COMMUNITY_ATTACHMENT_LIMIT_LABEL}.")
    suffix = Path(original_name).suffix.lower()
    if not suffix:
        raise ApiError(400, "У файла должно быть расширение.")
    if suffix in COMMUNITY_ATTACHMENT_BLOCKED_EXTENSIONS or suffix not in COMMUNITY_ATTACHMENT_ALLOWED_EXTENSIONS:
        raise ApiError(400, "Этот тип файла нельзя прикрепить.")
    if suffix == ".png" and not raw.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ApiError(400, "Файл не похож на PNG.")
    if suffix in {".jpg", ".jpeg"} and not raw.startswith(b"\xff\xd8\xff"):
        raise ApiError(400, "Файл не похож на JPG.")
    if suffix == ".webp" and not (raw.startswith(b"RIFF") and raw[8:12] == b"WEBP"):
        raise ApiError(400, "Файл не похож на WEBP.")
    if suffix == ".gif" and not (raw.startswith(b"GIF87a") or raw.startswith(b"GIF89a")):
        raise ApiError(400, "Файл не похож на GIF.")
    if suffix == ".pdf" and not raw.startswith(b"%PDF"):
        raise ApiError(400, "Файл не похож на PDF.")
    if suffix in {".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp"} and not raw.startswith(b"PK"):
        raise ApiError(400, "Файл не похож на документ.")
    width = height = None
    if suffix in COMMUNITY_ATTACHMENT_IMAGE_EXTENSIONS and Image is not None:
        try:
            with Image.open(io.BytesIO(raw)) as image:
                width, height = image.size
        except Exception as exc:
            raise ApiError(400, "Не удалось прочитать изображение.") from exc
    content_type = community_attachment_content_type(original_name)
    return suffix, community_attachment_kind(suffix), content_type, width, height

def parse_community_attachment_upload(raw: bytes, content_type: str) -> tuple[str, bytes, str]:
    if not raw:
        raise ApiError(400, "Нужно выбрать файл.")
    if "multipart/form-data" not in str(content_type or "").lower():
        raise ApiError(400, "Файл нужно отправлять как вложение.")
    try:
        message = BytesParser(policy=email_policy).parsebytes(
            b"Content-Type: "
            + str(content_type or "").encode("utf-8", "replace")
            + b"\r\nMIME-Version: 1.0\r\n\r\n"
            + raw
        )
    except Exception as exc:
        raise ApiError(400, "Не удалось прочитать выбранный файл.") from exc
    if not message.is_multipart():
        raise ApiError(400, "Файл нужно отправлять как вложение.")
    for part in message.iter_parts():
        disposition = part.get("Content-Disposition", "")
        if "form-data" not in disposition:
            continue
        if part.get_param("name", header="content-disposition") != "file":
            continue
        file_raw = part.get_payload(decode=True) or b""
        original_name = community_attachment_safe_name(part.get_filename() or "file")
        return original_name, file_raw, part.get_content_type()
    raise ApiError(400, "Нужно выбрать файл.")

def community_attachment_storage_path(stored_name: Any) -> Path:
    clean = str(stored_name or "").strip().replace("\\", "/")
    if not clean or clean.startswith("/") or ".." in clean.split("/"):
        raise ApiError(404, "Вложение не найдено.")
    path = (COMMUNITY_ATTACHMENTS_DIR / clean).resolve()
    try:
        path.relative_to(COMMUNITY_ATTACHMENTS_DIR.resolve())
    except ValueError as exc:
        raise ApiError(404, "Вложение не найдено.") from exc
    return path

def community_attachment_payload(row: dict[str, Any] | sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    return {
        "id": item.get("id"),
        "name": item.get("original_name") or "file",
        "content_type": item.get("content_type") or "application/octet-stream",
        "kind": item.get("kind") or "file",
        "size_bytes": int(item.get("size_bytes") or 0),
        "width": item.get("width"),
        "height": item.get("height"),
        "url": f"/api/community/messages/attachments/{int(item.get('id') or 0)}",
    }

def normalize_nickname(value: Any, fallback: str = "user") -> str:
    raw = str(value or "").strip().lower().replace("ё", "е")
    nick = re.sub(r"[^0-9a-zа-я_-]+", "-", raw, flags=re.IGNORECASE)
    nick = re.sub(r"-+", "-", nick).strip("-_")[:32]
    if len(nick) < 3:
        nick = make_slug(fallback, "user")[:32]
    if len(nick) < 3:
        nick = f"user-{secrets.token_hex(3)}"
    return nick

def unique_nickname(con: sqlite3.Connection, desired: str) -> str:
    base = normalize_nickname(desired, "user")
    candidate = base
    index = 2
    while con.execute("SELECT 1 FROM public_users WHERE nickname = ?", (candidate,)).fetchone():
        suffix = f"-{index}"
        candidate = f"{base[: max(3, 32 - len(suffix))]}{suffix}"
        index += 1
    return candidate

def public_user_row(user_id: int, con: sqlite3.Connection | None = None) -> dict[str, Any] | None:
    def fetch(local_con: sqlite3.Connection) -> dict[str, Any] | None:
        row = local_con.execute("SELECT * FROM public_users WHERE id = ?", (int(user_id),)).fetchone()
        return dict(row) if row else None

    if con is not None:
        return fetch(con)
    with community_connection() as local_con:
        return fetch(local_con)

def public_user_by_trebnik_client_id(client_id: int, con: sqlite3.Connection | None = None) -> dict[str, Any] | None:
    def fetch(local_con: sqlite3.Connection) -> dict[str, Any] | None:
        row = local_con.execute("SELECT * FROM public_users WHERE trebnik_client_id = ?", (int(client_id),)).fetchone()
        return admin_public_user_payload(row) if row else None

    if con is not None:
        return fetch(con)
    with community_connection() as local_con:
        return fetch(local_con)

def public_community_user(row: dict[str, Any] | sqlite3.Row | None, viewer: dict[str, Any] | None = None) -> dict[str, Any] | None:
    if not row:
        return None
    item = dict(row)
    viewer_is_owner = bool(viewer and int(viewer.get("user_id") or 0) == int(item.get("id") or 0))
    online_visible = bool(item.get("show_online_status")) or viewer_is_owner
    profile_url = f"/u/{quote(str(item.get('nickname') or ''))}"
    if not viewer and not bool(item.get("profile_guest_visible", 1)):
        profile_url = ""
    last_seen = parse_iso_datetime(item.get("last_seen"))
    online = bool(last_seen and (datetime.now() - last_seen).total_seconds() <= PUBLIC_ONLINE_WINDOW_SECONDS)
    return {
        "id": item.get("id"),
        "nickname": item.get("nickname"),
        "display_name": item.get("display_name") or item.get("nickname"),
        "avatar_url": item.get("avatar_url") or "",
        "avatar_updated_at": item.get("avatar_updated_at"),
        "trusted": bool(item.get("trusted")),
        "blocked": bool(item.get("blocked")),
        "deleted": bool(item.get("deleted_at")),
        "must_change_avatar": bool(item.get("must_change_avatar")) if viewer and int(viewer.get("user_id") or 0) == int(item.get("id") or 0) else None,
        "must_change_nickname": bool(item.get("must_change_nickname")) if viewer and int(viewer.get("user_id") or 0) == int(item.get("id") or 0) else None,
        "site_admin": bool(item.get("site_admin")) if viewer and is_admin_session(viewer) else None,
        "created_at": item.get("created_at"),
        "profile_url": profile_url,
        "online": online if online_visible else None,
    }

def public_profile_privacy_payload(row: dict[str, Any] | sqlite3.Row | None) -> dict[str, bool]:
    item = dict(row or {})
    return {
        "profile_guest_visible": bool(item.get("profile_guest_visible", 1)),
        "show_online_status": bool(item.get("show_online_status", 0)),
        "show_public_activity": bool(item.get("show_public_activity", 1)),
    }

def public_account_payload(row: dict[str, Any] | sqlite3.Row | None) -> dict[str, Any]:
    item = dict(row or {})
    return {
        "email": item.get("email") or "",
        "has_password": public_user_has_password(item),
        "password_set_at": item.get("password_set_at"),
        "notification_email_enabled": bool(item.get("notification_email_enabled", 1)),
    }

def normalize_public_access_value(kind: str, value: Any) -> str:
    kind = clean_text(kind, 20).lower()
    text = str(value or "").strip().lower()
    if kind == "email":
        return text[:180]
    if kind == "ip":
        return text.split(",", 1)[0].strip()[:64]
    return ""

def public_access_block_reason(email: Any = "", ip: Any = "") -> str:
    checks = [
        ("email", normalize_public_access_value("email", email)),
        ("ip", normalize_public_access_value("ip", ip)),
    ]
    checks = [(kind, value) for kind, value in checks if value]
    if not checks:
        return ""
    with community_connection() as con:
        for kind, value in checks:
            row = con.execute(
                """
                SELECT reason FROM public_access_blocks
                WHERE kind = ? AND value = ? AND active = 1
                LIMIT 1
                """,
                (kind, value),
            ).fetchone()
            if row:
                return clean_text(row["reason"] or "", 180) or "Доступ к действиям на сайте ограничен."
    return ""

def ensure_public_access_allowed(headers: Any, email: Any = "") -> None:
    reason = public_access_block_reason(email, request_ip(headers))
    if reason:
        raise ApiError(403, reason)

def require_public_user(headers: Any) -> dict[str, Any]:
    item = require_session(headers)
    if item.get("role") != "user":
        raise ApiError(403, "Нужен вход пользователя сайта.")
    user_id = int(item.get("user_id") or 0)
    with community_connection() as con:
        row = public_user_row(user_id, con=con)
        if not row or row.get("blocked") or row.get("deleted_at"):
            raise ApiError(403, "Этот профиль заблокирован.")
        ensure_public_access_allowed(headers, row.get("email") or "")
        return dict(row)

def require_comment_user(headers: Any) -> dict[str, Any]:
    item = require_session(headers)
    if item.get("role") == "user":
        return require_public_user(headers)
    if not is_admin_session(item):
        raise ApiError(403, "Нужен вход пользователя сайта.")
    with community_connection() as con:
        row = con.execute(
            """
            SELECT * FROM public_users
            WHERE site_admin = 1 AND blocked = 0
            ORDER BY id ASC
            LIMIT 1
            """
        ).fetchone()
        if not row:
            raise ApiError(403, "Для комментариев нужен публичный профиль администратора.")
        return dict(row)

def comment_viewer(headers: Any, con: sqlite3.Connection | None = None) -> dict[str, Any] | None:
    item = session(headers)
    if not item:
        return None
    if item.get("role") == "user":
        return item
    if not is_admin_session(item):
        return item
    def fetch(local_con: sqlite3.Connection) -> dict[str, Any] | None:
        row = local_con.execute(
            """
            SELECT * FROM public_users
            WHERE site_admin = 1 AND blocked = 0
            ORDER BY id ASC
            LIMIT 1
            """
        ).fetchone()
        if not row:
            return item
        return {"role": "user", "user_id": row["id"], "site_admin": True}
    if con is not None:
        return fetch(con)
    with community_connection() as local_con:
        return fetch(local_con)

def community_log(event: str, user_id: int | None = None, **payload: Any) -> None:
    with community_connection() as con:
        con.execute(
            "INSERT INTO community_events(event, user_id, payload, created_at) VALUES (?, ?, ?, ?)",
            (event, user_id, json.dumps(json_safe(payload), ensure_ascii=False), now_iso()),
        )

def touch_public_user(user_id: int, ip: str = "") -> None:
    if not user_id:
        return
    try:
        with community_connection() as con:
            if ip:
                con.execute("UPDATE public_users SET last_seen = ?, last_ip = ?, updated_at = ? WHERE id = ?", (now_iso(), ip[:64], now_iso(), int(user_id)))
            else:
                con.execute("UPDATE public_users SET last_seen = ?, updated_at = ? WHERE id = ?", (now_iso(), now_iso(), int(user_id)))
    except Exception:
        pass

def comment_restriction_message(user: dict[str, Any] | sqlite3.Row | None) -> str:
    item = dict(user or {})
    if item.get("site_admin"):
        return ""
    reason = clean_text(item.get("comments_locked_reason") or "", 180)
    if item.get("comments_locked_permanent"):
        return reason or "Комментарии для этого профиля ограничены."
    until = parse_iso_datetime(item.get("comments_locked_until"))
    if until and until > datetime.now():
        return reason or f"Комментарии ограничены до {until.date().isoformat()}."
    return ""

def public_comment_payload(row: dict[str, Any] | sqlite3.Row, viewer: dict[str, Any] | None = None, con: sqlite3.Connection | None = None) -> dict[str, Any]:
    item = dict(row)
    local_con = con
    close = False
    if local_con is None:
        local_con = community_connection()
        close = True
    try:
        user = public_user_row(int(item.get("user_id") or 0), con=local_con)
        like_count = local_con.execute("SELECT COUNT(*) count FROM comment_likes WHERE comment_id = ?", (item["id"],)).fetchone()["count"]
        liked_by_me = False
        if viewer and viewer.get("role") == "user":
            liked_by_me = bool(local_con.execute("SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?", (item["id"], int(viewer.get("user_id") or 0))).fetchone())
        return {
            "id": item.get("id"),
            "target_route": item.get("target_route"),
            "target_slug": item.get("target_slug"),
            "parent_id": item.get("parent_id"),
            "body": item.get("body"),
            "status": item.get("status"),
            "created_at": item.get("created_at"),
            "updated_at": item.get("updated_at"),
            "author": public_community_user(user, viewer),
            "like_count": like_count,
            "liked_by_me": liked_by_me,
            "replies": [],
        }
    finally:
        if close:
            local_con.close()

def ensure_material_target(route: str, slug: str, allowed_routes: set[str] | None = None) -> None:
    route = str(route or "").strip()
    slug = str(slug or "").strip()
    allowed = allowed_routes or {"works", "articles"}
    if route not in allowed:
        raise ApiError(400, "Для этого раздела действие не доступно.")
    if not find_public_item(public_content(), route, slug):
        raise ApiError(404, "Материал не найден или скрыт.")

def ensure_discussion_target(con: sqlite3.Connection, route: str, slug: str) -> None:
    route = str(route or "").strip()
    slug = str(slug or "").strip()
    if route == "questions":
        try:
            question_id = int(slug)
        except (TypeError, ValueError):
            raise ApiError(404, "Вопрос не найден.")
        row = con.execute(
            "SELECT id FROM public_questions WHERE id = ? AND status = 'published'",
            (question_id,),
        ).fetchone()
        if not row:
            raise ApiError(404, "Вопрос не найден или ещё не опубликован.")
        return
    ensure_material_target(route, slug, {"works", "articles"})

PUBLICATION_LIKE_ROUTES = {"works", "articles", "questions", "cards"}

def ensure_publication_like_target(con: sqlite3.Connection, route: str, slug: str) -> tuple[str, str]:
    route = clean_text(route, 30)
    slug = clean_text(slug, 120)
    if route not in PUBLICATION_LIKE_ROUTES or not slug:
        raise ApiError(400, "Для этого раздела лайки не включены.")
    if route == "questions":
        try:
            question_id = int(slug)
        except (TypeError, ValueError):
            raise ApiError(404, "Вопрос не найден.")
        row = con.execute(
            "SELECT id FROM public_questions WHERE id = ? AND status = 'published'",
            (question_id,),
        ).fetchone()
        if not row:
            raise ApiError(404, "Вопрос не найден или ещё не опубликован.")
        return route, str(question_id)
    if not find_public_item(load_content(), route, slug):
        raise ApiError(404, "Материал не найден или скрыт.")
    return route, slug

def create_community_notification(
    con: sqlite3.Connection,
    user_id: int,
    kind: str,
    title: str,
    body: str = "",
    url: str = "",
    *,
    actor_user_id: int | None = None,
    target_type: str = "",
    target_route: str = "",
    target_slug: str = "",
    target_id: int | None = None,
    aggregate_key: str = "",
    count: int = 1,
    email_important: bool = False,
    email_subscription: dict[str, Any] | sqlite3.Row | None = None,
) -> int | None:
    if actor_user_id and int(actor_user_id) == int(user_id):
        return None
    recipient = con.execute("SELECT * FROM public_users WHERE id = ? AND blocked = 0", (int(user_id),)).fetchone()
    if not recipient:
        return None
    now = now_iso()
    existing = None
    if aggregate_key:
        existing = con.execute(
            "SELECT * FROM community_notifications WHERE user_id = ? AND aggregate_key = ? LIMIT 1",
            (int(user_id), aggregate_key),
        ).fetchone()
    if existing:
        notification_id = int(existing["id"])
        con.execute(
            """
            UPDATE community_notifications
            SET actor_user_id = ?, kind = ?, target_type = ?, target_route = ?, target_slug = ?, target_id = ?,
                title = ?, body = ?, url = ?, count = ?, read_at = NULL, updated_at = ?
            WHERE id = ?
            """,
            (actor_user_id, kind, target_type, target_route, target_slug, target_id, title, body, url, int(count or 1), now, notification_id),
        )
    else:
        cur = con.execute(
            """
            INSERT INTO community_notifications(user_id, actor_user_id, kind, target_type, target_route, target_slug, target_id, aggregate_key, title, body, url, count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (int(user_id), actor_user_id, kind, target_type, target_route, target_slug, target_id, aggregate_key or None, title, body, url, int(count or 1), now, now),
        )
        notification_id = int(cur.lastrowid)
    if email_important:
        send_notification_email(con, notification_id, recipient, title, body, url, email_subscription)
    return notification_id

def subscription_token() -> str:
    return secrets.token_urlsafe(28)

def subscription_title(target_type: str, route: str, slug: str) -> str:
    content = load_content()
    if target_type == "section":
        return section_display_name(content, route)
    return public_profile_target_title(content, route, slug)

def subscription_url(target_type: str, route: str, slug: str) -> str:
    if route == "questions" and slug:
        return route_path("questions", str(slug))
    return route_path(route, "" if target_type == "section" else slug)

def subscription_payload(row: dict[str, Any] | sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    target_type = item.get("target_type") or ""
    route = item.get("target_route") or ""
    slug = item.get("target_slug") or ""
    return {
        "id": item.get("id"),
        "target_type": target_type,
        "target_route": route,
        "target_slug": slug,
        "active": bool(item.get("active")),
        "email_enabled": bool(item.get("email_enabled")),
        "title": subscription_title(target_type, route, slug),
        "url": subscription_url(target_type, route, slug),
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
    }

def normalize_subscription_target(data: dict[str, Any]) -> tuple[str, str, str]:
    target_type = clean_text(data.get("target_type"), 30)
    route = clean_text(data.get("target_route"), 40)
    slug = clean_text(data.get("target_slug"), 120)
    if target_type == "section":
        if route not in PUBLIC_SECTION_ROUTES:
            raise ApiError(400, "Раздел не найден.")
        return target_type, route, ""
    if target_type == "material":
        ensure_material_target(route, slug, set(PUBLIC_SECTION_ROUTES))
        return target_type, route, slug
    if target_type == "discussion":
        with community_connection() as con:
            ensure_discussion_target(con, route, slug)
        return target_type, route, slug
    raise ApiError(400, "Подписка не найдена.")

def ensure_subscription(con: sqlite3.Connection, user_id: int, target_type: str, route: str, slug: str = "", *, email_enabled: bool = True, reactivate: bool = True) -> sqlite3.Row | None:
    existing = con.execute(
        "SELECT * FROM community_subscriptions WHERE user_id = ? AND target_type = ? AND target_route = ? AND target_slug = ?",
        (int(user_id), target_type, route, slug),
    ).fetchone()
    if existing:
        if existing["active"] or reactivate:
            con.execute(
                "UPDATE community_subscriptions SET active = 1, email_enabled = ?, updated_at = ? WHERE id = ?",
                (1 if email_enabled else 0, now_iso(), existing["id"]),
            )
            return con.execute("SELECT * FROM community_subscriptions WHERE id = ?", (existing["id"],)).fetchone()
        return existing
    con.execute(
        """
        INSERT INTO community_subscriptions(user_id, target_type, target_route, target_slug, active, email_enabled, unsubscribe_token, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
        """,
        (int(user_id), target_type, route, slug, 1 if email_enabled else 0, subscription_token(), now_iso(), now_iso()),
    )
    return con.execute(
        "SELECT * FROM community_subscriptions WHERE user_id = ? AND target_type = ? AND target_route = ? AND target_slug = ?",
        (int(user_id), target_type, route, slug),
    ).fetchone()

def subscription_rows_for_targets(con: sqlite3.Connection, targets: list[tuple[str, str, str]], exclude_user_ids: set[int] | None = None) -> list[sqlite3.Row]:
    exclude_user_ids = exclude_user_ids or set()
    rows_by_user: dict[int, sqlite3.Row] = {}
    for target_type, route, slug in targets:
        rows = con.execute(
            """
            SELECT s.*, u.blocked FROM community_subscriptions s
            JOIN public_users u ON u.id = s.user_id
            WHERE s.target_type = ? AND s.target_route = ? AND s.target_slug = ? AND s.active = 1 AND u.blocked = 0
            ORDER BY s.updated_at DESC, s.id DESC
            """,
            (target_type, route, slug),
        ).fetchall()
        for row in rows:
            uid = int(row["user_id"])
            if uid not in exclude_user_ids and uid not in rows_by_user:
                rows_by_user[uid] = row
    return list(rows_by_user.values())

def community_subscriptions(headers: Any) -> dict[str, Any]:
    user = require_public_user(headers)
    with community_connection() as con:
        rows = con.execute(
            "SELECT * FROM community_subscriptions WHERE user_id = ? AND active = 1 ORDER BY updated_at DESC, id DESC",
            (int(user["id"]),),
        ).fetchall()
    return {"ok": True, "items": [subscription_payload(row) for row in rows]}

def set_community_subscription(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_public_user(headers)
    target_type, route, slug = normalize_subscription_target(data)
    active = bool_or_default(data.get("active"), True)
    email_enabled = bool_or_default(data.get("email_enabled"), True)
    with community_connection() as con:
        if active:
            row = ensure_subscription(con, int(user["id"]), target_type, route, slug, email_enabled=email_enabled, reactivate=True)
        else:
            row = con.execute(
                "SELECT * FROM community_subscriptions WHERE user_id = ? AND target_type = ? AND target_route = ? AND target_slug = ?",
                (int(user["id"]), target_type, route, slug),
            ).fetchone()
            if row:
                con.execute("UPDATE community_subscriptions SET active = 0, updated_at = ? WHERE id = ?", (now_iso(), row["id"]))
                row = con.execute("SELECT * FROM community_subscriptions WHERE id = ?", (row["id"],)).fetchone()
        rows = con.execute(
            "SELECT * FROM community_subscriptions WHERE user_id = ? AND active = 1 ORDER BY updated_at DESC, id DESC",
            (int(user["id"]),),
        ).fetchall()
    return {"ok": True, "subscription": subscription_payload(row) if row else None, "items": [subscription_payload(item) for item in rows]}

def unsubscribe_community_email(token: str) -> dict[str, Any]:
    token = str(token or "").strip()
    if not token:
        raise ApiError(400, "Ссылка отписки повреждена.")
    with community_connection() as con:
        row = con.execute("SELECT * FROM community_subscriptions WHERE unsubscribe_token = ?", (token,)).fetchone()
        if not row:
            raise ApiError(404, "Подписка не найдена.")
        con.execute("UPDATE community_subscriptions SET email_enabled = 0, updated_at = ? WHERE id = ?", (now_iso(), row["id"]))
        fresh = con.execute("SELECT * FROM community_subscriptions WHERE id = ?", (row["id"],)).fetchone()
    return {"ok": True, "message": "Письма по этой подписке отключены.", "subscription": subscription_payload(fresh)}

def notification_target_url(item: dict[str, Any]) -> str:
    if item.get("target_available") is False:
        return ""
    target_type = str(item.get("target_type") or "").strip()
    target_route = str(item.get("target_route") or "").strip()
    target_slug = str(item.get("target_slug") or "").strip()
    target_id = item.get("target_id")
    if target_route == "questions" and (target_id or target_slug):
        return route_path("questions", str(target_id or target_slug))
    if target_type == "material" and target_route:
        return route_path(target_route, target_slug)
    return str(item.get("url") or "").strip()

def notification_target_available(item: dict[str, Any]) -> bool:
    kind = str(item.get("kind") or "").strip()
    target_type = str(item.get("target_type") or "").strip()
    question_status = str(item.get("target_question_status") or "").strip()
    comment_status = str(item.get("target_comment_status") or "").strip()
    if target_type == "question" or question_status:
        if kind == "question_moderation":
            return question_status in {"pending", "published"}
        return question_status == "published"
    if target_type == "comment" or comment_status:
        if kind == "comment_moderation":
            return comment_status in {"pending", "published"}
        return comment_status == "published"
    return True

def notification_target_title(item: dict[str, Any], content: dict[str, Any]) -> str:
    target_type = str(item.get("target_type") or "").strip()
    target_route = str(item.get("target_route") or "").strip()
    target_slug = str(item.get("target_slug") or "").strip()
    target_id = item.get("target_id")
    if target_route == "questions" and (target_id or target_slug):
        return public_profile_target_title(content, "questions", str(target_id or target_slug))
    if target_type == "material" and target_route:
        item = find_public_item(content, target_route, target_slug)
        if item:
            return public_text(item.get("title") or target_slug)
    return ""

def notification_payload(row: dict[str, Any] | sqlite3.Row, content: dict[str, Any] | None = None) -> dict[str, Any]:
    item = dict(row)
    content = content or load_content()
    actor_nickname = str(item.get("actor_nickname") or "").strip()
    actor_display_name = str(item.get("actor_display_name") or actor_nickname).strip()
    actor = None
    if actor_nickname or actor_display_name:
        actor = {
            "id": item.get("actor_user_id"),
            "nickname": actor_nickname,
            "display_name": actor_display_name or actor_nickname,
            "profile_url": f"/u/{quote(actor_nickname)}" if actor_nickname else "",
        }
    target_title = notification_target_title(item, content)
    title = str(item.get("title") or "")
    if item.get("kind") == "section_material" and target_title:
        title = f"Новый материал: {target_title}"
    if item.get("kind") == "comment_like" and actor_display_name:
        count = int(item.get("count") or 1)
        extra_count = max(0, count - 1)
        title = f"{actor_display_name} оставил(а) лайк вашему комментарию" if not extra_count else f"{actor_display_name} и ещё {extra_count} оставили лайк вашему комментарию"
    target_available = notification_target_available(item)
    return {
        "id": item.get("id"),
        "kind": item.get("kind"),
        "target_type": item.get("target_type") or "",
        "target_route": item.get("target_route") or "",
        "target_slug": item.get("target_slug") or "",
        "target_id": item.get("target_id"),
        "target_title": target_title,
        "target_available": target_available,
        "title": title,
        "body": item.get("body") or "",
        "url": notification_target_url({**item, "target_available": target_available}),
        "count": int(item.get("count") or 1),
        "read_at": item.get("read_at"),
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
        "event_at": item.get("event_at") or item.get("updated_at") or item.get("created_at"),
        "email_sent_at": item.get("email_sent_at"),
        "actor": actor,
    }

def community_notifications(headers: Any) -> dict[str, Any]:
    user = require_public_user(headers)
    with community_connection() as con:
        rows = con.execute(
            """
            SELECT n.*, u.nickname actor_nickname, u.display_name actor_display_name,
                q.status target_question_status,
                c.status target_comment_status
                , CASE
                    WHEN n.kind = 'question_moderation' THEN q.created_at
                    WHEN n.kind = 'question_answer' THEN COALESCE(q.answered_at, n.created_at)
                    WHEN n.kind = 'comment_moderation' THEN c.created_at
                    WHEN n.kind IN ('comment_reply', 'material_comment') THEN c.created_at
                    ELSE n.updated_at
                  END event_at
            FROM community_notifications n
            LEFT JOIN public_users u ON u.id = n.actor_user_id
            LEFT JOIN public_questions q ON n.target_type = 'question' AND q.id = n.target_id
            LEFT JOIN public_comments c ON n.target_type = 'comment' AND c.id = n.target_id
            WHERE n.user_id = ?
            ORDER BY n.read_at IS NOT NULL ASC,
                datetime(COALESCE(
                    CASE
                        WHEN n.kind = 'question_moderation' THEN q.created_at
                        WHEN n.kind = 'question_answer' THEN COALESCE(q.answered_at, n.created_at)
                        WHEN n.kind = 'comment_moderation' THEN c.created_at
                        WHEN n.kind IN ('comment_reply', 'material_comment') THEN c.created_at
                        ELSE n.updated_at
                    END,
                    n.updated_at,
                    n.created_at
                )) DESC,
                n.id DESC
            LIMIT 80
            """,
            (int(user["id"]),),
        ).fetchall()
        unread = con.execute("SELECT COUNT(*) count FROM community_notifications WHERE user_id = ? AND read_at IS NULL", (int(user["id"]),)).fetchone()["count"]
    content = load_content()
    return {"ok": True, "unread_count": int(unread or 0), "items": [notification_payload(row, content) for row in rows]}

def mark_community_notifications_read(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_public_user(headers)
    notification_id = int(data.get("id") or 0)
    with community_connection() as con:
        if data.get("all"):
            con.execute("UPDATE community_notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ? AND read_at IS NULL", (now_iso(), int(user["id"])))
        elif notification_id:
            con.execute("UPDATE community_notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?", (now_iso(), notification_id, int(user["id"])))
        else:
            raise ApiError(400, "Не выбрано уведомление.")
    return community_notifications(headers)

def community_message_author(row: dict[str, Any] | sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    nickname = str(item.get("author_nickname") or "").strip()
    name = str(item.get("author_display_name") or nickname or "Пользователь").strip()
    return {
        "id": item.get("author_user_id"),
        "nickname": nickname,
        "display_name": name,
        "avatar_url": item.get("author_avatar_url") or "",
        "profile_url": f"/u/{quote(nickname)}" if nickname else "",
    }

def community_attachments_map(con: sqlite3.Connection, target_column: str, target_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    if target_column not in {"message_id", "broadcast_id"}:
        return {}
    clean_ids = sorted({int(item) for item in target_ids if int(item or 0) > 0})
    if not clean_ids:
        return {}
    placeholders = ",".join("?" for _ in clean_ids)
    rows = con.execute(
        f"""
        SELECT *
        FROM community_message_attachments
        WHERE {target_column} IN ({placeholders})
          AND deleted_at IS NULL
        ORDER BY id ASC
        """,
        tuple(clean_ids),
    ).fetchall()
    result: dict[int, list[dict[str, Any]]] = {}
    for row in rows:
        key = int(row[target_column] or 0)
        result.setdefault(key, []).append(community_attachment_payload(row))
    return result

def community_message_payload(row: dict[str, Any] | sqlite3.Row, viewer_id: int, attachments: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    item = dict(row)
    author_id = int(item.get("author_user_id") or 0)
    thread_user_id = int(item.get("thread_user_id") or 0)
    own = author_id == int(viewer_id or 0)
    recipient_read_at = item.get("read_by_admin_at") if author_id == thread_user_id else item.get("read_by_user_at")
    return {
        "id": item.get("id"),
        "kind": "message",
        "channel": normalize_message_channel(item.get("channel")),
        "thread_user_id": item.get("thread_user_id"),
        "author_user_id": item.get("author_user_id"),
        "author": community_message_author(item),
        "body": item.get("body") or "",
        "created_at": item.get("created_at"),
        "read_by_user_at": item.get("read_by_user_at"),
        "read_by_admin_at": item.get("read_by_admin_at"),
        "recipient_read_at": recipient_read_at,
        "read": bool(recipient_read_at),
        "own": own,
        "attachments": attachments or [],
    }

def support_contact_payload() -> dict[str, Any]:
    return {
        "id": 0,
        "nickname": "",
        "display_name": "Поддержка",
        "avatar_url": "",
        "profile_url": "",
    }

def community_support_broadcast_payload(row: dict[str, Any] | sqlite3.Row, viewer_id: int, attachments: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    item = dict(row)
    author_id = int(item.get("author_user_id") or 0)
    author_name = str(item.get("author_display_name") or item.get("author_nickname") or "Поддержка").strip()
    read_at = item.get("read_at")
    return {
        "id": f"support-broadcast-{item.get('id')}",
        "kind": "broadcast",
        "broadcast_id": item.get("id"),
        "channel": "support",
        "thread_user_id": item.get("user_id") or viewer_id,
        "author_user_id": author_id,
        "author": {
            "id": author_id,
            "nickname": item.get("author_nickname") or "",
            "display_name": "Поддержка" if viewer_id != author_id else author_name,
            "avatar_url": item.get("author_avatar_url") or "",
            "profile_url": "",
        },
        "body": item.get("body") or "",
        "created_at": item.get("created_at"),
        "read_by_user_at": read_at,
        "read_by_admin_at": item.get("created_at"),
        "recipient_read_at": read_at,
        "read": bool(read_at),
        "own": False,
        "attachments": attachments or [],
    }

def community_support_broadcast_summary_payload(row: dict[str, Any] | sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    return {
        "id": item.get("id"),
        "body": item.get("body") or "",
        "created_at": item.get("created_at"),
        "recipients_count": int(item.get("recipients_count") or 0),
        "unread_count": int(item.get("unread_count") or 0),
        "attachments_count": int(item.get("attachments_count") or 0),
    }

def community_message_thread_payload(row: dict[str, Any] | sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    nickname = str(item.get("nickname") or "").strip()
    return {
        "user_id": item.get("id"),
        "nickname": nickname,
        "display_name": item.get("display_name") or nickname or "Пользователь",
        "avatar_url": item.get("avatar_url") or "",
        "profile_url": f"/u/{quote(nickname)}" if nickname else "",
        "last_body": item.get("last_body") or "",
        "last_at": item.get("last_at"),
        "unread_count": int(item.get("unread_count") or 0),
        "messages_count": int(item.get("messages_count") or 0),
    }

def community_support_broadcast_unread_count(user_id: int, con: sqlite3.Connection) -> int:
    row = con.execute(
        """
        SELECT COUNT(*) count
        FROM community_support_broadcast_recipients
        WHERE user_id = ?
          AND read_at IS NULL
        """,
        (int(user_id),),
    ).fetchone()
    return int(row["count"] or 0) if row else 0

def community_messages_unread_count(user: dict[str, Any], con: sqlite3.Connection, channel: Any = None) -> int:
    user_id = int(user.get("id") or 0)
    selected_channel = normalize_message_channel(channel) if channel else ""
    if bool(user.get("site_admin")):
        params: list[Any] = []
        channel_sql = ""
        if selected_channel:
            channel_sql = "AND m.channel = ?"
            params.append(selected_channel)
        row = con.execute(
            f"""
            SELECT COUNT(*) count
            FROM community_messages m
            JOIN public_users u ON u.id = m.thread_user_id
            WHERE m.author_user_id = m.thread_user_id
              AND m.read_by_admin_at IS NULL
              AND u.deleted_at IS NULL
              AND u.blocked = 0
              {channel_sql}
            """,
            tuple(params),
        ).fetchone()
        return int(row["count"] or 0) if row else 0
    else:
        params = [user_id, user_id]
        channel_sql = ""
        if selected_channel:
            channel_sql = "AND channel = ?"
            params.append(selected_channel)
        row = con.execute(
            f"""
            SELECT COUNT(*) count
            FROM community_messages
            WHERE thread_user_id = ?
              AND author_user_id != ?
              AND read_by_user_at IS NULL
              {channel_sql}
            """,
            tuple(params),
        ).fetchone()
        unread = int(row["count"] or 0) if row else 0
        if not selected_channel or selected_channel == "support":
            unread += community_support_broadcast_unread_count(user_id, con)
        return unread

def community_message_owner_label(con: sqlite3.Connection) -> str:
    row = con.execute(
        """
        SELECT display_name, nickname
        FROM public_users
        WHERE site_admin = 1
          AND blocked = 0
          AND deleted_at IS NULL
        ORDER BY id ASC
        LIMIT 1
        """
    ).fetchone()
    if not row:
        return MESSAGE_CHANNEL_LABELS["owner"]
    return clean_text(row["display_name"] or row["nickname"] or MESSAGE_CHANNEL_LABELS["owner"], 80)

def community_message_channel_summaries(user: dict[str, Any], con: sqlite3.Connection) -> list[dict[str, Any]]:
    labels = dict(MESSAGE_CHANNEL_LABELS)
    labels["owner"] = community_message_owner_label(con)
    return [
        {"id": channel, "label": label, "unread_count": community_messages_unread_count(user, con, channel)}
        for channel, label in labels.items()
    ]

def community_messages_summary(headers: Any) -> dict[str, Any]:
    user = require_public_user(headers)
    with community_connection() as con:
        unread = community_messages_unread_count(user, con)
        channels = community_message_channel_summaries(user, con)
    return {"ok": True, "unread_count": unread, "is_admin": bool(user.get("site_admin")), "channels": channels}

def community_message_threads(con: sqlite3.Connection, channel: Any = "owner") -> list[dict[str, Any]]:
    selected_channel = normalize_message_channel(channel)
    rows = con.execute(
        """
        SELECT u.id, u.nickname, u.display_name, u.avatar_url,
               last_message.body last_body,
               last_message.created_at last_at,
               (SELECT COUNT(*) FROM community_messages all_messages WHERE all_messages.thread_user_id = u.id AND all_messages.channel = ?) messages_count,
               (SELECT COUNT(*) FROM community_messages unread
                WHERE unread.thread_user_id = u.id
                  AND unread.channel = ?
                  AND unread.author_user_id = u.id
                  AND unread.read_by_admin_at IS NULL) unread_count
        FROM public_users u
        JOIN community_messages last_message ON last_message.id = (
            SELECT id FROM community_messages latest
            WHERE latest.thread_user_id = u.id
              AND latest.channel = ?
            ORDER BY latest.id DESC
            LIMIT 1
        )
        WHERE u.deleted_at IS NULL
        ORDER BY unread_count DESC, datetime(last_message.created_at) DESC, last_message.id DESC
        LIMIT 80
        """,
        (selected_channel, selected_channel, selected_channel),
    ).fetchall()
    return [community_message_thread_payload(row) for row in rows]

def community_support_broadcast_rows(con: sqlite3.Connection, user_id: int) -> list[sqlite3.Row]:
    return con.execute(
        """
        SELECT b.*, r.user_id, r.read_at,
               u.nickname author_nickname,
               u.display_name author_display_name,
               u.avatar_url author_avatar_url
        FROM community_support_broadcast_recipients r
        JOIN community_support_broadcasts b ON b.id = r.broadcast_id
        LEFT JOIN public_users u ON u.id = b.author_user_id
        WHERE r.user_id = ?
        ORDER BY b.id ASC
        LIMIT 200
        """,
        (int(user_id),),
    ).fetchall()

def community_support_broadcast_summaries(con: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = con.execute(
        """
        SELECT b.*,
               COUNT(r.user_id) recipients_count,
               SUM(CASE WHEN r.read_at IS NULL THEN 1 ELSE 0 END) unread_count,
               (SELECT COUNT(*) FROM community_message_attachments a WHERE a.broadcast_id = b.id AND a.deleted_at IS NULL) attachments_count
        FROM community_support_broadcasts b
        LEFT JOIN community_support_broadcast_recipients r ON r.broadcast_id = b.id
        GROUP BY b.id
        ORDER BY b.id DESC
        LIMIT 5
        """
    ).fetchall()
    return [community_support_broadcast_summary_payload(row) for row in rows]

def community_messages(thread_user_id: Any, headers: Any, channel: Any = "owner") -> dict[str, Any]:
    user = require_public_user(headers)
    viewer_id = int(user.get("id") or 0)
    is_site_admin = bool(user.get("site_admin"))
    selected_channel = normalize_message_channel(channel)
    selected_id = int(thread_user_id or 0) if str(thread_user_id or "").strip().isdigit() else 0
    with community_connection() as con:
        threads = community_message_threads(con, selected_channel) if is_site_admin else []
        if is_site_admin:
            if not selected_id and threads:
                selected_id = int(threads[0]["user_id"] or 0)
            if selected_id:
                selected = con.execute("SELECT * FROM public_users WHERE id = ? AND deleted_at IS NULL", (selected_id,)).fetchone()
                if not selected:
                    raise ApiError(404, "Переписка не найдена.")
                con.execute(
                    """
                    UPDATE community_messages
                    SET read_by_admin_at = COALESCE(read_by_admin_at, ?)
                    WHERE channel = ?
                      AND thread_user_id = ?
                      AND author_user_id = thread_user_id
                      AND read_by_admin_at IS NULL
                    """,
                    (now_iso(), selected_channel, selected_id),
                )
        else:
            selected_id = viewer_id
            con.execute(
                """
                UPDATE community_messages
                SET read_by_user_at = COALESCE(read_by_user_at, ?)
                WHERE channel = ?
                  AND thread_user_id = ?
                  AND author_user_id != ?
                  AND read_by_user_at IS NULL
                """,
                (now_iso(), selected_channel, viewer_id, viewer_id),
            )
            if selected_channel == "support":
                con.execute(
                    """
                    UPDATE community_support_broadcast_recipients
                    SET read_at = COALESCE(read_at, ?)
                    WHERE user_id = ?
                      AND read_at IS NULL
                    """,
                    (now_iso(), viewer_id),
                )
        selected_user = con.execute("SELECT * FROM public_users WHERE id = ?", (selected_id,)).fetchone() if selected_id else None
        owner_user = None
        if not is_site_admin:
            owner_user = con.execute(
                """
                SELECT * FROM public_users
                WHERE site_admin = 1
                  AND blocked = 0
                  AND deleted_at IS NULL
                ORDER BY id ASC
                LIMIT 1
                """
            ).fetchone()
        rows = con.execute(
            """
            SELECT m.*, u.nickname author_nickname, u.display_name author_display_name, u.avatar_url author_avatar_url
            FROM community_messages m
            JOIN public_users u ON u.id = m.author_user_id
            WHERE m.channel = ?
              AND m.thread_user_id = ?
            ORDER BY m.id ASC
            LIMIT 200
            """,
            (selected_channel, selected_id),
        ).fetchall() if selected_id else []
        attachment_map = community_attachments_map(con, "message_id", [int(row["id"] or 0) for row in rows])
        messages = [community_message_payload(row, viewer_id, attachment_map.get(int(row["id"] or 0), [])) for row in rows]
        if not is_site_admin and selected_channel == "support":
            broadcast_rows = community_support_broadcast_rows(con, viewer_id)
            broadcast_attachment_map = community_attachments_map(con, "broadcast_id", [int(row["id"] or 0) for row in broadcast_rows])
            messages.extend(
                community_support_broadcast_payload(row, viewer_id, broadcast_attachment_map.get(int(row["id"] or 0), []))
                for row in broadcast_rows
            )
            messages.sort(key=lambda item: (str(item.get("created_at") or ""), str(item.get("id") or "")))
        threads = community_message_threads(con, selected_channel) if is_site_admin else []
        unread = community_messages_unread_count(user, con)
        channels = community_message_channel_summaries(user, con)
        support_broadcasts = community_support_broadcast_summaries(con) if is_site_admin and selected_channel == "support" else []
    return {
        "ok": True,
        "is_admin": is_site_admin,
        "channel": selected_channel,
        "channels": channels,
        "unread_count": unread,
        "selected_thread_user_id": selected_id,
        "selected_user": public_community_user(selected_user, {"role": "user", "user_id": viewer_id}) if selected_user else None,
        "owner_user": public_community_user(owner_user, {"role": "user", "user_id": viewer_id}) if owner_user else None,
        "support_user": support_contact_payload(),
        "threads": threads,
        "support_broadcasts": support_broadcasts,
        "messages": messages,
    }

def community_attachment_ids(value: Any) -> list[int]:
    if value is None:
        return []
    raw_items = value if isinstance(value, list) else [value]
    ids: list[int] = []
    for item in raw_items:
        try:
            attachment_id = int(item)
        except (TypeError, ValueError):
            continue
        if attachment_id > 0 and attachment_id not in ids:
            ids.append(attachment_id)
    return ids[:COMMUNITY_MESSAGE_MAX_ATTACHMENTS + 1]

def cleanup_community_attachment_drafts(con: sqlite3.Connection, now: str) -> None:
    cutoff = datetime.now() - timedelta(hours=24)
    rows = con.execute(
        """
        SELECT id, stored_name, created_at
        FROM community_message_attachments
        WHERE message_id IS NULL
          AND broadcast_id IS NULL
          AND deleted_at IS NULL
        LIMIT 100
        """
    ).fetchall()
    stale_ids: list[int] = []
    for row in rows:
        try:
            created_at = datetime.fromisoformat(str(row["created_at"] or ""))
        except ValueError:
            created_at = cutoff - timedelta(seconds=1)
        if created_at >= cutoff:
            continue
        stale_ids.append(int(row["id"]))
        try:
            path = community_attachment_storage_path(row["stored_name"])
            if path.exists() and path.is_file():
                path.unlink()
        except OSError:
            pass
    if stale_ids:
        con.executemany(
            "UPDATE community_message_attachments SET deleted_at = ? WHERE id = ?",
            [(now, attachment_id) for attachment_id in stale_ids],
        )

def save_community_message_attachment_upload(raw_body: bytes, content_type: str, headers: Any) -> dict[str, Any]:
    user = require_public_user(headers)
    user_id = int(user.get("id") or 0)
    original_name, file_raw, detected_content_type = parse_community_attachment_upload(raw_body, content_type)
    suffix, kind, guessed_content_type, width, height = validate_community_attachment(file_raw, original_name)
    content_type_value = guessed_content_type or detected_content_type or "application/octet-stream"
    now = now_iso()
    month_dir = datetime.now().strftime("%Y/%m")
    draft_token = secrets.token_urlsafe(24)
    stored_name = f"{month_dir}/{secrets.token_hex(16)}{suffix}"
    path = community_attachment_storage_path(stored_name)
    COMMUNITY_ATTACHMENTS_DIR.mkdir(parents=True, exist_ok=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    with FILE_LOCK:
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_bytes(file_raw)
        tmp.replace(path)
    with community_connection() as con:
        cleanup_community_attachment_drafts(con, now)
        cur = con.execute(
            """
            INSERT INTO community_message_attachments (
                uploader_user_id, draft_token, stored_name, original_name,
                content_type, extension, kind, size_bytes, width, height, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                draft_token,
                stored_name,
                original_name,
                content_type_value,
                suffix,
                kind,
                len(file_raw),
                width,
                height,
                now,
            ),
        )
        row = con.execute("SELECT * FROM community_message_attachments WHERE id = ?", (int(cur.lastrowid),)).fetchone()
    return {"ok": True, "attachment": community_attachment_payload(row)}

def claim_community_message_attachments(
    con: sqlite3.Connection,
    attachment_ids: list[int],
    user_id: int,
    *,
    message_id: int | None = None,
    broadcast_id: int | None = None,
    now: str,
) -> None:
    clean_ids = community_attachment_ids(attachment_ids)
    if len(clean_ids) > COMMUNITY_MESSAGE_MAX_ATTACHMENTS:
        raise ApiError(400, f"Можно прикрепить не больше {COMMUNITY_MESSAGE_MAX_ATTACHMENTS} файлов.")
    if not clean_ids:
        return
    placeholders = ",".join("?" for _ in clean_ids)
    rows = con.execute(
        f"""
        SELECT *
        FROM community_message_attachments
        WHERE id IN ({placeholders})
          AND uploader_user_id = ?
          AND message_id IS NULL
          AND broadcast_id IS NULL
          AND deleted_at IS NULL
        """,
        (*clean_ids, int(user_id)),
    ).fetchall()
    found_ids = {int(row["id"]) for row in rows}
    if found_ids != set(clean_ids):
        raise ApiError(400, "Одно из вложений уже недоступно.")
    if message_id:
        con.executemany(
            "UPDATE community_message_attachments SET message_id = ?, attached_at = ? WHERE id = ?",
            [(int(message_id), now, attachment_id) for attachment_id in clean_ids],
        )
    elif broadcast_id:
        con.executemany(
            "UPDATE community_message_attachments SET broadcast_id = ?, attached_at = ? WHERE id = ?",
            [(int(broadcast_id), now, attachment_id) for attachment_id in clean_ids],
        )

def save_community_message(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_public_user(headers)
    author_id = int(user.get("id") or 0)
    is_site_admin = bool(user.get("site_admin"))
    selected_channel = normalize_message_channel(data.get("channel"))
    body = clean_text(data.get("body"), 2000)
    attachment_ids = community_attachment_ids(data.get("attachments") or data.get("attachment_ids"))
    if not body and not attachment_ids:
        raise ApiError(400, "Напишите сообщение или прикрепите файл.")
    requested_thread_id = int(data.get("thread_user_id") or 0)
    now = now_iso()
    with community_connection() as con:
        if is_site_admin and selected_channel == "support" and bool(data.get("broadcast")):
            cur = con.execute(
                """
                INSERT INTO community_support_broadcasts(author_user_id, body, created_at)
                VALUES (?, ?, ?)
                """,
                (author_id, body, now),
            )
            broadcast_id = int(cur.lastrowid)
            claim_community_message_attachments(con, attachment_ids, author_id, broadcast_id=broadcast_id, now=now)
            con.execute(
                """
                INSERT INTO community_support_broadcast_recipients(broadcast_id, user_id, read_at)
                SELECT ?, id, NULL
                FROM public_users
                WHERE site_admin = 0
                  AND blocked = 0
                  AND deleted_at IS NULL
                """,
                (broadcast_id,),
            )
            con.execute(
                "INSERT INTO community_events(event, user_id, payload, created_at) VALUES (?, ?, ?, ?)",
                ("site_support_broadcast", None, json.dumps(json_safe({"broadcast_id": broadcast_id, "author_user_id": author_id}), ensure_ascii=False), now),
            )
            thread_id = requested_thread_id
        elif is_site_admin:
            if not requested_thread_id:
                raise ApiError(400, "Выберите переписку.")
            recipient = con.execute(
                "SELECT * FROM public_users WHERE id = ? AND deleted_at IS NULL AND blocked = 0",
                (requested_thread_id,),
            ).fetchone()
            if not recipient:
                raise ApiError(404, "Профиль не найден.")
            thread_id = int(recipient["id"])
            con.execute(
                """
                INSERT INTO community_messages(thread_user_id, author_user_id, channel, body, read_by_admin_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (thread_id, author_id, selected_channel, body, now, now),
            )
            message_id = int(con.execute("SELECT last_insert_rowid()").fetchone()[0])
            claim_community_message_attachments(con, attachment_ids, author_id, message_id=message_id, now=now)
            con.execute(
                "INSERT INTO community_events(event, user_id, payload, created_at) VALUES (?, ?, ?, ?)",
                ("site_message_reply", int(recipient["id"]), json.dumps(json_safe({"author_user_id": author_id, "channel": selected_channel}), ensure_ascii=False), now),
            )
        else:
            thread_id = author_id
            con.execute(
                """
                INSERT INTO community_messages(thread_user_id, author_user_id, channel, body, read_by_user_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (thread_id, author_id, selected_channel, body, now, now),
            )
            message_id = int(con.execute("SELECT last_insert_rowid()").fetchone()[0])
            claim_community_message_attachments(con, attachment_ids, author_id, message_id=message_id, now=now)
            con.execute(
                "INSERT INTO community_events(event, user_id, payload, created_at) VALUES (?, ?, ?, ?)",
                ("site_message_sent", author_id, json.dumps(json_safe({"channel": selected_channel}), ensure_ascii=False), now),
            )
    return community_messages(thread_id, headers, selected_channel)

def community_message_attachment_row_for_viewer(
    con: sqlite3.Connection,
    attachment_id: int,
    user: dict[str, Any],
) -> sqlite3.Row:
    row = con.execute(
        """
        SELECT a.*, m.thread_user_id, m.channel, b.id broadcast_exists
        FROM community_message_attachments a
        LEFT JOIN community_messages m ON m.id = a.message_id
        LEFT JOIN community_support_broadcasts b ON b.id = a.broadcast_id
        WHERE a.id = ?
          AND a.deleted_at IS NULL
        """,
        (int(attachment_id),),
    ).fetchone()
    if not row:
        raise ApiError(404, "Вложение не найдено.")
    user_id = int(user.get("id") or 0)
    if bool(user.get("site_admin")):
        return row
    if row["message_id"] and int(row["thread_user_id"] or 0) == user_id:
        return row
    if row["broadcast_id"]:
        recipient = con.execute(
            """
            SELECT 1
            FROM community_support_broadcast_recipients
            WHERE broadcast_id = ?
              AND user_id = ?
            """,
            (int(row["broadcast_id"]), user_id),
        ).fetchone()
        if recipient:
            return row
    if not row["message_id"] and not row["broadcast_id"] and int(row["uploader_user_id"] or 0) == user_id:
        return row
    raise ApiError(404, "Вложение не найдено.")

def community_message_attachment_stream(handler: Any, attachment_id: int, headers: Any) -> None:
    user = require_public_user(headers)
    with community_connection() as con:
        row = community_message_attachment_row_for_viewer(con, attachment_id, user)
    path = community_attachment_storage_path(row["stored_name"])
    if not path.exists() or not path.is_file():
        raise ApiError(404, "Файл не найден.")
    content_type = row["content_type"] or "application/octet-stream"
    name = community_attachment_safe_name(row["original_name"] or "file")
    disposition = "inline" if str(row["kind"] or "") == "image" else "attachment"
    body = path.read_bytes()
    handler.send_response(200)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "private, max-age=3600")
    handler.send_header("Content-Disposition", f"{disposition}; filename*=UTF-8''{quote(name)}")
    handler.add_security_headers()
    handler.add_cors()
    handler.end_headers()
    handler.wfile.write(body)

def admin_review_recipients(con: sqlite3.Connection) -> list[sqlite3.Row]:
    return con.execute(
        """
        SELECT * FROM public_users
        WHERE site_admin = 1 AND blocked = 0
        ORDER BY id ASC
        """
    ).fetchall()

def clear_review_notification(con: sqlite3.Connection, kind: str, target_id: int) -> None:
    key_prefix = "comment_moderation" if kind == "comment_moderation" else "question_moderation"
    con.execute(
        "DELETE FROM community_notifications WHERE kind = ? AND aggregate_key = ?",
        (kind, f"{key_prefix}:{int(target_id)}"),
    )

def notify_comment_needs_moderation(con: sqlite3.Connection, row: dict[str, Any] | sqlite3.Row, actor_user_id: int) -> None:
    item = dict(row)
    route = item.get("target_route") or ""
    slug = item.get("target_slug") or ""
    comment_id = int(item.get("id") or 0)
    actor = public_user_row(int(actor_user_id or 0), con=con)
    actor_name = notification_user_name(actor)
    title_target = public_profile_target_title(load_content(), route, slug)
    body = clean_text(item.get("body"), 180)
    for admin_user in admin_review_recipients(con):
        create_community_notification(
            con,
            int(admin_user["id"]),
            "comment_moderation",
            f"{actor_name} оставил комментарий на проверку",
            f"{title_target}: {body}",
            notification_comment_url(item),
            actor_user_id=int(actor_user_id),
            target_type="comment",
            target_route=route,
            target_slug=slug,
            target_id=comment_id,
            aggregate_key=f"comment_moderation:{comment_id}",
            email_important=True,
        )

def notify_question_needs_answer(con: sqlite3.Connection, row: dict[str, Any] | sqlite3.Row, actor_user_id: int) -> None:
    item = dict(row)
    question_id = int(item.get("id") or 0)
    actor = public_user_row(int(actor_user_id or 0), con=con)
    actor_name = notification_user_name(actor)
    for admin_user in admin_review_recipients(con):
        create_community_notification(
            con,
            int(admin_user["id"]),
            "question_moderation",
            f"{actor_name} задал вопрос",
            clean_text(item.get("question"), 220),
            route_path("questions", str(question_id)),
            actor_user_id=int(actor_user_id),
            target_type="question",
            target_route="questions",
            target_slug=str(question_id),
            target_id=question_id,
            aggregate_key=f"question_moderation:{question_id}",
            email_important=True,
        )

def notify_comment_published(con: sqlite3.Connection, row: dict[str, Any] | sqlite3.Row, actor_user_id: int) -> None:
    item = dict(row)
    route = item.get("target_route") or ""
    slug = item.get("target_slug") or ""
    comment_id = int(item.get("id") or 0)
    actor = public_user_row(int(actor_user_id or 0), con=con)
    actor_name = notification_user_name(actor)
    title_target = public_profile_target_title(load_content(), route, slug)
    url = notification_comment_url(item)
    parent_id = int(item.get("parent_id") or 0)
    if parent_id:
        parent = con.execute("SELECT * FROM public_comments WHERE id = ? AND status = 'published'", (parent_id,)).fetchone()
        parent_user_id = int(parent["user_id"]) if parent else 0
        if parent_user_id and parent_user_id != int(actor_user_id):
            create_community_notification(
                con,
                parent_user_id,
                "comment_reply",
                f"{actor_name} ответил на комментарий",
                clean_text(item.get("body"), 220),
                url,
                actor_user_id=int(actor_user_id),
                target_type="comment",
                target_route=route,
                target_slug=slug,
                target_id=comment_id,
                email_important=True,
            )
        exclude = {int(actor_user_id), parent_user_id}
    else:
        exclude = {int(actor_user_id)}
    for subscription in subscription_rows_for_targets(con, [("material", route, slug), ("discussion", route, slug)], exclude):
        create_community_notification(
            con,
            int(subscription["user_id"]),
            "material_comment",
            f"Новый комментарий: {title_target}",
            f"{actor_name}: {clean_text(item.get('body'), 180)}",
            url,
            actor_user_id=int(actor_user_id),
            target_type="material",
            target_route=route,
            target_slug=slug,
            target_id=comment_id,
        )

def update_comment_like_notification(con: sqlite3.Connection, comment_id: int, actor_user_id: int) -> None:
    row = con.execute("SELECT * FROM public_comments WHERE id = ? AND status = 'published'", (int(comment_id),)).fetchone()
    if not row:
        return
    owner_id = int(row["user_id"])
    if owner_id == int(actor_user_id):
        return
    like_count = con.execute("SELECT COUNT(*) count FROM comment_likes WHERE comment_id = ?", (int(comment_id),)).fetchone()["count"]
    aggregate_key = f"comment_like:{comment_id}:{owner_id}"
    if int(like_count or 0) <= 0:
        con.execute("DELETE FROM community_notifications WHERE user_id = ? AND aggregate_key = ?", (owner_id, aggregate_key))
        return
    actor = public_user_row(int(actor_user_id), con=con)
    actor_name = notification_user_name(actor)
    extra_count = max(0, int(like_count or 1) - 1)
    title = f"{actor_name} оставил(а) лайк вашему комментарию" if not extra_count else f"{actor_name} и ещё {extra_count} оставили лайк вашему комментарию"
    body = clean_text(row["body"], 180)
    create_community_notification(
        con,
        owner_id,
        "comment_like",
        title,
        body,
        notification_comment_url(row),
        actor_user_id=int(actor_user_id),
        target_type="comment",
        target_route=row["target_route"],
        target_slug=row["target_slug"],
        target_id=int(comment_id),
        aggregate_key=aggregate_key,
        count=int(like_count or 1),
    )

def notify_question_answered(con: sqlite3.Connection, row: dict[str, Any] | sqlite3.Row, actor_user_id: int | None = None) -> None:
    item = dict(row)
    create_community_notification(
        con,
        int(item["user_id"]),
        "question_answer",
        "На ваш вопрос ответили",
        clean_text(item.get("question"), 220),
        route_path("questions", str(item["id"])),
        actor_user_id=actor_user_id,
        target_type="question",
        target_route="questions",
        target_slug=str(item["id"]),
        target_id=int(item["id"]),
        email_important=True,
    )

def published_material_map(content: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    result: dict[tuple[str, str], dict[str, Any]] = {}
    sections = content.get("sections") if isinstance(content.get("sections"), dict) else {}
    for route in PUBLIC_SECTION_ROUTES:
        section = sections.get(route) if isinstance(sections.get(route), dict) else {}
        items = section.get("items") if isinstance(section.get("items"), list) else []
        for item in items:
            if isinstance(item, dict) and item.get("status") == "published" and clean_text(item.get("slug")):
                result[(route, clean_text(item.get("slug")))] = item
    return result

def notify_new_published_materials(before: dict[str, Any], after: dict[str, Any]) -> None:
    before_map = published_material_map(before)
    after_map = published_material_map(after)
    new_keys = [key for key in after_map if key not in before_map]
    if not new_keys:
        return
    content = after
    with community_connection() as con:
        for route, slug in new_keys:
            item = after_map[(route, slug)]
            title = public_text(item.get("title") or "Новый материал")
            section_title = section_display_name(content, route)
            url = route_path(route, slug)
            for subscription in subscription_rows_for_targets(con, [("section", route, "")], set()):
                create_community_notification(
                    con,
                    int(subscription["user_id"]),
                    "section_material",
                    f"Новый материал: {title}",
                    section_title,
                    url,
                    target_type="material",
                    target_route=route,
                    target_slug=slug,
                    email_important=True,
                    email_subscription=subscription,
                )

def increment_approved_actions(con: sqlite3.Connection, user_id: int) -> None:
    row = con.execute("SELECT approved_actions_count, trusted FROM public_users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return
    count = int(row["approved_actions_count"] or 0) + 1
    trusted = 1 if row["trusted"] or count >= PUBLIC_TRUST_APPROVALS else 0
    con.execute("UPDATE public_users SET approved_actions_count = ?, trusted = ?, updated_at = ? WHERE id = ?", (count, trusted, now_iso(), user_id))

def update_public_profile(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_public_user(headers)
    display_name = clean_text(data.get("display_name"), 80)
    avatar_url = clean_text(data.get("avatar_url"), 400)
    notification_email_enabled = 1 if bool_or_default(data.get("notification_email_enabled"), bool(user.get("notification_email_enabled", 1))) else 0
    profile_guest_visible = 1 if bool_or_default(data.get("profile_guest_visible"), bool(user.get("profile_guest_visible", 1))) else 0
    show_online_status = 1 if bool_or_default(data.get("show_online_status"), bool(user.get("show_online_status", 0))) else 0
    show_public_activity = 1 if bool_or_default(data.get("show_public_activity"), bool(user.get("show_public_activity", 1))) else 0
    if len(display_name) < 2:
        raise ApiError(400, "Публичное имя должно быть не короче 2 символов.")
    if avatar_url and not profile_avatar_path_from_url(avatar_url):
        raise ApiError(400, "Фото профиля нужно загрузить через настройки профиля.")
    with community_connection() as con:
        current = con.execute("SELECT * FROM public_users WHERE id = ?", (user["id"],)).fetchone()
        nickname = str(current["nickname"] or user.get("nickname") or normalize_nickname(display_name, "user")) if current else normalize_nickname(display_name, "user")
        old_avatar = str(current["avatar_url"] or "") if current else ""
        old_display_name = str(current["display_name"] or "") if current else ""
        avatar_updated_at = now_iso() if avatar_url != old_avatar else (current["avatar_updated_at"] if current else None)
        must_change_avatar = 0 if avatar_url != old_avatar else int(current["must_change_avatar"] or 0)
        must_change_nickname = 0 if display_name != old_display_name else int(current["must_change_nickname"] or 0)
        con.execute(
            """
            UPDATE public_users
            SET display_name = ?, nickname = ?, bio = '', avatar_url = ?, avatar_updated_at = ?,
                notification_email_enabled = ?, profile_guest_visible = ?, show_online_status = ?,
                show_public_activity = ?, must_change_avatar = ?, must_change_nickname = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                display_name,
                nickname,
                avatar_url,
                avatar_updated_at,
                notification_email_enabled,
                profile_guest_visible,
                show_online_status,
                show_public_activity,
                must_change_avatar,
                must_change_nickname,
                now_iso(),
                user["id"],
            ),
        )
        fresh = dict(con.execute("SELECT * FROM public_users WHERE id = ?", (user["id"],)).fetchone())
    if old_avatar and old_avatar != avatar_url:
        delete_uploaded_media(old_avatar)
    auth = load_auth()
    changed = False
    for token, session_item in auth.get("sessions", {}).items():
        if session_item.get("role") == "user" and int(session_item.get("user_id") or 0) == int(user["id"]):
            session_item["username"] = nickname
            session_item["nickname"] = nickname
            session_item["display_name"] = display_name
            session_item.pop("bio", None)
            session_item["avatar_url"] = avatar_url
            session_item["avatar_updated_at"] = fresh.get("avatar_updated_at")
            session_item["notification_email_enabled"] = bool(fresh.get("notification_email_enabled", 1))
            session_item["profile_guest_visible"] = bool(fresh.get("profile_guest_visible", 1))
            session_item["show_online_status"] = bool(fresh.get("show_online_status", 0))
            session_item["show_public_activity"] = bool(fresh.get("show_public_activity", 1))
            session_item["must_change_avatar"] = bool(fresh.get("must_change_avatar"))
            session_item["must_change_nickname"] = bool(fresh.get("must_change_nickname"))
            changed = True
    if changed:
        save_auth(auth)
    return {
        "ok": True,
        "user": public_community_user(fresh, {"role": "user", "user_id": fresh["id"], "site_admin": bool(fresh.get("site_admin"))}),
        "privacy": public_profile_privacy_payload(fresh),
        "auth_user": public_user(
            {
                "role": "user",
                "user_id": fresh["id"],
                "username": fresh["nickname"],
                "nickname": fresh["nickname"],
                "display_name": fresh["display_name"],
                "avatar_url": fresh.get("avatar_url") or "",
                "avatar_updated_at": fresh.get("avatar_updated_at"),
                "notification_email_enabled": bool(fresh.get("notification_email_enabled", 1)),
                "profile_guest_visible": bool(fresh.get("profile_guest_visible", 1)),
                "show_online_status": bool(fresh.get("show_online_status", 0)),
                "show_public_activity": bool(fresh.get("show_public_activity", 1)),
                "trusted": fresh["trusted"],
                "site_admin": bool(fresh.get("site_admin")),
                "must_change_avatar": bool(fresh.get("must_change_avatar")),
                "must_change_nickname": bool(fresh.get("must_change_nickname")),
                "trebnik_client_id": fresh.get("trebnik_client_id"),
                "trebnik_linked_at": fresh.get("trebnik_linked_at"),
                "trebnik_linked_by": fresh.get("trebnik_linked_by"),
            }
        ),
    }

def update_public_account(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_public_user(headers)
    rate_limit(headers, "public-account-update")
    requested_email = "email" in data
    requested_password = bool(str(data.get("new_password") or ""))
    current_password = str(data.get("current_password") or "")
    with community_connection() as con:
        row = con.execute("SELECT * FROM public_users WHERE id = ?", (user["id"],)).fetchone()
        if not row:
            raise ApiError(404, "Профиль не найден.")
        email = str(row["email"] or "").strip().lower()
        next_email = email
        email_changed = False
        if requested_email:
            next_email = clean_email(data.get("email"))
            email_changed = next_email != email
        if email_changed:
            ensure_public_access_allowed(headers, next_email)
            exists = con.execute(
                "SELECT id FROM public_users WHERE lower(email) = lower(?) AND id != ?",
                (next_email, int(user["id"])),
            ).fetchone()
            if exists:
                raise ApiError(409, "Эта почта уже используется.")
        has_password = public_user_has_password(row)
        if (email_changed or requested_password) and has_password:
            if not current_password or not verify_password(current_password, public_password_hash(row)):
                raise ApiError(401, "Введите текущий пароль.")
        if email_changed and not has_password and not requested_password:
            raise ApiError(400, "Сначала задайте пароль, чтобы менять почту.")
        password_changed = False
        if requested_password:
            confirm = str(data.get("new_password_confirm") or data.get("password_confirm") or "")
            if str(data.get("new_password") or "") != confirm:
                raise ApiError(400, "Пароли не совпадают.")
            set_public_user_password(con, int(user["id"]), str(data.get("new_password") or ""))
            password_changed = True
        if email_changed:
            con.execute("UPDATE public_users SET email = ?, updated_at = ? WHERE id = ?", (next_email, now_iso(), int(user["id"])))
        fresh = con.execute("SELECT * FROM public_users WHERE id = ?", (user["id"],)).fetchone()
    if email_changed or password_changed:
        community_log("public_account_updated", int(user["id"]), email_changed=email_changed, password_changed=password_changed)
    return {"ok": True, "account": public_account_payload(fresh)}

def public_profile_target_title(content: dict[str, Any], route: str, slug: str) -> str:
    if route == "questions" and slug:
        try:
            question_id = int(slug)
        except (TypeError, ValueError):
            question_id = 0
        if question_id:
            try:
                with community_connection() as con:
                    row = con.execute("SELECT question FROM public_questions WHERE id = ?", (question_id,)).fetchone()
                if row:
                    return clean_text(row["question"], 80) or "Вопрос"
            except Exception:
                pass
        return "Вопрос"
    item = find_public_item(content, route, slug)
    if item:
        return public_text(item.get("title") or slug)
    if route in PUBLIC_SECTION_ROUTES:
        return section_display_name(content, route)
    return public_text(slug or route or "Материал")

def public_profile_status_label(status: str) -> str:
    status = clean_text(status, 20).lower()
    labels = {
        "pending": "на проверке",
        "published": "опубликовано",
        "hidden": "скрыто",
        "rejected": "отклонено",
        "deleted": "удалено",
    }
    return labels.get(status, "в обработке")

def public_profile_activity(row: sqlite3.Row, con: sqlite3.Connection) -> dict[str, Any]:
    if not bool(row["show_public_activity"] if "show_public_activity" in row.keys() else 1):
        return {"comments": [], "questions": []}
    content = load_content()
    comments = con.execute(
        """
        SELECT id, target_route, target_slug, body, created_at
        FROM public_comments
        WHERE user_id = ? AND status = 'published'
          AND NOT EXISTS (
            SELECT 1 FROM public_profile_hidden_activity h
            WHERE h.user_id = public_comments.user_id
              AND h.item_type = 'comment'
              AND h.item_id = public_comments.id
          )
        ORDER BY created_at DESC, id DESC
        LIMIT 12
        """,
        (row["id"],),
    ).fetchall()
    questions = con.execute(
        """
        SELECT id, question, answer, created_at, answered_at
        FROM public_questions
        WHERE user_id = ? AND status = 'published'
          AND NOT EXISTS (
            SELECT 1 FROM public_profile_hidden_activity h
            WHERE h.user_id = public_questions.user_id
              AND h.item_type = 'question'
              AND h.item_id = public_questions.id
          )
        ORDER BY COALESCE(answered_at, created_at) DESC, id DESC
        LIMIT 12
        """,
        (row["id"],),
    ).fetchall()
    return {
        "comments": [
            {
                "id": item["id"],
                "body": item["body"],
                "created_at": item["created_at"],
                "target_route": item["target_route"],
                "target_slug": item["target_slug"],
                "target_title": public_profile_target_title(content, item["target_route"], item["target_slug"]),
                "target_url": f"{route_path('questions', item['target_slug'])}#comment-{item['id']}" if item["target_route"] == "questions" else route_path(item["target_route"], item["target_slug"]),
            }
            for item in comments
        ],
        "questions": [
            {
                "id": item["id"],
                "question": item["question"],
                "answer": item["answer"] or "",
                "created_at": item["created_at"],
                "answered_at": item["answered_at"],
                "target_url": route_path("questions", str(item["id"])),
            }
            for item in questions
        ],
    }

def own_profile_activity(row: sqlite3.Row, con: sqlite3.Connection) -> dict[str, Any]:
    content = load_content()
    comments = con.execute(
        """
        SELECT id, target_route, target_slug, body, status, created_at, updated_at, moderated_at
        FROM public_comments
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 24
        """,
        (row["id"],),
    ).fetchall()
    questions = con.execute(
        """
        SELECT id, question, answer, status, created_at, updated_at, answered_at
        FROM public_questions
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 24
        """,
        (row["id"],),
    ).fetchall()
    return {
        "comments": [
            {
                "id": item["id"],
                "body": item["body"],
                "status": item["status"],
                "status_label": public_profile_status_label(item["status"]),
                "is_public": item["status"] == "published",
                "created_at": item["created_at"],
                "updated_at": item["updated_at"],
                "moderated_at": item["moderated_at"],
                "target_route": item["target_route"],
                "target_slug": item["target_slug"],
                "target_title": public_profile_target_title(content, item["target_route"], item["target_slug"]),
                "target_url": f"{route_path('questions', item['target_slug'])}#comment-{item['id']}" if item["target_route"] == "questions" and item["status"] == "published" else (route_path(item["target_route"], item["target_slug"]) if item["status"] == "published" else ""),
            }
            for item in comments
        ],
        "questions": [
            {
                "id": item["id"],
                "question": item["question"],
                "answer": item["answer"] or "",
                "status": item["status"],
                "status_label": "ответ опубликован" if item["status"] == "published" and item["answer"] else public_profile_status_label(item["status"]),
                "is_public": item["status"] == "published",
                "created_at": item["created_at"],
                "updated_at": item["updated_at"],
                "answered_at": item["answered_at"],
                "target_url": route_path("questions", str(item["id"])) if item["status"] == "published" else "",
            }
            for item in questions
        ],
    }

def community_profile(nickname: str, headers: Any) -> dict[str, Any]:
    viewer = session(headers)
    nick = normalize_nickname(nickname, "")
    with community_connection() as con:
        row = con.execute("SELECT * FROM public_users WHERE nickname = ?", (nick,)).fetchone()
        if not row or row["blocked"] or row["deleted_at"]:
            raise ApiError(404, "Профиль не найден.")
        is_owner = bool(viewer and viewer.get("role") == "user" and int(viewer.get("user_id") or 0) == int(row["id"] or 0))
        is_registered_viewer = bool(viewer and (viewer.get("role") == "user" or is_admin_session(viewer)))
        guest_visible = bool(row["profile_guest_visible"] if "profile_guest_visible" in row.keys() else 1)
        if not is_owner and not is_registered_viewer and not guest_visible:
            raise ApiError(404, "Профиль недоступен.")
        show_public_activity = bool(row["show_public_activity"] if "show_public_activity" in row.keys() else 1)
        stats = {
            "comments": con.execute(
                """
                SELECT COUNT(*) count FROM public_comments
                WHERE user_id = ? AND status = 'published'
                  AND NOT EXISTS (
                    SELECT 1 FROM public_profile_hidden_activity h
                    WHERE h.user_id = public_comments.user_id
                      AND h.item_type = 'comment'
                      AND h.item_id = public_comments.id
                  )
                """,
                (row["id"],),
            ).fetchone()["count"] if show_public_activity else 0,
            "questions": con.execute(
                """
                SELECT COUNT(*) count FROM public_questions
                WHERE user_id = ? AND status = 'published'
                  AND NOT EXISTS (
                    SELECT 1 FROM public_profile_hidden_activity h
                    WHERE h.user_id = public_questions.user_id
                      AND h.item_type = 'question'
                      AND h.item_id = public_questions.id
                  )
                """,
                (row["id"],),
            ).fetchone()["count"] if show_public_activity else 0,
        }
        activity = public_profile_activity(row, con)
        account = public_account_payload(row) if is_owner else None
        own_activity = own_profile_activity(row, con) if is_owner else None
    payload = {"ok": True, "profile": public_community_user(row, viewer), "stats": stats, "activity": activity}
    if is_owner:
        payload["account"] = account
        payload["privacy"] = public_profile_privacy_payload(row)
        payload["own_activity"] = own_activity
    return payload

def hide_public_profile_activity(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_public_user(headers)
    item_type = clean_text(data.get("item_type") or data.get("kind"), 20).lower()
    if item_type not in {"comment", "question"}:
        raise ApiError(400, "Нужна запись профиля.")
    try:
        item_id = int(data.get("item_id") or data.get("id") or 0)
    except (TypeError, ValueError):
        item_id = 0
    if item_id <= 0:
        raise ApiError(400, "Нужна запись профиля.")
    with community_connection() as con:
        if item_type == "comment":
            row = con.execute("SELECT id FROM public_comments WHERE id = ? AND user_id = ?", (item_id, int(user["id"]))).fetchone()
        else:
            row = con.execute("SELECT id FROM public_questions WHERE id = ? AND user_id = ?", (item_id, int(user["id"]))).fetchone()
        if not row:
            raise ApiError(404, "Запись не найдена.")
        con.execute(
            """
            INSERT OR IGNORE INTO public_profile_hidden_activity(user_id, item_type, item_id, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (int(user["id"]), item_type, item_id, now_iso()),
        )
        nick = str(user.get("nickname") or "")
    community_log("public_profile_activity_hidden", int(user["id"]), item_type=item_type, item_id=item_id)
    return community_profile(nick, headers)

def community_comments(route: str, slug: str, headers: Any) -> dict[str, Any]:
    route = clean_text(route, 30)
    slug = clean_text(slug, 120)
    with community_connection() as con:
        viewer = comment_viewer(headers, con)
        admin_can_moderate = bool(viewer and is_admin_session(viewer))
        ensure_discussion_target(con, route, slug)
        status_clause = "status IN ('published', 'pending')" if admin_can_moderate else "status = 'published'"
        rows = con.execute(
            f"""
            SELECT * FROM public_comments
            WHERE target_route = ? AND target_slug = ? AND {status_clause}
            ORDER BY created_at ASC, id ASC
            """,
            (route, slug),
        ).fetchall()
        payloads = [public_comment_payload(row, viewer, con=con) for row in rows]
        material_author_nick = ""
        if route != "questions":
            content = load_content()
            material = find_public_item(content, route, slug) or {}
            explicit_nick = clean_text(material.get("author_nickname") or material.get("author_slug") or "")
            if explicit_nick:
                material_author_nick = explicit_nick.lower()
            else:
                owner_row = con.execute(
                    "SELECT nickname FROM public_users WHERE site_admin = 1 AND blocked = 0 ORDER BY id ASC LIMIT 1"
                ).fetchone()
                if owner_row:
                    material_author_nick = clean_text(owner_row["nickname"] or "").lower()
        for item in payloads:
            commenter_nick = clean_text(((item.get("author") or {}).get("nickname") or "")).lower()
            item["is_material_author"] = bool(material_author_nick and commenter_nick == material_author_nick)
        by_id = {int(item["id"]): item for item in payloads if item.get("id")}
        items: list[dict[str, Any]] = []
        for item in payloads:
            parent_id = int(item.get("parent_id") or 0)
            if parent_id and parent_id in by_id:
                by_id[parent_id].setdefault("replies", []).append(item)
            else:
                items.append(item)
        return {"ok": True, "items": items}

def save_public_comment(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_comment_user(headers)
    route = clean_text(data.get("target_route"), 30)
    slug = clean_text(data.get("target_slug"), 120)
    body = clean_text(data.get("body"), 2000)
    parent_id = int(data.get("parent_id") or 0)
    if len(body) < 3:
        raise ApiError(400, "Комментарий слишком короткий.")
    restriction = comment_restriction_message(user)
    if restriction:
        raise ApiError(403, restriction)
    status = "published" if user.get("trusted") or user.get("site_admin") else "pending"
    with community_connection() as con:
        ensure_discussion_target(con, route, slug)
        if parent_id:
            parent = con.execute("SELECT * FROM public_comments WHERE id = ? AND status = 'published'", (parent_id,)).fetchone()
            if not parent or parent["target_route"] != route or parent["target_slug"] != slug:
                raise ApiError(404, "Комментарий для ответа не найден.")
            if parent["parent_id"]:
                raise ApiError(400, "Ответ можно оставить только на основной комментарий.")
        cur = con.execute(
            """
            INSERT INTO public_comments(target_route, target_slug, user_id, parent_id, body, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (route, slug, user["id"], parent_id or None, body, status, now_iso(), now_iso()),
        )
        row = con.execute("SELECT * FROM public_comments WHERE id = ?", (cur.lastrowid,)).fetchone()
        ensure_subscription(con, int(user["id"]), "discussion", route, slug, email_enabled=False, reactivate=False)
        if status == "published":
            notify_comment_published(con, row, int(user["id"]))
        else:
            notify_comment_needs_moderation(con, row, int(user["id"]))
        payload = public_comment_payload(row, {"role": "user", "user_id": user["id"]}, con=con)
    community_log("public_comment_created", int(user["id"]), status=status, route=route, slug=slug)
    return {"ok": True, "comment": payload, "status": status}

def like_public_comment(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_comment_user(headers)
    comment_id = int(data.get("comment_id") or 0)
    with community_connection() as con:
        row = con.execute("SELECT * FROM public_comments WHERE id = ? AND status = 'published'", (comment_id,)).fetchone()
        if not row:
            raise ApiError(404, "Комментарий не найден.")
        liked = con.execute("SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?", (comment_id, user["id"])).fetchone()
        if liked:
            con.execute("DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?", (comment_id, user["id"]))
            active = False
        else:
            con.execute("INSERT INTO comment_likes(comment_id, user_id, created_at) VALUES (?, ?, ?)", (comment_id, user["id"], now_iso()))
            active = True
        count = con.execute("SELECT COUNT(*) count FROM comment_likes WHERE comment_id = ?", (comment_id,)).fetchone()["count"]
        update_comment_like_notification(con, comment_id, int(user["id"]))
    return {"ok": True, "liked": active, "like_count": count}

def public_comment_likes(comment_id: int, headers: Any) -> dict[str, Any]:
    viewer = require_session(headers)
    if viewer.get("role") not in {"user", "admin"}:
        raise ApiError(403, "Список лайков доступен только после входа.")
    with community_connection() as con:
        rows = con.execute(
            """
            SELECT u.* FROM comment_likes l
            JOIN public_users u ON u.id = l.user_id
            WHERE l.comment_id = ?
            ORDER BY l.created_at DESC
            """,
            (int(comment_id),),
        ).fetchall()
        return {"ok": True, "items": [public_community_user(row, viewer) for row in rows]}

def publication_like_viewer_user_id(viewer: dict[str, Any] | None, con: sqlite3.Connection) -> int:
    if not viewer:
        return 0
    if viewer.get("role") == "user":
        return int(viewer.get("user_id") or 0)
    if is_admin_session(viewer):
        row = con.execute(
            """
            SELECT id FROM public_users
            WHERE site_admin = 1 AND blocked = 0 AND deleted_at IS NULL
            ORDER BY id ASC
            LIMIT 1
            """
        ).fetchone()
        return int(row["id"] or 0) if row else 0
    return 0

def publication_likes_payload(
    con: sqlite3.Connection,
    route: str,
    slug: str,
    viewer: dict[str, Any] | None,
) -> dict[str, Any]:
    count = con.execute(
        "SELECT COUNT(*) count FROM publication_likes WHERE target_route = ? AND target_slug = ?",
        (route, slug),
    ).fetchone()["count"]
    viewer_user_id = publication_like_viewer_user_id(viewer, con)
    liked_by_me = bool(
        viewer_user_id
        and con.execute(
            "SELECT 1 FROM publication_likes WHERE target_route = ? AND target_slug = ? AND user_id = ?",
            (route, slug, viewer_user_id),
        ).fetchone()
    )
    rows = con.execute(
        """
        SELECT u.* FROM publication_likes l
        JOIN public_users u ON u.id = l.user_id
        WHERE l.target_route = ? AND l.target_slug = ?
        ORDER BY l.created_at DESC
        """,
        (route, slug),
    ).fetchall()
    return {
        "ok": True,
        "target_route": route,
        "target_slug": slug,
        "like_count": count,
        "liked_by_me": liked_by_me,
        "items": [public_community_user(row, viewer) for row in rows],
    }

def like_publication(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_comment_user(headers)
    with community_connection() as con:
        route, slug = ensure_publication_like_target(con, data.get("target_route"), data.get("target_slug"))
        liked = con.execute(
            "SELECT 1 FROM publication_likes WHERE target_route = ? AND target_slug = ? AND user_id = ?",
            (route, slug, int(user["id"])),
        ).fetchone()
        if liked:
            con.execute(
                "DELETE FROM publication_likes WHERE target_route = ? AND target_slug = ? AND user_id = ?",
                (route, slug, int(user["id"])),
            )
            active = False
        else:
            con.execute(
                "INSERT INTO publication_likes(target_route, target_slug, user_id, created_at) VALUES (?, ?, ?, ?)",
                (route, slug, int(user["id"]), now_iso()),
            )
            active = True
        payload = publication_likes_payload(con, route, slug, {"role": "user", "user_id": int(user["id"])})
    community_log("publication_like_toggled", int(user["id"]), route=route, slug=slug, active=active)
    payload["liked"] = active
    payload["liked_by_me"] = active
    return payload

def public_publication_likes(route: str, slug: str, headers: Any) -> dict[str, Any]:
    viewer = session(headers)
    with community_connection() as con:
        route, slug = ensure_publication_like_target(con, route, slug)
        return publication_likes_payload(con, route, slug, viewer)

def public_questions_feed(headers: Any) -> dict[str, Any]:
    viewer = session(headers)
    admin_can_moderate = bool(is_admin_session(viewer))
    status_clause = "q.status IN ('pending', 'hidden', 'published')" if admin_can_moderate else "q.status = 'published'"
    order_clause = "CASE q.status WHEN 'pending' THEN 0 WHEN 'hidden' THEN 1 ELSE 2 END, COALESCE(q.answered_at, q.created_at) DESC, q.id DESC" if admin_can_moderate else "COALESCE(q.answered_at, q.created_at) DESC, q.id DESC"
    with community_connection() as con:
        rows = con.execute(
            f"""
            SELECT q.*, u.nickname, u.display_name, u.trusted, u.blocked, u.created_at user_created_at, u.last_seen
            FROM public_questions q JOIN public_users u ON u.id = q.user_id
            WHERE {status_clause}
            ORDER BY {order_clause}
            LIMIT 80
            """
        ).fetchall()
    items = []
    for row in rows:
        items.append(public_question_payload(row, viewer, admin_can_moderate))
    return {"ok": True, "items": items}

def public_question_answerer(answered_by: str | None, viewer: dict[str, Any] | None) -> dict[str, Any] | None:
    name = clean_text(answered_by, 80)
    if not name:
        return None
    with community_connection() as con:
        row = con.execute(
            """
            SELECT * FROM public_users
            WHERE blocked = 0 AND deleted_at IS NULL
              AND (lower(nickname) = lower(?) OR lower(display_name) = lower(?) OR site_admin = 1)
            ORDER BY
              CASE
                WHEN lower(nickname) = lower(?) THEN 0
                WHEN lower(display_name) = lower(?) THEN 1
                WHEN site_admin = 1 THEN 2
                ELSE 3
              END,
              id ASC
            LIMIT 1
            """,
            (name, name, name, name),
        ).fetchone()
    if row:
        return public_community_user(row, viewer)
    return {
        "id": None,
        "nickname": "",
        "display_name": name,
        "avatar_url": "",
        "profile_url": "",
        "online": None,
    }

def public_question_payload(row: dict[str, Any] | sqlite3.Row, viewer: dict[str, Any] | None, admin_can_moderate: bool = False) -> dict[str, Any]:
    data = dict(row)
    publish_anonymously = bool(data.get("publish_anonymously"))
    author = public_community_user(
        {
            "id": data["user_id"],
            "nickname": data["nickname"],
            "display_name": data["display_name"],
            "trusted": data["trusted"],
            "blocked": data["blocked"],
            "created_at": data["user_created_at"],
            "last_seen": data["last_seen"],
        },
        viewer,
    )
    if publish_anonymously and not admin_can_moderate:
        author = {
            "id": None,
            "nickname": "",
            "display_name": "Анонимный вопрос",
            "avatar_url": "",
            "profile_url": "",
            "online": None,
        }
    return {
        "id": data["id"],
        "question": data["question"],
        "answer": data.get("answer"),
        "status": data.get("status"),
        "category": data.get("category") or "",
        "publish_anonymously": publish_anonymously,
        "created_at": data["created_at"],
        "updated_at": data.get("updated_at"),
        "answered_at": data.get("answered_at"),
        "answered_by": data.get("answered_by"),
        "answerer": public_question_answerer(data.get("answered_by"), viewer),
        "author": author,
    }

def public_question_detail(question_id: int, headers: Any) -> dict[str, Any]:
    viewer = session(headers)
    admin_can_moderate = bool(is_admin_session(viewer))
    status_clause = "q.status IN ('pending', 'hidden', 'published')" if admin_can_moderate else "q.status = 'published'"
    with community_connection() as con:
        row = con.execute(
            f"""
            SELECT q.*, u.nickname, u.display_name, u.trusted, u.blocked, u.created_at user_created_at, u.last_seen
            FROM public_questions q JOIN public_users u ON u.id = q.user_id
            WHERE q.id = ? AND {status_clause}
            LIMIT 1
            """,
            (int(question_id),),
        ).fetchone()
    if not row:
        raise ApiError(404, "Вопрос не найден или ещё не опубликован.")
    return {"ok": True, "question": public_question_payload(row, viewer, admin_can_moderate)}

def public_questions_count() -> int:
    try:
        with community_connection() as con:
            row = con.execute("SELECT COUNT(*) count FROM public_questions WHERE status = 'published'").fetchone()
        return int(row["count"] if row else 0)
    except Exception:
        return 0

def save_public_question(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_public_user(headers)
    question = clean_text(data.get("question"), 2000)
    if len(question) < 8:
        raise ApiError(400, "Вопрос слишком короткий.")
    with community_connection() as con:
        cur = con.execute(
            "INSERT INTO public_questions(user_id, question, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)",
            (user["id"], question, now_iso(), now_iso()),
        )
        row = dict(con.execute("SELECT * FROM public_questions WHERE id = ?", (cur.lastrowid,)).fetchone())
        notify_question_needs_answer(con, row, int(user["id"]))
    community_log("public_question_created", int(user["id"]), question_id=row["id"])
    return {"ok": True, "question": row}

def admin_question_author(con: sqlite3.Connection, admin: dict[str, Any]) -> dict[str, Any]:
    if admin.get("role") == "user" and int(admin.get("user_id") or 0):
        row = con.execute(
            "SELECT * FROM public_users WHERE id = ? AND blocked = 0 AND deleted_at IS NULL",
            (int(admin.get("user_id") or 0),),
        ).fetchone()
        if row:
            return dict(row)
    row = con.execute(
        """
        SELECT * FROM public_users
        WHERE site_admin = 1 AND blocked = 0 AND deleted_at IS NULL
        ORDER BY id ASC
        LIMIT 1
        """
    ).fetchone()
    if row:
        return dict(row)

    now = now_iso()
    base_email = "admin-questions@katuonela.local"
    email = base_email
    suffix = 2
    while con.execute("SELECT 1 FROM public_users WHERE email = ?", (email,)).fetchone():
        email = f"admin-questions-{suffix}@katuonela.local"
        suffix += 1
    nickname = unique_nickname(con, "admin-questions")
    cur = con.execute(
        """
        INSERT INTO public_users(
            email, nickname, display_name, notification_email_enabled,
            profile_guest_visible, show_public_activity, trusted, site_admin,
            accepted_legal_at, created_at, updated_at
        )
        VALUES (?, ?, ?, 0, 0, 0, 1, 1, ?, ?, ?)
        """,
        (email, nickname, "Вопрос из переписки", now, now, now),
    )
    row = con.execute("SELECT * FROM public_users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row)

def create_public_question_admin(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    admin = require_admin(headers)
    question = clean_text(data.get("question"), 2000)
    answer = clean_text(data.get("answer"), 5000)
    if len(question) < 8:
        raise ApiError(400, "Вопрос слишком короткий.")
    status = clean_text(data.get("status"), 20) or "hidden"
    if status not in {"pending", "hidden", "published"}:
        raise ApiError(400, "Нужен статус: pending, hidden или published.")
    if status == "published" and len(answer) < 3:
        raise ApiError(400, "Для публикации нужен ответ.")
    category = make_slug(data.get("category"), "")
    publish_anonymously = bool_or_default(data.get("publish_anonymously"), True)
    now = now_iso()
    admin_name = clean_text(admin.get("display_name") or admin.get("username") or "admin", 80)
    with community_connection() as con:
        author = admin_question_author(con, admin)
        cur = con.execute(
            """
            INSERT INTO public_questions(
                user_id, question, answer, category, publish_anonymously, status,
                created_at, updated_at, answered_at, answered_by
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(author["id"]),
                question,
                answer if answer else None,
                category,
                1 if publish_anonymously else 0,
                status,
                now,
                now,
                now if answer and status in {"hidden", "published"} else None,
                admin_name if answer and status in {"hidden", "published"} else None,
            ),
        )
        fresh = con.execute(
            """
            SELECT q.*, u.nickname, u.display_name, u.trusted, u.blocked, u.created_at user_created_at, u.last_seen
            FROM public_questions q JOIN public_users u ON u.id = q.user_id
            WHERE q.id = ?
            LIMIT 1
            """,
            (int(cur.lastrowid),),
        ).fetchone()
    community_log("public_question_admin_created", int(author["id"]), question_id=int(fresh["id"]), status=status, admin=admin_name)
    return {"ok": True, "question": public_question_payload(fresh, admin, True)}

def _active_access_blocks(con: sqlite3.Connection) -> list[dict[str, Any]]:
    return [
        dict(row)
        for row in con.execute(
            """
            SELECT * FROM public_access_blocks
            WHERE active = 1
            ORDER BY updated_at DESC, id DESC
            """
        ).fetchall()
    ]

def _profile_visit_stats() -> dict[int, dict[str, Any]]:
    today = moscow_day_key()
    start_key = moscow_day_key(moscow_now() - timedelta(days=13))
    stats: dict[int, dict[str, Any]] = {}
    try:
        with FILE_LOCK, site_store_connection() as con:
            rows = con.execute(
                """
                SELECT user_id, day_key, first_seen_at, last_seen_at, pageviews, last_path
                FROM site_visits
                WHERE user_id IS NOT NULL AND day_key >= ? AND role != 'admin'
                ORDER BY day_key DESC, last_seen_at DESC
                """,
                (start_key,),
            ).fetchall()
    except Exception:
        return stats
    for row in rows:
        user_id = int(row["user_id"] or 0)
        if not user_id:
            continue
        item = stats.setdefault(user_id, {
            "visits_14d": 0,
            "pageviews_14d": 0,
            "seconds_14d": 0,
            "today_pageviews": 0,
            "today_seconds": 0,
            "last_path": "",
            "first_seen_at": "",
            "last_seen_at": "",
        })
        item["visits_14d"] += 1
        item["pageviews_14d"] += int(row["pageviews"] or 0)
        first_seen = parse_iso_datetime(row["first_seen_at"])
        last_seen = parse_iso_datetime(row["last_seen_at"])
        seconds = max(0, int((last_seen - first_seen).total_seconds())) if first_seen and last_seen else 0
        item["seconds_14d"] += min(seconds, 8 * 60 * 60)
        if row["day_key"] == today:
            item["today_pageviews"] += int(row["pageviews"] or 0)
            item["today_seconds"] += min(seconds, 8 * 60 * 60)
        if not item["last_seen_at"] or str(row["last_seen_at"] or "") > item["last_seen_at"]:
            item["last_seen_at"] = row["last_seen_at"] or ""
            item["last_path"] = row["last_path"] or ""
        if not item["first_seen_at"] or str(row["first_seen_at"] or "") < item["first_seen_at"]:
            item["first_seen_at"] = row["first_seen_at"] or ""
    return stats

def _block_state_for_user(row: dict[str, Any] | sqlite3.Row, blocks: list[dict[str, Any]]) -> dict[str, Any]:
    item = dict(row)
    email = normalize_public_access_value("email", item.get("email") or "")
    ip = normalize_public_access_value("ip", item.get("last_ip") or "")
    email_block = next((block for block in blocks if block.get("kind") == "email" and block.get("value") == email), None)
    ip_block = next((block for block in blocks if block.get("kind") == "ip" and (block.get("value") == ip or int(block.get("user_id") or 0) == int(item.get("id") or 0))), None)
    return {
        "email_blocked": bool(email_block),
        "ip_blocked": bool(ip_block),
        "email_block_reason": email_block.get("reason") if email_block else "",
        "ip_block_reason": ip_block.get("reason") if ip_block else "",
    }

def _profile_comment_lock_payload(row: dict[str, Any] | sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    locked_until = item.get("comments_locked_until")
    until = parse_iso_datetime(locked_until)
    return {
        "comments_locked": bool(item.get("comments_locked_permanent") or (until and until > datetime.now())),
        "comments_locked_until": locked_until,
        "comments_locked_permanent": bool(item.get("comments_locked_permanent")),
        "comments_locked_reason": item.get("comments_locked_reason") or "",
    }

def admin_profile_payload(row: dict[str, Any] | sqlite3.Row, stats: dict[str, Any] | None = None, blocks: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    item = admin_public_user_payload(row)
    item.update(_profile_comment_lock_payload(row))
    item.update(_block_state_for_user(row, blocks or []))
    item["visit_stats"] = stats or {}
    item["profile_url"] = f"/u/{quote(str(item.get('nickname') or ''))}"
    return item

def admin_profiles(headers: Any) -> dict[str, Any]:
    require_admin(headers)
    visit_stats = _profile_visit_stats()
    with community_connection() as con:
        blocks = _active_access_blocks(con)
        rows = con.execute(
            """
            SELECT u.*,
              (SELECT COUNT(*) FROM public_comments c WHERE c.user_id = u.id) comments_total,
              (SELECT COUNT(*) FROM public_comments c WHERE c.user_id = u.id AND c.status = 'published') comments_published,
              (SELECT COUNT(*) FROM public_comments c WHERE c.user_id = u.id AND c.status = 'pending') comments_pending,
              (SELECT COUNT(*) FROM public_questions q WHERE q.user_id = u.id) questions_total
            FROM public_users u
            WHERE u.deleted_at IS NULL
            ORDER BY COALESCE(u.last_seen, u.created_at) DESC, u.id DESC
            """
        ).fetchall()
    items = [admin_profile_payload(row, visit_stats.get(int(row["id"] or 0), {}), blocks) for row in rows]
    summary = {
        "total": len(items),
        "blocked": sum(1 for item in items if item.get("blocked")),
        "trusted": sum(1 for item in items if item.get("trusted")),
        "locked_comments": sum(1 for item in items if item.get("comments_locked")),
        "needs_change": sum(1 for item in items if item.get("must_change_avatar") or item.get("must_change_nickname")),
    }
    return {"ok": True, "profiles": items, "summary": summary}

def admin_profile_detail(user_id: int, headers: Any) -> dict[str, Any]:
    require_admin(headers)
    visit_stats = _profile_visit_stats()
    with community_connection() as con:
        blocks = _active_access_blocks(con)
        row = con.execute(
            """
            SELECT u.*,
              (SELECT COUNT(*) FROM public_comments c WHERE c.user_id = u.id) comments_total,
              (SELECT COUNT(*) FROM public_comments c WHERE c.user_id = u.id AND c.status = 'published') comments_published,
              (SELECT COUNT(*) FROM public_comments c WHERE c.user_id = u.id AND c.status = 'pending') comments_pending,
              (SELECT COUNT(*) FROM public_questions q WHERE q.user_id = u.id) questions_total
            FROM public_users u
            WHERE u.id = ? AND u.deleted_at IS NULL
            """,
            (int(user_id),),
        ).fetchone()
        if not row:
            raise ApiError(404, "Профиль не найден.")
        comments = con.execute(
            """
            SELECT c.*,
              (SELECT COUNT(*) FROM comment_likes l WHERE l.comment_id = c.id) like_count
            FROM public_comments c
            WHERE c.user_id = ?
            ORDER BY c.created_at DESC, c.id DESC
            """,
            (int(user_id),),
        ).fetchall()
    content = load_content()
    comment_items: list[dict[str, Any]] = []
    for comment in comments:
        item = dict(comment)
        item["target_title"] = public_profile_target_title(content, item.get("target_route") or "", item.get("target_slug") or "")
        item["target_url"] = notification_comment_url(item)
        comment_items.append(item)
    profile = admin_profile_payload(row, visit_stats.get(int(row["id"] or 0), {}), blocks)
    return {"ok": True, "profile": profile, "comments": comment_items}

def _set_public_access_block(
    con: sqlite3.Connection,
    *,
    kind: str,
    value: str,
    user_id: int,
    active: bool,
    reason: str,
    admin_name: str,
) -> None:
    kind = clean_text(kind, 20).lower()
    value = normalize_public_access_value(kind, value)
    if kind not in {"email", "ip"} or not value:
        if active:
            raise ApiError(400, "Нет значения для блокировки.")
        return
    now = now_iso()
    if active:
        con.execute(
            """
            INSERT INTO public_access_blocks(kind, value, user_id, active, reason, created_by, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?, ?, ?)
            ON CONFLICT(kind, value) DO UPDATE SET
              user_id = excluded.user_id,
              active = 1,
              reason = excluded.reason,
              created_by = excluded.created_by,
              updated_at = excluded.updated_at
            """,
            (kind, value, int(user_id), reason, admin_name, now, now),
        )
    else:
        con.execute(
            """
            UPDATE public_access_blocks
            SET active = 0, reason = ?, updated_at = ?
            WHERE kind = ? AND value = ?
            """,
            (reason, now, kind, value),
        )

def _revoke_profile_sessions(user_id: int) -> None:
    try:
        auth = load_auth()
        tokens: list[str] = []
        for token, item in list(auth.get("sessions", {}).items()):
            if item.get("role") == "user" and int(item.get("user_id") or 0) == int(user_id):
                tokens.append(token)
        if tokens:
            site_sessions_delete(tokens)
    except Exception:
        pass

def admin_update_profile(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    admin = require_admin(headers)
    user_id = int(data.get("id") or 0)
    if not user_id:
        raise ApiError(400, "Профиль не выбран.")
    admin_name = clean_text(admin.get("username") or admin.get("display_name") or "admin", 80)
    with community_connection() as con:
        row = con.execute("SELECT * FROM public_users WHERE id = ? AND deleted_at IS NULL", (user_id,)).fetchone()
        if not row:
            raise ApiError(404, "Профиль не найден.")
        is_self = admin.get("role") == "user" and int(admin.get("user_id") or 0) == user_id
        fields: list[str] = []
        params: list[Any] = []
        now = now_iso()
        if "trusted" in data:
            fields.append("trusted = ?")
            params.append(1 if bool(data.get("trusted")) else 0)
        if "blocked" in data:
            blocked = bool(data.get("blocked"))
            if blocked and is_self:
                raise ApiError(400, "Нельзя заблокировать собственный профиль.")
            fields.extend(["blocked = ?", "blocked_at = ?", "blocked_by = ?", "block_reason = ?"])
            params.extend([1 if blocked else 0, now if blocked else None, admin_name if blocked else None, clean_text(data.get("block_reason") or "", 240)])
        if "must_change_avatar" in data:
            fields.append("must_change_avatar = ?")
            params.append(1 if bool(data.get("must_change_avatar")) else 0)
        if "must_change_nickname" in data:
            fields.append("must_change_nickname = ?")
            params.append(1 if bool(data.get("must_change_nickname")) else 0)
        if "moderation_note" in data:
            fields.append("moderation_note = ?")
            params.append(clean_text(data.get("moderation_note") or "", 600))

        lock_mode = clean_text(data.get("comment_lock_mode") or "", 20)
        if lock_mode:
            reason = clean_text(data.get("comments_locked_reason") or "", 240)
            if lock_mode == "none":
                fields.extend(["comments_locked_permanent = ?", "comments_locked_until = ?", "comments_locked_reason = ?", "comments_locked_by = ?", "comments_locked_at = ?"])
                params.extend([0, None, "", None, None])
            elif lock_mode == "permanent":
                fields.extend(["comments_locked_permanent = ?", "comments_locked_until = ?", "comments_locked_reason = ?", "comments_locked_by = ?", "comments_locked_at = ?"])
                params.extend([1, None, reason, admin_name, now])
            elif lock_mode == "until":
                until = clean_text(data.get("comments_locked_until") or "", 30)
                if re.fullmatch(r"\d{4}-\d{2}-\d{2}", until):
                    until = f"{until}T23:59:59"
                if not parse_iso_datetime(until):
                    raise ApiError(400, "Укажите дату ограничения комментариев.")
                fields.extend(["comments_locked_permanent = ?", "comments_locked_until = ?", "comments_locked_reason = ?", "comments_locked_by = ?", "comments_locked_at = ?"])
                params.extend([0, until, reason, admin_name, now])
            else:
                raise ApiError(400, "Неверный режим комментариев.")

        block_reason = clean_text(data.get("block_reason") or data.get("access_block_reason") or "", 240)
        if "email_blocked" in data:
            _set_public_access_block(
                con,
                kind="email",
                value=row["email"],
                user_id=user_id,
                active=bool(data.get("email_blocked")),
                reason=block_reason,
                admin_name=admin_name,
            )
        if "ip_blocked" in data:
            last_ip = normalize_public_access_value("ip", row["last_ip"] if "last_ip" in row.keys() else "")
            _set_public_access_block(
                con,
                kind="ip",
                value=last_ip,
                user_id=user_id,
                active=bool(data.get("ip_blocked")),
                reason=block_reason,
                admin_name=admin_name,
            )
        if fields:
            fields.append("updated_at = ?")
            params.append(now)
            params.append(user_id)
            con.execute(f"UPDATE public_users SET {', '.join(fields)} WHERE id = ?", tuple(params))
    if data.get("blocked"):
        _revoke_profile_sessions(user_id)
    community_log("public_user_admin_updated", user_id, admin=admin_name, action="profile_settings")
    return admin_profile_detail(user_id, headers)

def admin_delete_profile(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    admin = require_admin(headers)
    user_id = int(data.get("id") or 0)
    if not user_id:
        raise ApiError(400, "Профиль не выбран.")
    admin_name = clean_text(admin.get("username") or admin.get("display_name") or "admin", 80)
    with community_connection() as con:
        row = con.execute("SELECT * FROM public_users WHERE id = ? AND deleted_at IS NULL", (user_id,)).fetchone()
        if not row:
            raise ApiError(404, "Профиль не найден.")
        if admin.get("role") == "user" and int(admin.get("user_id") or 0) == user_id:
            raise ApiError(400, "Нельзя удалить собственный профиль.")
        con.execute(
            """
            UPDATE public_users
            SET blocked = 1, blocked_at = COALESCE(blocked_at, ?), blocked_by = COALESCE(blocked_by, ?),
                deleted_at = ?, deleted_by = ?, updated_at = ?
            WHERE id = ?
            """,
            (now_iso(), admin_name, now_iso(), admin_name, now_iso(), user_id),
        )
    _revoke_profile_sessions(user_id)
    community_log("public_user_deleted", user_id, admin=admin_name)
    return admin_profiles(headers)

def admin_public_user_payload(row: dict[str, Any] | sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    for key in ("password_salt", "password_hash", "password_algorithm"):
        item.pop(key, None)
    item["has_password"] = bool(item.get("password_set_at"))
    return item

def admin_community_summary() -> dict[str, Any]:
    with community_connection() as con:
        pending_comments = con.execute(
            """
            SELECT c.*, u.nickname, u.display_name FROM public_comments c
            JOIN public_users u ON u.id = c.user_id
            WHERE c.status = 'pending'
            ORDER BY c.created_at ASC LIMIT 50
            """
        ).fetchall()
        pending_questions = con.execute(
            """
            SELECT q.*, u.nickname, u.display_name FROM public_questions q
            JOIN public_users u ON u.id = q.user_id
            WHERE q.status = 'pending'
            ORDER BY q.created_at ASC LIMIT 50
            """
        ).fetchall()
        users = con.execute(
            """
            SELECT u.*,
              (SELECT COUNT(*) FROM public_comments c WHERE c.user_id = u.id) comments_total,
              (SELECT COUNT(*) FROM public_comments c WHERE c.user_id = u.id AND c.status = 'published') comments_published,
              (SELECT COUNT(*) FROM public_questions q WHERE q.user_id = u.id) questions_total,
              (SELECT COUNT(*) FROM public_questions q WHERE q.user_id = u.id AND q.status = 'published') questions_published
            FROM public_users u
            WHERE u.deleted_at IS NULL
            ORDER BY u.created_at DESC, u.id DESC
            """
        ).fetchall()
        events = con.execute("SELECT * FROM community_events ORDER BY created_at DESC LIMIT 80").fetchall()
    content = load_content()
    pending_comment_items: list[dict[str, Any]] = []
    for row in pending_comments:
        item = dict(row)
        item["target_title"] = public_profile_target_title(content, item.get("target_route") or "", item.get("target_slug") or "")
        item["target_url"] = notification_comment_url(item)
        pending_comment_items.append(item)
    return {
        "smtp": community_status(),
        "pending_comments": pending_comment_items,
        "pending_questions": [dict(row) for row in pending_questions],
        "users": [admin_public_user_payload(row) for row in users],
        "events": [dict(row) for row in events],
    }

def moderate_public_comment(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    admin = require_admin(headers)
    comment_id = int(data.get("id") or 0)
    status = clean_text(data.get("status"), 20)
    if status not in {"published", "hidden", "rejected"}:
        raise ApiError(400, "Нужен статус: published, hidden или rejected.")
    with community_connection() as con:
        row = con.execute("SELECT * FROM public_comments WHERE id = ?", (comment_id,)).fetchone()
        if not row:
            raise ApiError(404, "Комментарий не найден.")
        con.execute("UPDATE public_comments SET status = ?, updated_at = ?, moderated_at = ?, moderated_by = ? WHERE id = ?", (status, now_iso(), now_iso(), admin.get("username"), comment_id))
        if status == "published" and row["status"] != "published":
            increment_approved_actions(con, int(row["user_id"]))
        clear_review_notification(con, "comment_moderation", comment_id)
        fresh = con.execute("SELECT * FROM public_comments WHERE id = ?", (comment_id,)).fetchone()
        if status == "published" and row["status"] != "published":
            notify_comment_published(con, fresh, int(fresh["user_id"]))
        payload = public_comment_payload(fresh, admin, con=con)
    community_log("public_comment_moderated", int(row["user_id"]), comment_id=comment_id, status=status, admin=admin.get("username"))
    return {"ok": True, "comment": payload}

def answer_public_question(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    admin = require_admin(headers)
    question_id = int(data.get("id") or 0)
    question_input = data.get("question")
    answer = clean_text(data.get("answer"), 5000)
    status = clean_text(data.get("status"), 20) or "published"
    if status not in {"pending", "published", "hidden", "rejected"}:
        raise ApiError(400, "Нужен статус: pending, published, hidden или rejected.")
    if status == "published" and len(answer) < 3:
        raise ApiError(400, "Для публикации нужен ответ.")
    with community_connection() as con:
        row = con.execute("SELECT * FROM public_questions WHERE id = ?", (question_id,)).fetchone()
        if not row:
            raise ApiError(404, "Вопрос не найден.")
        question = clean_text(question_input, 2000) if question_input is not None else clean_text(row["question"], 2000)
        if status != "rejected" and len(question) < 8:
            raise ApiError(400, "Вопрос слишком короткий.")
        category = make_slug(data.get("category"), "") if "category" in data else clean_text(row["category"] if "category" in row.keys() else "", 120)
        publish_anonymously = bool_or_default(data.get("publish_anonymously"), bool(row["publish_anonymously"] if "publish_anonymously" in row.keys() else False))
        now = now_iso()
        admin_name = clean_text(admin.get("display_name") or admin.get("username") or "admin", 80)
        answered_at = now if answer and status in {"hidden", "published"} else None
        answered_by = admin_name if answer else None
        con.execute(
            "UPDATE public_questions SET question = ?, answer = ?, category = ?, status = ?, publish_anonymously = ?, updated_at = ?, answered_at = ?, answered_by = ? WHERE id = ?",
            (question, answer if answer else None, category, status, 1 if publish_anonymously else 0, now, answered_at, answered_by, question_id),
        )
        if status == "published" and row["status"] != "published":
            increment_approved_actions(con, int(row["user_id"]))
        clear_review_notification(con, "question_moderation", question_id)
        fresh = dict(con.execute("SELECT * FROM public_questions WHERE id = ?", (question_id,)).fetchone())
        if status == "published" and row["status"] != "published":
            notify_question_answered(con, fresh, int(admin.get("user_id") or 0) or None)
    community_log("public_question_answered", int(row["user_id"]), question_id=question_id, status=status, admin=admin.get("username"))
    return {"ok": True, "question": fresh}

def update_public_user_admin(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    admin = require_admin(headers)
    user_id = int(data.get("id") or 0)
    trusted = data.get("trusted")
    blocked = data.get("blocked")
    site_admin = data.get("site_admin")
    fields = []
    params: list[Any] = []
    if trusted is not None:
        fields.append("trusted = ?")
        params.append(1 if bool(trusted) else 0)
    if blocked is not None:
        fields.append("blocked = ?")
        params.append(1 if bool(blocked) else 0)
    if site_admin is not None:
        fields.append("site_admin = ?")
        params.append(1 if bool(site_admin) else 0)
        fields.append("site_admin_granted_at = ?")
        params.append(now_iso() if bool(site_admin) else None)
    if not fields:
        raise ApiError(400, "Нет изменений.")
    fields.append("updated_at = ?")
    params.append(now_iso())
    params.append(user_id)
    with community_connection() as con:
        con.execute(f"UPDATE public_users SET {', '.join(fields)} WHERE id = ?", tuple(params))
        row = con.execute("SELECT * FROM public_users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise ApiError(404, "Пользователь не найден.")
    community_log("public_user_admin_updated", user_id, admin=admin.get("username"), trusted=trusted, blocked=blocked, site_admin=site_admin)
    return {"ok": True, "user": public_community_user(row, {"role": "admin"})}

__all__ = ['normalize_nickname', 'unique_nickname', 'public_user_row', 'public_user_by_trebnik_client_id', 'public_community_user', 'public_profile_privacy_payload', 'public_account_payload', 'normalize_public_access_value', 'public_access_block_reason', 'ensure_public_access_allowed', 'require_public_user', 'community_log', 'touch_public_user', 'comment_restriction_message', 'public_comment_payload', 'ensure_material_target', 'ensure_discussion_target', 'create_community_notification', 'subscription_token', 'subscription_title', 'subscription_url', 'subscription_payload', 'normalize_subscription_target', 'ensure_subscription', 'subscription_rows_for_targets', 'community_subscriptions', 'set_community_subscription', 'unsubscribe_community_email', 'notification_payload', 'community_notifications', 'mark_community_notifications_read', 'community_messages_summary', 'community_messages', 'save_community_message_attachment_upload', 'community_message_attachment_stream', 'save_community_message', 'admin_review_recipients', 'notify_comment_needs_moderation', 'notify_question_needs_answer', 'notify_comment_published', 'update_comment_like_notification', 'notify_question_answered', 'published_material_map', 'notify_new_published_materials', 'increment_approved_actions', 'update_public_profile', 'update_public_account', 'public_profile_target_title', 'public_profile_status_label', 'public_profile_activity', 'own_profile_activity', 'community_profile', 'hide_public_profile_activity', 'community_comments', 'save_public_comment', 'like_public_comment', 'public_comment_likes', 'like_publication', 'public_publication_likes', 'public_questions_feed', 'public_question_answerer', 'public_question_payload', 'public_question_detail', 'public_questions_count', 'save_public_question', 'admin_question_author', 'create_public_question_admin', 'admin_profile_payload', 'admin_profiles', 'admin_profile_detail', 'admin_update_profile', 'admin_delete_profile', 'admin_public_user_payload', 'admin_community_summary', 'moderate_public_comment', 'answer_public_question', 'update_public_user_admin']
