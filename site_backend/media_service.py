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

def file_info(path: Path) -> dict[str, Any]:
    info: dict[str, Any] = {"name": path.name, "exists": path.exists()}
    if path.exists():
        stat = path.stat()
        info.update(
            size_bytes=stat.st_size,
            modified_at=datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
        )
    return info

def media_public_url(path: Path) -> str:
    rel = path.resolve().relative_to(WEB_ROOT)
    return "/" + "/".join(rel.parts)

def file_content_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def hardlink_existing_duplicate(path: Path, candidates: list[Path]) -> None:
    if not path.exists():
        return
    target_size = path.stat().st_size
    target_hash: str | None = None
    tmp = path.with_name(f".{path.name}.dedupe-link")
    try:
        for candidate in candidates:
            try:
                if not candidate.exists() or candidate.resolve() == path.resolve():
                    continue
                if os.path.samefile(candidate, path):
                    return
                if candidate.stat().st_size != target_size:
                    continue
                if target_hash is None:
                    target_hash = file_content_hash(path)
                if file_content_hash(candidate) != target_hash:
                    continue
                if tmp.exists():
                    tmp.unlink()
                os.link(candidate, tmp)
                os.replace(tmp, path)
                return
            except OSError:
                continue
    finally:
        try:
            if tmp.exists():
                tmp.unlink()
        except OSError:
            pass

def normalize_media_slot(slot: Any, default: str = "hero") -> str:
    clean = str(slot or "").strip().lower()
    if clean in MEDIA_SLOT_PREFIXES:
        return clean
    return default

def media_path_from_url(url: Any) -> Path | None:
    if not isinstance(url, str) or not url.strip():
        return None
    clean = url.strip().split("?", 1)[0]
    if not clean.startswith("/static/uploads/"):
        return None
    candidate = (WEB_ROOT / clean.lstrip("/")).resolve()
    try:
        candidate.relative_to(UPLOADS_DIR.resolve())
    except ValueError:
        return None
    if candidate.suffix.lower() not in set(MEDIA_UPLOAD_MIME_SUFFIXES.values()):
        return None
    if not any(candidate.name.startswith(prefix) for prefix in MEDIA_SLOT_PREFIXES.values()):
        return None
    return candidate

def original_media_path_from_url(url: Any) -> Path | None:
    path = media_path_from_url(url)
    if not path:
        return None
    if not path.exists():
        return None
    variant_match = re.match(r"^(?P<base>.+)-\d+\.webp$", path.name)
    base = variant_match.group("base") if variant_match else re.sub(r"-original\.[^.]+$", "", path.name)
    candidates = sorted(path.parent.glob(f"{base}-original.*"), key=lambda item: item.stat().st_size if item.exists() else 0, reverse=True)
    for candidate in candidates:
        if candidate.exists() and candidate.suffix.lower() in set(MEDIA_UPLOAD_MIME_SUFFIXES.values()):
            return candidate
    if variant_match:
        variants = []
        for candidate in path.parent.glob(f"{base}-*.webp"):
            width_match = re.match(rf"^{re.escape(base)}-(\d+)\.webp$", candidate.name)
            if width_match and candidate.exists():
                variants.append((int(width_match.group(1)), candidate))
        if variants:
            return max(variants, key=lambda item: item[0])[1]
    return path

def full_media_url(url: Any) -> str:
    path = original_media_path_from_url(url)
    return media_public_url(path) if path else ""

def profile_avatar_path_from_url(url: Any) -> Path | None:
    path = media_path_from_url(url)
    if not path:
        return None
    if not path.name.startswith(MEDIA_SLOT_PREFIXES["profile-avatar"]):
        return None
    if not path.exists():
        return None
    return path

def delete_uploaded_media(url: Any) -> None:
    path = media_path_from_url(url)
    if not path:
        return
    try:
        candidates = [path]
        variant_match = re.match(r"^(?P<base>.+)-\d+\.webp$", path.name)
        if variant_match:
            base = variant_match.group("base")
            candidates.extend(path.parent.glob(f"{base}-*.webp"))
            candidates.extend(path.parent.glob(f"{base}-original.*"))
        original_match = re.match(r"^(?P<base>.+)-original\.[^.]+$", path.name)
        if original_match:
            base = original_match.group("base")
            candidates.extend(path.parent.glob(f"{base}-*.webp"))
            candidates.extend(path.parent.glob(f"{base}-original.*"))
        MEDIA_TRASH_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        for candidate in set(candidates):
            if candidate.exists():
                target = MEDIA_TRASH_DIR / f"{stamp}_{candidate.name}"
                suffix = 2
                while target.exists():
                    target = MEDIA_TRASH_DIR / f"{stamp}_{suffix}_{candidate.name}"
                    suffix += 1
                candidate.replace(target)
    except OSError:
        pass

def parse_image_data_url(data_url: Any) -> tuple[str, bytes]:
    if not isinstance(data_url, str) or not data_url.strip():
        raise ApiError(400, "Нужно передать фото.")
    match = re.fullmatch(r"data:(image/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)", data_url.strip(), re.IGNORECASE)
    if not match:
        raise ApiError(400, "Поддерживаются только PNG, JPG, WEBP и GIF.")
    mime = match.group(1).lower()
    try:
        raw = base64.b64decode(match.group(2), validate=True)
    except Exception as exc:
        raise ApiError(400, "Не удалось прочитать загруженное фото.") from exc
    if not raw:
        raise ApiError(400, "Файл с фото пустой.")
    if len(raw) > MEDIA_UPLOAD_LIMIT_BYTES:
        raise ApiError(400, f"Фото слишком большое. Выберите файл до {MEDIA_UPLOAD_LIMIT_LABEL}.")
    if mime == "image/png" and not raw.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ApiError(400, "Файл не похож на PNG.")
    if mime == "image/jpeg" and not raw.startswith(b"\xff\xd8\xff"):
        raise ApiError(400, "Файл не похож на JPG.")
    if mime == "image/webp" and not (raw.startswith(b"RIFF") and raw[8:12] == b"WEBP"):
        raise ApiError(400, "Файл не похож на WEBP.")
    if mime == "image/gif" and not (raw.startswith(b"GIF87a") or raw.startswith(b"GIF89a")):
        raise ApiError(400, "Файл не похож на GIF.")
    return MEDIA_UPLOAD_MIME_SUFFIXES[mime], raw

def parse_image_form_upload(raw: bytes, content_type: str, default_slot: str = "hero") -> tuple[str, str, bytes]:
    if not raw:
        raise ApiError(400, "Нужно выбрать фото.")
    if "multipart/form-data" not in str(content_type or "").lower():
        raise ApiError(400, "Фото нужно отправлять как файл.")
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
        raise ApiError(400, "Фото нужно отправлять как файл.")
    file_raw = b""
    slot_value = None
    for part in message.iter_parts():
        disposition = part.get("Content-Disposition", "")
        if "form-data" not in disposition:
            continue
        name = part.get_param("name", header="content-disposition")
        payload = part.get_payload(decode=True) or b""
        if name == "file" and not file_raw:
            file_raw = payload
        elif name == "slot" and slot_value is None:
            slot_value = payload.decode(part.get_content_charset() or "utf-8", "replace")
    if not file_raw:
        raise ApiError(400, "Нужно выбрать фото.")
    suffix = ""
    if file_raw.startswith(b"\x89PNG\r\n\x1a\n"):
        suffix = ".png"
    elif file_raw.startswith(b"\xff\xd8\xff"):
        suffix = ".jpg"
    elif file_raw.startswith(b"RIFF") and file_raw[8:12] == b"WEBP":
        suffix = ".webp"
    elif file_raw.startswith(b"GIF87a") or file_raw.startswith(b"GIF89a"):
        suffix = ".gif"
    if not suffix:
        raise ApiError(400, "Поддерживаются только PNG, JPG, WEBP и GIF.")
    if len(file_raw) > MEDIA_UPLOAD_LIMIT_BYTES:
        raise ApiError(400, f"Фото слишком большое. Выберите файл до {MEDIA_UPLOAD_LIMIT_LABEL}.")
    slot = normalize_media_slot(slot_value, default=default_slot)
    return slot, suffix, file_raw

def image_dimensions(path: Path) -> tuple[int, int] | tuple[None, None]:
    try:
        if Image is not None:
            with Image.open(path) as image:
                return image.size
        data = path.read_bytes()[:128]
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            offset = 12
            while offset + 8 <= len(data):
                chunk_type = data[offset:offset + 4]
                chunk_size = int.from_bytes(data[offset + 4:offset + 8], "little")
                payload = offset + 8
                if chunk_type == b"VP8X" and payload + 10 <= len(data):
                    return (
                        int.from_bytes(data[payload + 4:payload + 7], "little") + 1,
                        int.from_bytes(data[payload + 7:payload + 10], "little") + 1,
                    )
                if chunk_type == b"VP8L" and payload + 5 <= len(data):
                    bits = int.from_bytes(data[payload + 1:payload + 5], "little")
                    return ((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1)
                if chunk_type == b"VP8 " and payload + 10 <= len(data) and data[payload + 3:payload + 6] == b"\x9d\x01\x2a":
                    return (
                        int.from_bytes(data[payload + 6:payload + 8], "little") & 0x3FFF,
                        int.from_bytes(data[payload + 8:payload + 10], "little") & 0x3FFF,
                    )
                offset = payload + chunk_size + (chunk_size % 2)
    except Exception:
        pass
    return (None, None)

def save_original_upload(raw: bytes, suffix: str, slot: str, base_name: str, digest: str | None = None) -> tuple[Path, dict[str, Any]]:
    path = UPLOADS_DIR / f"{base_name}{suffix}"
    with FILE_LOCK:
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_bytes(raw)
        tmp.replace(path)
        if digest:
            hardlink_existing_duplicate(path, sorted(UPLOADS_DIR.glob(f"*-{digest}-original.*")))
    width, height = image_dimensions(path)
    return path, {
        "path": media_public_url(path),
        "width": width,
        "height": height,
        "size_bytes": path.stat().st_size,
        "optimized": False,
    }

def save_webp_variants(raw: bytes, slot: str, base_name: str, digest: str | None = None) -> tuple[Path, dict[str, Any]]:
    if Image is None or ImageOps is None:
        raise RuntimeError("Pillow is not available.")
    with Image.open(io.BytesIO(raw)) as source:
        image = ImageOps.exif_transpose(source)
        if getattr(image, "is_animated", False):
            raise RuntimeError("Animated images are kept as originals.")
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
        source_width, source_height = image.size
        variants: dict[str, Any] = {}
        paths: list[Path] = []
        for max_width in MEDIA_SLOT_WIDTHS.get(slot, (960,)):
            target_width = min(int(max_width), int(source_width))
            if target_width <= 0:
                continue
            ratio = target_width / source_width
            target_height = max(1, round(source_height * ratio))
            variant = image if target_width == source_width else image.resize((target_width, target_height), Image.Resampling.LANCZOS)
            path = UPLOADS_DIR / f"{base_name}-{target_width}.webp"
            with FILE_LOCK:
                tmp = path.with_suffix(path.suffix + ".tmp")
                variant.save(tmp, "WEBP", quality=MEDIA_WEBP_QUALITY, method=6)
                tmp.replace(path)
                if digest:
                    hardlink_existing_duplicate(path, sorted(UPLOADS_DIR.glob(f"*-{digest}-{target_width}.webp")))
            paths.append(path)
            variants[str(target_width)] = {
                "path": media_public_url(path),
                "width": target_width,
                "height": target_height,
                "size_bytes": path.stat().st_size,
            }
        if not paths:
            raise RuntimeError("No media variants were created.")
    primary = paths[0]
    primary_url = media_public_url(primary)
    primary_info = next((info for info in variants.values() if info.get("path") == primary_url), {})
    return primary, {
        "path": primary_url,
        "width": primary_info.get("width"),
        "height": primary_info.get("height"),
        "size_bytes": primary.stat().st_size,
        "variants": variants,
        "optimized": True,
    }

def save_uploaded_bytes(raw: bytes, suffix: str, slot: str) -> dict[str, Any]:
    normalized_slot = normalize_media_slot(slot)
    prefix = MEDIA_SLOT_PREFIXES[normalized_slot]
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha1(raw).hexdigest()[:10]
    if suffix.lower() == ".gif" and len(raw) > MEDIA_ORIGINAL_FALLBACK_LIMIT_BYTES:
        raise ApiError(400, f"Большие GIF нельзя сжать безопасно. Выберите GIF до {MEDIA_ORIGINAL_FALLBACK_LIMIT_LABEL} или обычное фото JPG/PNG/WEBP до {MEDIA_UPLOAD_LIMIT_LABEL}.")
    unique_part = secrets.token_hex(3)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    base_name = f"{prefix}{stamp}-{unique_part}-{digest}"
    if suffix.lower() != ".gif":
        try:
            path, info = save_webp_variants(raw, normalized_slot, base_name, digest)
            original_path, original_info = save_original_upload(raw, suffix, normalized_slot, f"{base_name}-original", digest)
            return {
                "slot": normalized_slot,
                "path": path,
                "file": file_info(path),
                **info,
                "original_path": media_public_url(original_path),
                "original": original_info,
            }
        except Exception as exc:
            if exc.__class__.__name__ == "DecompressionBombError":
                raise ApiError(400, "Фото слишком большое по размеру кадра. Лучше выбрать изображение до 80 мегапикселей.") from exc
            if len(raw) > MEDIA_ORIGINAL_FALLBACK_LIMIT_BYTES:
                raise ApiError(400, "Фото большое, но сервер не смог его сжать. Попробуйте сохранить его как JPG/PNG/WEBP и загрузить снова.") from exc
    path, info = save_original_upload(raw, suffix, normalized_slot, base_name, digest)
    return {"slot": normalized_slot, "path": path, "file": file_info(path), **info, "original_path": media_public_url(path), "original": info}

def full_media_url_payload(url: Any) -> dict[str, Any]:
    clean = str(url or "").strip()
    path = media_path_from_url(clean)
    if not path or not path.exists():
        raise ApiError(404, "Фото не найдено.")
    full_url_value = full_media_url(clean) or clean
    return {"ok": True, "url": full_url_value, "source_url": media_public_url(path)}

def collect_content_media_urls(content: Any) -> set[str]:
    urls: set[str] = set()
    if not isinstance(content, dict):
        return urls
    brand = content.get("brand") if isinstance(content.get("brand"), dict) else {}
    home = content.get("home") if isinstance(content.get("home"), dict) else {}
    for value in (
        brand.get("owner_photo_url"),
        brand.get("header_visual_url"),
        home.get("hero_image_url"),
    ):
        if isinstance(value, str) and value.strip():
            urls.add(value.strip())
    sections = content.get("sections") if isinstance(content.get("sections"), dict) else {}
    for section in sections.values():
        if not isinstance(section, dict):
            continue
        value = section.get("cover_image_url")
        if isinstance(value, str) and value.strip():
            urls.add(value.strip())
        items = section.get("items") if isinstance(section.get("items"), list) else []
        for item in items:
            if not isinstance(item, dict):
                continue
            value = item.get("cover_image_url")
            if isinstance(value, str) and value.strip():
                urls.add(value.strip())
            blocks = item.get("blocks") if isinstance(item.get("blocks"), dict) else {}
            for block in blocks.get("blocks", []) if isinstance(blocks.get("blocks"), list) else []:
                if not isinstance(block, dict) or block.get("type") != "image":
                    continue
                data = block.get("data") if isinstance(block.get("data"), dict) else {}
                file_data = data.get("file") if isinstance(data.get("file"), dict) else {}
                inline_url = file_data.get("url") or data.get("url")
                if isinstance(inline_url, str) and inline_url.strip():
                    urls.add(inline_url.strip())
    return urls

def save_owner_photo_upload(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    suffix, raw = parse_image_data_url(data.get("data_url"))
    saved = save_uploaded_bytes(raw, suffix, "legacy-owner")
    public_path = saved.get("path")
    log_event("owner_photo_uploaded", username=user.get("username"), path=public_path, size_bytes=len(raw), slot=saved.get("slot"))
    return {"ok": True, **{key: json_safe(value) for key, value in saved.items() if key != "path"}, "path": public_path}

def save_owner_photo_file_upload(raw_body: bytes, content_type: str, headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    slot, suffix, raw = parse_image_form_upload(raw_body, content_type, default_slot="legacy-owner")
    saved = save_uploaded_bytes(raw, suffix, slot)
    public_path = saved.get("path")
    log_event("owner_photo_uploaded", username=user.get("username"), path=public_path, size_bytes=len(raw), slot=saved.get("slot"))
    return {"ok": True, **{key: json_safe(value) for key, value in saved.items() if key != "path"}, "path": public_path}

def save_media_file_upload(raw_body: bytes, content_type: str, headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    slot, suffix, raw = parse_image_form_upload(raw_body, content_type, default_slot="hero")
    saved = save_uploaded_bytes(raw, suffix, slot)
    public_path = saved.get("path")
    log_event("media_uploaded", username=user.get("username"), path=public_path, size_bytes=len(raw), slot=saved.get("slot"))
    return {"ok": True, **{key: json_safe(value) for key, value in saved.items() if key != "path"}, "path": public_path}

def save_public_avatar_file_upload(raw_body: bytes, content_type: str, headers: Any) -> dict[str, Any]:
    user = require_public_user(headers)
    _slot, suffix, raw = parse_image_form_upload(raw_body, content_type, default_slot="profile-avatar")
    saved = save_uploaded_bytes(raw, suffix, "profile-avatar")
    public_path = saved.get("path")
    community_log("public_avatar_uploaded", int(user["id"]), path=public_path, size_bytes=len(raw), slot=saved.get("slot"))
    return {"ok": True, **{key: json_safe(value) for key, value in saved.items() if key != "path"}, "path": public_path}

__all__ = ['file_info', 'media_public_url', 'normalize_media_slot', 'media_path_from_url', 'original_media_path_from_url', 'full_media_url', 'profile_avatar_path_from_url', 'delete_uploaded_media', 'parse_image_data_url', 'parse_image_form_upload', 'image_dimensions', 'save_original_upload', 'save_webp_variants', 'save_uploaded_bytes', 'full_media_url_payload', 'collect_content_media_urls', 'save_owner_photo_upload', 'save_owner_photo_file_upload', 'save_media_file_upload', 'save_public_avatar_file_upload']
