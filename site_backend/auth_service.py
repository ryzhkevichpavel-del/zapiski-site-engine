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

def hash_password(password: str, salt_hex: str | None = None) -> dict[str, str]:
    salt = bytes.fromhex(salt_hex) if salt_hex else secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 140_000)
    return {"salt": salt.hex(), "hash": digest.hex(), "algorithm": "pbkdf2_sha256"}

def verify_password(password: str, stored: dict[str, str]) -> bool:
    if not stored or not stored.get("salt") or not stored.get("hash"):
        return False
    candidate = hash_password(password, stored["salt"])["hash"]
    return hmac.compare_digest(candidate, stored["hash"])

def clean_public_password(value: Any) -> str:
    password = str(value or "")
    if len(password) < 8:
        raise ApiError(400, "Пароль должен быть не короче 8 символов.")
    if len(password) > 200:
        raise ApiError(400, "Пароль слишком длинный.")
    return password

def public_password_hash(row: dict[str, Any] | sqlite3.Row | None) -> dict[str, str]:
    item = dict(row or {})
    return {
        "salt": item.get("password_salt") or "",
        "hash": item.get("password_hash") or "",
        "algorithm": item.get("password_algorithm") or "pbkdf2_sha256",
    }

def public_user_has_password(row: dict[str, Any] | sqlite3.Row | None) -> bool:
    item = dict(row or {})
    return bool(item.get("password_salt") and item.get("password_hash"))

def set_public_user_password(con: sqlite3.Connection, user_id: int, password: str) -> None:
    hashed = hash_password(clean_public_password(password))
    con.execute(
        """
        UPDATE public_users
        SET password_salt = ?, password_hash = ?, password_algorithm = ?, password_set_at = ?, updated_at = ?
        WHERE id = ?
        """,
        (hashed["salt"], hashed["hash"], hashed["algorithm"], now_iso(), now_iso(), int(user_id)),
    )

def default_auth() -> dict[str, Any]:
    return {"created_at": now_iso(), "admins": {}, "clients": {}, "invites": {}, "sessions": {}}

def normalize_auth_store(data: Any) -> tuple[dict[str, Any], bool]:
    if not isinstance(data, dict):
        data = default_auth()
        changed = True
    else:
        changed = False
    for key in ("admins", "clients", "invites", "sessions"):
        if not isinstance(data.get(key), dict):
            data[key] = {}
            changed = True
    if not data.get("created_at"):
        data["created_at"] = now_iso()
        changed = True
    # v5 deliberately drops old sessions without expiry so upgrades do not keep stale tokens alive.
    for token, item in list(data.get("sessions", {}).items()):
        if not isinstance(item, dict) or not item.get("expires_at"):
            data["sessions"].pop(token, None)
            changed = True
    return data, changed

def _auth_metadata(data: dict[str, Any]) -> dict[str, Any]:
    clean = dict(data)
    clean["sessions"] = {}
    return clean

def _valid_session_item(item: Any) -> bool:
    return isinstance(item, dict) and bool(item.get("expires_at"))

def _session_items(data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for token, item in data.get("sessions", {}).items():
        if isinstance(token, str) and token and _valid_session_item(item):
            result[token] = dict(item)
    return result

def _migrate_auth_sessions(sessions: dict[str, Any]) -> bool:
    changed = False
    for token, item in sessions.items():
        if _valid_session_item(item):
            site_session_upsert(token, item)
            changed = True
    return changed

def save_auth_session(token: str, item: dict[str, Any]) -> None:
    if _valid_session_item(item):
        site_session_upsert(token, item)

def delete_auth_session(token: str) -> None:
    site_session_delete(token)

def load_auth() -> dict[str, Any]:
    data = site_store_get("auth")
    migrated = data is None
    if migrated:
        data = read_protected_json(AUTH_FILE, default_auth(), AUTH_BACKUP_DIR, "доступов") if AUTH_FILE.exists() else default_auth()
    data, changed = normalize_auth_store(data)
    stored_sessions = _session_items(data)
    if stored_sessions:
        _migrate_auth_sessions(stored_sessions)
        data["sessions"] = {}
        changed = True
    sessions = site_sessions_all()
    for token, item in list(sessions.items()):
        if not _valid_session_item(item):
            site_session_delete(token)
            sessions.pop(token, None)
            changed = True
    data["sessions"] = sessions
    if changed:
        site_store_set("auth", _auth_metadata(data))
    elif migrated:
        site_store_set("auth", _auth_metadata(data))
    return data

def save_auth(data: dict[str, Any]) -> None:
    data, _ = normalize_auth_store(data)
    for token, item in _session_items(data).items():
        save_auth_session(token, item)
    site_store_set("auth", _auth_metadata(data))

def admin_exists() -> bool:
    return bool(load_auth().get("admins"))

def setup_key() -> str | None:
    if admin_exists():
        return None
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with FILE_LOCK:
        if SETUP_KEY_FILE.exists():
            key = SETUP_KEY_FILE.read_text("utf-8").strip()
            if len(key) >= 16:
                return key
        key = secrets.token_urlsafe(24)
        SETUP_KEY_FILE.write_text(key, "utf-8")
        return key

def clear_setup_key() -> None:
    with FILE_LOCK:
        try:
            SETUP_KEY_FILE.unlink()
        except FileNotFoundError:
            pass

def public_client(client: dict[str, Any] | None) -> dict[str, Any] | None:
    if not client:
        return None
    hidden = {"telegram_id", "invite_token", "invite_used"}
    return {key: value for key, value in client.items() if key not in hidden}

def cookie_value(headers: Any, name: str) -> str:
    raw = headers.get("Cookie") or ""
    if not raw:
        return ""
    try:
        cookies = SimpleCookie()
        cookies.load(raw)
        morsel = cookies.get(name)
        return unquote(morsel.value) if morsel else ""
    except Exception:
        return ""

def session_token(headers: Any) -> str:
    return cookie_value(headers, SESSION_COOKIE_NAME)

def session(headers: Any) -> dict[str, Any] | None:
    token = session_token(headers)
    if not token:
        return None
    item = site_session_get(token)
    if not item:
        return None

    if item.get("role") == "client":
        delete_auth_session(token)
        log_event("legacy_client_session_disabled", username=item.get("username"), client_id=item.get("client_id"))
        return None

    now = datetime.now()
    expires_at = parse_iso_datetime(item.get("expires_at"))
    if expires_at and expires_at < now:
        delete_auth_session(token)
        log_event("session_expired", role=item.get("role"), username=item.get("username"), client_id=item.get("client_id"))
        return None

    item = dict(item)
    item["token"] = token
    if item.get("role") == "user":
        user_row = public_user_row(int(item.get("user_id") or 0))
        if not user_row or user_row.get("blocked") or user_row.get("deleted_at"):
            delete_auth_session(token)
            return None
        item["username"] = user_row.get("nickname")
        item["nickname"] = user_row.get("nickname")
        item["display_name"] = user_row.get("display_name")
        item["avatar_url"] = user_row.get("avatar_url") or ""
        item["avatar_updated_at"] = user_row.get("avatar_updated_at")
        item["notification_email_enabled"] = bool(user_row.get("notification_email_enabled", 1))
        item["profile_guest_visible"] = bool(user_row.get("profile_guest_visible", 1))
        item["show_online_status"] = bool(user_row.get("show_online_status", 0))
        item["show_public_activity"] = bool(user_row.get("show_public_activity", 1))
        item["trusted"] = bool(user_row.get("trusted"))
        item["site_admin"] = bool(user_row.get("site_admin"))
        item["must_change_avatar"] = bool(user_row.get("must_change_avatar"))
        item["must_change_nickname"] = bool(user_row.get("must_change_nickname"))
        item["trebnik_client_id"] = user_row.get("trebnik_client_id")
        item["client_id"] = user_row.get("trebnik_client_id")
        item["trebnik_linked_at"] = user_row.get("trebnik_linked_at")
        item["trebnik_linked_by"] = user_row.get("trebnik_linked_by")
    last_seen_dt = parse_iso_datetime(item.get("last_seen"))
    if not last_seen_dt or (now - last_seen_dt).total_seconds() >= SESSION_TOUCH_WINDOW_SECONDS:
        item["last_seen"] = now_iso()
        save_auth_session(token, {key: value for key, value in item.items() if key != "token"})
        if item.get("role") == "user":
            touch_public_user(int(item.get("user_id") or 0), request_ip(headers))
    return item

def require_session(headers: Any) -> dict[str, Any]:
    item = session(headers)
    if not item:
        raise ApiError(401, "Нужен вход.")
    return item

def is_admin_session(item: dict[str, Any] | None) -> bool:
    return bool(item and (item.get("role") == "admin" or (item.get("role") == "user" and item.get("site_admin"))))

def require_admin(headers: Any) -> dict[str, Any]:
    item = require_session(headers)
    if not is_admin_session(item):
        raise ApiError(403, "Нужен вход администратора.")
    return item

def require_client_or_admin(headers: Any, client_id: int) -> dict[str, Any]:
    item = require_session(headers)
    if is_admin_session(item):
        return item
    if item.get("role") == "user" and int(item.get("trebnik_client_id") or 0) == int(client_id):
        return item
    raise ApiError(403, "Этот кабинет не открыт для вашего профиля.")

def session_trebnik_client_id(item: dict[str, Any] | None) -> int:
    if not item or item.get("role") != "user":
        return 0
    return int(item.get("trebnik_client_id") or 0)

def require_trebnik_client_session(headers: Any) -> tuple[dict[str, Any], int]:
    item = require_session(headers)
    if is_admin_session(item):
        raise ApiError(403, "Предпросмотр клиента открыт только для просмотра.")
    client_id = session_trebnik_client_id(item)
    if not client_id:
        raise ApiError(403, "Кабинет Требника ещё не открыт для этого профиля.")
    return item, client_id

def public_user(item: dict[str, Any] | None) -> dict[str, Any] | None:
    if not item:
        return None
    user = {
        "role": item.get("role"),
        "username": item.get("username"),
        "display_name": item.get("display_name") or item.get("username"),
        "created_at": item.get("created_at"),
        "last_seen": item.get("last_seen"),
        "expires_at": item.get("expires_at"),
    }
    if item.get("role") == "client":
        user["client_id"] = item.get("client_id")
    if item.get("role") == "user":
        trebnik_client_id = item.get("trebnik_client_id")
        user["user_id"] = item.get("user_id")
        user["nickname"] = item.get("nickname") or item.get("username")
        user["avatar_url"] = item.get("avatar_url") or ""
        user["avatar_updated_at"] = item.get("avatar_updated_at")
        user["notification_email_enabled"] = bool(item.get("notification_email_enabled", True))
        user["profile_guest_visible"] = bool(item.get("profile_guest_visible", True))
        user["show_online_status"] = bool(item.get("show_online_status", False))
        user["show_public_activity"] = bool(item.get("show_public_activity", True))
        user["trusted"] = bool(item.get("trusted"))
        user["site_admin"] = bool(item.get("site_admin"))
        user["must_change_avatar"] = bool(item.get("must_change_avatar"))
        user["must_change_nickname"] = bool(item.get("must_change_nickname"))
        user["trebnik_client_id"] = trebnik_client_id
        user["trebnik_linked_at"] = item.get("trebnik_linked_at")
        user["trebnik_linked_by"] = item.get("trebnik_linked_by")
        if trebnik_client_id:
            user["client_id"] = trebnik_client_id
        user["profile_url"] = f"/u/{quote(str(item.get('nickname') or item.get('username') or ''))}"
    return user

def rate_limit(headers: Any, bucket: str) -> None:
    raw_ip = getattr(headers, "get", lambda _key, _default=None: _default)("X-Forwarded-For", "") or ""
    ip = raw_ip.split(",", 1)[0].strip() or "local"
    key = f"{bucket}:{ip}"
    now = datetime.now()
    window = timedelta(seconds=AUTH_RATE_WINDOW_SECONDS)
    attempts = [item for item in AUTH_ATTEMPTS.get(key, []) if now - item < window]
    if len(attempts) >= AUTH_RATE_MAX_ATTEMPTS:
        raise ApiError(429, "Слишком много попыток. Подождите и попробуйте снова.")
    attempts.append(now)
    AUTH_ATTEMPTS[key] = attempts

def auth_summary() -> dict[str, Any]:
    auth = load_auth()
    sessions = []
    now = datetime.now()
    expired_tokens: list[str] = []
    for token, item in list(auth.get("sessions", {}).items()):
        expires_at = parse_iso_datetime(item.get("expires_at"))
        if expires_at and expires_at < now:
            expired_tokens.append(token)
            continue
        sessions.append({
            "token_tail": token[-6:],
            "role": item.get("role"),
            "username": item.get("username"),
            "display_name": item.get("display_name"),
            "client_id": item.get("client_id"),
            "user_id": item.get("user_id"),
            "created_at": item.get("created_at"),
            "last_seen": item.get("last_seen"),
            "expires_at": item.get("expires_at"),
        })
    if expired_tokens:
        site_sessions_delete(expired_tokens)
    clients = []
    for username, item in auth.get("clients", {}).items():
        clients.append({
            "username": username,
            "display_name": item.get("display_name"),
            "client_id": item.get("client_id"),
            "created_at": item.get("created_at"),
            "invite_token_tail": str(item.get("invite_token") or "")[-6:],
        })
    admins = [{"username": username, "display_name": item.get("display_name"), "created_at": item.get("created_at")} for username, item in auth.get("admins", {}).items()]
    invites = []
    for token, item in auth.get("invites", {}).items():
        invites.append({
            "token_tail": token[-6:],
            "client_id": item.get("client_id"),
            "client_name": item.get("client_name"),
            "created_at": item.get("created_at"),
            "created_by": item.get("created_by"),
            "used_by": item.get("used_by"),
            "used_at": item.get("used_at"),
            "expires_at": item.get("expires_at"),
        })
    return {"admins": admins, "client_accounts": clients, "sessions": sessions, "invites": invites}

def create_session(auth: dict[str, Any], role: str, username: str, account: dict[str, Any]) -> dict[str, Any]:
    token = secrets.token_urlsafe(32)
    now = datetime.now()
    expires_at = (now + timedelta(hours=SESSION_TTL_HOURS)).isoformat(timespec="seconds")
    sess = {
        "role": role,
        "username": username,
        "display_name": account.get("display_name") or username,
        "client_id": account.get("client_id"),
        "created_at": now_iso(),
        "last_seen": now_iso(),
        "expires_at": expires_at,
    }
    auth["sessions"][token] = sess
    save_auth(auth)
    log_event("login", role=role, username=username, client_id=account.get("client_id"))
    return {"ok": True, "token": token, "user": public_user(sess), "expires_at": expires_at}

def create_public_session(user: dict[str, Any]) -> dict[str, Any]:
    auth = load_auth()
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now() + timedelta(hours=SESSION_TTL_HOURS)).isoformat(timespec="seconds")
    sess = {
        "role": "user",
        "username": user.get("nickname"),
        "nickname": user.get("nickname"),
        "display_name": user.get("display_name") or user.get("nickname"),
        "avatar_url": user.get("avatar_url") or "",
        "avatar_updated_at": user.get("avatar_updated_at"),
        "notification_email_enabled": bool(user.get("notification_email_enabled", True)),
        "profile_guest_visible": bool(user.get("profile_guest_visible", True)),
        "show_online_status": bool(user.get("show_online_status", False)),
        "show_public_activity": bool(user.get("show_public_activity", True)),
        "user_id": user.get("id"),
        "trusted": bool(user.get("trusted")),
        "site_admin": bool(user.get("site_admin")),
        "must_change_avatar": bool(user.get("must_change_avatar")),
        "must_change_nickname": bool(user.get("must_change_nickname")),
        "trebnik_client_id": user.get("trebnik_client_id"),
        "client_id": user.get("trebnik_client_id"),
        "trebnik_linked_at": user.get("trebnik_linked_at"),
        "trebnik_linked_by": user.get("trebnik_linked_by"),
        "created_at": now_iso(),
        "last_seen": now_iso(),
        "expires_at": expires_at,
    }
    auth.setdefault("sessions", {})[token] = sess
    save_auth(auth)
    touch_public_user(int(user.get("id") or 0))
    community_log("public_login", int(user.get("id") or 0))
    return {"ok": True, "token": token, "user": public_user(sess), "expires_at": expires_at}

def setup_admin(data: dict[str, Any]) -> dict[str, Any]:
    auth = load_auth()
    if auth.get("admins"):
        raise ApiError(409, "Администратор уже создан.")
    expected_key = setup_key()
    provided_key = str(data.get("setup_key") or "").strip()
    if not expected_key or not hmac.compare_digest(provided_key, expected_key):
        log_event("setup_failed")
        raise ApiError(403, "Неверный ключ первичной настройки.")
    username = str(data.get("username") or "").strip()
    password = str(data.get("password") or "")
    display_name = str(data.get("display_name") or username).strip() or username
    if len(username) < 3:
        raise ApiError(400, "Логин должен быть не короче 3 символов.")
    if len(password) < 8:
        raise ApiError(400, "Пароль должен быть не короче 8 символов.")
    auth["admins"][username] = {"display_name": display_name, "password": hash_password(password), "created_at": now_iso()}
    clear_setup_key()
    log_event("admin_created", username=username)
    return create_session(auth, "admin", username, auth["admins"][username])

def login_api(data: dict[str, Any]) -> dict[str, Any]:
    role = str(data.get("role") or "").strip().lower()
    username = str(data.get("username") or "").strip()
    password = str(data.get("password") or "")
    if role == "client":
        raise ApiError(410, "Старый вход в Требник отключен. Войдите обычным профилем сайта.")
    if role != "admin" or not username or not password:
        raise ApiError(400, "Введите роль, логин и пароль.")
    auth = load_auth()
    if role == "admin" and not auth.get("admins"):
        raise ApiError(403, "Сначала создайте администратора.")
    account = (auth["admins"] if role == "admin" else auth["clients"]).get(username)
    if not account or not verify_password(password, account.get("password") or {}):
        raise ApiError(401, "Неверный логин или пароль.")
    return create_session(auth, role, username, account)

def register_client(data: dict[str, Any]) -> dict[str, Any]:
    raise ApiError(410, "Активация по ссылке отключена. Доступ к Требнику открывает администратор.")

def public_code_message(purpose: str, code: str) -> tuple[str, str]:
    if purpose == "register":
        return (
            "Код регистрации на katuonela.ru",
            f"Код регистрации: {code}\n\nОн действует {PUBLIC_LOGIN_CODE_TTL_MINUTES} минут. Если вы не регистрировались на сайте, просто проигнорируйте письмо.",
        )
    if purpose == "reset":
        return (
            "Восстановление пароля на katuonela.ru",
            f"Код восстановления пароля: {code}\n\nОн действует {PUBLIC_LOGIN_CODE_TTL_MINUTES} минут. Если вы не запрашивали восстановление, просто проигнорируйте письмо.",
        )
    return (
        "Код входа на katuonela.ru",
        f"Код входа: {code}\n\nОн действует {PUBLIC_LOGIN_CODE_TTL_MINUTES} минут. Если вы не запрашивали вход, просто проигнорируйте письмо.",
    )

def create_public_auth_code(email: str, purpose: str, accepted_legal_at: str | None = None, headers: Any | None = None) -> dict[str, Any]:
    code = f"{secrets.randbelow(1_000_000):06d}"
    hashed = hash_password(code)
    expires_at = (datetime.now() + timedelta(minutes=PUBLIC_LOGIN_CODE_TTL_MINUTES)).isoformat(timespec="seconds")
    with community_connection() as con:
        con.execute(
            """
            INSERT INTO login_codes(email, code_salt, code_hash, created_at, expires_at, purpose, accepted_legal_at, ip)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (email, hashed["salt"], hashed["hash"], now_iso(), expires_at, purpose, accepted_legal_at, request_ip(headers or {})),
        )
    subject, body = public_code_message(purpose, code)
    send_site_email(email, subject, body)
    return {"ok": True, "message": "Код отправлен на почту.", "expires_at": expires_at}

def consume_public_auth_code(con: sqlite3.Connection, email: str, code: str, purpose: str) -> sqlite3.Row:
    if not re.fullmatch(r"\d{6}", code):
        raise ApiError(400, "Введите шестизначный код из письма.")
    row = con.execute(
        """
        SELECT * FROM login_codes
        WHERE email = ? AND purpose = ? AND used_at IS NULL
        ORDER BY created_at DESC LIMIT 1
        """,
        (email, purpose),
    ).fetchone()
    if not row:
        raise ApiError(404, "Код не найден. Запросите новый код.")
    expires_at = parse_iso_datetime(row["expires_at"])
    if not expires_at or expires_at < datetime.now():
        raise ApiError(410, "Код устарел. Запросите новый.")
    if int(row["attempts"] or 0) >= 5:
        raise ApiError(429, "Слишком много неверных попыток. Запросите новый код.")
    stored = {"salt": row["code_salt"], "hash": row["code_hash"], "algorithm": "pbkdf2_sha256"}
    if not verify_password(code, stored):
        con.execute("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?", (row["id"],))
        con.commit()
        raise ApiError(401, "Неверный код.")
    con.execute("UPDATE login_codes SET used_at = ? WHERE id = ?", (now_iso(), row["id"]))
    return row

def create_public_auth_token(con: sqlite3.Connection, email: str, purpose: str, accepted_legal_at: str | None = None) -> str:
    token = secrets.token_urlsafe(32)
    hashed = hash_password(token)
    expires_at = (datetime.now() + timedelta(minutes=PUBLIC_LOGIN_CODE_TTL_MINUTES)).isoformat(timespec="seconds")
    con.execute(
        """
        INSERT INTO public_auth_tokens(email, token_salt, token_hash, purpose, accepted_legal_at, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (email, hashed["salt"], hashed["hash"], purpose, accepted_legal_at, now_iso(), expires_at),
    )
    return token

def consume_public_auth_token(con: sqlite3.Connection, email: str, token: str, purpose: str) -> sqlite3.Row:
    if not token:
        raise ApiError(400, "Сначала подтвердите код из письма.")
    rows = con.execute(
        """
        SELECT * FROM public_auth_tokens
        WHERE email = ? AND purpose = ? AND used_at IS NULL
        ORDER BY created_at DESC LIMIT 8
        """,
        (email, purpose),
    ).fetchall()
    for row in rows:
        expires_at = parse_iso_datetime(row["expires_at"])
        if not expires_at or expires_at < datetime.now():
            continue
        stored = {"salt": row["token_salt"], "hash": row["token_hash"], "algorithm": "pbkdf2_sha256"}
        if verify_password(token, stored):
            con.execute("UPDATE public_auth_tokens SET used_at = ? WHERE id = ?", (now_iso(), row["id"]))
            return row
    raise ApiError(401, "Подтверждение устарело. Запросите новый код.")

def request_public_registration_code(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    rate_limit(headers, "public-register-code")
    if not smtp_configured():
        raise ApiError(503, "Регистрация пока закрыта: на сервере не настроена отправка почты.")
    email = clean_email(data.get("email"))
    ensure_public_access_allowed(headers, email)
    accepted_legal = bool(data.get("accepted_legal"))
    if not accepted_legal:
        raise ApiError(400, "Нужно принять правила сайта и согласие на обработку данных.")
    with community_connection() as con:
        user = con.execute("SELECT * FROM public_users WHERE email = ?", (email,)).fetchone()
        if user and (user["blocked"] or user["deleted_at"]):
            raise ApiError(403, "Этот профиль заблокирован.")
        if user and public_user_has_password(user):
            raise ApiError(409, "Аккаунт с такой почтой уже есть. Войдите по паролю или восстановите пароль.")
    payload = create_public_auth_code(email, "register", accepted_legal_at=now_iso(), headers=headers)
    community_log("public_registration_code_requested", None, email=email)
    return payload

def verify_public_registration_code(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    rate_limit(headers, "public-register-verify")
    email = clean_email(data.get("email"))
    ensure_public_access_allowed(headers, email)
    code = str(data.get("code") or "").strip()
    with community_connection() as con:
        user = con.execute("SELECT * FROM public_users WHERE email = ?", (email,)).fetchone()
        if user and (user["blocked"] or user["deleted_at"]):
            raise ApiError(403, "Этот профиль заблокирован.")
        if user and public_user_has_password(user):
            raise ApiError(409, "Аккаунт с такой почтой уже есть. Войдите по паролю или восстановите пароль.")
        code_row = consume_public_auth_code(con, email, code, "register")
        registration_token = create_public_auth_token(con, email, "register_details", code_row["accepted_legal_at"] or now_iso())
    return {"ok": True, "registration_token": registration_token, "email": email}

def complete_public_registration(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    rate_limit(headers, "public-register-complete")
    email = clean_email(data.get("email"))
    ensure_public_access_allowed(headers, email)
    registration_token = str(data.get("registration_token") or "").strip()
    password = clean_public_password(data.get("password"))
    password_confirm = str(data.get("password_confirm") or data.get("password") or "")
    if password_confirm != password:
        raise ApiError(400, "Пароли не совпадают.")
    display_name = clean_text(data.get("display_name"), 80)
    if len(display_name) < 2:
        raise ApiError(400, "Публичное имя должно быть не короче 2 символов.")
    requested_nick = clean_text(data.get("nickname"), 40)
    registered_event: dict[str, Any] | None = None
    with community_connection() as con:
        existing = con.execute("SELECT * FROM public_users WHERE email = ?", (email,)).fetchone()
        if existing and (existing["blocked"] or existing["deleted_at"]):
            raise ApiError(403, "Этот профиль заблокирован.")
        if existing and public_user_has_password(existing):
            raise ApiError(409, "Аккаунт с такой почтой уже есть. Войдите по паролю или восстановите пароль.")
        token_row = consume_public_auth_token(con, email, registration_token, "register_details")
        if existing:
            nickname = normalize_nickname(requested_nick or display_name or existing["nickname"], email.split("@", 1)[0])
            same = con.execute("SELECT id FROM public_users WHERE nickname = ? AND id != ?", (nickname, existing["id"])).fetchone()
            if same:
                nickname = unique_nickname(con, nickname)
            con.execute(
                """
                UPDATE public_users
                SET display_name = ?, nickname = ?, accepted_legal_at = COALESCE(accepted_legal_at, ?), updated_at = ?, last_seen = ?
                    , last_ip = ?
                WHERE id = ?
                """,
                (display_name, nickname, token_row["accepted_legal_at"] or now_iso(), now_iso(), now_iso(), request_ip(headers), existing["id"]),
            )
            set_public_user_password(con, int(existing["id"]), password)
            user = con.execute("SELECT * FROM public_users WHERE id = ?", (existing["id"],)).fetchone()
        else:
            nickname = unique_nickname(con, requested_nick or display_name or email.split("@", 1)[0])
            hashed = hash_password(password)
            con.execute(
                """
                INSERT INTO public_users(email, nickname, display_name, password_salt, password_hash, password_algorithm, password_set_at, accepted_legal_at, created_at, updated_at, last_seen, last_ip)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (email, nickname, display_name, hashed["salt"], hashed["hash"], hashed["algorithm"], now_iso(), token_row["accepted_legal_at"] or now_iso(), now_iso(), now_iso(), now_iso(), request_ip(headers)),
            )
            user = con.execute("SELECT * FROM public_users WHERE email = ?", (email,)).fetchone()
            registered_event = {"user_id": int(user["id"]), "email": email, "nickname": nickname}
        user_dict = dict(user)
    if registered_event:
        community_log("public_user_registered", registered_event["user_id"], email=registered_event["email"], nickname=registered_event["nickname"])
    else:
        community_log("public_user_password_set", int(user_dict["id"]), email=email)
    return create_public_session(user_dict)

def login_public_password(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    rate_limit(headers, "public-password-login")
    identifier = clean_text(data.get("login") or data.get("email") or data.get("username"), 180).lower()
    password = str(data.get("password") or "")
    if not identifier or not password:
        raise ApiError(400, "Введите почту и пароль.")
    if "@" in identifier:
        ensure_public_access_allowed(headers, identifier)
    else:
        ensure_public_access_allowed(headers, "")
    with community_connection() as con:
        row = con.execute(
            "SELECT * FROM public_users WHERE lower(email) = ? OR lower(nickname) = ? LIMIT 1",
            (identifier, identifier),
        ).fetchone()
        if not row or not public_user_has_password(row) or not verify_password(password, public_password_hash(row)):
            raise ApiError(401, "Неверная почта, ник или пароль.")
        ensure_public_access_allowed(headers, row["email"])
        if row["blocked"] or row["deleted_at"]:
            raise ApiError(403, "Этот профиль заблокирован.")
        con.execute("UPDATE public_users SET last_ip = ?, updated_at = ? WHERE id = ?", (request_ip(headers), now_iso(), row["id"]))
        row = con.execute("SELECT * FROM public_users WHERE id = ?", (row["id"],)).fetchone()
        user_dict = dict(row)
    return create_public_session(user_dict)

def request_public_password_reset(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    rate_limit(headers, "public-reset-code")
    if not smtp_configured():
        raise ApiError(503, "На сервере не настроена отправка почты.")
    email = clean_email(data.get("email"))
    ensure_public_access_allowed(headers, email)
    with community_connection() as con:
        user = con.execute("SELECT * FROM public_users WHERE email = ?", (email,)).fetchone()
        if user and (user["blocked"] or user["deleted_at"]):
            raise ApiError(403, "Этот профиль заблокирован.")
    if user:
        create_public_auth_code(email, "reset", headers=headers)
        community_log("public_password_reset_code_requested", int(user["id"]), email=email)
    return {"ok": True, "message": "Если аккаунт с такой почтой есть, код отправлен."}

def complete_public_password_reset(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    rate_limit(headers, "public-reset-complete")
    email = clean_email(data.get("email"))
    ensure_public_access_allowed(headers, email)
    code = str(data.get("code") or "").strip()
    password = clean_public_password(data.get("password"))
    password_confirm = str(data.get("password_confirm") or data.get("password") or "")
    if password_confirm != password:
        raise ApiError(400, "Пароли не совпадают.")
    with community_connection() as con:
        user = con.execute("SELECT * FROM public_users WHERE email = ?", (email,)).fetchone()
        if not user:
            raise ApiError(404, "Аккаунт не найден.")
        if user["blocked"] or user["deleted_at"]:
            raise ApiError(403, "Этот профиль заблокирован.")
        consume_public_auth_code(con, email, code, "reset")
        set_public_user_password(con, int(user["id"]), password)
        fresh = dict(con.execute("SELECT * FROM public_users WHERE id = ?", (user["id"],)).fetchone())
    community_log("public_password_reset_completed", int(fresh["id"]), email=email)
    return create_public_session(fresh)

def request_public_login_code(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    raise ApiError(410, "Вход по одноразовому коду заменен входом по паролю. Обновите страницу.")

def verify_public_login_code(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    raise ApiError(410, "Вход по одноразовому коду заменен входом по паролю. Обновите страницу.")

def revoke_session_api(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    token_tail = str(data.get("token_tail") or "").strip()
    if len(token_tail) < 4:
        raise ApiError(400, "Нужен хвост токена сессии.")
    current = session(headers)
    current_token = current.get("token") if current else None
    auth = load_auth()
    removed = []
    removed_tokens = []
    for token, item in list(auth.get("sessions", {}).items()):
        if token.endswith(token_tail):
            # Не удаляем текущую сессию администратора, чтобы кнопкой не запереть самого себя случайно.
            if current_token == token:
                continue
            removed.append({"role": item.get("role"), "username": item.get("username"), "client_id": item.get("client_id")})
            removed_tokens.append(token)
    if not removed:
        raise ApiError(404, "Сессия не найдена или это текущий вход.")
    site_sessions_delete(removed_tokens)
    log_event("session_revoked", username=user.get("username"), count=len(removed))
    return {"ok": True, "removed": removed}

def revoke_invite_api(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    raise ApiError(410, "Клиентские ссылки отключены. Привяжите к клиенту профиль сайта.")

__all__ = ['hash_password', 'verify_password', 'clean_public_password', 'public_password_hash', 'public_user_has_password', 'set_public_user_password', 'default_auth', 'normalize_auth_store', 'save_auth_session', 'delete_auth_session', 'load_auth', 'save_auth', 'admin_exists', 'setup_key', 'clear_setup_key', 'public_client', 'cookie_value', 'session_token', 'session', 'require_session', 'is_admin_session', 'require_admin', 'require_client_or_admin', 'session_trebnik_client_id', 'require_trebnik_client_session', 'public_user', 'rate_limit', 'auth_summary', 'create_session', 'create_public_session', 'setup_admin', 'login_api', 'register_client', 'public_code_message', 'create_public_auth_code', 'consume_public_auth_code', 'create_public_auth_token', 'consume_public_auth_token', 'request_public_registration_code', 'verify_public_registration_code', 'complete_public_registration', 'login_public_password', 'request_public_password_reset', 'complete_public_password_reset', 'request_public_login_code', 'verify_public_login_code', 'revoke_session_api', 'revoke_invite_api']
