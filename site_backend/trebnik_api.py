from __future__ import annotations

from typing import Any


def handle_get(handler: Any, app: Any, parts: list[str]) -> tuple[bool, dict[str, Any] | None]:
    if parts == ["api", "clients"]:
        app.require_admin(handler.headers)
        live = app.trebnik_bridge_query_required("admin.clients", {}, handler.headers)
        return True, {"ok": True, "items": live.get("items") if isinstance(live.get("items"), list) else [], "source": "bot", **app.trebnik_live_meta(live)}
    if len(parts) == 4 and parts[:2] == ["api", "client"] and parts[3] == "overview":
        client_id = int(parts[2])
        viewer = app.require_client_or_admin(handler.headers, client_id)
        return True, app.client_overview(client_id, include_admin_notes=app.is_admin_session(viewer), headers=handler.headers)
    if len(parts) == 4 and parts[:2] == ["api", "client"] and parts[3] == "requests":
        client_id = int(parts[2])
        app.require_client_or_admin(handler.headers, client_id)
        live = app.trebnik_bridge_query_required("client.requests", {"client_id": client_id}, handler.headers)
        return True, {"ok": True, "items": live.get("items") if isinstance(live.get("items"), list) else [], "source": "bot", **app.trebnik_live_meta(live)}
    if len(parts) == 4 and parts[:2] == ["api", "client"] and parts[3] == "action-summary":
        client_id = int(parts[2])
        app.require_client_or_admin(handler.headers, client_id)
        live = app.trebnik_bridge_query_required("client.action_summary", {"client_id": client_id}, handler.headers)
        return True, {"ok": True, "summary": live, "source": "bot", **app.trebnik_live_meta(live)}
    if len(parts) == 4 and parts[:2] == ["api", "client"] and parts[3] == "services":
        client_id = int(parts[2])
        app.require_client_or_admin(handler.headers, client_id)
        live = app.trebnik_bridge_query_required("client.services", {"client_id": client_id, "include_closed": True}, handler.headers)
        return True, {"ok": True, "items": live.get("items") if isinstance(live.get("items"), list) else [], "source": "bot", **app.trebnik_live_meta(live)}
    if len(parts) == 4 and parts[:2] == ["api", "client"] and parts[3] == "updates":
        client_id = int(parts[2])
        app.require_client_or_admin(handler.headers, client_id)
        live = app.trebnik_bridge_query_required("client.updates", {"client_id": client_id}, handler.headers)
        return True, {"ok": True, "items": live.get("items") if isinstance(live.get("items"), list) else [], "source": "bot", **app.trebnik_live_meta(live)}
    if len(parts) == 4 and parts[:2] == ["api", "client"] and parts[3] == "finances":
        client_id = int(parts[2])
        app.require_client_or_admin(handler.headers, client_id)
        report = app.trebnik_bridge_query_required("client.financial_report", {"client_id": client_id}, handler.headers)
        return True, {"ok": True, "report": report, "source": "bot", **app.trebnik_live_meta(report)}
    if len(parts) == 4 and parts[:2] == ["api", "client"] and parts[3] == "financial-report":
        client_id = int(parts[2])
        app.require_client_or_admin(handler.headers, client_id)
        report = app.trebnik_bridge_query_required("client.financial_report", {"client_id": client_id}, handler.headers)
        return True, {"ok": True, "report": report, "source": "bot", **app.trebnik_live_meta(report)}
    if len(parts) == 4 and parts[:2] == ["api", "client"] and parts[3] == "targets":
        client_id = int(parts[2])
        app.require_client_or_admin(handler.headers, client_id)
        live = app.trebnik_bridge_query_required("client.targets", {"client_id": client_id}, handler.headers)
        return True, {
            "ok": True,
            "update_targets": live.get("update_targets") if isinstance(live.get("update_targets"), list) else [],
            "payment_targets": live.get("payment_targets") if isinstance(live.get("payment_targets"), list) else [],
            "source": "bot",
            **app.trebnik_live_meta(live),
        }
    if len(parts) == 4 and parts[:2] == ["api", "client"] and parts[3] == "notifications":
        client_id = int(parts[2])
        app.require_client_or_admin(handler.headers, client_id)
        live = app.trebnik_bridge_query_required("client.notifications", {"client_id": client_id}, handler.headers)
        return True, {"ok": True, **live, "source": "bot", **app.trebnik_live_meta(live)}
    if parts == ["api", "admin", "finance"]:
        app.require_admin(handler.headers)
        live = app.trebnik_bridge_query_required("admin.finance_dashboard", {}, handler.headers)
        return True, {"ok": True, **live, "source": "bot", **app.trebnik_live_meta(live)}
    if parts == ["api", "admin", "ritebook"]:
        app.require_admin(handler.headers)
        catalog = app.admin_work_catalog(headers=handler.headers)
        return True, {"ok": True, "items": catalog.get("items", []), "source": catalog.get("source", "copy")}
    if parts == ["api", "admin", "actions"]:
        app.require_admin(handler.headers)
        return True, app.admin_actions_dashboard(headers=handler.headers)
    if parts == ["api", "trebnik", "events"]:
        app.trebnik_events_stream(handler)
        return True, None
    if len(parts) == 3 and parts[:2] == ["api", "request"]:
        return True, app.request_detail(int(parts[2]), headers=handler.headers)
    if len(parts) == 4 and parts[:2] == ["api", "request"] and parts[3] == "history":
        return True, app.request_history(int(parts[2]), headers=handler.headers)
    if len(parts) == 4 and parts[:2] == ["api", "request"] and parts[3] == "work-logs":
        return True, app.request_work_logs(int(parts[2]), headers=handler.headers)
    if len(parts) == 3 and parts[:2] == ["api", "service"]:
        return True, app.service_detail(int(parts[2]), headers=handler.headers)
    if len(parts) == 5 and parts[:2] == ["api", "update"] and parts[3] == "attachment":
        app.update_attachment_stream(handler, int(parts[2]), int(parts[4]), handler.headers)
        return True, None
    if len(parts) == 4 and parts[:3] == ["api", "admin", "update"]:
        app.require_admin(handler.headers)
        return True, app.update_detail(int(parts[3]), headers=handler.headers)
    if len(parts) == 3 and parts[:2] == ["api", "work"]:
        app.require_admin(handler.headers)
        return True, app.work_detail(int(parts[2]), headers=handler.headers)
    if parts in (["api", "admin", "dashboard"], ["api", "admin", "summary"], ["api", "admin", "workbench"]):
        app.require_admin(handler.headers)
        return True, app.admin_dashboard(headers=handler.headers)
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
    if parts == ["api", "client", "message"]:
        return True, app.save_client_message(data, handler.headers)
    if parts == ["api", "client", "update"]:
        return True, app.save_client_message({**data, "kind": "update"}, handler.headers)
    if parts == ["api", "client", "payment-receipt"]:
        return True, app.save_payment_receipt(data, handler.headers)
    if parts == ["api", "client", "notification"]:
        return True, app.save_client_notification(data, handler.headers)
    if parts == ["api", "client", "notifications-all"]:
        return True, app.save_client_notifications_all(data, handler.headers)
    if parts == ["api", "client", "notifications", "read"]:
        return True, app.mark_trebnik_client_notifications_read(data, handler.headers)
    if parts == ["api", "service", "extend-request"]:
        return True, app.save_service_extend_request(data, handler.headers)
    if parts == ["api", "service", "action"]:
        return True, app.save_service_action(data, handler.headers)
    if parts == ["api", "admin", "trebnik", "action"]:
        return True, app.save_admin_trebnik_action(data, handler.headers)
    if parts == ["api", "admin", "inquiry", "update-status"]:
        return True, app.update_inquiry_status(data, handler.headers)
    if parts == ["api", "admin", "payment", "confirm"]:
        return True, app.save_payment_decision(data, handler.headers, "confirmed")
    if parts == ["api", "admin", "payment", "reject"]:
        return True, app.save_payment_decision(data, handler.headers, "rejected")
    if parts == ["api", "admin", "service", "more-time", "approve"]:
        return True, app.review_service_more_time(data, handler.headers, "approved")
    if parts == ["api", "admin", "service", "more-time", "reject"]:
        return True, app.review_service_more_time(data, handler.headers, "rejected")
    if parts == ["api", "admin", "update", "read"]:
        return True, app.mark_update_read(data, handler.headers)
    if parts == ["api", "admin", "update", "read-all"]:
        return True, app.mark_all_updates_read(data, handler.headers)
    if parts == ["api", "admin", "work", "log"]:
        return True, app.save_work_log(data, handler.headers)
    if parts == ["api", "admin", "work", "log-bulk"]:
        return True, app.save_work_logs_bulk(data, handler.headers)
    if parts == ["api", "admin", "ritebook", "update"]:
        return True, app.save_ritebook_item(data, handler.headers)
    if parts == ["api", "admin", "trebnik", "profile-link"]:
        return True, app.set_trebnik_profile_link(data, handler.headers)
    if parts == ["api", "admin", "sync"]:
        user = app.require_admin(handler.headers)
        payload = {
            "ok": True,
            "mode": "snapshot",
            "warning": "Это ручной диагностический снимок. Интерфейс Требника не использует его как живые данные.",
            "sync": app.ensure_db_copy(force=True),
        }
        app.log_event("db_sync", username=user.get("username"), status=payload["sync"].get("status"))
        return True, payload
    return False, None
