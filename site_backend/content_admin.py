from __future__ import annotations

from typing import Any
from urllib.parse import parse_qs, urlparse


def handle_get(handler: Any, app: Any, parts: list[str]) -> tuple[bool, dict[str, Any] | None]:
    if parts == ["api", "site", "content"]:
        viewer = app.session(handler.headers)
        params = parse_qs(urlparse(handler.path).query)
        public_view = str(params.get("view", [""])[0] or "").strip().lower() == "public"
        return True, {"ok": True, "content": app.public_content() if public_view or not app.is_admin_session(viewer) else app.load_content()}
    if parts == ["api", "admin", "content", "history"]:
        return True, app.content_history(handler.headers)
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
    if parts == ["api", "public", "inquiry"]:
        return True, app.save_inquiry(data, handler.headers)
    if parts == ["api", "site", "visit"]:
        viewer = app.public_user(app.session(handler.headers))
        visitor_token = app.track_site_visit(handler.headers, app.clean_visit_path(data.get("path") or "/"), viewer)
        if visitor_token and not app.visitor_cookie(handler.headers):
            cookies.append(handler.visitor_cookie(visitor_token))
        return True, {"ok": True}
    if parts == ["api", "admin", "traffic", "reset"]:
        app.require_admin(handler.headers)
        mode = str(data.get("mode") or "today").strip().lower()
        if mode != "today":
            raise app.ApiError(400, "Можно сбросить только сегодняшний счетчик.")
        result = app.reset_admin_traffic()
        return True, {"ok": True, "reset": result, "traffic": app.admin_traffic_summary()}
    if parts == ["api", "admin", "content"]:
        return True, app.save_content(data, handler.headers)
    if parts == ["api", "admin", "content", "material", "create"]:
        return True, app.create_material_content(data, handler.headers)
    if parts == ["api", "admin", "content", "material", "save"]:
        return True, app.save_material_content(data, handler.headers)
    if parts == ["api", "admin", "content", "material", "status"]:
        return True, app.update_material_status(data, handler.headers)
    if parts == ["api", "admin", "content", "material", "delete"]:
        return True, app.delete_material_content(data, handler.headers)
    if parts == ["api", "admin", "content", "section", "save"]:
        return True, app.save_section_content(data, handler.headers)
    if parts == ["api", "admin", "content", "home", "save"]:
        return True, app.save_home_content(data, handler.headers)
    if parts == ["api", "admin", "content", "featured", "save"]:
        return True, app.save_featured_content(data, handler.headers)
    if parts == ["api", "admin", "content", "restore"]:
        return True, app.restore_content_backup(data, handler.headers)
    if parts == ["api", "admin", "note"]:
        return True, app.save_note(data, handler.headers)
    return False, None
