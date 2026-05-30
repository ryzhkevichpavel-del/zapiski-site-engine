from __future__ import annotations

from typing import Any

from . import auth, community, content_admin, health_status, media, trebnik_api


GET_ROUTES = (
    health_status,
    media,
    content_admin,
    auth,
    trebnik_api,
    community,
)

POST_ROUTES = (
    auth,
    community,
    content_admin,
    media,
    trebnik_api,
)


def api_get(handler: Any, app: Any, path: str) -> None:
    parts = _path_parts(path)
    for route_module in GET_ROUTES:
        handled, payload = route_module.handle_get(handler, app, parts)
        if not handled:
            continue
        if payload is not None:
            handler.json(200, payload)
        return
    raise app.ApiError(404, "Маршрут API не найден.")


def api_post(handler: Any, app: Any, path: str, raw_body: bytes, content_type: str) -> None:
    cookies: list[str] = []
    with app.WRITE_LOCK:
        parts = _path_parts(path)
        data = {} if media.is_multipart_media(parts, content_type) else app.parse_body(raw_body)
        for route_module in POST_ROUTES:
            handled, payload = route_module.handle_post(handler, app, parts, data, raw_body, content_type, cookies)
            if handled:
                break
        else:
            raise app.ApiError(404, "Маршрут API не найден.")
    if (
        isinstance(payload, dict)
        and payload.get("user")
        and (parts[:2] == ["api", "auth"] or parts[:3] == ["api", "community", "auth"])
    ):
        payload.pop("token", None)
    handler.json(200, payload, cookies=[cookie for cookie in cookies if cookie])


def _path_parts(path: str) -> list[str]:
    return [part for part in path.strip("/").split("/") if part]
