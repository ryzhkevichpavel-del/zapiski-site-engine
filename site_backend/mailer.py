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

def env_flag(name: str, default: bool = False) -> bool:
    value = str(os.getenv(name, "")).strip().lower()
    if not value:
        return default
    return value in {"1", "true", "yes", "да", "on"}

def smtp_settings() -> dict[str, Any]:
    host = os.getenv("TUONELA_SMTP_HOST", "").strip()
    user = os.getenv("TUONELA_SMTP_USER", "").strip()
    password = os.getenv("TUONELA_SMTP_PASSWORD", "")
    from_email = os.getenv("TUONELA_SMTP_FROM", "").strip() or user
    port_raw = os.getenv("TUONELA_SMTP_PORT", "").strip()
    try:
        port = int(port_raw or 465)
    except ValueError:
        port = 465
    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "from_email": from_email,
        "ssl": env_flag("TUONELA_SMTP_SSL", port == 465),
        "starttls": env_flag("TUONELA_SMTP_STARTTLS", port != 465),
    }

def smtp_configured() -> bool:
    settings = smtp_settings()
    return bool(settings["host"] and settings["from_email"] and (settings["password"] or not settings["user"]))

def send_site_email(to_email: str, subject: str, body: str) -> None:
    if not smtp_configured():
        raise ApiError(503, "Регистрация пока закрыта: на сервере не настроена отправка почты.")
    settings = smtp_settings()
    message = EmailMessage()
    message["From"] = settings["from_email"]
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)
    try:
        if settings["ssl"]:
            with smtplib.SMTP_SSL(settings["host"], settings["port"], timeout=15, context=ssl.create_default_context()) as smtp:
                if settings["user"]:
                    smtp.login(settings["user"], settings["password"])
                smtp.send_message(message)
        else:
            with smtplib.SMTP(settings["host"], settings["port"], timeout=15) as smtp:
                if settings["starttls"]:
                    smtp.starttls(context=ssl.create_default_context())
                if settings["user"]:
                    smtp.login(settings["user"], settings["password"])
                smtp.send_message(message)
    except ApiError:
        raise
    except Exception as exc:
        raise ApiError(502, "Почтовый сервер не отправил письмо. Проверьте настройки SMTP.") from exc

def clean_email(value: Any) -> str:
    email = str(value or "").strip().lower()
    if len(email) > 180 or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise ApiError(400, "Введите корректную почту.")
    return email

def notification_base_url() -> str:
    return PUBLIC_BASE_URL or "https://katuonela.ru"

def notification_user_name(row: dict[str, Any] | sqlite3.Row | None) -> str:
    if not row:
        return "Участник"
    item = dict(row)
    return str(item.get("display_name") or item.get("nickname") or "Участник").strip()

def notification_comment_url(row: dict[str, Any] | sqlite3.Row) -> str:
    item = dict(row)
    if (item.get("target_route") or "") == "questions":
        return f"{route_path('questions', str(item.get('target_slug') or ''))}#comment-{item.get('id')}"
    return f"{route_path(item.get('target_route') or '', item.get('target_slug') or '')}#comment-{item.get('id')}"

def notification_email_body(title: str, body: str, url: str, subscription: dict[str, Any] | sqlite3.Row | None = None) -> str:
    link = absolute_url(notification_base_url(), url or "/")
    lines = [title.strip(), "", body.strip(), "", link]
    if subscription:
        token = str(dict(subscription).get("unsubscribe_token") or "").strip()
        if token:
            lines.extend(["", "Отключить письма по этой подписке:", absolute_url(notification_base_url(), f"/api/community/unsubscribe?token={quote(token)}")])
    return "\n".join(line for line in lines if line is not None)

def send_notification_email(con: sqlite3.Connection, notification_id: int, recipient: dict[str, Any] | sqlite3.Row, title: str, body: str, url: str, subscription: dict[str, Any] | sqlite3.Row | None = None) -> None:
    user = dict(recipient)
    if not user.get("email") or not bool(user.get("notification_email_enabled", 1)):
        return
    if subscription and not bool(dict(subscription).get("email_enabled", 1)):
        return
    try:
        send_site_email(str(user["email"]), title, notification_email_body(title, body, url, subscription))
        con.execute("UPDATE community_notifications SET email_sent_at = ?, email_error = NULL WHERE id = ?", (now_iso(), notification_id))
    except Exception as exc:
        con.execute("UPDATE community_notifications SET email_error = ? WHERE id = ?", (clean_text(str(exc), 280), notification_id))

def test_smtp_api(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    require_admin(headers)
    email = clean_email(data.get("email"))
    send_site_email(email, "Проверка почты katuonela.ru", "Это тестовое письмо из Мастерской сайта. Если оно пришло, SMTP настроен правильно.")
    return {"ok": True, "message": "Тестовое письмо отправлено."}

__all__ = ['env_flag', 'smtp_settings', 'smtp_configured', 'send_site_email', 'clean_email', 'notification_base_url', 'notification_user_name', 'notification_comment_url', 'notification_email_body', 'send_notification_email', 'test_smtp_api']
