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

def content_image_dimensions(url: Any) -> tuple[int | None, int | None]:
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

def sync_content_image_size(owner: dict[str, Any], url_key: str, prefix: str) -> None:
    url = str(owner.get(url_key) or "").strip()
    if not url:
        owner.pop(f"{prefix}_width", None)
        owner.pop(f"{prefix}_height", None)
        return
    width, height = content_image_dimensions(url)
    if width and height:
        owner[f"{prefix}_width"] = int(width)
        owner[f"{prefix}_height"] = int(height)
    else:
        owner.setdefault(f"{prefix}_width", "")
        owner.setdefault(f"{prefix}_height", "")

def default_content() -> dict[str, Any]:
    content = json.loads('{\n  "brand": {\n    "site_name": "Записки чернокнижника",\n    "site_subtitle": "материалы • услуги • Требник",\n    "mark": "✦",\n    "owner_name": "",\n    "owner_photo_url": "",\n    "client_area_name": "Требник",\n    "admin_area_name": "Мастерская"\n  },\n  "home": {\n    "kicker": "закрытая книга",\n    "title": "Записки чернокнижника",\n    "lead": "Тёмная библиотека материалов, разборов и услуг. Для клиентов здесь открывается личный Требник: ход работ, записи, оплаты и сопровождение без лишнего шума.",\n    "cta_primary": "Войти в Требник",\n    "cta_secondary": "Смотреть услуги",\n    "signature": "",\n    "welcome_title": "Добро пожаловать",\n    "welcome_text": "Здесь собраны материалы, личные записи, ответы и рабочие форматы обращения. Для клиентов отдельный кабинет остается спокойной закрытой частью сайта — без лишнего шума и без путаницы."\n  },\n  "sections": {\n    "works": {\n      "title": "Работы",\n      "intro": "Личные записи о работе, наблюдения, ходовые материалы и заметки, которым нужен отдельный вес.",\n      "items": [\n        {\n          "title": "Ночная связка: удержание намерения",\n          "slug": "nochnaya-svyazka-uderzhanie",\n          "tag": "личная работа",\n          "status": "published",\n          "date": "запись",\n          "cover_symbol": "✒",\n          "excerpt": "Короткая запись о том, как держится линия работы, когда внешне все выглядит тихо.",\n          "body": "Не всякая работа проявляется громко. Иногда важнее не вспышка, а плотность: сны становятся тяжелее, случайные встречи складываются в один узор, человек начинает возвращаться к одной и той же мысли.\\n\\nВ таких записях фиксируется не декоративная сторона обряда, а ход: что меняется, где сопротивление, какой знак повторяется и когда пора усиливать давление.\\n\\nМатериал оставлен как пример того, что работа читается по совокупности фактов, а не по одному красивому совпадению.",\n          "cta_label": "Формат",\n          "cta_note": "Личные рабочие материалы могут быть открыты, скрыты или оставлены только для внутреннего архива."\n        },\n        {\n          "title": "Разбор знаков после работы",\n          "slug": "razbor-znakov-posle-raboty",\n          "tag": "наблюдение",\n          "status": "published",\n          "date": "памятка",\n          "cover_symbol": "☾",\n          "excerpt": "Какие знаки действительно имеют вес, а какие только создают шум вокруг запроса.",\n          "body": "Знак становится важным, когда он повторяется, попадает в контекст запроса и меняет поведение людей или ход событий. Одиночная мелочь без связи с целью чаще остается шумом.\\n\\nПосле работы стоит фиксировать факты: встречи, сообщения, сны с сильным следом, перемены в реакции человека, сдвиги в обстоятельствах. Чем меньше истерики в наблюдении, тем точнее виден ход.\\n\\nЕсли знак вызывает сомнение, лучше записать его спокойно и дождаться второго подтверждения."\n        }\n      ]\n    },\n    "articles": {\n      "title": "Статьи",\n      "intro": "Длинные тексты, памятки и разборы, которые можно открыть перед диагностикой, работой или сопровождением.",\n      "items": [\n        {\n          "title": "Как читать ход работы без истерики",\n          "slug": "kak-chitat-hod-raboty-bez-isteriki",\n          "tag": "материал",\n          "status": "published",\n          "date": "памятка",\n          "cover_symbol": "✧",\n          "excerpt": "Памятка о том, как наблюдать результат и не превращать ожидание в самосаботаж.",\n          "body": "Главная ошибка клиента после работы — пытаться дергать процесс каждую минуту. Ожидание результата легко превращается в поток тревоги, где любое слово, сон или случайность объявляются то победой, то провалом.\\n\\nСмотреть нужно на факты: изменилась ли линия общения, появились ли новые обстоятельства, сдвинулось ли поведение человека, повторяется ли один и тот же знак. Важен не отдельный всплеск, а направление.\\n\\nПисать мастеру стоит тогда, когда есть событие, новый факт или вопрос по уже согласованному действию. Если есть только страх, его лучше сначала отделить от наблюдения.",\n          "cta_label": "Для клиента",\n          "cta_note": "Этот текст можно отправлять перед началом сопровождения."\n        },\n        {\n          "title": "Что сообщать мастеру",\n          "slug": "chto-soobshchat-masteru",\n          "tag": "памятка",\n          "status": "published",\n          "date": "перед работой",\n          "cover_symbol": "✥",\n          "excerpt": "Короткий порядок: какие сведения помогают делу, а какие только засоряют картину.",\n          "body": "Полезны факты: даты, связи между людьми, важные события, изменения поведения, сны с сильным следом, новые контакты, платежи, договоренности и резкие сдвиги в ситуации.\\n\\nНе полезен поток тревоги без фактов. Он забивает картину и заставляет тратить внимание не на работу, а на тушение внутренней паники.\\n\\nЛучший формат сообщения: что произошло, когда, с кем связано, почему это важно для запроса. Если есть скриншот или цитата — приложить только существенное."\n        }\n      ]\n    },\n    "questions": {\n      "title": "Вопросы",\n      "intro": "Ответы без лишнего шума: сроки, апдейты, границы обращения и порядок связи.",\n      "items": [\n        {\n          "title": "Когда писать после обряда?",\n          "slug": "kogda-pisat-posle-obryada",\n          "tag": "ответ",\n          "status": "published",\n          "date": "FAQ",\n          "cover_symbol": "?",\n          "excerpt": "Писать стоит не по тревоге, а по факту: событие, знак, сдвиг, вопрос по уже согласованной работе.",\n          "body": "После обряда не нужно проверять мир каждые десять минут. Работа не становится сильнее от того, что клиент постоянно ищет подтверждение.\\n\\nПисать стоит, когда появляется факт: сообщение, встреча, сон с явным следом, изменение поведения, новый человек в ситуации, резкий сдвиг обстоятельств или вопрос по инструкции.\\n\\nЕсли есть только внутреннее напряжение, лучше записать его отдельно и дать процессу время."\n        },\n        {\n          "title": "Что считается апдейтом?",\n          "slug": "chto-schitaetsya-apdeytom",\n          "tag": "ответ",\n          "status": "published",\n          "date": "FAQ",\n          "cover_symbol": "◌",\n          "excerpt": "Апдейт — это значимое изменение по запросу, а не повтор одной и той же тревоги.",\n          "body": "Апдейт — это событие, которое помогает видеть ход: человек проявился, исчез, изменил тон, возникла новая информация, пришел сон, случился конфликт, появились деньги, срок или решение.\\n\\nПовторное сообщение в духе «я опять переживаю» апдейтом не является. Оно может быть человечески понятно, но для работы почти ничего не дает.\\n\\nЧем точнее апдейт, тем легче понять, усиливать ли работу, ждать ли развития или менять ход."\n        }\n      ]\n    },\n    "services": {\n      "title": "Услуги",\n      "intro": "Карты, диагностики, сопровождение и отдельные форматы обращения.",\n      "items": [\n        {\n          "title": "Карты и разбор ситуации",\n          "slug": "karty-i-razbor-situatsii",\n          "tag": "карты",\n          "status": "published",\n          "date": "формат",\n          "price": "от 3 000 ₽",\n          "cover_symbol": "☾",\n          "excerpt": "Разбор через карты: скрытый мотив, линия действий, вероятные последствия и точка вмешательства.",\n          "body": "Подходит, когда нужно понять скрытый мотив человека, реальное состояние ситуации, риск, слабое место или дальнейший ход.\\n\\nВ разбор можно включить конкретные вопросы, но лучше не распыляться: один точный запрос дает больше, чем десять размытых. Ответ передается в понятном виде, с выводом и возможным следующим шагом.\\n\\nПеред заявкой подготовьте имена или обозначения участников, краткое описание ситуации и главный вопрос.",\n          "cta_label": "Оставить заявку",\n          "cta_note": "Опишите ситуацию и способ связи. Заявка попадет в Мастерскую, после чего можно будет согласовать формат и оплату."\n        },\n        {\n          "title": "Сопровождение по запросу",\n          "slug": "soprovozhdenie-po-zaprosu",\n          "tag": "работа",\n          "status": "published",\n          "date": "индивидуально",\n          "price": "по согласованию",\n          "cover_symbol": "✦",\n          "excerpt": "Длительный формат: запрос, работы, записи, апдейты и личный Требник клиента.",\n          "body": "Сопровождение подходит для сложных ситуаций, где одного разбора недостаточно. После согласования появляется личный Требник: там видны обращения, услуги, финансы и записи по ходу работы.\\n\\nФормат, срок и стоимость зависят от запроса. Важно заранее обозначить цель, границы, возможные риски и порядок связи.\\n\\nКлиент не получает декоративную витрину. Он получает рабочий кабинет, где видно, что происходит и что уже зафиксировано.",\n          "cta_label": "Обсудить сопровождение",\n          "cta_note": "Оставьте заявку: кратко опишите цель, текущую ситуацию и удобный способ связи."\n        }\n      ]\n    },\n    "cards": {\n      "title": "Карты",\n      "intro": "Расклады, колоды, изображения и короткие чтения — отдельная галерея для карт.",\n      "items": [\n        {\n          "title": "Расклад на скрытый мотив",\n          "slug": "rasklad-na-skrytyy-motiv",\n          "tag": "расклад",\n          "status": "published",\n          "date": "пример",\n          "cover_symbol": "☷",\n          "excerpt": "Схема чтения, где важен не внешний сюжет, а двигатель ситуации под ним.",\n          "body": "Расклад смотрит не только то, что человек показывает, но и то, что толкает его изнутри: страх, выгода, обида, зависимость, интерес или попытка удержать контроль.\\n\\nТакой формат полезен, когда слова расходятся с поведением. Карты показывают не красивую версию, а рабочую механику ситуации."\n        },\n        {\n          "title": "Карта дня: жесткая правда",\n          "slug": "karta-dnya-zhestkaya-pravda",\n          "tag": "пример",\n          "status": "published",\n          "date": "короткое чтение",\n          "cover_symbol": "✶",\n          "excerpt": "Короткая запись с картой, прямым выводом и действием на день.",\n          "body": "Карта дня не обязана быть мягкой. Иногда ее задача — не утешить, а назвать то, что человек уже знает, но избегает произнести.\\n\\nХорошее короткое чтение состоит из трех частей: что происходит, где опасность, какое действие сегодня не стоит откладывать."\n        }\n      ]\n    }\n  }\n}')
    content["brand"].update({"header_visual_url": "", "header_visual_alt": ""})
    content["home"].update(
        {
            "eyebrow": "частная библиотека",
            "hero_kicker": "",
            "hero_title": "Добро пожаловать",
            "hero_text": "Здесь собраны материалы, личные записи, ответы и рабочие форматы обращения. Для клиентов отдельный кабинет остается спокойной закрытой частью сайта — без лишнего шума и без путаницы.",
            "hero_image_url": "",
            "hero_image_alt": "",
            "hero_image_width": "",
            "hero_image_height": "",
            "cta_primary_route": "services",
            "cta_primary_action": "inquiry",
            "cta_primary_title": "Заявка с главной",
            "cta_secondary_route": "services",
            "show_featured": False,
            "featured_material_ids": [],
            "seo_title": "",
            "seo_description": "",
        }
    )
    for section in content.get("sections", {}).values():
        section.setdefault("cover_image_url", "")
        section.setdefault("cover_image_alt", "")
        section.setdefault("cover_image_width", "")
        section.setdefault("cover_image_height", "")
        section.setdefault("seo_title", "")
        section.setdefault("seo_description", "")
        section.setdefault("topics_enabled", False)
        section.setdefault("topics", [])
        for item in section.get("items", []):
            item.setdefault("cover_image_url", "")
            item.setdefault("cover_image_alt", "")
            item.setdefault("cover_image_width", "")
            item.setdefault("cover_image_height", "")
            item.setdefault("seo_title", "")
            item.setdefault("seo_description", "")
            item.setdefault("topic_slug", "")
    return content

def default_featured_material_ids(sections: dict[str, Any]) -> list[str]:
    preferred_routes = ["works", "articles", "services", "questions"]
    picked: list[str] = []
    seen: set[str] = set()
    for route in preferred_routes:
        section = sections.get(route) if isinstance(sections, dict) else None
        items = section.get("items") if isinstance(section, dict) and isinstance(section.get("items"), list) else []
        for item in items:
            if not isinstance(item, dict):
                continue
            slug = str(item.get("slug") or "").strip()
            if not slug:
                continue
            key = f"{route}:{slug}"
            if key not in seen:
                picked.append(key)
                seen.add(key)
                break
    if len(picked) >= 4:
        return picked[:4]
    for route, section in (sections or {}).items():
        items = section.get("items") if isinstance(section, dict) and isinstance(section.get("items"), list) else []
        for item in items:
            if not isinstance(item, dict):
                continue
            slug = str(item.get("slug") or "").strip()
            if not slug:
                continue
            key = f"{route}:{slug}"
            if key not in seen:
                picked.append(key)
                seen.add(key)
            if len(picked) >= 4:
                return picked[:4]
    return picked[:4]

def normalize_section_topics(section: dict[str, Any], items: list[dict[str, Any]] | None = None) -> None:
    raw_topics = section.get("topics") if isinstance(section.get("topics"), list) else []
    normalized: list[dict[str, Any]] = []
    seen_slugs: set[str] = set()
    for index, topic in enumerate(raw_topics[:80]):
        if isinstance(topic, str):
            title = topic.strip()[:100]
            raw_slug = title
            enabled = True
        elif isinstance(topic, dict):
            title = str(topic.get("title") or topic.get("name") or topic.get("label") or topic.get("slug") or "").strip()[:100]
            raw_slug = topic.get("slug") or title
            enabled = bool_or_default(topic.get("enabled"), True)
        else:
            continue
        if not title:
            continue
        slug = make_slug(raw_slug, f"topic-{index + 1}")
        base_slug = slug
        suffix = 2
        while slug in seen_slugs:
            slug = f"{base_slug}-{suffix}"
            suffix += 1
        seen_slugs.add(slug)
        normalized.append({"slug": slug, "title": title, "enabled": enabled})
    section["topics_enabled"] = bool_or_default(section.get("topics_enabled"), False)
    section["topics"] = normalized
    valid_slugs = {topic["slug"] for topic in normalized}
    section_items = items if items is not None else section.get("items")
    for item in section_items if isinstance(section_items, list) else []:
        if not isinstance(item, dict):
            continue
        topic_slug = make_slug(item.get("topic_slug") or item.get("topic") or "", "")
        item["topic_slug"] = topic_slug if topic_slug in valid_slugs else ""

def normalize_content(data: dict[str, Any]) -> dict[str, Any]:
    defaults = default_content()
    try:
        data["version"] = max(1, int(data.get("version") or 1))
    except (TypeError, ValueError):
        data["version"] = 1
    if not isinstance(data.get("brand"), dict):
        data["brand"] = defaults["brand"]
    for key, value in defaults["brand"].items():
        data["brand"].setdefault(key, value)
    data["brand"].setdefault("header_visual_url", "")
    data["brand"].setdefault("header_visual_alt", "")

    if not isinstance(data.get("home"), dict):
        data["home"] = defaults["home"]
    for key, value in defaults["home"].items():
        data["home"].setdefault(key, value)
    if not data["home"].get("hero_title"):
        data["home"]["hero_title"] = data["home"].get("welcome_title") or defaults["home"]["hero_title"]
    if not data["home"].get("hero_text"):
        data["home"]["hero_text"] = data["home"].get("welcome_text") or defaults["home"]["hero_text"]
    data["home"].setdefault("hero_image_alt", data["brand"].get("owner_name") or data["brand"].get("site_name") or "")
    sync_content_image_size(data["home"], "hero_image_url", "hero_image")
    data["home"].setdefault("hero_kicker", "")
    data["home"].setdefault("eyebrow", defaults["home"]["eyebrow"])
    data["home"].setdefault("cta_primary", defaults["home"].get("cta_primary", "Оставить заявку"))
    data["home"].setdefault("cta_secondary", defaults["home"].get("cta_secondary", "Смотреть услуги"))
    data["home"].setdefault("cta_primary_route", "services")
    data["home"].setdefault("cta_primary_action", "inquiry")
    data["home"].setdefault("cta_primary_title", "Заявка с главной")
    data["home"].setdefault("cta_secondary_route", "services")
    data["home"].setdefault("show_featured", False)
    data["home"].setdefault("seo_title", "")
    data["home"].setdefault("seo_description", "")
    data["home"]["cta_primary_route"] = safe_public_route(data["home"].get("cta_primary_route"), "services")
    data["home"]["cta_secondary_route"] = safe_public_route(data["home"].get("cta_secondary_route"), "services")
    data["home"]["show_featured"] = bool_or_default(data["home"].get("show_featured"), False)
    if not isinstance(data["home"].get("featured_material_ids"), list):
        data["home"]["featured_material_ids"] = []

    if not isinstance(data.get("sections"), dict):
        data["sections"] = defaults["sections"]
    for section_key, default_section in defaults["sections"].items():
        section = data["sections"].setdefault(section_key, default_section)
        if not isinstance(section, dict):
            data["sections"][section_key] = default_section
            section = data["sections"][section_key]
        section.setdefault("title", default_section["title"])
        section.setdefault("intro", default_section.get("intro", ""))
        section.setdefault("cover_image_url", default_section.get("cover_image_url", ""))
        section.setdefault("cover_image_alt", default_section.get("cover_image_alt", section.get("title") or default_section["title"]))
        sync_content_image_size(section, "cover_image_url", "cover_image")
        section.setdefault("seo_title", "")
        section.setdefault("seo_description", "")
        section.setdefault("topics_enabled", False)
        section.setdefault("topics", [])
        if not isinstance(section.get("items"), list):
            section["items"] = []
        normalized_items = []
        seen_slugs: set[str] = set()
        for index, item in enumerate(section["items"]):
            if not isinstance(item, dict):
                continue
            item.setdefault("status", "published")
            item.setdefault("tag", item.get("category") or "")
            item.setdefault("date", "")
            item.setdefault("cover_symbol", item.get("symbol") or "✦")
            item.setdefault("cover_image_url", "")
            item.setdefault("cover_image_alt", item.get("title") or "")
            sync_content_image_size(item, "cover_image_url", "cover_image")
            item.setdefault("seo_title", "")
            item.setdefault("seo_description", "")
            item.setdefault("topic_slug", "")
            if not item.get("excerpt"):
                item["excerpt"] = item.get("text") or item.get("description") or ""
            if not item.get("body"):
                item["body"] = item.get("text") or item.get("excerpt") or ""
            clean_blocks = clean_editor_blocks(item.get("blocks"), "")
            if clean_blocks:
                item["blocks"] = clean_blocks
            else:
                item.pop("blocks", None)
            slug = make_slug(item.get("slug") or item.get("title"), f"material-{index+1}")
            base_slug = slug
            suffix = 2
            while slug in seen_slugs:
                slug = f"{base_slug}-{suffix}"
                suffix += 1
            item["slug"] = slug
            seen_slugs.add(slug)
            normalized_items.append(item)
        section["items"] = normalized_items
        normalize_section_topics(section, normalized_items)
    clean_featured = []
    seen_featured: set[str] = set()
    for value in data["home"].get("featured_material_ids", []):
        text = str(value or "").strip()
        if not text or ":" not in text or text in seen_featured:
            continue
        seen_featured.add(text)
        clean_featured.append(text)
    data["home"]["featured_material_ids"] = clean_featured[:8]
    return data

def load_content() -> dict[str, Any]:
    data = read_content_json()
    if not isinstance(data, dict):
        data = default_content()
    normalized = normalize_content(clone_json(data))
    return normalized

def public_content(data: dict[str, Any] | None = None) -> dict[str, Any]:
    content = normalize_content(clone_json(data or load_content()))
    for section in content.get("sections", {}).values():
        section["items"] = [item for item in section.get("items", []) if item.get("status") == "published"]
        visible_topic_slugs = {str(item.get("topic_slug") or "").strip() for item in section["items"] if str(item.get("topic_slug") or "").strip()}
        if section.get("topics_enabled") is True and visible_topic_slugs:
            section["topics"] = [
                topic
                for topic in section.get("topics", [])
                if isinstance(topic, dict)
                and topic.get("enabled") is not False
                and str(topic.get("slug") or "").strip() in visible_topic_slugs
            ]
        else:
            section["topics"] = []
    content.pop("updated_by", None)
    return content

__all__ = ['default_content', 'default_featured_material_ids', 'normalize_section_topics', 'normalize_content', 'load_content', 'public_content']
