from __future__ import annotations

from typing import Any


def handle_get(handler: Any, app: Any, parts: list[str]) -> tuple[bool, dict[str, Any] | None]:
    if parts == ["api", "auth", "me"]:
        viewer = app.session(handler.headers)
        cookies = (
            [handler.session_cookie(viewer["token"])]
            if viewer and viewer.get("token")
            else ([handler.clear_session_cookie()] if app.cookie_value(handler.headers, app.SESSION_COOKIE_NAME) else [])
        )
        payload = {"ok": True, "setup_required": not app.admin_exists(), "user": app.public_user(viewer)}
        handler.json(200, payload, cookies=cookies)
        return True, None
    if parts == ["api", "admin", "access"]:
        app.require_admin(handler.headers)
        return True, {"ok": True, "access": app.auth_summary(), "events": app.load_state().get("events", [])[-200:]}
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
    if parts == ["api", "auth", "setup-admin"]:
        app.rate_limit(handler.headers, "setup")
        payload = app.setup_admin(data)
        if payload.get("token"):
            cookies.append(handler.session_cookie(str(payload.get("token"))))
        return True, payload
    if parts == ["api", "auth", "login"]:
        app.rate_limit(handler.headers, "login")
        payload = app.login_api(data)
        if payload.get("token"):
            cookies.append(handler.session_cookie(str(payload.get("token"))))
        return True, payload
    if parts == ["api", "auth", "logout"]:
        item = app.session(handler.headers)
        if item:
            app.delete_auth_session(item.get("token"))
            app.log_event("logout", role=item.get("role"), username=item.get("username"), client_id=item.get("client_id"))
        cookies.append(handler.clear_session_cookie())
        return True, {"ok": True}
    if parts == ["api", "admin", "session", "revoke"]:
        return True, app.revoke_session_api(data, handler.headers)
    return False, None
