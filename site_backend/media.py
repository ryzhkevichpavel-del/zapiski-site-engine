from __future__ import annotations

from typing import Any


MEDIA_POST_PARTS = (
    ["api", "admin", "media", "owner-photo"],
    ["api", "admin", "media", "upload"],
    ["api", "community", "profile", "avatar"],
    ["api", "community", "messages", "attachment"],
)


def is_multipart_media(parts: list[str], content_type: str) -> bool:
    return parts in MEDIA_POST_PARTS and "multipart/form-data" in str(content_type).lower()

def handle_get(handler: Any, app: Any, parts: list[str]) -> tuple[bool, dict[str, Any] | None]:
    if parts == ["api", "media", "full-url"]:
        from urllib.parse import parse_qs, urlparse

        params = parse_qs(urlparse(handler.path).query)
        return True, app.full_media_url_payload(params.get("url", [""])[0])
    return False, None


def handle_post(
    handler: Any,
    app: Any,
    parts: list[str],
    data: dict[str, Any],
    raw_body: bytes,
    content_type: str,
    cookies: list[str],
) -> tuple[bool, dict[str, Any] | None]:
    if parts == ["api", "admin", "media", "owner-photo"]:
        if "multipart/form-data" in str(content_type).lower():
            return True, app.save_owner_photo_file_upload(raw_body, content_type, handler.headers)
        return True, app.save_owner_photo_upload(data, handler.headers)
    if parts == ["api", "admin", "media", "upload"]:
        return True, app.save_media_file_upload(raw_body, content_type, handler.headers)
    if parts == ["api", "community", "profile", "avatar"]:
        return True, app.save_public_avatar_file_upload(raw_body, content_type, handler.headers)
    return False, None
