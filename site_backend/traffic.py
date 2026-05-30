from __future__ import annotations

import hashlib
import html
import re
import secrets
import sqlite3
from http.cookies import SimpleCookie
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from .settings import *
from .serialization import now_iso
from .site_store import site_store_connection
from .storage import read_content_json

def request_ip(headers: Any) -> str:
    raw_ip = getattr(headers, "get", lambda _key, _default=None: _default)("X-Forwarded-For", "") or ""
    return raw_ip.split(",", 1)[0].strip() or "local"

def moscow_now() -> datetime:
    return datetime.now(MOSCOW_TZ)

def moscow_day_key(moment: datetime | None = None) -> str:
    return (moment or moscow_now()).date().isoformat()

def looks_like_bot(user_agent: str) -> bool:
    raw = str(user_agent or "").lower()
    if not raw:
        return True
    bot_markers = (
        "bot", "crawler", "spider", "slurp", "curl", "wget", "python-requests", "uptime", "monitor",
        "chatgpt-user", "oai-searchbot", "google-inspectiontool", "infrawatch", "zgrab",
        "headless", "httpclient", "go-http-client", "masscan", "nuclei", "semrush", "ahrefs",
        "bingpreview", "facebookexternalhit", "telegrambot",
    )
    return any(marker in raw for marker in bot_markers)

def visitor_hash(headers: Any) -> str:
    visitor_token = visitor_cookie(headers)
    if visitor_token:
        raw = f"zapiski-visitor-v2|{visitor_token}"
        return hashlib.sha256(raw.encode("utf-8", "replace")).hexdigest()
    ip = request_ip(headers)
    user_agent = getattr(headers, "get", lambda _key, _default=None: _default)("User-Agent", "") or ""
    language = getattr(headers, "get", lambda _key, _default=None: _default)("Accept-Language", "") or ""
    raw = f"zapiski-visitor-v1|{ip}|{user_agent}|{language}"
    return hashlib.sha256(raw.encode("utf-8", "replace")).hexdigest()

def clean_visitor_token(value: Any) -> str:
    raw = str(value or "").strip()
    return raw if re.fullmatch(r"[A-Za-z0-9_-]{24,80}", raw) else ""

def new_visitor_token() -> str:
    return secrets.token_urlsafe(32)

def visitor_cookie(headers: Any) -> str:
    raw_cookie = getattr(headers, "get", lambda _key, _default=None: _default)("Cookie", "") or ""
    if not raw_cookie:
        return ""
    cookie = SimpleCookie()
    try:
        cookie.load(raw_cookie)
    except Exception:
        return ""
    return clean_visitor_token(cookie.get(VISITOR_COOKIE_NAME).value if VISITOR_COOKIE_NAME in cookie else "")

def viewer_has_admin_rights(viewer: dict[str, Any] | None) -> bool:
    return bool(viewer and (viewer.get("role") == "admin" or viewer.get("site_admin")))

def clean_visit_path(path: Any) -> str:
    raw = str(path or "/").strip() or "/"
    parsed = urlparse(raw)
    clean = parsed.path or raw
    clean = unquote(str(clean or "/")).strip() or "/"
    if not clean.startswith("/"):
        clean = f"/{clean}"
    clean = re.sub(r"/{2,}", "/", clean)
    if Path(clean).suffix:
        clean = "/"
    return clean[:240]

def _plain_traffic_text(value: Any, limit: int = 90) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", str(value or "")))
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit].rstrip()

def _load_traffic_content() -> dict[str, Any]:
    data = read_content_json()
    return data if isinstance(data, dict) else {"sections": {}}

def _traffic_path_parts(path: Any) -> tuple[str, list[str]]:
    clean = clean_visit_path(path)
    return clean, [unquote(part) for part in clean.split("/") if part]

def _traffic_material_index(content: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    sections = content.get("sections") if isinstance(content.get("sections"), dict) else {}
    result: dict[tuple[str, str], dict[str, Any]] = {}
    for route in PUBLIC_SECTION_ROUTES:
        section = sections.get(route) if isinstance(sections.get(route), dict) else {}
        items = section.get("items") if isinstance(section.get("items"), list) else []
        for item in items:
            if not isinstance(item, dict):
                continue
            slug = _plain_traffic_text(item.get("slug"), 120)
            if slug:
                result[(route, slug)] = item
    return result

def _traffic_section_name(content: dict[str, Any], route: str) -> str:
    section = content.get("sections", {}).get(route) if isinstance(content.get("sections"), dict) else {}
    if isinstance(section, dict):
        title = _plain_traffic_text(section.get("title"))
        if title:
            return title
    return PUBLIC_SECTION_NAMES.get(route, route)

def traffic_path_details(path: Any, content: dict[str, Any] | None = None, material_index: dict[tuple[str, str], dict[str, Any]] | None = None) -> dict[str, str]:
    content = content if isinstance(content, dict) else {}
    material_index = material_index or _traffic_material_index(content)
    clean, parts = _traffic_path_parts(path)
    if clean == "/":
        return {"path": clean, "label": "Главная", "kind": "page"}
    route = parts[0] if parts else ""
    if route == "u":
        label = f"Профиль: {parts[1].replace('-', ' ')}" if len(parts) > 1 else "Профиль"
        return {"path": clean, "label": label, "kind": "profile"}
    legal_labels = {
        "privacy": "Персональные данные",
        "rules": "Правила сайта",
        "personal-data-consent": "Согласие",
    }
    if route in legal_labels:
        return {"path": clean, "label": legal_labels[route], "kind": "page"}
    if route in PUBLIC_SECTION_ROUTES:
        section = _traffic_section_name(content, route)
        if len(parts) == 1:
            return {"path": clean, "label": section, "kind": "section"}
        slug = "/".join(parts[1:])
        item = material_index.get((route, slug))
        label = _plain_traffic_text(item.get("title")) if isinstance(item, dict) else ""
        return {
            "path": clean,
            "label": label or slug.replace("-", " "),
            "kind": "material",
        }
    return {"path": clean, "label": clean, "kind": "page"}

def traffic_row_payload(row: sqlite3.Row, content: dict[str, Any], material_index: dict[tuple[str, str], dict[str, Any]]) -> dict[str, Any]:
    payload = dict(row)
    details = traffic_path_details(payload.get("path") or payload.get("last_path") or "/", content, material_index)
    payload.update(details)
    return payload

def track_site_visit(headers: Any, path: str, viewer: dict[str, Any] | None = None, visitor_token: str = "") -> str:
    user_agent = getattr(headers, "get", lambda _key, _default=None: _default)("User-Agent", "") or ""
    if looks_like_bot(user_agent) or viewer_has_admin_rights(viewer):
        return ""
    token = clean_visitor_token(visitor_token) or visitor_cookie(headers) or new_visitor_token()
    now = now_iso()
    day_key = moscow_day_key()
    fingerprint = hashlib.sha256(f"zapiski-visitor-v2|{token}".encode("utf-8", "replace")).hexdigest()
    clean_path = clean_visit_path(path)
    user_id = None
    role = ""
    if viewer:
        user_id = viewer.get("user_id")
        role = str(viewer.get("role") or "")
    with FILE_LOCK, site_store_connection() as con:
        con.execute(
            """
            INSERT INTO site_visits(day_key, visitor_hash, first_seen_at, last_seen_at, pageviews, last_path, user_id, role)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?)
            ON CONFLICT(day_key, visitor_hash) DO UPDATE SET
                last_seen_at = excluded.last_seen_at,
                pageviews = site_visits.pageviews + 1,
                last_path = excluded.last_path,
                user_id = COALESCE(excluded.user_id, site_visits.user_id),
                role = CASE WHEN excluded.role != '' THEN excluded.role ELSE site_visits.role END
            """,
            (day_key, fingerprint, now, now, clean_path, user_id, role),
        )
        con.execute(
            """
            INSERT INTO site_pageviews(day_key, visitor_hash, created_at, path, user_id, role)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (day_key, fingerprint, now, clean_path, user_id, role),
        )
        cutoff_key = moscow_day_key(moscow_now() - timedelta(days=90))
        con.execute("DELETE FROM site_pageviews WHERE day_key < ?", (cutoff_key,))
    return token

def admin_traffic_summary() -> dict[str, Any]:
    today_key = moscow_day_key()
    yesterday_key = moscow_day_key(moscow_now() - timedelta(days=1))
    history_keys = [moscow_day_key(moscow_now() - timedelta(days=offset)) for offset in range(13, -1, -1)]
    start_key = history_keys[0]
    content = _load_traffic_content()
    material_index = _traffic_material_index(content)
    with FILE_LOCK, site_store_connection() as con:
        rows = con.execute(
            """
            SELECT day_key, COUNT(DISTINCT visitor_hash) visitors, COUNT(*) pageviews
            FROM site_pageviews
            WHERE day_key >= ? AND role != 'admin' AND path != '/u' AND path NOT LIKE '/u/%'
            GROUP BY day_key
            """,
            (start_key,),
        ).fetchall()
        today_paths = [
            traffic_row_payload(row, content, material_index)
            for row in con.execute(
                """
                SELECT path, COUNT(DISTINCT visitor_hash) visitors, COUNT(*) pageviews
                FROM site_pageviews
                WHERE day_key = ? AND role != 'admin' AND path != '/u' AND path NOT LIKE '/u/%'
                GROUP BY path
                ORDER BY pageviews DESC, visitors DESC
                """,
                (today_key,),
            ).fetchall()
        ]
        top_pages = [row for row in today_paths if row.get("kind") != "material"][:12]
        top_materials = [row for row in today_paths if row.get("kind") == "material"][:12]
    by_day = {row["day_key"]: dict(row) for row in rows}
    today = by_day.get(today_key, {"day_key": today_key, "visitors": 0, "pageviews": 0})
    yesterday = by_day.get(yesterday_key, {"day_key": yesterday_key, "visitors": 0, "pageviews": 0})
    last_14_days = [by_day.get(key, {"day_key": key, "visitors": 0, "pageviews": 0}) for key in history_keys]
    return {
        "timezone": "Москва",
        "today": today,
        "yesterday": yesterday,
        "last_14_days": last_14_days,
        "top_pages": top_pages,
        "top_materials": top_materials,
    }

def reset_admin_traffic(day_key: str = "") -> dict[str, Any]:
    target_day = day_key or moscow_day_key()
    with FILE_LOCK, site_store_connection() as con:
        pageviews = con.execute("DELETE FROM site_pageviews WHERE day_key = ?", (target_day,)).rowcount
        visitors = con.execute("DELETE FROM site_visits WHERE day_key = ?", (target_day,)).rowcount
    return {"day_key": target_day, "deleted_pageviews": pageviews, "deleted_visitors": visitors}

__all__ = ['request_ip', 'moscow_now', 'moscow_day_key', 'looks_like_bot', 'visitor_hash', 'clean_visitor_token', 'new_visitor_token', 'visitor_cookie', 'viewer_has_admin_rights', 'clean_visit_path', 'traffic_path_details', 'track_site_visit', 'admin_traffic_summary', 'reset_admin_traffic']
