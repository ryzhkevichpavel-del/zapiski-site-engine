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
from .media_service import image_dimensions, media_path_from_url

def allowed_static(path: Path) -> bool:
    try:
        rel = path.resolve().relative_to(WEB_ROOT)
    except ValueError:
        return False
    parts = rel.parts
    if not parts:
        return False
    if parts[0] != "static":
        return False
    return path.suffix.lower() in ALLOWED_STATIC_SUFFIXES

def file_cache_header(path: Path) -> str:
    try:
        rel = path.resolve().relative_to(STATIC_DIR.resolve())
    except ValueError:
        return "no-store"
    if rel.name in {"app.js", "prepaint-auth.js", "styles.css"} or (rel.parts and rel.parts[0] in {"app_modules", "styles_modules"}):
        return "no-cache, max-age=0, must-revalidate"
    return "public, max-age=2592000, immutable"

def h(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)

def public_text(value: Any) -> str:
    text = str(value or "")
    replacements = (
        (r"личный Требник клиента", "закрытый клиентский доступ"),
        (r"личный Требник", "закрытый клиентский доступ"),
        (r"Требник клиента", "клиентский доступ"),
        (r"Требник", "клиентский доступ"),
    )
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text

def compact_text(value: Any, limit: int = 180) -> str:
    text = re.sub(r"\s+", " ", public_text(value)).strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "…"

def text_to_paragraphs_html(value: Any) -> str:
    text = public_text(value).strip()
    if not text:
        return ""
    paragraphs = re.split(r"\n{2,}", text)
    return "".join(f"<p>{h(paragraph).replace(chr(10), '<br>')}</p>" for paragraph in paragraphs if paragraph.strip())

class InlineHTMLCleaner(html.parser.HTMLParser):
    allowed_tags = {"b", "strong", "i", "em", "br", "a"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.open_tags: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag == "br":
            self.parts.append("<br>")
            return
        if tag not in self.allowed_tags:
            return
        if tag == "a":
            href = next((value or "" for name, value in attrs if name.lower() == "href"), "")
            href = href.strip()
            if re.match(r"^(https?:|mailto:|tel:|/)", href, flags=re.IGNORECASE):
                self.parts.append(f'<a href="{h(href)}" target="_blank" rel="noopener">')
                self.open_tags.append("a")
            else:
                self.parts.append("<span>")
                self.open_tags.append("span")
            return
        self.parts.append(f"<{tag}>")
        self.open_tags.append(tag)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "br":
            return
        if tag == "a":
            close_tag = self.open_tags.pop() if self.open_tags else "a"
            self.parts.append(f"</{close_tag}>")
        elif tag in self.allowed_tags:
            if self.open_tags:
                self.open_tags.pop()
            self.parts.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        self.parts.append(h(public_text(data)))

    def get_html(self) -> str:
        return "".join(self.parts)

def clean_inline_html(value: Any) -> str:
    parser = InlineHTMLCleaner()
    try:
        parser.feed(str(value or ""))
        parser.close()
        return parser.get_html()
    except Exception:
        return h(public_text(value))

def clean_text_alignment(value: Any) -> str:
    align = str(value or "").strip()
    return align if align in {"left", "center", "right", "justify"} else "left"

def text_alignment_attr(item: dict[str, Any]) -> str:
    align = clean_text_alignment(item.get("alignment") or item.get("align") or item.get("textAlign"))
    return f' class="is-text-align-{h(align)}"' if align != "left" else ""

def editor_list_items_html(items: Any, style: str = "unordered", attrs: str = "") -> str:
    if not isinstance(items, list) or not items:
        return ""
    tag = "ol" if style == "ordered" else "ul"
    rows = []
    for item in items:
        if isinstance(item, str):
            content = clean_inline_html(item)
            nested = ""
        elif isinstance(item, dict):
            content = clean_inline_html(item.get("content") or item.get("text") or "")
            nested = editor_list_items_html(item.get("items"), style)
        else:
            continue
        rows.append(f"<li>{content}{nested}</li>")
    return f"<{tag}{attrs}>{''.join(rows)}</{tag}>" if rows else ""

def editor_blocks_html(data: Any) -> str:
    blocks = data.get("blocks") if isinstance(data, dict) and isinstance(data.get("blocks"), list) else []
    parts: list[str] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        block_type = str(block.get("type") or "paragraph")
        item = block.get("data") if isinstance(block.get("data"), dict) else {}
        if block_type == "header":
            try:
                level = int(item.get("level") or 2)
            except (TypeError, ValueError):
                level = 2
            level = level if level in {2, 3, 4} else 2
            parts.append(f"<h{level}{text_alignment_attr(item)}>{clean_inline_html(item.get('text'))}</h{level}>")
        elif block_type == "list":
            parts.append(editor_list_items_html(item.get("items"), str(item.get("style") or "unordered"), text_alignment_attr(item)))
        elif block_type == "quote":
            caption = clean_inline_html(item.get("caption"))
            parts.append(f"<blockquote{text_alignment_attr(item)}><p>{clean_inline_html(item.get('text'))}</p>{f'<cite>{caption}</cite>' if caption else ''}</blockquote>")
        elif block_type == "image":
            file_data = item.get("file") if isinstance(item.get("file"), dict) else {}
            url = str(file_data.get("url") or item.get("url") or "").strip()
            if not url:
                continue
            caption = clean_inline_html(item.get("caption"))
            layout = str(item.get("layout") or ("wide" if item.get("stretched") else "center")).strip()
            layout = layout if layout in {"center", "left", "right", "wide"} else "center"
            size = str(item.get("size") or "medium").strip()
            size = size if size in {"small", "medium", "large"} else "medium"
            classes = ["material-body-image", f"is-align-{layout}", f"is-size-{size}"]
            if item.get("stretched") or layout == "wide":
                classes.append("is-stretched")
            alt = public_text(item.get("alt") or item.get("caption") or "Изображение")
            image = image_html(url, alt)
            parts.append(f'<figure class="{" ".join(classes)}"><button class="material-image-open" type="button" data-action="image-lightbox" data-image-url="{h(url)}" data-image-alt="{h(alt)}">{image}</button>{f"<figcaption>{caption}</figcaption>" if caption else ""}</figure>')
        elif block_type == "delimiter":
            parts.append("<hr>")
        else:
            parts.append(f"<p{text_alignment_attr(item)}>{clean_inline_html(item.get('text'))}</p>")
    return "".join(parts)

def material_body_html(item: dict[str, Any]) -> str:
    blocks = item.get("blocks") if isinstance(item.get("blocks"), dict) else {}
    if isinstance(blocks.get("blocks"), list) and blocks.get("blocks"):
        return editor_blocks_html(blocks)
    return text_to_paragraphs_html(item.get("body") or item.get("excerpt") or "")

def route_path(route: str, slug: str = "") -> str:
    route = str(route or "").strip("/")
    slug = str(slug or "").strip("/")
    if route in {"", "home"}:
        return "/"
    if slug:
        return f"/{quote(route)}/{quote(slug)}"
    return f"/{quote(route)}"

def safe_public_route(value: Any, default: str = "services") -> str:
    route = str(value or "").strip("/").lower()
    return route if route in PUBLIC_SECTION_ROUTES or route == "home" else default

def absolute_url(base_url: str, path: str) -> str:
    clean_base = str(base_url or "").rstrip("/")
    clean_path = path if str(path).startswith("/") else f"/{path}"
    return f"{clean_base}{clean_path}"

def hero_title(content: dict[str, Any]) -> str:
    home = content.get("home") if isinstance(content.get("home"), dict) else {}
    value = str(home.get("hero_title") or home.get("welcome_title") or "").strip()
    return DEFAULT_HERO_TITLE if not value or value == OLD_HERO_TITLE else public_text(value)

def hero_kicker(content: dict[str, Any]) -> str:
    home = content.get("home") if isinstance(content.get("home"), dict) else {}
    return public_text(str(home.get("hero_kicker") or "").strip())

def hero_text(content: dict[str, Any]) -> str:
    home = content.get("home") if isinstance(content.get("home"), dict) else {}
    value = str(home.get("hero_text") or home.get("welcome_text") or "").strip()
    return DEFAULT_HERO_TEXT if not value or value == OLD_HERO_TEXT else public_text(value)

def brand_logo_url(content: dict[str, Any]) -> str:
    brand = content.get("brand") if isinstance(content.get("brand"), dict) else {}
    return str(brand.get("header_visual_url") or DEFAULT_BRAND_LOGO_URL).strip()

def site_name(content: dict[str, Any]) -> str:
    brand = content.get("brand") if isinstance(content.get("brand"), dict) else {}
    home = content.get("home") if isinstance(content.get("home"), dict) else {}
    return str(brand.get("site_name") or home.get("title") or "Записки чернокнижника").strip()

def admin_area_name(content: dict[str, Any]) -> str:
    brand = content.get("brand") if isinstance(content.get("brand"), dict) else {}
    raw = str(brand.get("admin_area_name") or "").strip()
    return "Мастерская" if not raw or raw == "Админка" else raw

def client_area_name(content: dict[str, Any]) -> str:
    brand = content.get("brand") if isinstance(content.get("brand"), dict) else {}
    return str(brand.get("client_area_name") or "Требник").strip() or "Требник"

def public_sections(content: dict[str, Any]) -> dict[str, Any]:
    sections = content.get("sections") if isinstance(content.get("sections"), dict) else {}
    return {route: sections.get(route, {}) for route in PUBLIC_SECTION_ROUTES}

def published_section_items(section: dict[str, Any]) -> list[dict[str, Any]]:
    items = section.get("items", []) if isinstance(section, dict) else []
    if not isinstance(items, list):
        return []
    return [
        item
        for item in items
        if isinstance(item, dict) and item.get("status") == "published" and str(item.get("slug") or "").strip()
    ]

def section_display_name(content: dict[str, Any], route: str) -> str:
    sections = content.get("sections") if isinstance(content.get("sections"), dict) else {}
    section = sections.get(route) if isinstance(sections.get(route), dict) else {}
    return public_text(section.get("title") or PUBLIC_SECTION_NAMES.get(route, route))

def find_public_item(content: dict[str, Any], route: str, slug: str) -> dict[str, Any] | None:
    section = public_sections(content).get(route) or {}
    for item in section.get("items", []) if isinstance(section.get("items"), list) else []:
        if str(item.get("slug") or "") == slug and item.get("status") == "published":
            return item
    return None

def featured_materials(content: dict[str, Any]) -> list[tuple[str, dict[str, Any], str]]:
    home = content.get("home") if isinstance(content.get("home"), dict) else {}
    sections = public_sections(content)
    ids = home.get("featured_material_ids") if isinstance(home.get("featured_material_ids"), list) else []
    keys = [str(value or "").strip() for value in ids if str(value or "").strip()]
    if not keys and home.get("show_featured") is True:
        keys = default_featured_material_ids(sections)
    result: list[tuple[str, dict[str, Any], str]] = []
    seen: set[str] = set()
    for key in keys:
        if ":" not in key or key in seen:
            continue
        route, slug = key.split(":", 1)
        if route not in PUBLIC_SECTION_ROUTES:
            continue
        item = find_public_item(content, route, slug)
        if not item:
            continue
        section = sections.get(route) or {}
        result.append((route, item, public_text(section.get("title") or PUBLIC_SECTION_NAMES.get(route, route))))
        seen.add(key)
        if len(result) >= 4:
            break
    return result

def image_size(url: Any, owner: dict[str, Any] | None = None, prefix: str = "cover_image") -> tuple[int | None, int | None]:
    owner = owner if isinstance(owner, dict) else {}
    width = owner.get(f"{prefix}_width")
    height = owner.get(f"{prefix}_height")
    try:
        width_int = int(width) if width else None
        height_int = int(height) if height else None
    except (TypeError, ValueError):
        width_int = height_int = None
    if width_int and height_int:
        return width_int, height_int
    path = media_path_from_url(str(url or ""))
    if path and path.exists():
        return image_dimensions(path)
    return None, None

def image_attrs(url: Any, owner: dict[str, Any] | None = None, prefix: str = "cover_image") -> str:
    width, height = image_size(url, owner, prefix)
    if not width or not height:
        return ""
    ratio = max(0.1, float(width) / float(height))
    return f' width="{int(width)}" height="{int(height)}" style="--image-ratio:{ratio:.4f}"'

def cover_ratio_class(url: Any, owner: dict[str, Any] | None = None, prefix: str = "cover_image") -> str:
    width, height = image_size(url, owner, prefix)
    if not width or not height:
        return ""
    ratio = float(width) / float(height)
    if ratio < 0.82:
        return "cover-portrait"
    if ratio > 1.18:
        return "cover-landscape"
    return "cover-square"

def image_html(url: Any, alt: Any, class_name: str = "card-image", owner: dict[str, Any] | None = None, prefix: str = "cover_image", priority: bool = False) -> str:
    clean = str(url or "").strip()
    if not clean:
        return ""
    loading = ' loading="lazy"' if not priority else ""
    fetchpriority = ' fetchpriority="high"' if priority else ""
    return f'<img class="{h(class_name)}" src="{h(clean)}" alt="{h(public_text(alt))}"{image_attrs(clean, owner, prefix)}{loading} decoding="async"{fetchpriority}>'

def optimized_image_srcset(url: Any) -> str:
    clean = str(url or "").strip()
    match = re.match(r"^(.*-)(\d+)(\.webp)$", clean)
    if not match:
        return ""
    return f"{clean} {match.group(2)}w"

def hero_image_html(url: Any, alt: Any, fallback_alt: str, home: dict[str, Any] | None = None) -> str:
    clean = str(url or "").strip()
    if not clean:
        return ""
    srcset = optimized_image_srcset(clean)
    responsive = f' srcset="{h(srcset)}" sizes="(max-width: 860px) 92vw, 34vw"' if srcset else ""
    return (
        f'<img class="hero-image" src="{h(clean)}"{responsive} '
        f'alt="{h(public_text(alt) or fallback_alt)}"{image_attrs(clean, home, "hero_image")} decoding="async" fetchpriority="high">'
    )

def card_media_html(item: dict[str, Any], section_title: str) -> str:
    url = str(item.get("cover_image_url") or "").strip()
    title = public_text(item.get("title") or "Материал")
    if url:
        return f'<div class="content-card-media">{image_html(url, item.get("cover_image_alt") or title, owner=item)}</div>'
    return (
        '<div class="content-card-media card-placeholder">'
        f"<div><strong>{h(title)}</strong><span>{h(public_text(section_title))}</span></div>"
        "</div>"
    )

def material_card_html(item: dict[str, Any], route: str, section_title: str) -> str:
    title = public_text(item.get("title") or "Без названия")
    excerpt = public_text(item.get("excerpt") or "")
    slug = str(item.get("slug") or "").strip()
    price = str(item.get("price") or "").strip() if item.get("show_price") is not False else ""
    foot_right = price if route == "services" else ""
    has_cover = bool(str(item.get("cover_image_url") or "").strip())
    cover_class = cover_ratio_class(item.get("cover_image_url"), item)
    href = route_path(route, slug)
    service_action = ""
    if route == "services":
        service_action = f'<button class="service-card-action" type="button" data-action="inquiry" data-route="services" data-title="{h(title)}">Оставить заявку</button>'
    excerpt_html = f"<p>{h(excerpt)}</p>" if excerpt else ""
    foot_html = f'<span class="card-foot"><span>{h(foot_right)}</span></span>' if foot_right else ""
    return (
        f'<article class="content-card card-{h(route)} {"has-cover" if has_cover else "no-cover"} {h(cover_class)}">'
        f'<a class="content-card-main" href="{h(href)}" data-route="{h(route)}" data-slug="{h(slug)}">'
        f"{card_media_html(item, section_title)}"
        '<div class="content-card-copy">'
        f"<h2>{h(title)}</h2>"
        f"{excerpt_html}"
        f"{foot_html}"
        "</div></a>"
        f"{service_action}"
        "</article>"
    )

def section_topic_groups(section: dict[str, Any]) -> list[dict[str, Any]]:
    if section.get("topics_enabled") is not True:
        return []
    topics = section.get("topics") if isinstance(section.get("topics"), list) else []
    items = published_section_items(section)
    groups: list[dict[str, Any]] = []
    for topic in topics:
        if not isinstance(topic, dict) or topic.get("enabled") is False:
            continue
        slug = str(topic.get("slug") or "").strip()
        title = public_text(topic.get("title") or "")
        if not slug or not title:
            continue
        topic_items = [item for item in items if str(item.get("topic_slug") or "").strip() == slug]
        groups.append({"slug": slug, "title": title, "items": topic_items})
    return groups

def section_topic_nav_html(content: dict[str, Any], route: str, active_topic: str = "", active_slug: str = "") -> str:
    section = public_sections(content).get(route) or {}
    groups = section_topic_groups(section)
    if not groups:
        return ""
    section_title = public_text(section.get("title") or PUBLIC_SECTION_NAMES.get(route, route))
    rows = []
    for group in groups:
        group_slug = str(group.get("slug") or "")
        is_open = bool(active_topic and active_topic == group_slug)
        links = []
        for item in group.get("items", []):
            slug = str(item.get("slug") or "").strip()
            title = public_text(item.get("title") or "Материал")
            active = slug and slug == active_slug
            active_attrs = ' class="is-active" aria-current="page"' if active else ""
            links.append(
                f'<a href="{h(route_path(route, slug))}" data-route="{h(route)}" data-slug="{h(slug)}"{active_attrs}>{h(title)}</a>'
            )
        if not links:
            links.append('<span class="topic-nav-empty">Материалов пока нет</span>')
        rows.append(
            f'<details class="topic-nav-group {"is-active" if is_open else ""}" {"open" if is_open else ""}>'
            f'<summary><span>{h(group["title"])}</span><em>{len(links)}</em></summary>'
            f'<nav class="topic-nav-links" aria-label="{h(group["title"])}">{"".join(links)}</nav>'
            "</details>"
        )
    return (
        f'<aside class="topic-nav" aria-label="Темы раздела {h(section_title)}">'
        '<div class="topic-nav-head">Темы</div>'
        f'<div class="topic-nav-list">{"".join(rows)}</div>'
        "</aside>"
    )

def section_topic_mobile_menu_html(content: dict[str, Any], route: str, active_topic: str = "", active_slug: str = "") -> str:
    section = public_sections(content).get(route) or {}
    groups = section_topic_groups(section)
    if not groups:
        return ""
    rows = []
    for group in groups:
        group_slug = str(group.get("slug") or "")
        is_open = bool(active_topic and active_topic == group_slug)
        links = []
        for item in group.get("items", []):
            slug = str(item.get("slug") or "").strip()
            title = public_text(item.get("title") or "Материал")
            active = slug and slug == active_slug
            active_attrs = ' class="is-active" aria-current="page"' if active else ""
            links.append(
                f'<a href="{h(route_path(route, slug))}" data-route="{h(route)}" data-slug="{h(slug)}"{active_attrs}>{h(title)}</a>'
            )
        if not links:
            links.append('<span class="topic-nav-empty">Материалов пока нет</span>')
        rows.append(
            f'<details class="topic-nav-group {"is-active" if is_open else ""}" {"open" if is_open else ""}>'
            f'<summary><span>{h(group["title"])}</span><em>{len(links)}</em></summary>'
            f'<nav class="topic-nav-links" aria-label="{h(group["title"])}">{"".join(links)}</nav>'
            "</details>"
        )
    return (
        '<details class="mobile-topic-menu">'
        '<summary class="plain mobile-topic-trigger">Темы</summary>'
        f'<div class="mobile-topic-panel"><div class="topic-nav-list">{"".join(rows)}</div></div>'
        "</details>"
    )

def section_tools_placeholder_html() -> str:
    return (
        '<div class="section-tools section-tools-placeholder" aria-hidden="true">'
        '<div class="section-left-actions"></div>'
        '<div class="section-right-actions"></div>'
        '</div>'
    )

def public_nav_html(content: dict[str, Any], active_route: str) -> str:
    links = ['<a href="/" data-route="home"' + (' class="active" aria-current="page"' if active_route == "home" else "") + ">Главная</a>"]
    for route in PUBLIC_SECTION_ROUTES:
        active = active_route == route
        active_attrs = ' class="active" aria-current="page"' if active else ""
        links.append(
            f'<a href="{h(route_path(route))}" data-route="{h(route)}"'
            f'{active_attrs}>{h(section_display_name(content, route))}</a>'
        )
    return "\n        ".join(links)

def server_profile_initial(user: dict[str, Any] | None) -> str:
    if not user:
        return ""
    source = str(user.get("display_name") or user.get("username") or "").strip()
    if source:
        return source[:1].upper()
    if is_admin_session(user):
        return "А"
    if user.get("role") == "client":
        return "К"
    return ""

def render_header_html(content: dict[str, Any], active_route: str, viewer: dict[str, Any] | None = None) -> str:
    name = site_name(content)
    admin_name = admin_area_name(content)
    brand = content.get("brand") if isinstance(content.get("brand"), dict) else {}
    subtitle = str(brand.get("site_subtitle") or "").strip()
    logo_url = brand_logo_url(content)
    logo_style = f" style=\"--brand-logo-url:url('{h(logo_url)}')\"" if logo_url else ""
    subtitle_html = f'<span class="brand-sub" id="brandSub">{h(subtitle)}</span>' if subtitle else '<span class="brand-sub" id="brandSub" hidden></span>'
    logged_in = bool(viewer)
    is_admin = is_admin_session(viewer)
    admin_hidden = "" if is_admin else " hidden"
    login_hidden = " hidden" if logged_in or not smtp_configured() else ""
    profile_hidden = "" if logged_in else " hidden"
    profile_label = f'Профиль: {public_text(viewer.get("display_name") or viewer.get("username"))}' if viewer else "Профиль"
    profile_name = public_text(viewer.get("display_name") or viewer.get("username") or "Профиль") if viewer else "Профиль"
    avatar = server_profile_initial(viewer)
    profile_html = (
        f"""
        <div id="profileControl" class="profile-control"{profile_hidden}>
          <button id="profileButton" class="account-trigger" type="button" aria-label="{h(profile_label)}" aria-haspopup="menu" aria-expanded="false">
            <span id="profileAvatar" class="account-avatar">{h(avatar)}</span>
            <span class="account-name">{h(profile_name)}</span>
            <span class="account-caret" aria-hidden="true"></span>
          </button>
          <div id="profileMenu" class="profile-menu" role="menu" hidden></div>
        </div>"""
        if logged_in else ""
    )
    return f"""
    <header class="site-header" id="siteHeader" data-nosnippet>
      <a class="brand-lockup" href="/" data-route="home" aria-label="На главную">
        <span class="brand-mark" id="brandMark" aria-hidden="true"{logo_style}></span>
        <span class="brand-copy">
          <span class="brand-name" id="brandName" data-text="{h(name)}">{h(name)}</span>
          {subtitle_html}
        </span>
      </a>

      <button id="menuButton" class="menu-button" type="button" aria-label="Открыть меню" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>

      <nav id="siteNav" class="site-nav" aria-label="Разделы сайта">
        {public_nav_html(content, active_route)}
        <div id="mobileNavActions" class="mobile-nav-actions" hidden></div>
      </nav>

      <div class="header-actions">
        <button id="loginButton" class="entry-button" type="button"{login_hidden}>Войти</button>
        <div id="notificationsControl" class="notification-control" hidden>
          <button id="notificationsButton" class="notification-button" type="button" data-action="notifications-open" aria-haspopup="dialog" aria-expanded="false" aria-label="Уведомления"></button>
          <div id="notificationsPanel" class="notification-popover" hidden></div>
        </div>
        <div id="messagesControl" class="message-control" hidden>
          <button id="messagesButton" class="message-button" type="button" data-action="messages-open" aria-label="Сообщения"></button>
        </div>
        {profile_html}
      </div>
    </header>"""

def home_button_html(home: dict[str, Any], which: str) -> str:
    if which == "primary":
        raw_label = home.get("cta_primary_label") if "cta_primary_label" in home else home.get("cta_primary", "Оставить заявку")
        label = public_text(str(raw_label or "").strip())
        if not label:
            return ""
        route = safe_public_route(home.get("cta_primary_route"), "services")
        action = str(home.get("cta_primary_action") or "").strip()
        title = public_text(home.get("cta_primary_title") or "Заявка с главной")
        if action == "inquiry":
            return f'<button class="primary" data-action="inquiry" data-route="{h(route)}" data-title="{h(title)}">{h(label)}</button>'
        return f'<a class="primary" href="{h(route_path(route))}" data-route="{h(route)}">{h(label)}</a>'
    raw_label = home.get("cta_secondary_label") if "cta_secondary_label" in home else home.get("cta_secondary", "Смотреть услуги")
    label = public_text(str(raw_label or "").strip())
    if not label:
        return ""
    route = safe_public_route(home.get("cta_secondary_route"), "services")
    return f'<a class="secondary" href="{h(route_path(route))}" data-route="{h(route)}">{h(label)}</a>'

def home_contact_buttons_html(home: dict[str, Any]) -> str:
    telegram_url = str(home.get("telegram_url") or "").strip()
    telegram_label = public_text(str(home.get("telegram_label") or "Написать в Telegram").strip())
    site_label = public_text(str(home.get("site_message_label") or "Написать тут").strip())
    telegram = (
        f'<a class="hero-contact-button" href="{h(telegram_url)}" target="_blank" rel="noopener">{h(telegram_label)}</a>'
        if telegram_url and telegram_label
        else ""
    )
    site_message = f'<button class="hero-contact-button" type="button" data-action="site-message">{h(site_label)}</button>' if site_label else ""
    if not telegram and not site_message:
        return ""
    return f'<div class="hero-contact-actions">{telegram}{site_message}</div>'

def hero_featured_html(content: dict[str, Any], contact_html: str = "") -> str:
    home = content.get("home") if isinstance(content.get("home"), dict) else {}
    if home.get("show_featured") is not True:
        return contact_html
    items = featured_materials(content)
    if not items:
        return contact_html
    cards = []
    for route, item, section_title in items:
        title = public_text(item.get("title") or "Материал")
        excerpt = compact_text(item.get("excerpt") or "", 120)
        excerpt_html = f"<p>{h(excerpt)}</p>" if excerpt else ""
        cards.append(
            '<article class="hero-featured-item">'
            f'<a class="hero-featured-main" href="{h(route_path(route, str(item.get("slug") or "")))}" data-route="{h(route)}" data-slug="{h(item.get("slug") or "")}">'
            f"<strong>{h(title)}</strong>"
            f"{excerpt_html}"
            "</a></article>"
        )
    return (
        '<aside class="hero-featured" aria-label="Избранные материалы">'
        '<div class="hero-featured-head">'
        '<div class="hero-featured-title">Избранное</div>'
        f"{contact_html}"
        "</div>"
        f'<div class="hero-featured-list">{"".join(cards)}</div>'
        "</aside>"
    )

def home_html(content: dict[str, Any]) -> str:
    home = content.get("home") if isinstance(content.get("home"), dict) else {}
    image_url = str(home.get("hero_image_url") or "").strip()
    image_alt = home.get("hero_image_alt") or site_name(content)
    has_media = bool(image_url)
    kicker = hero_kicker(content)
    image = (
        '<div class="hero-media"><div class="hero-frame">'
        f'<div class="hero-frame-inner">{hero_image_html(image_url, image_alt, site_name(content), home)}</div>'
        "</div></div>"
    ) if has_media else ""
    primary_button = home_button_html(home, "primary")
    secondary_button = home_button_html(home, "secondary")
    actions = f'<div class="hero-actions">{primary_button}{secondary_button}</div>' if primary_button or secondary_button else ""
    return f"""
    <section class="home-layout">
      <article class="hero-stage panel {'has-media' if has_media else 'is-text-only'}">
        <div class="hero-copy">
          {f'<div class="hero-kicker">{h(kicker)}</div>' if kicker else ''}
          <h1>{h(hero_title(content))}</h1>
          <div class="hero-text">{text_to_paragraphs_html(hero_text(content))}</div>
          {actions}
          {hero_featured_html(content, home_contact_buttons_html(home))}
        </div>
        {image}
      </article>
    </section>"""

def section_html(content: dict[str, Any], route: str) -> str:
    section = public_sections(content).get(route) or {}
    title = public_text(section.get("title") or PUBLIC_SECTION_NAMES.get(route, route))
    items = published_section_items(section)
    topic_nav = section_topic_nav_html(content, route)
    if route == "questions":
        cards = "".join(material_card_html(item, route, title) for item in items)
        materials_attr = "1" if items else "0"
        body = f"""
      <section class="questions-hub is-booting">
        <h1 class="visually-hidden">{h(title)}</h1>
        <div class="questions-content">
          {f'<div class="content-grid section-grid section-grid-questions questions-materials">{cards}</div>' if cards else ''}
          <div class="community-list questions-list" data-questions-list data-has-materials="{materials_attr}" hidden></div>
        </div>
      </section>"""
        topic_slot = topic_nav or '<div class="topic-nav topic-nav-placeholder" aria-hidden="true"></div>'
        layout = f'<div class="section-topic-layout has-topic-slot {"has-topic-nav" if topic_nav else "is-topic-empty"}">{topic_slot}<div class="section-topic-main">{body}</div></div>'
        return f"""
    <section class="public-section section-questions">
      {section_tools_placeholder_html()}
      {layout}
    </section>"""
    cards = "".join(material_card_html(item, route, title) for item in items) or '<div class="empty">В этом разделе пока нет опубликованных материалов.</div>'
    grid = f"""
      <h1 class="visually-hidden">{h(title)}</h1>
      <div class="content-grid section-grid section-grid-{h(route)}">{cards}</div>"""
    topic_slot = topic_nav or '<div class="topic-nav topic-nav-placeholder" aria-hidden="true"></div>'
    layout = f'<div class="section-topic-layout has-topic-slot {"has-topic-nav" if topic_nav else "is-topic-empty"}">{topic_slot}<div class="section-topic-main">{grid}</div></div>'
    return f"""
    <section class="public-section section-{h(route)}">
      {section_tools_placeholder_html()}
      {layout}
    </section>"""

def material_cta_html(item: dict[str, Any], route: str) -> str:
    cta_label = public_text(item.get("cta_label") or ("Оставить заявку" if route == "services" else "К сведению"))
    cta_note = public_text(item.get("cta_note") or ("Опишите ситуацию и оставьте способ связи. Сообщение попадет в Мастерскую." if route == "services" else ""))
    if route == "services":
        return (
            '<aside class="service-step">'
            f'<div><h2>{h(cta_label)}</h2><p class="subtle">{h(cta_note)}</p></div>'
            f'<button class="primary" data-action="inquiry" data-route="services" data-title="{h(public_text(item.get("title") or "Услуга"))}">Оставить заявку</button>'
            "</aside>"
        )
    if not item.get("cta_label") and not item.get("cta_note"):
        return ""
    return f'<aside class="material-aside"><h2>{h(cta_label)}</h2><p class="subtle">{h(cta_note)}</p></aside>'

def material_html(content: dict[str, Any], route: str, slug: str) -> str:
    section = public_sections(content).get(route) or {}
    item = find_public_item(content, route, slug)
    if not item:
        raise ApiError(404, "Материал не найден.")
    section_title = public_text(section.get("title") or PUBLIC_SECTION_NAMES.get(route, route))
    title = public_text(item.get("title") or "Материал")
    mobile_topic_menu = section_topic_mobile_menu_html(content, route, str(item.get("topic_slug") or ""), slug)
    price = str(item.get("price") or "").strip() if item.get("show_price") is not False else ""
    date_label = str(item.get("date") or "").strip()
    author_label = public_text(item.get("author_name") or "")
    author_slug = str(item.get("author_slug") or "").strip()
    author_html = (
        f'<a class="pill material-meta-link material-author-link" href="{h(route_path("u", author_slug))}" data-route="u" data-slug="{h(author_slug)}">{h(author_label)}</a>'
        if author_label and author_slug
        else (f'<span class="pill">{h(author_label)}</span>' if author_label else "")
    )
    article = f"""
    <article class="material-page reading-page material-{h(route)} no-cover">
      <div class="material-public-tools material-public-tools-static">
        <a class="plain material-back-link" href="{h(route_path(route))}" data-route="{h(route)}">К разделу</a>
        {mobile_topic_menu}
        <div class="material-top-actions"></div>
      </div>
      <h1 class="material-title">{h(title)}</h1>
      <div class="material-body">{material_body_html(item)}</div>
      <div class="material-meta material-meta-public material-meta-footer">{f'<span class="pill price">{h(price)}</span>' if price and route == "services" else ''}{f'<span class="pill">{h(date_label)}</span>' if date_label else ''}{author_html}</div>
      {material_cta_html(item, route) if item.get("show_cta") is not False else ""}
    </article>"""
    topic_nav = section_topic_nav_html(content, route, str(item.get("topic_slug") or ""), slug)
    if not topic_nav:
        return article
    return f'<div class="material-topic-layout has-topic-nav">{topic_nav}{article}</div>'

def legal_body_html(kind: str, content: dict[str, Any]) -> str:
    name = h(site_name(content))
    if kind == "privacy":
        return f"""
        <p><strong>{name}</strong> обрабатывает только те данные, которые нужны для работы сайта, публичного сообщества, заявок и закрытого клиентского доступа. Оператор сайта: администрация сайта {name}. Связаться по вопросам персональных данных можно через форму заявки или через тот канал связи, который уже используется для общения с администрацией.</p>
        <h2>Какие данные обрабатываются</h2>
        <ul>
          <li>при регистрации: почта, пароль в защищенном виде, публичное имя, ник, дата регистрации, технический статус аккаунта;</li>
          <li>в публичном профиле: имя, ник, фото или монограмма, описание о себе, статус доверенного профиля, публичные комментарии, вопросы и лайки;</li>
          <li>в заявках: имя, контакт, текст сообщения, выбранный материал или раздел;</li>
          <li>в закрытом клиентском доступе: данные, сообщения, платежные отметки и рабочие записи, которые нужны для сопровождения клиента;</li>
          <li>технически: IP-адрес, время действий, данные сессии, защитные журналы сервера и браузерный токен входа.</li>
        </ul>
        <h2>Зачем это нужно</h2>
        <p>Данные используются для регистрации и входа, защиты от спама, модерации, публикации комментариев и вопросов, ответа на заявки, отправки кодов входа и важных уведомлений, работы подписок и закрытого клиентского доступа.</p>
        <h2>Что видно другим</h2>
        <p>Другим посетителям могут быть видны только публичные данные: имя, ник, фото профиля, описание, опубликованные комментарии, опубликованные вопросы, лайки и публичный статус профиля. Почта, контакт из заявки, пароль, технические журналы и закрытые клиентские данные не публикуются.</p>
        <h2>Файлы cookie и счетчики</h2>
        <p>Сайт использует техническую сессию и хранение входа в браузере, чтобы пользователь оставался авторизованным. Для администратора ведется внутренний счетчик посещений без внешних аналитических сервисов: открытый IP-адрес в нем не публикуется, а посетитель учитывается по техническому отпечатку. Google Analytics, Яндекс.Метрика и другие внешние счетчики на сайте не подключены. Если такие сервисы появятся, политика будет обновлена до подключения.</p>
        <h2>Передача данных</h2>
        <p>Данные не продаются и не передаются посторонним для рекламы. Технически данные могут обрабатываться хостингом, почтовым сервисом и средствами защиты сайта. Трансграничная передача специально не используется; иностранные аналитические сервисы не подключены.</p>
        <h2>Сроки и права</h2>
        <p>Данные хранятся, пока нужен аккаунт, заявка, клиентский доступ или защита сайта. Пользователь может попросить изменить, удалить, ограничить обработку данных или отозвать согласие. После отзыва часть данных может временно сохраняться в журналах и резервных копиях, если это нужно для безопасности и учета действий.</p>
        <p>Актуальная редакция: 30 апреля 2026 года.</p>"""
    if kind == "personal-data-consent":
        return f"""
        <p>Оставляя заявку, регистрируясь или публикуя материалы на сайте {name}, пользователь дает администрации сайта согласие на обработку персональных данных на условиях ниже.</p>
        <h2>Состав данных</h2>
        <p>Согласие относится к данным, которые пользователь сам вводит на сайте: почта, имя, ник, пароль в защищенном виде, фото профиля, описание о себе, контакт для ответа, текст заявки, комментарии, вопросы, лайки, настройки подписок и технические данные входа.</p>
        <h2>Действия с данными</h2>
        <p>Разрешаются сбор, запись, хранение, уточнение, использование, публикация разрешенных публичных данных, блокирование, удаление и техническая передача тем сервисам, без которых сайт не может работать: хостингу, почтовой отправке и средствам защиты.</p>
        <h2>Публичная публикация</h2>
        <p>Пользователь отдельно разрешает показывать неопределенному кругу лиц свое публичное имя, ник, фото профиля, описание, опубликованные комментарии, опубликованные вопросы, лайки и публичный статус профиля. Почта, контакт из заявки, пароль и закрытые клиентские данные в это разрешение не входят.</p>
        <h2>Цель</h2>
        <p>Цель обработки: регистрация, вход, работа публичного профиля, публикация комментариев и вопросов, ответы на заявки, модерация, защита от спама, уведомления, подписки и закрытый клиентский доступ.</p>
        <h2>Срок</h2>
        <p>Согласие действует до его отзыва или до удаления аккаунта, если закон или безопасность сайта не требуют временно сохранить отдельные записи. Отозвать согласие можно через обращение к администрации сайта.</p>"""
    return """
        <p>Регистрация дает публичный профиль для комментариев, вопросов, лайков и подписок. Она не открывает закрытый клиентский доступ.</p>
        <h2>Публичные материалы</h2>
        <p>Комментарии и вопросы проходят модерацию, если профиль еще не доверенный. Доверенный статус может быть включен или снят администрацией вручную.</p>
        <h2>Нельзя</h2>
        <ul>
          <li>публиковать чужие телефоны, адреса, почту, документы, личные переписки и фотографии без согласия людей на них;</li>
          <li>выдавать себя за другого человека;</li>
          <li>оставлять спам, угрозы, оскорбления и материалы, нарушающие закон;</li>
          <li>использовать сайт для сбора чужих персональных данных.</li>
        </ul>
        <p>Такие материалы могут быть скрыты, а профиль заблокирован. Личные переписки между пользователями в этой версии сайта не работают.</p>"""

def legal_page_html(content: dict[str, Any], kind: str, title: str) -> str:
    return f"""
    <article class="material-page legal-page">
      <h1>{h(title)}</h1>
      <div class="material-body">{legal_body_html(kind, content)}</div>
    </article>"""

def privacy_html(content: dict[str, Any]) -> str:
    return legal_page_html(content, "privacy", "Политика обработки персональных данных")

def rules_html(content: dict[str, Any]) -> str:
    return legal_page_html(content, "rules", "Правила сайта")

def personal_data_consent_html(content: dict[str, Any]) -> str:
    return legal_page_html(content, "personal-data-consent", "Согласие на обработку персональных данных")

def app_shell_loading_html(text: str) -> str:
    return f'<div class="loading"><span class="spinner"></span><span>{h(text)}</span></div>'

def app_shell_html(content: dict[str, Any], route: str) -> str:
    if route == "trebnik":
        return app_shell_loading_html("Открываю Требник…")
    if route == "admin":
        return app_shell_loading_html(f"Открываю {admin_area_name(content)}…")
    if route == "u":
        return app_shell_loading_html("Открываю профиль…")
    return app_shell_loading_html("Открываю записи…")

def profile_ssr_name(profile: dict[str, Any]) -> str:
    return public_text(profile.get("display_name") or profile.get("nickname") or "Пользователь")

def profile_ssr_initial(profile: dict[str, Any]) -> str:
    return (profile_ssr_name(profile)[:1] or "У").upper()

def profile_ssr_avatar_html(profile: dict[str, Any]) -> str:
    url = str(profile.get("avatar_url") or "").strip()
    name = profile_ssr_name(profile)
    if url:
        return (
            f'<button class="profile-identity-photo" type="button" data-action="image-lightbox" '
            f'data-image-url="{h(url)}" data-image-alt="{h(name)}" aria-label="Открыть фото профиля">'
            f'<img src="{h(url)}" alt="{h(name)}" loading="lazy" decoding="async"></button>'
        )
    return f'<span class="profile-identity-photo is-empty">{h(profile_ssr_initial(profile))}</span>'

def profile_ssr_date(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        clean = text.replace("Z", "+00:00")
        return datetime.fromisoformat(clean).strftime("%d.%m.%Y")
    except (TypeError, ValueError):
        return text[:10]

def profile_ssr_status_html(profile: dict[str, Any]) -> str:
    return '<span class="profile-online-status">онлайн</span>' if profile.get("online") is True else ""

def profile_ssr_comment_html(item: dict[str, Any]) -> str:
    route = str(item.get("target_route") or "").strip()
    slug = str(item.get("target_slug") or "").strip()
    url = str(item.get("target_url") or route_path(route, slug)).strip()
    date = profile_ssr_date(item.get("created_at"))
    return (
        f'<a class="profile-feed-row" href="{h(url)}" data-route="{h(route)}" data-slug="{h(slug)}">'
        f'<strong>{h(item.get("target_title") or "Материал")}</strong>'
        f'<span>{h(compact_text(item.get("body") or "", 150))}</span>'
        f'{f"<em>{h(date)}</em>" if date else ""}'
        "</a>"
    )

def profile_ssr_question_html(item: dict[str, Any]) -> str:
    item_id = str(item.get("id") or "").strip()
    url = str(item.get("target_url") or route_path("questions", item_id)).strip()
    date = profile_ssr_date(item.get("answered_at") or item.get("created_at"))
    answer = compact_text(item.get("answer") or "Ответ пока не опубликован.", 150)
    return (
        f'<a class="profile-feed-row" href="{h(url)}" data-route="questions" data-slug="{h(item_id)}">'
        f'<strong>{h(compact_text(item.get("question") or "Вопрос", 120))}</strong>'
        f'<span>{h(answer)}</span>'
        f'{f"<em>{h(date)}</em>" if date else ""}'
        "</a>"
    )

def profile_ssr_html(payload: dict[str, Any]) -> str:
    profile = payload.get("profile") if isinstance(payload.get("profile"), dict) else {}
    activity = payload.get("activity") if isinstance(payload.get("activity"), dict) else {}
    comments = [{"kind": "comment", "item": item} for item in activity.get("comments", []) if isinstance(item, dict)]
    questions = [{"kind": "question", "item": item} for item in activity.get("questions", []) if isinstance(item, dict)]
    latest = sorted(
        comments + questions,
        key=lambda row: str(row["item"].get("answered_at") or row["item"].get("created_at") or ""),
        reverse=True,
    )[:12]
    feed_html = "".join(
        profile_ssr_question_html(row["item"]) if row["kind"] == "question" else profile_ssr_comment_html(row["item"])
        for row in latest
    )
    return f"""
    <article class="profile-cabinet" data-profile-tab="overview" data-profile-mode="public">
      <div class="profile-cabinet-shell">
        <aside class="profile-identity-rail">
          {profile_ssr_avatar_html(profile)}
        </aside>
        <section class="profile-workspace">
          <header class="profile-workspace-head">
            <div class="profile-name-slot"><h1>{h(profile_ssr_name(profile))}</h1>{profile_ssr_status_html(profile)}</div>
          </header>
          <div class="profile-tab-body">
            <div class="profile-content-grid profile-public-grid">
              <section class="profile-section is-wide">
                <div class="profile-section-head"><h3>Лента</h3></div>
                <div class="profile-feed-list">{feed_html or '<p class="profile-quiet">Публичных записей пока нет.</p>'}</div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </article>"""

def profile_ssr_meta(payload: dict[str, Any], content: dict[str, Any], slug: str = "") -> tuple[str, str, str, str]:
    profile = payload.get("profile") if isinstance(payload.get("profile"), dict) else {}
    name = profile_ssr_name(profile)
    site = site_name(content)
    description = f"Публичный профиль пользователя {name}."
    canonical = str(profile.get("profile_url") or route_path("u", slug)).strip() or route_path("u", slug)
    return f"{name} — {site}", compact_text(description, 220), canonical, "profile"

def seo_field(data: dict[str, Any], primary: str, fallback: str = "") -> str:
    value = str(data.get(primary) or data.get(primary.replace("seo_", "meta_")) or "").strip()
    return public_text(value) if value else fallback

def page_meta_for(content: dict[str, Any], route: str, slug: str = "") -> tuple[str, str, str, str]:
    name = site_name(content)
    if route == "home":
        home = content.get("home") if isinstance(content.get("home"), dict) else {}
        title = seo_field(home, "seo_title", name)
        description = seo_field(home, "seo_description", compact_text(hero_text(content), 220))
        return title, compact_text(description, 220), "/", "website"
    if route in PUBLIC_SECTION_ROUTES and not slug:
        section = public_sections(content).get(route) or {}
        title = public_text(section.get("title") or PUBLIC_SECTION_NAMES.get(route, route))
        meta_title = seo_field(section, "seo_title", f"{title} — {name}")
        fallback_description = PUBLIC_SECTION_META_DESCRIPTIONS.get(route, title)
        meta_description = seo_field(section, "seo_description", compact_text(section.get("intro") or fallback_description, 220))
        return meta_title, compact_text(meta_description, 220), route_path(route), "website"
    if route == "questions" and slug:
        name = site_name(content)
        return f"Вопрос — {name}", "Вопрос и ответ в разделе вопросов.", route_path("questions", slug), "article"
    if route in PUBLIC_SECTION_ROUTES and slug:
        item = find_public_item(content, route, slug)
        if not item:
            raise ApiError(404, "Материал не найден.")
        title = public_text(item.get("title") or "Материал")
        meta_title = seo_field(item, "seo_title", f"{title} — {name}")
        meta_description = seo_field(item, "seo_description", compact_text(item.get("excerpt") or item.get("body") or title, 220))
        return meta_title, compact_text(meta_description, 220), route_path(route, slug), "article"
    if route == "trebnik":
        return f"{client_area_name(content)} — {name}", "Закрытый клиентский доступ для привязанных профилей.", "/trebnik", "website"
    if route == "admin":
        return f"{admin_area_name(content)} — {name}", "Закрытая мастерская администратора.", "/admin", "website"
    if route == "privacy":
        return f"Политика обработки персональных данных — {name}", "Как сайт обрабатывает персональные данные пользователей.", "/privacy", "website"
    if route == "rules":
        return f"Правила сайта — {name}", "Правила регистрации, комментариев, вопросов и модерации.", "/rules", "website"
    if route == "personal-data-consent":
        return f"Согласие на обработку персональных данных — {name}", "Согласие на обработку данных в заявках, профиле и публичных материалах.", "/personal-data-consent", "website"
    if route == "u":
        return f"Профиль пользователя — {name}", "Публичный профиль пользователя сайта.", route_path("u", slug) if slug else "/u", "profile"
    return f"Страница не найдена — {name}", "Такой страницы нет.", "/", "website"

def hero_preload_html(content: dict[str, Any], route: str) -> str:
    if route != "home":
        return ""
    home = content.get("home") if isinstance(content.get("home"), dict) else {}
    image_url = str(home.get("hero_image_url") or "").strip()
    if not image_url:
        return ""
    srcset = optimized_image_srcset(image_url)
    srcset_attr = f' imagesrcset="{h(srcset)}" imagesizes="(max-width: 860px) 92vw, 34vw"' if srcset else ""
    image_type = ' type="image/webp"' if image_url.lower().endswith(".webp") else ""
    return f'<link rel="preload" href="{h(image_url)}" as="image"{srcset_attr}{image_type} fetchpriority="high">'

def social_image_url(content: dict[str, Any], base_url: str) -> str:
    home = content.get("home") if isinstance(content.get("home"), dict) else {}
    clean = str(home.get("hero_image_url") or brand_logo_url(content) or "").strip()
    if not clean:
        return ""
    if re.match(r"^https?://", clean, flags=re.IGNORECASE):
        return clean
    if clean.startswith("/"):
        return absolute_url(base_url, clean)
    return absolute_url(base_url, f"/{clean}")

def schema_date(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    iso_match = re.match(r"^(\d{4})-(\d{2})-(\d{2})", text)
    if iso_match:
        return "-".join(iso_match.groups())
    dot_match = re.match(r"^(\d{1,2})[./](\d{1,2})[./](\d{4})", text)
    if dot_match:
        day, month, year = dot_match.groups()
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
    months = {
        "января": 1,
        "февраля": 2,
        "марта": 3,
        "апреля": 4,
        "мая": 5,
        "июня": 6,
        "июля": 7,
        "августа": 8,
        "сентября": 9,
        "октября": 10,
        "ноября": 11,
        "декабря": 12,
    }
    word_match = re.search(r"\b(\d{1,2})\s+([а-яё]+)\s+(\d{4})", text.lower(), flags=re.IGNORECASE)
    if word_match:
        day, month_name, year = word_match.groups()
        month = months.get(month_name)
        if month:
            return f"{int(year):04d}-{month:02d}-{int(day):02d}"
    return ""

def schema_image_url(value: Any, base_url: str) -> str:
    clean = str(value or "").strip()
    if not clean:
        return ""
    if re.match(r"^https?://", clean, flags=re.IGNORECASE):
        return clean
    if clean.startswith("/"):
        return absolute_url(base_url, clean)
    return absolute_url(base_url, f"/{clean}")

def structured_data_html(
    content: dict[str, Any],
    *,
    route: str,
    slug: str,
    base_url: str,
    status: int,
    meta_title: str,
    meta_description: str,
    canonical: str,
    social_image: str,
) -> str:
    if status >= 400 or route in {"admin", "trebnik"}:
        return ""
    site_url = absolute_url(base_url, "/")
    org_id = f"{site_url}#organization"
    website_id = f"{site_url}#website"
    page_id = f"{canonical}#webpage"
    site_title = site_name(content)
    graph: list[dict[str, Any]] = [
        {
            "@type": "Organization",
            "@id": org_id,
            "name": site_title,
            "url": site_url,
        },
        {
            "@type": "WebSite",
            "@id": website_id,
            "url": site_url,
            "name": site_title,
            "description": compact_text(hero_text(content), 220),
            "inLanguage": "ru-RU",
            "publisher": {"@id": org_id},
        },
    ]
    logo_url = schema_image_url(brand_logo_url(content), base_url)
    if logo_url:
        graph[0]["logo"] = {"@type": "ImageObject", "url": logo_url}
    page_type = "CollectionPage" if route in PUBLIC_SECTION_ROUTES and not slug else "WebPage"
    graph.append(
        {
            "@type": page_type,
            "@id": page_id,
            "url": canonical,
            "name": meta_title,
            "description": meta_description,
            "isPartOf": {"@id": website_id},
            "inLanguage": "ru-RU",
        }
    )
    if route in PUBLIC_SECTION_ROUTES and slug:
        item = find_public_item(content, route, slug)
        if item:
            section = public_sections(content).get(route) or {}
            article_id = f"{canonical}#article"
            image_url = schema_image_url(item.get("cover_image_url"), base_url) or social_image
            author_name = public_text(item.get("author_name") or site_title)
            author_slug = str(item.get("author_slug") or "").strip()
            article: dict[str, Any] = {
                "@type": "Article",
                "@id": article_id,
                "mainEntityOfPage": {"@id": page_id},
                "url": canonical,
                "headline": public_text(item.get("title") or meta_title),
                "description": meta_description,
                "articleSection": public_text(section.get("title") or PUBLIC_SECTION_NAMES.get(route, route)),
                "inLanguage": "ru-RU",
                "author": {
                    "@type": "Person",
                    "name": author_name,
                },
                "publisher": {"@id": org_id},
            }
            if author_slug:
                article["author"]["url"] = absolute_url(base_url, route_path("u", author_slug))
            if image_url:
                article["image"] = [image_url]
            published = schema_date(item.get("published_at") or item.get("date") or item.get("created_at"))
            modified = schema_date(item.get("updated_at") or item.get("modified_at") or item.get("date"))
            if published:
                article["datePublished"] = published
            if modified:
                article["dateModified"] = modified
            graph.append(article)
            graph[-2]["mainEntity"] = {"@id": article_id}
    payload = {"@context": "https://schema.org", "@graph": graph}
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return f'<script type="application/ld+json">{data}</script>'

def site_footer_html(content: dict[str, Any]) -> str:
    return f"""
    <footer class="site-footer" data-nosnippet>
      <nav aria-label="Документы сайта">
        <a href="/personal-data-consent" data-route="personal-data-consent">Согласие на обработку данных</a>
        <a href="/privacy" data-route="privacy">Персональные данные</a>
        <a href="/rules" data-route="rules">Правила сайта</a>
      </nav>
    </footer>"""

def critical_css_html() -> str:
    return """<style>
:root{color-scheme:dark;--bg:#030806;--ink:#f4ead9;--gold-2:#f0ce76;--serif:Georgia,"Times New Roman",serif;--sans:Inter,Segoe UI,Roboto,Arial,sans-serif}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{min-height:100%;background:#030806}
body{min-height:100%;margin:0;background:#030806;color:#f4ead9;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:16px;line-height:1.6;overflow-x:hidden}
a{color:inherit;text-decoration:none}
button,input,textarea,select{font:inherit;color:inherit}
.shell{position:relative;z-index:1;width:100%;max-width:1920px;margin:0 auto;padding:0 0 42px}
.site-header{position:sticky;top:0;z-index:50;display:grid;grid-template-columns:max-content minmax(0,1fr) max-content;grid-template-areas:"brand nav actions";align-items:center;gap:clamp(10px,1.2vw,20px);min-height:62px;padding:8px clamp(24px,2vw,38px) 7px;border-bottom:1px solid rgba(201,151,67,.36);background:linear-gradient(180deg,rgba(2,8,7,.96),rgba(3,12,10,.9));box-shadow:0 14px 34px rgba(0,0,0,.2)}
.brand-lockup{grid-area:brand;display:inline-flex;align-items:center;gap:15px;color:inherit}
.brand-copy{display:grid;gap:4px;min-width:0}
.brand-name{display:block;white-space:nowrap;font-family:Georgia,"Times New Roman",serif;font-size:clamp(1.42rem,1.55vw,1.72rem);line-height:1.02;color:#f4ead9}
.brand-sub,.brand-sub[hidden]{display:none!important}
.brand-mark{display:block;flex:0 0 auto;width:34px;height:34px;background:#f0ce76}
.site-nav{grid-area:nav;display:flex;justify-content:center;align-items:center;gap:11px;flex-wrap:nowrap;min-width:0}
.site-nav>a{display:inline-flex;align-items:center;min-height:25px;padding:0;color:rgba(244,234,217,.72);font-size:.84rem;white-space:nowrap}
.header-actions{grid-area:actions;position:relative;z-index:2;display:flex;justify-content:flex-end;align-items:center;gap:8px;min-width:180px;min-height:34px}
body.auth-pending .header-actions>*{visibility:hidden}
.menu-button{display:none}
#app{display:block}
.hero-frame,.hero-image{aspect-ratio:1/1}
.hero-image{display:block;width:100%;height:100%;object-fit:cover}
@media(max-width:860px){.shell{width:100%;padding:0 0 36px}.site-header{grid-template-columns:minmax(0,1fr) auto 30px;grid-template-areas:"brand actions menu" "nav nav nav";column-gap:5px;row-gap:0;min-height:40px;padding:4px 12px 5px;background:linear-gradient(180deg,rgba(2,8,7,.96),rgba(3,12,10,.9))}.brand-lockup{gap:8px}.brand-mark{width:30px;height:30px}.brand-name{max-width:calc(100vw - 142px);overflow:hidden;text-overflow:ellipsis;font-size:1.03rem;line-height:1}.site-nav{display:none}.header-actions{gap:5px;min-width:0;min-height:30px}.header-actions #loginButton,.header-actions #adminButton,.header-actions #adminTrafficControl{display:none!important}.menu-button{grid-area:menu;width:30px;height:30px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:0;border:0;background:transparent}.menu-button span{display:block;width:14px;height:2px;margin:0 auto;border-radius:99px;background:#f0ce76}}
</style>"""

def _dedupe_links(paths: tuple[str, ...] | list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for path in paths:
        if path in seen:
            continue
        seen.add(path)
        result.append(path)
    return result

def _ordered_style_links(paths: tuple[str, ...] | list[str]) -> list[str]:
    result = _dedupe_links(paths)
    final_names = ("10-responsive.css", "14-mobile-complete.css")
    final_links: list[str] = []
    rest: list[str] = []
    for path in result:
        if any(name in path for name in final_names):
            final_links.append(path)
        else:
            rest.append(path)
    final_links.sort(key=lambda path: next((index for index, name in enumerate(final_names) if name in path), len(final_names)))
    return rest + final_links

def style_preloads_for_route(route: str, viewer: dict[str, Any] | None = None) -> list[str]:
    paths = list(PUBLIC_STYLE_MODULE_PRELOADS)
    is_admin_viewer = is_admin_session(viewer)
    if route == "admin" or is_admin_viewer:
        paths.extend(ADMIN_STYLE_MODULE_PRELOADS)
    elif route == "trebnik" and viewer:
        paths.extend(TREBNIK_CLIENT_STYLE_MODULE_PRELOADS)
    return _ordered_style_links(paths)

def app_module_preloads_for_route(route: str, viewer: dict[str, Any] | None = None) -> list[str]:
    modules = list(PUBLIC_APP_MODULE_PRELOADS)
    if route in {"admin", "trebnik"} or is_admin_session(viewer):
        modules.extend(WORKSPACE_APP_MODULE_PRELOADS)
    return _dedupe_links(modules)

def render_html_document(content: dict[str, Any], *, route: str, app_html: str, base_url: str, status: int = 200, slug: str = "", description: str | None = None, title: str | None = None, canonical_path: str | None = None, og_type: str = "website", viewer: dict[str, Any] | None = None) -> bytes:
    meta_title, meta_description, meta_path, meta_type = page_meta_for(content, route, slug) if status < 400 else page_meta_for(content, "not-found")
    meta_title = title or meta_title
    meta_description = description or meta_description
    meta_path = canonical_path or meta_path
    meta_type = og_type or meta_type
    canonical = absolute_url(base_url, meta_path)
    social_image = social_image_url(content, base_url)
    social_image_meta = (
        f'\n  <meta property="og:image" content="{h(social_image)}">'
        f'\n  <meta name="twitter:image" content="{h(social_image)}">'
        if social_image else ""
    )
    robots_meta = '<meta name="robots" content="noindex,nofollow">' if route in {"admin", "trebnik", "messages"} else ""
    hero_preload = hero_preload_html(content, route)
    structured_data = structured_data_html(
        content,
        route=route,
        slug=slug,
        base_url=base_url,
        status=status,
        meta_title=meta_title,
        meta_description=meta_description,
        canonical=canonical,
        social_image=social_image,
    )
    asset_links = "\n  ".join(
        [f'<link rel="stylesheet" href="{h(path)}">' for path in style_preloads_for_route(route, viewer)]
        + [f'<link rel="preload" href="/static/app_modules/{h(name)}?v={h(ASSET_VERSION)}" as="script">' for name in app_module_preloads_for_route(route, viewer)]
    )
    body_class = "" if viewer else "auth-pending"
    body_class_attr = f' class="{h(body_class)}"' if body_class else ""
    body = f"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#04110f">
  <title>{h(meta_title)}</title>
  <meta name="description" content="{h(meta_description)}">
  {robots_meta}
  <link rel="canonical" href="{h(canonical)}">
  <meta property="og:type" content="{h(meta_type)}">
  <meta property="og:title" content="{h(meta_title)}">
  <meta property="og:description" content="{h(meta_description)}">
  <meta property="og:url" content="{h(canonical)}">
  <meta property="og:site_name" content="{h(site_name(content))}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{h(meta_title)}">
  <meta name="twitter:description" content="{h(meta_description)}">{social_image_meta}
  <link rel="icon" href="/static/favicon.svg?v={h(ASSET_VERSION)}" type="image/svg+xml">
  {critical_css_html()}
  {structured_data}
  {asset_links}
  {hero_preload}
  <script type="module" src="/static/app.js?v={h(ASSET_VERSION)}"></script>
</head>
<body{body_class_attr} data-route="{h(route)}">
  <div class="atmosphere" aria-hidden="true">
    <div class="deep-bg"></div>
    <div class="grain"></div>
  </div>

  <div class="shell">
    {render_header_html(content, route if route in PUBLIC_SECTION_ROUTES else ("home" if route == "home" else ""), viewer)}
    <script src="/static/prepaint-auth.js?v={h(ASSET_VERSION)}"></script>
    <div id="notice" class="notice" role="status" aria-live="polite" hidden></div>
    <main id="app" tabindex="-1" data-ssr="1">{app_html}</main>
    {site_footer_html(content)}
  </div>

  <div id="modal" class="modal" hidden role="dialog" aria-modal="true">
    <div class="modal-backdrop" data-modal-close></div>
    <section class="modal-card" role="document">
      <header class="modal-head">
        <button id="modalClose" class="modal-close" type="button" aria-label="Закрыть">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </header>
      <div id="modalBody" class="modal-body"></div>
    </section>
  </div>
</body>
</html>"""
    return body.encode("utf-8")

def resolve_page(path: str, content: dict[str, Any]) -> tuple[int, str, str, str]:
    clean = "/" + "/".join(part for part in str(path or "/").split("/") if part)
    if clean == "/index.html":
        clean = "/"
    parts = [part for part in clean.strip("/").split("/") if part]
    if not parts:
        return 200, "home", "", home_html(content)
    if len(parts) == 1 and parts[0] == "privacy":
        return 200, "privacy", "", privacy_html(content)
    if len(parts) == 1 and parts[0] == "personal-data-consent":
        return 200, "personal-data-consent", "", personal_data_consent_html(content)
    if len(parts) == 1 and parts[0] == "rules":
        return 200, "rules", "", rules_html(content)
    if len(parts) == 2 and parts[0] == "u":
        return 200, "u", parts[1], app_shell_html(content, "u")
    if len(parts) == 1 and parts[0] in PUBLIC_SECTION_ROUTES:
        return 200, parts[0], "", section_html(content, parts[0])
    if len(parts) == 2 and parts[0] == "questions":
        return 200, "questions", parts[1], app_shell_html(content, "questions")
    if len(parts) == 2 and parts[0] in PUBLIC_SECTION_ROUTES:
        return 200, parts[0], parts[1], material_html(content, parts[0], parts[1])
    if len(parts) == 1 and parts[0] in APP_ROUTES:
        return 200, parts[0], "", app_shell_html(content, parts[0])
    if len(parts) == 2 and parts[0] == "trebnik" and parts[1] in TREBNIK_ADMIN_SUBROUTES:
        return 200, "trebnik", parts[1], app_shell_html(content, "trebnik")
    raise ApiError(404, "Страница не найдена.")

def not_found_html(content: dict[str, Any]) -> str:
    return '<section class="gate-card not-found-page"><h1>Страница не найдена</h1><p>Такого адреса нет. Перейдите на главную или выберите раздел в меню.</p><div class="row" style="margin-top:22px"><a class="secondary" href="/" data-route="home">На главную</a></div></section>'

def sitemap_xml(base_url: str, content: dict[str, Any]) -> bytes:
    updated = str(content.get("updated_at") or datetime.now().date().isoformat())[:10]
    urls = ["/", "/privacy", "/personal-data-consent", "/rules"]
    for route, section in public_sections(content).items():
        items = published_section_items(section)
        urls.append(route_path(route))
        for item in items:
            urls.append(route_path(route, str(item.get("slug"))))
    entries = "".join(
        f"<url><loc>{h(absolute_url(base_url, path))}</loc><lastmod>{h(updated)}</lastmod></url>"
        for path in urls
    )
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{entries}</urlset>'.encode("utf-8")

def robots_txt(base_url: str) -> bytes:
    return (
        "User-agent: *\n"
        "Disallow: /api/\n"
        "Disallow: /admin\n"
        "Disallow: /trebnik\n"
        "Allow: /\n"
        f"Sitemap: {absolute_url(base_url, '/sitemap.xml')}\n"
    ).encode("utf-8")

__all__ = ['allowed_static', 'file_cache_header', 'h', 'public_text', 'compact_text', 'text_to_paragraphs_html', 'InlineHTMLCleaner', 'clean_inline_html', 'editor_list_items_html', 'material_body_html', 'route_path', 'safe_public_route', 'absolute_url', 'hero_title', 'hero_kicker', 'hero_text', 'brand_logo_url', 'site_name', 'admin_area_name', 'client_area_name', 'public_sections', 'published_section_items', 'section_display_name', 'find_public_item', 'featured_materials', 'image_html', 'optimized_image_srcset', 'hero_image_html', 'card_media_html', 'material_card_html', 'section_topic_groups', 'section_topic_nav_html', 'section_topic_mobile_menu_html', 'section_tools_placeholder_html', 'public_nav_html', 'server_profile_initial', 'render_header_html', 'home_button_html', 'hero_featured_html', 'home_html', 'section_html', 'material_cta_html', 'material_html', 'legal_body_html', 'legal_page_html', 'privacy_html', 'rules_html', 'personal_data_consent_html', 'app_shell_html', 'profile_ssr_html', 'profile_ssr_meta', 'seo_field', 'page_meta_for', 'hero_preload_html', 'social_image_url', 'site_footer_html', 'render_html_document', 'resolve_page', 'not_found_html', 'sitemap_xml', 'robots_txt']
