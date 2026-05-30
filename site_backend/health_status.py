from __future__ import annotations

from typing import Any


def handle_get(handler: Any, app: Any, parts: list[str]) -> tuple[bool, dict[str, Any] | None]:
    if parts == ["api", "health"]:
        app.ensure_community_schema()
        return True, {
            "ok": True,
            "status": "ok",
            "setup_required": not app.admin_exists(),
            "community": app.community_status(),
            "trebnik": {"ok": None, "status": "not_checked"},
        }
    if parts == ["api", "trebnik", "health"]:
        app.require_admin(handler.headers)
        return True, app.trebnik_site_health()
    if parts == ["api", "admin", "traffic"]:
        app.require_admin(handler.headers)
        return True, {"ok": True, "traffic": app.admin_traffic_summary()}
    return False, None
