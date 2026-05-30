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
from .media_service import image_dimensions

def clean_text(value: Any, limit: int | None = None) -> str:
    text = str(value or "").strip()
    return text[:limit] if limit else text

def bool_or_default(value: Any, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if value in (0, "0", "false", "False", "нет", "no"):
        return False
    if value in (1, "1", "true", "True", "да", "yes"):
        return True
    return default

MONTHS_RU = (
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
)

def default_material_date() -> str:
    now = datetime.now(MOSCOW_TZ)
    return f"{now.day} {MONTHS_RU[now.month - 1]} {now.year} года"

def compact_material_text(value: Any, limit: int = 220) -> str:
    text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", str(value or "")))).strip()
    if len(text) <= limit:
        return text
    return text[: max(1, limit - 1)].rstrip() + "…"

def material_author_defaults(user: dict[str, Any] | None = None) -> tuple[str, str]:
    user = user if isinstance(user, dict) else {}
    name = clean_text(user.get("display_name") or user.get("username"), 120)
    slug = clean_text(user.get("nickname") or user.get("username"), 120)
    return name, slug

def content_editor_image_dimensions(url: Any) -> tuple[int | None, int | None]:
    clean = str(url or "").strip().split("?", 1)[0]
    if not clean.startswith("/static/uploads/"):
        return None, None
    candidate = (WEB_ROOT / clean.lstrip("/")).resolve()
    try:
        candidate.relative_to(UPLOADS_DIR.resolve())
    except ValueError:
        return None, None
    if not candidate.exists():
        return None, None
    return image_dimensions(candidate)

def sync_editor_image_size(owner: dict[str, Any], url_key: str, prefix: str) -> None:
    url = str(owner.get(url_key) or "").strip()
    if not url:
        owner.pop(f"{prefix}_width", None)
        owner.pop(f"{prefix}_height", None)
        return
    width, height = content_editor_image_dimensions(url)
    if width and height:
        owner[f"{prefix}_width"] = int(width)
        owner[f"{prefix}_height"] = int(height)
    else:
        owner[f"{prefix}_width"] = clean_text(owner.get(f"{prefix}_width"), 10)
        owner[f"{prefix}_height"] = clean_text(owner.get(f"{prefix}_height"), 10)

def clean_editor_list_items(items: Any, depth: int = 0) -> list[Any]:
    if not isinstance(items, list) or depth > 3:
        return []
    cleaned = []
    for item in items[:80]:
        if isinstance(item, str):
            text = clean_text(item, 3000)
            if text:
                cleaned.append(text)
            continue
        if not isinstance(item, dict):
            continue
        content = clean_text(item.get("content") or item.get("text"), 3000)
        children = clean_editor_list_items(item.get("items"), depth + 1)
        if content or children:
            cleaned.append({"content": content, "items": children})
    return cleaned

def clean_text_alignment(value: Any) -> str:
    align = clean_text(value, 20)
    return align if align in {"left", "center", "right", "justify"} else ""

def add_text_alignment(payload: dict[str, Any], source: dict[str, Any]) -> dict[str, Any]:
    alignment = clean_text_alignment(source.get("alignment") or source.get("align") or source.get("textAlign"))
    if alignment and alignment != "left":
        payload["alignment"] = alignment
    return payload

def clean_editor_blocks(value: Any, fallback_text: Any = "") -> dict[str, Any]:
    if not isinstance(value, dict) or not isinstance(value.get("blocks"), list):
        return {}
    blocks = []
    for block in value.get("blocks", [])[:120]:
        if not isinstance(block, dict):
            continue
        block_type = clean_text(block.get("type"), 40)
        data = block.get("data") if isinstance(block.get("data"), dict) else {}
        if block_type in {"paragraph", ""}:
            text = clean_text(data.get("text"), 6000)
            if text:
                blocks.append({"type": "paragraph", "data": add_text_alignment({"text": text}, data)})
        elif block_type == "header":
            text = clean_text(data.get("text"), 400)
            if text:
                try:
                    level = int(data.get("level") or 2)
                except (TypeError, ValueError):
                    level = 2
                blocks.append({"type": "header", "data": add_text_alignment({"text": text, "level": level if level in {2, 3, 4} else 2}, data)})
        elif block_type == "list":
            items = clean_editor_list_items(data.get("items"))
            if items:
                style = clean_text(data.get("style"), 20)
                blocks.append({"type": "list", "data": add_text_alignment({"style": "ordered" if style == "ordered" else "unordered", "items": items}, data)})
        elif block_type == "quote":
            text = clean_text(data.get("text"), 3000)
            caption = clean_text(data.get("caption"), 400)
            if text or caption:
                blocks.append({"type": "quote", "data": add_text_alignment({"text": text, "caption": caption}, data)})
        elif block_type == "image":
            file_data = data.get("file") if isinstance(data.get("file"), dict) else {}
            url = clean_text(file_data.get("url") or data.get("url"), 400)
            if url:
                layout = clean_text(data.get("layout"), 20)
                if layout not in {"center", "left", "right", "wide"}:
                    layout = "wide" if bool_or_default(data.get("stretched"), False) else "center"
                size = clean_text(data.get("size"), 20)
                if size not in {"small", "medium", "large"}:
                    size = "medium"
                blocks.append(
                    {
                        "type": "image",
                        "data": {
                            "file": {"url": url},
                            "alt": clean_text(data.get("alt"), 180),
                            "caption": clean_text(data.get("caption"), 400),
                            "layout": layout,
                            "size": size,
                            "stretched": layout == "wide" or bool_or_default(data.get("stretched"), False),
                            "withBorder": bool_or_default(data.get("withBorder"), False),
                            "withBackground": bool_or_default(data.get("withBackground"), False),
                        },
                    }
                )
        elif block_type == "delimiter":
            blocks.append({"type": "delimiter", "data": {}})
    if not blocks and clean_text(fallback_text):
        for paragraph in re.split(r"\n{2,}", clean_text(fallback_text, 12000)):
            paragraph = paragraph.strip()
            if paragraph:
                blocks.append({"type": "paragraph", "data": {"text": h(paragraph).replace(chr(10), "<br>")}})
    return {"time": value.get("time") or int(datetime.now().timestamp() * 1000), "blocks": blocks, "version": clean_text(value.get("version"), 20) or "2.31.6"} if blocks else {}

def ensure_content_fresh(existing: dict[str, Any], base_updated_at: Any = None, base_version: Any = None) -> None:
    try:
        current_version = int(existing.get("version") or 1)
    except (TypeError, ValueError):
        current_version = 1
    try:
        incoming_version = int(base_version) if base_version not in (None, "") else None
    except (TypeError, ValueError):
        incoming_version = None
    if incoming_version is None and not clean_text(base_updated_at):
        raise ApiError(409, "Не вижу версии данных для сохранения. Обновите страницу и повторите правку, чтобы не потерять изменения.")
    if incoming_version is not None and incoming_version != current_version:
        raise ApiError(409, "Сайт уже изменился в другой вкладке. Обновите страницу и повторите правку, чтобы не потерять новые изменения.")
    base = clean_text(base_updated_at)
    current = clean_text(existing.get("updated_at"))
    if incoming_version is None and base and current and base != current:
        raise ApiError(409, "Сайт уже изменился в другой вкладке. Обновите страницу и повторите правку, чтобы не потерять новые изменения.")

def content_changed_fields(before: dict[str, Any], after: dict[str, Any], labels: dict[str, str] | None = None) -> list[str]:
    labels = labels or {}
    changed = []
    for key in sorted(set(before) | set(after)):
        if before.get(key) != after.get(key):
            changed.append(labels.get(key, key))
    return changed

def response_with_saved_content(content: dict[str, Any], changed_fields: list[str] | None = None, warnings: list[str] | None = None) -> dict[str, Any]:
    return {
        "ok": True,
        "content": content,
        "saved_at": content.get("updated_at"),
        "changed_fields": changed_fields or [],
        "warnings": warnings or [],
    }

def content_history(headers: Any) -> dict[str, Any]:
    require_admin(headers)
    backups = []
    CONTENT_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    for path in sorted(CONTENT_BACKUP_DIR.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True)[:80]:
        info = file_info(path)
        backups.append({"name": path.name, **info})
    return {"ok": True, "current": {"version": load_content().get("version"), "updated_at": load_content().get("updated_at")}, "backups": backups}

def restore_content_backup(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    name = clean_text(data.get("name"), 220)
    if not name:
        raise ApiError(400, "Выберите резервную копию.")
    candidate = (CONTENT_BACKUP_DIR / name).resolve()
    try:
        candidate.relative_to(CONTENT_BACKUP_DIR.resolve())
    except ValueError:
        raise ApiError(400, "Неверное имя резервной копии.")
    if not candidate.is_file() or candidate.suffix.lower() != ".json":
        raise ApiError(404, "Резервная копия не найдена.")
    try:
        restored = json.loads(candidate.read_text("utf-8"))
    except Exception as exc:
        raise ApiError(400, "Не удалось прочитать резервную копию.") from exc
    existing = load_content()
    normalized = normalize_content(restored if isinstance(restored, dict) else {})
    try:
        normalized["version"] = int(existing.get("version") or 1) + 1
    except (TypeError, ValueError):
        normalized["version"] = 2
    normalized["updated_at"] = now_iso()
    normalized["updated_by"] = user.get("username")
    backup_file(CONTENT_FILE, CONTENT_BACKUP_DIR, "перед-восстановлением")
    write_json(CONTENT_FILE, normalized)
    log_event("content_restored", username=user.get("username"), backup=name)
    return response_with_saved_content(normalized, ["восстановлена резервная копия"], [f"Восстановлено из {name}"])

def commit_content(content: dict[str, Any], user: dict[str, Any], event: str, changed_fields: list[str] | None = None, warnings: list[str] | None = None) -> dict[str, Any]:
    existing = load_content()
    old_media_urls = collect_content_media_urls(existing)
    normalized = normalize_content(content)
    try:
        normalized["version"] = int(existing.get("version") or 1) + 1
    except (TypeError, ValueError):
        normalized["version"] = 2
    normalized["updated_at"] = now_iso()
    normalized["updated_by"] = user.get("username")
    backup_file(CONTENT_FILE, CONTENT_BACKUP_DIR, event)
    write_json(CONTENT_FILE, normalized)
    new_media_urls = collect_content_media_urls(normalized)
    for url in sorted(old_media_urls - new_media_urls):
        delete_uploaded_media(url)
    if event != "content_restored":
        try:
            notify_new_published_materials(existing, normalized)
        except Exception as exc:
            warnings = list(warnings or []) + [f"Уведомления не созданы: {clean_text(str(exc), 160)}"]
    log_event(event, username=user.get("username"), changed_fields=changed_fields or [], warnings=warnings or [])
    return response_with_saved_content(normalized, changed_fields, warnings)

def material_payload(data: dict[str, Any], old_slug: str = "", index: int = 0, user: dict[str, Any] | None = None) -> dict[str, Any]:
    item = data.get("material") if isinstance(data.get("material"), dict) else data.get("item")
    if not isinstance(item, dict):
        raise ApiError(400, "Нужно передать материал.")
    title = clean_text(item.get("title"), 180) or f"Материал {index + 1}"
    slug = clean_text(item.get("slug"), 90) or old_slug or title
    blocks = clean_editor_blocks(item.get("blocks"), item.get("body"))
    body = clean_text(item.get("body"), 12000)
    excerpt = clean_text(item.get("excerpt"), 600)
    author_name, author_slug = material_author_defaults(user)
    payload = {
        "title": title,
        "slug": make_slug(slug, f"material-{index + 1}"),
        "tag": clean_text(item.get("tag"), 80),
        "topic_slug": make_slug(item.get("topic_slug"), ""),
        "status": clean_text(item.get("status"), 30) if clean_text(item.get("status")) in {"published", "draft", "hidden"} else "published",
        "date": clean_text(item.get("date"), 80) or default_material_date(),
        "price": clean_text(item.get("price"), 80),
        "excerpt": excerpt,
        "body": body,
        "cover_symbol": clean_text(item.get("cover_symbol"), 12) or "✦",
        "cover_image_url": clean_text(item.get("cover_image_url"), 400),
        "cover_image_alt": clean_text(item.get("cover_image_alt"), 180),
        "cover_image_width": clean_text(item.get("cover_image_width"), 10),
        "cover_image_height": clean_text(item.get("cover_image_height"), 10),
        "author_name": clean_text(item.get("author_name"), 120) or author_name,
        "author_slug": clean_text(item.get("author_slug"), 120) or author_slug,
        "cta_label": clean_text(item.get("cta_label"), 120),
        "cta_note": clean_text(item.get("cta_note"), 400),
        "seo_title": clean_text(item.get("seo_title"), 180) or title,
        "seo_description": clean_text(item.get("seo_description"), 300) or compact_material_text(excerpt or body or title, 220),
        "show_tag": bool_or_default(item.get("show_tag"), True),
        "show_date": bool_or_default(item.get("show_date"), True),
        "show_price": bool_or_default(item.get("show_price"), True),
        "show_cta": bool_or_default(item.get("show_cta"), True),
    }
    sync_editor_image_size(payload, "cover_image_url", "cover_image")
    if blocks:
        payload["blocks"] = blocks
    return payload

def find_section_item(content: dict[str, Any], route: str, slug: str, fallback_index: Any = None) -> tuple[dict[str, Any], list[dict[str, Any]], int]:
    section = content.get("sections", {}).get(route)
    if not isinstance(section, dict):
        raise ApiError(404, "Раздел не найден.")
    items = section.get("items") if isinstance(section.get("items"), list) else []
    index = next((i for i, item in enumerate(items) if str(item.get("slug") or "") == str(slug or "")), -1)
    if index < 0 and fallback_index not in (None, ""):
        try:
            candidate = int(fallback_index)
        except (TypeError, ValueError):
            candidate = -1
        if 0 <= candidate < len(items):
            index = candidate
    if index < 0:
        raise ApiError(404, "Материал не найден. Обновите страницу.")
    return section, items, index

def material_duplicate(items: list[dict[str, Any]], slug: str, current_index: int | None = None) -> dict[str, Any] | None:
    return next(
        (
            item
            for i, item in enumerate(items)
            if i != current_index and clean_text(item.get("slug")) == slug
        ),
        None,
    )

def save_content(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    content = data.get("content")
    if not isinstance(content, dict):
        raise ApiError(400, "Нужно передать content.")
    existing = load_content()
    ensure_content_fresh(existing, data.get("base_updated_at"), data.get("base_version"))
    content = normalize_content(content)
    return commit_content(content, user, "content_saved", ["весь сайт"])

def create_material_content(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    route = clean_text(data.get("route"), 40)
    if route not in {"works", "articles", "questions", "services", "cards"}:
        raise ApiError(400, "Раздел материала не найден.")
    existing = load_content()
    ensure_content_fresh(existing, data.get("base_updated_at"), data.get("base_version"))
    content = clone_json(existing)
    section = content.get("sections", {}).get(route)
    if not isinstance(section, dict):
        raise ApiError(404, "Раздел не найден.")
    items = section.get("items") if isinstance(section.get("items"), list) else []
    next_item = material_payload(data, "", len(items), user)
    if material_duplicate(items, next_item["slug"]):
        raise ApiError(400, "Такой короткий адрес уже есть в этом разделе. Выберите другой.")
    section["items"] = [*items, next_item]
    result = commit_content(content, user, "material_created", ["материал"])
    result["material"] = next_item
    return result

def save_material_content(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    route = clean_text(data.get("route"), 40)
    if route not in {"works", "articles", "questions", "services", "cards"}:
        raise ApiError(400, "Раздел материала не найден.")
    existing = load_content()
    ensure_content_fresh(existing, data.get("base_updated_at"), data.get("base_version"))
    content = clone_json(existing)
    section, items, index = find_section_item(content, route, clean_text(data.get("old_slug") or data.get("slug")), data.get("index"))
    before = clone_json(items[index])
    before_compare = material_payload({"material": before}, clean_text(before.get("slug")), index)
    next_item = material_payload(data, clean_text(before.get("slug")), index, user)
    incoming_item = data.get("material") if isinstance(data.get("material"), dict) else data.get("item")
    for optional_key in ("seo_title", "seo_description"):
        if isinstance(incoming_item, dict) and optional_key not in incoming_item:
            next_item[optional_key] = before.get(optional_key, "")
    if material_duplicate(items, next_item["slug"], index):
        raise ApiError(400, "Такой короткий адрес уже есть в этом разделе. Выберите другой.")
    warnings: list[str] = []
    requested_slug = clean_text((data.get("material") or {}).get("slug") if isinstance(data.get("material"), dict) else "")
    if requested_slug and requested_slug != next_item["slug"]:
        warnings.append(f"Короткий адрес очищен до «{next_item['slug']}».")
    items[index] = next_item
    section["items"] = items
    labels = {
        "title": "название",
        "slug": "короткий адрес",
        "tag": "метка",
        "topic_slug": "тема",
        "status": "статус",
        "date": "дата/формат",
        "price": "цена",
        "excerpt": "краткое описание",
        "body": "полный текст",
        "blocks": "текст страницы",
        "cover_image_url": "обложка",
        "cover_image_alt": "описание изображения",
        "author_name": "автор",
        "author_slug": "профиль автора",
        "cta_label": "кнопка",
        "cta_note": "пояснение",
        "seo_title": "SEO-заголовок",
        "seo_description": "SEO-описание",
        "show_tag": "видимость метки",
        "show_date": "видимость даты/формата",
        "show_price": "видимость цены",
        "show_cta": "видимость кнопки",
    }
    changed = content_changed_fields(before_compare, next_item, labels)
    result = commit_content(content, user, "material_saved", changed, warnings)
    result["material"] = next_item
    return result

def update_material_status(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    route = clean_text(data.get("route"), 40)
    status = clean_text(data.get("status"), 30)
    if route not in {"works", "articles", "questions", "services", "cards"}:
        raise ApiError(400, "Раздел материала не найден.")
    if status not in {"published", "draft", "hidden"}:
        raise ApiError(400, "Неверный статус материала.")
    existing = load_content()
    ensure_content_fresh(existing, data.get("base_updated_at"), data.get("base_version"))
    content = clone_json(existing)
    section, items, index = find_section_item(content, route, clean_text(data.get("slug")), data.get("index"))
    before = clean_text(items[index].get("status")) or "published"
    items[index] = {**items[index], "status": status}
    section["items"] = items
    result = commit_content(
        content,
        user,
        "material_status_changed",
        [] if before == status else ["статус"],
    )
    result["material"] = items[index]
    return result

def delete_material_content(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    route = clean_text(data.get("route"), 40)
    if route not in {"works", "articles", "questions", "services", "cards"}:
        raise ApiError(400, "Раздел материала не найден.")
    existing = load_content()
    ensure_content_fresh(existing, data.get("base_updated_at"), data.get("base_version"))
    content = clone_json(existing)
    section, items, index = find_section_item(content, route, clean_text(data.get("slug")), data.get("index"))
    removed = clone_json(items[index])
    removed_slug = clean_text(removed.get("slug"))
    section["items"] = [item for i, item in enumerate(items) if i != index]
    featured = content.setdefault("home", {}).get("featured_material_ids")
    if isinstance(featured, list) and removed_slug:
        content["home"]["featured_material_ids"] = [
            key for key in featured if str(key or "") != f"{route}:{removed_slug}"
        ]
    result = commit_content(content, user, "material_deleted", ["материал"])
    result["deleted"] = {"route": route, "slug": removed_slug, "title": clean_text(removed.get("title"), 180)}
    return result

def save_section_content(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    route = clean_text(data.get("route"), 40)
    if route not in {"works", "articles", "questions", "services", "cards"}:
        raise ApiError(400, "Раздел не найден.")
    existing = load_content()
    ensure_content_fresh(existing, data.get("base_updated_at"), data.get("base_version"))
    content = clone_json(existing)
    section = content.get("sections", {}).get(route)
    if not isinstance(section, dict):
        raise ApiError(404, "Раздел не найден.")
    before = clone_json(section)
    section["title"] = clean_text(data.get("title"), 120) or route
    section["intro"] = clean_text(data.get("intro"), 500)
    section["cover_image_url"] = clean_text(data.get("cover_image_url"), 400)
    section["cover_image_alt"] = clean_text(data.get("cover_image_alt"), 180)
    section["cover_image_width"] = clean_text(data.get("cover_image_width"), 10)
    section["cover_image_height"] = clean_text(data.get("cover_image_height"), 10)
    sync_editor_image_size(section, "cover_image_url", "cover_image")
    if "seo_title" in data:
        section["seo_title"] = clean_text(data.get("seo_title"), 180)
    if "seo_description" in data:
        section["seo_description"] = clean_text(data.get("seo_description"), 300)
    if "topics_enabled" in data:
        section["topics_enabled"] = bool_or_default(data.get("topics_enabled"), False)
    if "topics" in data:
        section["topics"] = data.get("topics") if isinstance(data.get("topics"), list) else []
    if "topics_enabled" in data or "topics" in data:
        normalize_section_topics(section, section.get("items") if isinstance(section.get("items"), list) else [])
    changed = content_changed_fields(
        {key: before.get(key) for key in ("title", "intro", "cover_image_url", "cover_image_alt", "seo_title", "seo_description", "topics_enabled", "topics")},
        {key: section.get(key) for key in ("title", "intro", "cover_image_url", "cover_image_alt", "seo_title", "seo_description", "topics_enabled", "topics")},
        {"title": "название", "intro": "описание", "cover_image_url": "обложка", "cover_image_alt": "описание изображения", "seo_title": "SEO-заголовок", "seo_description": "SEO-описание", "topics_enabled": "темы", "topics": "список тем"},
    )
    return commit_content(content, user, "section_saved", changed)

def save_home_content(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    existing = load_content()
    ensure_content_fresh(existing, data.get("base_updated_at"), data.get("base_version"))
    content = clone_json(existing)
    home = content.setdefault("home", {})
    before = clone_json(home)
    home["hero_kicker"] = clean_text(data.get("hero_kicker"), 140)
    home["hero_title"] = clean_text(data.get("hero_title"), 180)
    home["welcome_title"] = home["hero_title"]
    home["hero_text"] = clean_text(data.get("hero_text"), 1600)
    home["welcome_text"] = home["hero_text"]
    home["hero_image_url"] = clean_text(data.get("hero_image_url"), 400)
    home["hero_image_alt"] = clean_text(data.get("hero_image_alt"), 180)
    home["hero_image_width"] = clean_text(data.get("hero_image_width"), 10)
    home["hero_image_height"] = clean_text(data.get("hero_image_height"), 10)
    sync_editor_image_size(home, "hero_image_url", "hero_image")
    if "cta_primary" in data:
        home["cta_primary"] = clean_text(data.get("cta_primary"), 120)
    if "cta_primary_route" in data:
        home["cta_primary_route"] = safe_public_route(data.get("cta_primary_route"), "services")
    if "cta_primary_action" in data:
        home["cta_primary_action"] = clean_text(data.get("cta_primary_action"), 40)
    if "cta_primary_title" in data:
        home["cta_primary_title"] = clean_text(data.get("cta_primary_title"), 180)
    if "cta_secondary" in data:
        home["cta_secondary"] = clean_text(data.get("cta_secondary"), 120)
    if "cta_secondary_route" in data:
        home["cta_secondary_route"] = safe_public_route(data.get("cta_secondary_route"), "services")
    if "show_featured" in data:
        home["show_featured"] = bool_or_default(data.get("show_featured"), False)
    if "seo_title" in data:
        home["seo_title"] = clean_text(data.get("seo_title"), 180)
    if "seo_description" in data:
        home["seo_description"] = clean_text(data.get("seo_description"), 300)
    changed = content_changed_fields(
        {key: before.get(key) for key in ("hero_kicker", "hero_title", "hero_text", "hero_image_url", "hero_image_alt", "cta_primary", "cta_primary_route", "cta_secondary", "cta_secondary_route", "show_featured", "seo_title", "seo_description")},
        {key: home.get(key) for key in ("hero_kicker", "hero_title", "hero_text", "hero_image_url", "hero_image_alt", "cta_primary", "cta_primary_route", "cta_secondary", "cta_secondary_route", "show_featured", "seo_title", "seo_description")},
        {"hero_kicker": "строка над именем", "hero_title": "заголовок", "hero_text": "текст", "hero_image_url": "фото", "hero_image_alt": "описание фото", "cta_primary": "главная кнопка", "cta_primary_route": "маршрут главной кнопки", "cta_secondary": "вторая кнопка", "cta_secondary_route": "маршрут второй кнопки", "show_featured": "показ избранного", "seo_title": "SEO-заголовок", "seo_description": "SEO-описание"},
    )
    return commit_content(content, user, "home_saved", changed)

def save_featured_content(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    existing = load_content()
    ensure_content_fresh(existing, data.get("base_updated_at"), data.get("base_version"))
    content = clone_json(existing)
    ids = data.get("featured_material_ids")
    if not isinstance(ids, list):
        raise ApiError(400, "Нужно передать список избранных материалов.")
    clean_ids: list[str] = []
    seen: set[str] = set()
    for value in ids:
        text = clean_text(value, 140)
        if text and ":" in text and text not in seen:
            seen.add(text)
            clean_ids.append(text)
    before = list(content.setdefault("home", {}).get("featured_material_ids") or [])
    content["home"]["featured_material_ids"] = clean_ids[:4]
    before_show = bool(content["home"].get("show_featured"))
    content["home"]["show_featured"] = bool(clean_ids[:4])
    changed = [] if before == content["home"]["featured_material_ids"] and before_show == content["home"]["show_featured"] else ["избранные материалы"]
    return commit_content(content, user, "featured_saved", changed)

__all__ = ['clean_text', 'bool_or_default', 'clean_editor_list_items', 'clean_editor_blocks', 'ensure_content_fresh', 'content_changed_fields', 'response_with_saved_content', 'content_history', 'restore_content_backup', 'commit_content', 'material_payload', 'find_section_item', 'material_duplicate', 'save_content', 'create_material_content', 'save_material_content', 'update_material_status', 'delete_material_content', 'save_section_content', 'save_home_content', 'save_featured_content']
