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

from . import settings as site_settings
from .errors import ApiError
from .serialization import money_safe, now_iso, parse_date
from .settings import *
from .site_store import load_state, log_event, save_state
from .snapshot_store import all_rows, one_row
from .trebnik_bridge import (
    trebnik_bridge_binary_required,
    trebnik_bridge_query,
    trebnik_bridge_query_required,
)

WORK_CATALOG_EDITABLE_FIELDS = {
    "title",
    "goal",
    "category",
    "type",
    "total_days",
    "period_days",
    "period_times",
}
WORK_CATALOG_DEFAULT_CATEGORY = "служебная"

TREBNIK_CLIENT_NOTIFICATION_FIELDS = {
    "notify_new_work",
    "notify_status_change",
    "notify_diagnostics",
    "notify_recommendations",
    "notify_payment_reminder",
    "notify_update_reminder",
}

ADMIN_TREBNIK_COMMANDS = {
    "client.add",
    "client.rename",
    "client.archive",
    "client.unarchive",
    "client.delete",
    "request.add",
    "request.update",
    "request.delete",
    "work.add",
    "work.update",
    "work.delete",
    "work.log.add",
    "work.log.add_bulk",
    "diagnostic.add",
    "diagnostic.update",
    "diagnostic.delete",
    "recommendation.add",
    "recommendation.update",
    "recommendation.cancel",
    "recommendation.delete",
    "update.read",
    "payment.reminder.preview",
    "payment.reminder.send",
    "payment.reminder.settings",
    "payment.reminder.settings.save",
    "payment.request.add",
    "payment.request.confirm",
    "payment.request.reject",
    "payment.service.add",
    "payment.service.confirm",
    "payment.service.reject",
    "service.add",
    "service.update",
    "service.delete",
}

def get_client(client_id: int, con: sqlite3.Connection | None = None) -> dict[str, Any]:
    client = one_row("SELECT * FROM clients WHERE id=?", (client_id,), con=con)
    if not client:
        raise ApiError(404, "Клиент не найден.")
    return client

def clients_payload(con: sqlite3.Connection | None = None) -> list[dict[str, Any]]:
    return all_rows(
        """
        SELECT c.id, c.name, c.created_at, c.is_archived, COALESCE(c.is_test,0) is_test,
               COALESCE(r.requests_count,0) requests_count,
               COALESCE(r.active_requests_count,0) active_requests_count,
               COALESCE(w.works_count,0) works_count,
               COALESCE(s.services_count,0) services_count,
               COALESCE(u.updates_count,0) updates_count,
               u.last_update_at,
               COALESCE(p.pending_total,0)+COALESCE(sp.pending_total,0) pending_total,
               COALESCE(p.paid_total,0)+COALESCE(sp.paid_total,0) paid_total
        FROM clients c
        LEFT JOIN (
            SELECT client_id,
                   COUNT(*) requests_count,
                   SUM(CASE WHEN COALESCE(status,'planned') IN ('planned','active','paused') THEN 1 ELSE 0 END) active_requests_count
            FROM requests GROUP BY client_id
        ) r ON r.client_id=c.id
        LEFT JOIN (
            SELECT r.client_id, COUNT(w.id) works_count
            FROM requests r LEFT JOIN works w ON w.request_id=r.id GROUP BY r.client_id
        ) w ON w.client_id=c.id
        LEFT JOIN (SELECT client_id, COUNT(*) services_count FROM client_services GROUP BY client_id) s ON s.client_id=c.id
        LEFT JOIN (SELECT client_id, COUNT(*) updates_count, MAX(created_at) last_update_at FROM updates GROUP BY client_id) u ON u.client_id=c.id
        LEFT JOIN (
            SELECT r.client_id,
                   SUM(CASE WHEN confirmed=0 THEN amount ELSE 0 END) pending_total,
                   SUM(CASE WHEN confirmed=1 THEN amount ELSE 0 END) paid_total
            FROM payments p JOIN requests r ON r.id=p.request_id GROUP BY r.client_id
        ) p ON p.client_id=c.id
        LEFT JOIN (
            SELECT s.client_id,
                   SUM(CASE WHEN confirmed=0 THEN amount ELSE 0 END) pending_total,
                   SUM(CASE WHEN confirmed=1 THEN amount ELSE 0 END) paid_total
            FROM service_payments sp JOIN client_services s ON s.id=sp.service_id GROUP BY s.client_id
        ) sp ON sp.client_id=c.id
        WHERE COALESCE(c.is_archived,0)=0
        ORDER BY LOWER(c.name), c.id
        """,
        con=con,
    )

def _placeholders(count: int) -> str:
    return ",".join("?" for _ in range(count))

def effective_work_cost(extra_cost: Any, cost_mode: Any, linked_paid: Any) -> float:
    raw_mode = str(cost_mode or "").strip()
    extra = float(extra_cost or 0)
    if raw_mode in {"included_in_request", "request_included"}:
        return 0.0
    if raw_mode in {"manual", "extra", "included"}:
        return extra
    if raw_mode == "auto_from_payments":
        return float(linked_paid or 0)
    return extra if extra > MONEY_EPSILON else float(linked_paid or 0)

def work_payment_totals_map(work_ids: list[int], con: sqlite3.Connection | None = None) -> dict[int, dict[str, Any]]:
    ids = [int(item) for item in work_ids if int(item)]
    if not ids:
        return {}
    rows = all_rows(
        f"""
        SELECT work_id,
               COALESCE(SUM(CASE WHEN confirmed=1 THEN amount ELSE 0 END),0) paid,
               COALESCE(SUM(CASE WHEN confirmed=0 THEN amount ELSE 0 END),0) pending,
               COALESCE(SUM(CASE WHEN confirmed=1 THEN 1 ELSE 0 END),0) paid_count,
               COALESCE(SUM(CASE WHEN confirmed=0 THEN 1 ELSE 0 END),0) pending_count
        FROM payments
        WHERE work_id IN ({_placeholders(len(ids))})
        GROUP BY work_id
        """,
        tuple(ids),
        con=con,
    )
    return {
        int(row["work_id"]): {
            "paid": money_safe(row.get("paid") or 0),
            "pending": money_safe(row.get("pending") or 0),
            "paid_count": int(row.get("paid_count") or 0),
            "pending_count": int(row.get("pending_count") or 0),
        }
        for row in rows
    }

def request_finance_map(request_ids: list[int], con: sqlite3.Connection | None = None) -> dict[int, dict[str, Any]]:
    ids = [int(item) for item in request_ids if int(item)]
    if not ids:
        return {}
    works = all_rows(
        f"""
        SELECT id, request_id, extra_cost, cost_mode
        FROM works
        WHERE request_id IN ({_placeholders(len(ids))})
        """,
        tuple(ids),
        con=con,
    )
    work_totals = work_payment_totals_map([int(row["id"]) for row in works], con=con)
    extra_by_request: dict[int, float] = {int(item): 0.0 for item in ids}
    for work in works:
        totals = work_totals.get(int(work["id"]), {})
        extra_by_request[int(work["request_id"])] = extra_by_request.get(int(work["request_id"]), 0.0) + effective_work_cost(
            work.get("extra_cost"),
            work.get("cost_mode"),
            totals.get("paid"),
        )
    rows = all_rows(
        f"""
        SELECT r.id request_id,
               COALESCE(r.base_cost,0) base_cost,
               COALESCE(d.diag_total,0) diag_total,
               COALESCE(p.paid,0) paid,
               COALESCE(p.pending,0) pending,
               COALESCE(p.count,0) payments_count
        FROM requests r
        LEFT JOIN (
            SELECT request_id, SUM(COALESCE(cost,0)) diag_total
            FROM diagnostics
            WHERE COALESCE(is_hidden,0)=0 AND COALESCE(type,'')='ordered'
            GROUP BY request_id
        ) d ON d.request_id=r.id
        LEFT JOIN (
            SELECT request_id,
                   SUM(CASE WHEN confirmed=1 THEN amount ELSE 0 END) paid,
                   SUM(CASE WHEN confirmed=0 THEN amount ELSE 0 END) pending,
                   COUNT(*) count
            FROM payments GROUP BY request_id
        ) p ON p.request_id=r.id
        WHERE r.id IN ({_placeholders(len(ids))})
        """,
        tuple(ids),
        con=con,
    )
    result: dict[int, dict[str, Any]] = {}
    for row in rows:
        extra_total = float(extra_by_request.get(int(row["request_id"]), 0.0) or 0)
        diag_total = float(row.get("diag_total") or 0)
        total = float(row.get("base_cost") or 0) + extra_total + diag_total
        paid = float(row.get("paid") or 0) + diag_total
        pending = float(row.get("pending") or 0)
        result[int(row["request_id"])] = {
            "base_cost": money_safe(row.get("base_cost") or 0),
            "extra_cost": money_safe(extra_total),
            "diag_total": money_safe(diag_total),
            "total": money_safe(total),
            "paid": money_safe(paid),
            "pending": money_safe(pending),
            "remainder": money_safe(max(total - paid, 0)),
            "money_debt_total": money_safe(max(total - paid, 0)),
            "money_pending_total": money_safe(pending),
            "payments_count": int(row.get("payments_count") or 0),
        }
    return result

def request_finance(request_id: int, con: sqlite3.Connection | None = None) -> dict[str, Any]:
    return request_finance_map([request_id], con=con).get(
        int(request_id),
        {"total": 0, "paid": 0, "pending": 0, "remainder": 0, "payments_count": 0},
    )

def service_finance_map(service_ids: list[int], con: sqlite3.Connection | None = None) -> dict[int, dict[str, Any]]:
    ids = [int(item) for item in service_ids if int(item)]
    if not ids:
        return {}
    rows = all_rows(
        f"""
        SELECT s.id service_id,
               COALESCE(s.price,0) price,
               s.service_kind,
               s.status,
               s.active_until,
               s.payment_postponed_until,
               COALESCE(s.accrued_debt_amount,0) debt,
               COALESCE(s.current_paid_amount,0) current_paid_amount,
               COALESCE(p.paid,0) paid,
               COALESCE(p.pending,0) pending,
               COALESCE(p.count,0) payments_count
        FROM client_services s
        LEFT JOIN (
            SELECT service_id,
                   SUM(CASE WHEN confirmed=1 THEN amount ELSE 0 END) paid,
                   SUM(CASE WHEN confirmed=0 THEN amount ELSE 0 END) pending,
                   COUNT(*) count
            FROM service_payments GROUP BY service_id
        ) p ON p.service_id=s.id
        WHERE s.id IN ({_placeholders(len(ids))})
        """,
        tuple(ids),
        con=con,
    )
    result: dict[int, dict[str, Any]] = {}
    today_text = datetime.now().date().isoformat()
    for row in rows:
        price = float(row.get("price") or 0)
        paid = float(row.get("paid") or row.get("current_paid_amount") or 0)
        pending = float(row.get("pending") or 0)
        stored_debt = float(row.get("debt") or 0)
        debt = stored_debt
        if str(row.get("service_kind") or "one_time") != "periodic":
            effective_price = price if price > MONEY_EPSILON else max(price, paid)
            debt = max(effective_price - paid, 0)
            price = effective_price
        state_label = "Закрыта" if row.get("status") == "closed" else "Активна"
        due_until = row.get("payment_postponed_until") or row.get("active_until")
        if pending > MONEY_EPSILON:
            state_label = "Платёж на проверке"
        elif debt > MONEY_EPSILON:
            state_label = "Долг просрочен" if due_until and str(due_until) < today_text else "Ждёт оплату"
        result[int(row["service_id"])] = {
            "total": money_safe(max(price, paid + debt)),
            "price": money_safe(price),
            "paid": money_safe(paid),
            "pending": money_safe(pending),
            "debt": money_safe(debt),
            "money_debt_total": money_safe(debt),
            "money_pending_total": money_safe(pending),
            "state_label": state_label,
            "payment_due_until": due_until,
            "payments_count": int(row.get("payments_count") or 0),
        }
    return result

def service_finance(service_id: int, con: sqlite3.Connection | None = None) -> dict[str, Any]:
    return service_finance_map([service_id], con=con).get(
        int(service_id),
        {"price": 0, "paid": 0, "pending": 0, "debt": 0, "payments_count": 0},
    )

def client_requests(client_id: int, con: sqlite3.Connection | None = None) -> list[dict[str, Any]]:
    rows = all_rows(
        """
        SELECT r.*, COALESCE(w.works_count,0) works_count,
               COALESCE(d.diagnostics_count,0) diagnostics_count,
               COALESCE(rec.recommendations_count,0) recommendations_count,
               COALESCE(u.updates_count,0) updates_count,
               u.last_update_at
        FROM requests r
        LEFT JOIN (SELECT request_id, COUNT(*) works_count FROM works GROUP BY request_id) w ON w.request_id=r.id
        LEFT JOIN (SELECT request_id, COUNT(*) diagnostics_count FROM diagnostics WHERE COALESCE(is_hidden,0)=0 GROUP BY request_id) d ON d.request_id=r.id
        LEFT JOIN (SELECT request_id, COUNT(*) recommendations_count FROM recommendations GROUP BY request_id) rec ON rec.request_id=r.id
        LEFT JOIN (SELECT request_id, COUNT(*) updates_count, MAX(created_at) last_update_at FROM updates GROUP BY request_id) u ON u.request_id=r.id
        WHERE r.client_id=?
        ORDER BY CASE WHEN r.status='active' THEN 0 ELSE 1 END, r.created_at DESC, r.id DESC
        """,
        (client_id,),
        con=con,
    )
    finance_map = request_finance_map([int(row["id"]) for row in rows], con=con)
    for row in rows:
        row["financials"] = finance_map.get(int(row["id"]), {"total": 0, "paid": 0, "pending": 0, "remainder": 0, "payments_count": 0})
    return rows

def client_services(client_id: int, con: sqlite3.Connection | None = None) -> list[dict[str, Any]]:
    rows = all_rows(
        """
        SELECT s.*, COALESCE(u.updates_count,0) updates_count, u.last_update_at
        FROM client_services s
        LEFT JOIN (SELECT service_id, COUNT(*) updates_count, MAX(created_at) last_update_at FROM updates GROUP BY service_id) u ON u.service_id=s.id
        WHERE s.client_id=?
        ORDER BY CASE WHEN s.status='active' THEN 0 ELSE 1 END, s.active_until ASC, s.id DESC
        """,
        (client_id,),
        con=con,
    )
    finance_map = service_finance_map([int(row["id"]) for row in rows], con=con)
    today = datetime.now().date()
    for row in rows:
        row["financials"] = finance_map.get(int(row["id"]), {"price": 0, "paid": 0, "pending": 0, "debt": 0, "payments_count": 0})
        row["state_label"] = row["financials"].get("state_label") or row.get("status")
        row["can_mark_payment"] = float(row["financials"].get("debt") or 0) > MONEY_EPSILON and float(row["financials"].get("pending") or 0) <= MONEY_EPSILON
        row["can_request_more_time"] = row["can_mark_payment"] and bool(row.get("active_until"))
        row["can_postpone_payment"] = row["can_request_more_time"] and not row.get("payment_postponed_until")
        row["can_stop_after_current"] = str(row.get("service_kind") or "") == "periodic" and not bool(row.get("stop_after_current"))
        row["can_resume"] = str(row.get("service_kind") or "") == "periodic" and bool(row.get("stop_after_current"))
        dt = parse_date(row.get("active_until"))
        row["days_left"] = (dt.date() - today).days if dt else None
    return rows

def client_diagnostics(client_id: int, include_hidden: bool = False, con: sqlite3.Connection | None = None) -> list[dict[str, Any]]:
    hidden_filter = "" if include_hidden else "AND COALESCE(d.is_hidden,0)=0"
    return all_rows(
        f"""
        SELECT d.*, r.title request_title, w.title work_title
        FROM diagnostics d
        LEFT JOIN requests r ON r.id=d.request_id
        LEFT JOIN works w ON w.id=d.work_id
        WHERE d.client_id=? {hidden_filter}
        ORDER BY d.created_at DESC, d.id DESC
        """,
        (client_id,),
        con=con,
    )

def client_updates(client_id: int, limit: int = 100, con: sqlite3.Connection | None = None) -> list[dict[str, Any]]:
    rows = all_rows(
        """
        SELECT u.*, r.title request_title, s.title service_title
        FROM updates u
        LEFT JOIN requests r ON r.id=u.request_id
        LEFT JOIN client_services s ON s.id=u.service_id
        WHERE u.client_id=?
        AND COALESCE(u.text,'') NOT LIKE 'Комментарий к платежу:%'
        ORDER BY u.created_at DESC, u.id DESC LIMIT ?
        """,
        (client_id, limit),
        con=con,
    )
    _attach_local_update_attachments(rows, con=con)
    return rows


def _local_update_attachments_map(update_ids: list[int], con: sqlite3.Connection | None = None) -> dict[int, list[dict[str, Any]]]:
    clean_ids = [int(update_id) for update_id in update_ids if int(update_id or 0)]
    if not clean_ids:
        return {}
    placeholders = ",".join("?" for _ in clean_ids)
    try:
        rows = all_rows(
            f"""
            SELECT id, update_id, kind, telegram_file_id, telegram_file_unique_id, sort_order, created_at
            FROM update_attachments
            WHERE update_id IN ({placeholders})
            ORDER BY update_id ASC, sort_order ASC, id ASC
            """,
            tuple(clean_ids),
            con=con,
        )
    except sqlite3.OperationalError:
        return {}
    mapping: dict[int, list[dict[str, Any]]] = {}
    for row in rows:
        mapping.setdefault(int(row.get("update_id") or 0), []).append(row)
    return mapping


def _attach_local_update_attachments(rows: list[dict[str, Any]], con: sqlite3.Connection | None = None) -> list[dict[str, Any]]:
    mapping = _local_update_attachments_map([int(row.get("id") or 0) for row in rows], con=con)
    for row in rows:
        update_id = int(row.get("id") or 0)
        attachments = mapping.get(update_id) or []
        if not attachments and row.get("photo_file_id"):
            attachments = [{"kind": "photo"}]
        row["attachments"] = attachments
        row["attachments_count"] = len(attachments)
        row["has_attachments"] = bool(attachments)
    return rows

def normalize_client_update_row(row: dict[str, Any]) -> dict[str, Any]:
    attachments = row.get("attachments") if isinstance(row.get("attachments"), list) else []
    update_id = int(row.get("id") or 0)
    public_attachments = [
        {
            "kind": str(item.get("kind") or "photo") or "photo",
            "index": index,
            "url": f"/api/update/{update_id}/attachment/{index}" if update_id else "",
        }
        for index, item in enumerate(attachments)
        if isinstance(item, dict)
    ]
    kind = str(row.get("kind") or "update")
    row["kind"] = "client_question" if kind in {"question", "client_question"} else "update"
    row["text"] = str(row.get("text") or "")
    row["target_type"] = "request" if row.get("request_id") else ("service" if row.get("service_id") else "")
    row["target_id"] = row.get("request_id") or row.get("service_id") or ""
    row["target_title"] = row.get("request_title") or row.get("service_title") or ""
    row["status"] = "processing" if row.get("read_at") else "new"
    row["attachments"] = public_attachments
    row["attachments_count"] = len(public_attachments)
    row["has_attachments"] = bool(public_attachments)
    row["photo_file_id"] = None
    return row

def client_message_rows(client_id: int | None = None, limit: int = 80, con: sqlite3.Connection | None = None, days: int | None = None) -> list[dict[str, Any]]:
    where = ["u.author = 'client'", "COALESCE(u.text,'') NOT LIKE 'Комментарий к платежу:%'"]
    params: list[Any] = []
    if client_id is not None:
        where.append("u.client_id = ?")
        params.append(int(client_id))
    else:
        where.append("COALESCE(c.is_test,0)=0")
    if days is not None:
        where.append("u.created_at >= datetime('now', ?)")
        params.append(f"-{max(int(days), 1)} days")
    params.append(int(limit))
    rows = all_rows(
        f"""
        SELECT u.*, c.name client_name, r.title request_title, s.title service_title
        FROM updates u
        JOIN clients c ON c.id=u.client_id
        LEFT JOIN requests r ON r.id=u.request_id
        LEFT JOIN client_services s ON s.id=u.service_id
        WHERE {" AND ".join(where)}
        ORDER BY u.created_at DESC, u.id DESC
        LIMIT ?
        """,
        tuple(params),
        con=con,
    )
    _attach_local_update_attachments(rows, con=con)
    return [normalize_client_update_row(row) for row in rows]

def payment_receipt_rows(client_id: int | None = None, limit: int = 80, con: sqlite3.Connection | None = None) -> list[dict[str, Any]]:
    request_where = ["COALESCE(p.marked_by,'') = 'client'"]
    service_where = ["COALESCE(sp.marked_by,'') = 'client'"]
    request_params: list[Any] = []
    service_params: list[Any] = []
    if client_id is not None:
        request_where.append("c.id = ?")
        service_where.append("c.id = ?")
        request_params.append(int(client_id))
        service_params.append(int(client_id))
    else:
        request_where.append("COALESCE(c.is_test,0)=0")
        service_where.append("COALESCE(c.is_test,0)=0")
    rows = all_rows(
        f"""
        SELECT * FROM (
          SELECT
            'request' target_type,
            p.id payment_id,
            'request-' || p.id id,
            p.request_id target_id,
            p.work_id work_id,
            w.title work_title,
            r.title request_title,
            COALESCE(NULLIF(w.title,''), r.title) target_title,
            c.id client_id,
            c.name client_name,
            p.amount amount,
            COALESCE(p.note,'') text,
            p.created_at created_at,
            CASE WHEN COALESCE(p.confirmed,0)=1 THEN 'confirmed' ELSE 'new' END status
          FROM payments p
          JOIN requests r ON r.id=p.request_id
          JOIN clients c ON c.id=r.client_id
          LEFT JOIN works w ON w.id=p.work_id
          WHERE {" AND ".join(request_where)}
          UNION ALL
          SELECT
            'service' target_type,
            sp.id payment_id,
            'service-' || sp.id id,
            sp.service_id target_id,
            NULL work_id,
            NULL work_title,
            NULL request_title,
            s.title target_title,
            c.id client_id,
            c.name client_name,
            sp.amount amount,
            COALESCE(sp.note,'') text,
            sp.created_at created_at,
            CASE WHEN COALESCE(sp.confirmed,0)=1 THEN 'confirmed' ELSE 'new' END status
          FROM service_payments sp
          JOIN client_services s ON s.id=sp.service_id
          JOIN clients c ON c.id=s.client_id
          WHERE {" AND ".join(service_where)}
        )
        ORDER BY created_at DESC
        LIMIT ?
        """,
        tuple(request_params + service_params + [int(limit)]),
        con=con,
    )
    for row in rows:
        row["amount"] = money_safe(row.get("amount"))
    return rows

def service_extend_request_rows(client_id: int | None = None, limit: int = 80, con: sqlite3.Connection | None = None) -> list[dict[str, Any]]:
    where: list[str] = []
    params: list[Any] = []
    if client_id is not None:
        where.append("smr.client_id = ?")
        params.append(int(client_id))
    else:
        where.append("COALESCE(c.is_test,0)=0")
    params.append(int(limit))
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    return all_rows(
        f"""
        SELECT smr.*, c.name client_name, s.title service_title
        FROM service_more_time_requests smr
        JOIN clients c ON c.id=smr.client_id
        JOIN client_services s ON s.id=smr.service_id
        {where_sql}
        ORDER BY smr.created_at DESC, smr.id DESC
        LIMIT ?
        """,
        tuple(params),
        con=con,
    )

def service_action_logs(service_id: int, con: sqlite3.Connection | None = None, limit: int = 40) -> list[dict[str, Any]]:
    try:
        rows = all_rows(
            """
            SELECT *
            FROM action_log
            WHERE service_id=?
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (int(service_id), max(1, min(int(limit or 40), 120))),
            con=con,
        )
    except sqlite3.DatabaseError:
        return []
    for row in rows:
        try:
            row["details"] = json.loads(row.get("details_json") or "{}")
        except (TypeError, json.JSONDecodeError):
            row["details"] = {}
    return rows

def client_finance(requests: list[dict[str, Any]], services: list[dict[str, Any]]) -> dict[str, Any]:
    req_total = sum(float(row["financials"].get("total") or 0) for row in requests)
    req_paid = sum(float(row["financials"].get("paid") or 0) for row in requests)
    req_pending = sum(float(row["financials"].get("pending") or 0) for row in requests)
    svc_total = sum(float(row["financials"].get("total") or row["financials"].get("price") or row["financials"].get("debt") or 0) for row in services)
    svc_debt = sum(float(row["financials"].get("debt") or 0) for row in services)
    svc_paid = sum(float(row["financials"].get("paid") or 0) for row in services)
    svc_pending = sum(float(row["financials"].get("pending") or 0) for row in services)
    return {"requests": requests, "services": services, "summary": {"total": money_safe(max(req_total + svc_total, req_paid + svc_paid + svc_debt)), "paid": money_safe(req_paid + svc_paid), "pending": money_safe(req_pending + svc_pending), "debt": money_safe(max(req_total - req_paid, 0) + svc_debt)}}

def attach_work_logs_to_rows(rows: list[dict[str, Any]], con: sqlite3.Connection | None = None, headers: Any | None = None) -> list[dict[str, Any]]:
    works = [dict(row) for row in (rows or [])]
    ids = [int(row.get("id") or 0) for row in works if int(row.get("id") or 0)]
    if not ids:
        return works
    logs_by_id: dict[int, list[dict[str, Any]]] = {}
    if headers is not None:
        live = trebnik_bridge_query_required("work.logs", {"work_ids": ids}, headers)
        raw = live.get("logs_by_work_id") if isinstance(live, dict) else None
        if isinstance(raw, dict):
            for key, value in raw.items():
                try:
                    work_id = int(key)
                except (TypeError, ValueError):
                    continue
                logs_by_id[work_id] = [dict(item) for item in value] if isinstance(value, list) else []
        for row in works:
            row["logs"] = logs_by_id.get(int(row.get("id") or 0), [])
        return works
    if not logs_by_id:
        placeholders = ",".join("?" for _ in ids)
        for row in all_rows(f"SELECT * FROM work_logs WHERE work_id IN ({placeholders}) ORDER BY log_date DESC, id DESC", ids, con=con):
            logs_by_id.setdefault(int(row.get("work_id") or 0), []).append(row)
    for row in works:
        row["logs"] = logs_by_id.get(int(row.get("id") or 0), [])
    return works

def client_overview(client_id: int, include_admin_notes: bool = False, con: sqlite3.Connection | None = None, headers: Any | None = None) -> dict[str, Any]:
    if headers is not None:
        command = "admin.client_overview" if include_admin_notes else "client.overview"
        payload = trebnik_bridge_query_required(command, {"client_id": int(client_id)}, headers)
        if include_admin_notes:
            state = load_state()
            payload["admin_notes"] = [note for note in state.get("notes", []) if int(note.get("client_id") or 0) == int(client_id)][-8:]
        if include_admin_notes and isinstance(payload.get("works"), list):
            payload["works"] = attach_work_logs_to_rows(payload["works"], headers=headers)
        if include_admin_notes:
            payload["linked_user"] = public_user_by_trebnik_client_id(client_id)
        payload["source"] = "bot"
        return payload
    requests = client_requests(client_id, con=con)
    services = client_services(client_id, con=con)
    diagnostics = client_diagnostics(client_id, include_hidden=include_admin_notes, con=con)
    updates = [normalize_client_update_row(row) for row in client_updates(client_id, 80 if include_admin_notes else 15, con=con)]
    finance = client_finance(requests, services)
    next_work = one_row(
        """
        SELECT w.*, r.title request_title
        FROM works w JOIN requests r ON r.id=w.request_id
        WHERE r.client_id=?
          AND COALESCE(w.status,'planned') IN ('planned','active')
          AND COALESCE(w.next_due, w.expected_first_result) IS NOT NULL
          AND date(COALESCE(w.next_due, w.expected_first_result)) >= date(?)
        ORDER BY date(COALESCE(w.next_due, w.expected_first_result)) ASC LIMIT 1
        """,
        (client_id, datetime.now().date().isoformat()),
        con=con,
    )
    state = load_state()
    client_messages = client_message_rows(client_id, 20, con=con)
    payment_receipts = payment_receipt_rows(client_id, 20, con=con)
    payload = {
        "ok": True,
        "client": public_client(get_client(client_id, con=con)),
        "counts": {
            "requests": len(requests),
            "active_requests": sum(1 for row in requests if str(row.get("status") or "planned") in {"planned", "active", "paused"}),
            "services": len(services),
            "active_services": sum(1 for row in services if row.get("status") == "active"),
            "diagnostics": len(diagnostics),
            "updates": len(updates),
            "client_messages": len(client_messages),
            "payment_receipts": len(payment_receipts),
        },
        "next_work": next_work,
        "requests": requests,
        "diagnostics": diagnostics,
        "services": services,
        "recent_updates": updates,
        "finance": finance,
        "client_messages": client_messages,
        "payment_receipts": payment_receipts,
    }
    if include_admin_notes:
        notes = [note for note in state.get("notes", []) if int(note.get("client_id") or 0) == int(client_id)]
        payload["admin_notes"] = notes[-8:]
        payload["linked_user"] = public_user_by_trebnik_client_id(client_id)
        payload["works"] = all_rows(
            """
            SELECT w.*, r.title request_title, r.client_id, c.name client_name
            FROM works w
            JOIN requests r ON r.id=w.request_id
            JOIN clients c ON c.id=r.client_id
            WHERE r.client_id=?
            ORDER BY
              CASE WHEN COALESCE(w.status,'') IN ('active','planned') THEN 0 ELSE 1 END,
              COALESCE(w.next_due, w.expected_first_result, w.expected_final_result, w.created_at) ASC,
              w.id DESC
            """,
            (client_id,),
            con=con,
        )
        payload["recommendations"] = all_rows(
            """
            SELECT rec.*, r.title request_title
            FROM recommendations rec
            LEFT JOIN requests r ON r.id=rec.request_id
            WHERE rec.client_id=?
            ORDER BY rec.created_at DESC, rec.id DESC
            """,
            (client_id,),
            con=con,
        )
        payload["request_payments"] = all_rows(
            """
            SELECT p.*, COALESCE(NULLIF(w.title,''), r.title) target_title, r.title request_title,
                   w.title work_title, r.client_id, c.name client_name
            FROM payments p
            JOIN requests r ON r.id=p.request_id
            JOIN clients c ON c.id=r.client_id
            LEFT JOIN works w ON w.id=p.work_id
            WHERE r.client_id=?
            ORDER BY p.created_at DESC, p.id DESC
            """,
            (client_id,),
            con=con,
        )
        payload["service_payments"] = all_rows(
            """
            SELECT sp.*, s.title target_title, s.client_id, c.name client_name
            FROM service_payments sp
            JOIN client_services s ON s.id=sp.service_id
            JOIN clients c ON c.id=s.client_id
            WHERE s.client_id=?
            ORDER BY sp.created_at DESC, sp.id DESC
            """,
            (client_id,),
            con=con,
        )
    payload.setdefault("source", "copy")
    if include_admin_notes and isinstance(payload.get("works"), list):
        payload["works"] = attach_work_logs_to_rows(payload["works"], con=con, headers=headers)
    return payload

def request_detail(request_id: int, con: sqlite3.Connection | None = None, headers: Any | None = None) -> dict[str, Any]:
    if headers is not None:
        return trebnik_bridge_query_required("request.detail", {"request_id": int(request_id)}, headers)
    request = one_row("SELECT r.*, c.name client_name FROM requests r JOIN clients c ON c.id=r.client_id WHERE r.id=?", (request_id,), con=con)
    if not request:
        raise ApiError(404, "Запрос не найден.")
    updates = all_rows("SELECT * FROM updates WHERE request_id=? ORDER BY created_at DESC, id DESC", (request_id,), con=con)
    _attach_local_update_attachments(updates, con=con)
    payload = {"ok": True, "request": request, "financials": request_finance(request_id, con=con), "works": all_rows("SELECT * FROM works WHERE request_id=? ORDER BY created_at DESC, id DESC", (request_id,), con=con), "diagnostics": all_rows("SELECT * FROM diagnostics WHERE request_id=? AND COALESCE(is_hidden,0)=0 ORDER BY created_at DESC, id DESC", (request_id,), con=con), "recommendations": all_rows("SELECT * FROM recommendations WHERE request_id=? ORDER BY created_at DESC, id DESC", (request_id,), con=con), "updates": [normalize_client_update_row(row) for row in updates], "payments": all_rows("SELECT p.*, w.title work_title FROM payments p LEFT JOIN works w ON w.id=p.work_id WHERE p.request_id=? ORDER BY p.created_at DESC, p.id DESC", (request_id,), con=con)}
    payload.setdefault("source", "copy")
    return payload

def request_history(request_id: int, headers: Any) -> dict[str, Any]:
    live = trebnik_bridge_query_required("request.history", {"request_id": int(request_id)}, headers)
    return {"ok": True, "items": live.get("items") if isinstance(live.get("items"), list) else [], "source": "bot", **trebnik_live_meta(live)}

def request_work_logs(request_id: int, headers: Any) -> dict[str, Any]:
    detail = trebnik_bridge_query_required("request.detail", {"request_id": int(request_id)}, headers)
    work_ids = [
        int(row.get("id") or 0)
        for row in detail.get("works", [])
        if isinstance(row, dict) and int(row.get("id") or 0)
    ]
    live = trebnik_bridge_query_required("work.logs", {"work_ids": work_ids}, headers)
    return {
        "ok": True,
        "logs_by_work_id": live.get("logs_by_work_id") if isinstance(live.get("logs_by_work_id"), dict) else {},
        "source": "bot",
        **trebnik_live_meta(live),
    }

def service_detail(service_id: int, con: sqlite3.Connection | None = None, headers: Any | None = None) -> dict[str, Any]:
    if headers is not None:
        return trebnik_bridge_query_required("service.detail", {"service_id": int(service_id)}, headers)
    service = one_row("SELECT s.*, c.name client_name FROM client_services s JOIN clients c ON c.id=s.client_id WHERE s.id=?", (service_id,), con=con)
    if not service:
        raise ApiError(404, "Услуга не найдена.")
    financials = service_finance(service_id, con=con)
    service["state_label"] = financials.get("state_label") or service.get("status")
    service["can_mark_payment"] = float(financials.get("debt") or 0) > MONEY_EPSILON and float(financials.get("pending") or 0) <= MONEY_EPSILON
    service["can_request_more_time"] = service["can_mark_payment"] and bool(service.get("active_until"))
    service["can_postpone_payment"] = service["can_request_more_time"] and not service.get("payment_postponed_until")
    service["can_stop_after_current"] = str(service.get("service_kind") or "") == "periodic" and not bool(service.get("stop_after_current"))
    service["can_resume"] = str(service.get("service_kind") or "") == "periodic" and bool(service.get("stop_after_current"))
    updates = all_rows("SELECT * FROM updates WHERE service_id=? ORDER BY created_at DESC, id DESC", (service_id,), con=con)
    _attach_local_update_attachments(updates, con=con)
    payload = {"ok": True, "service": service, "financials": financials, "updates": [normalize_client_update_row(row) for row in updates], "payments": all_rows("SELECT * FROM service_payments WHERE service_id=? ORDER BY created_at DESC, id DESC", (service_id,), con=con), "more_time_requests": all_rows("SELECT * FROM service_more_time_requests WHERE service_id=? ORDER BY created_at DESC, id DESC", (service_id,), con=con), "action_logs": service_action_logs(service_id, con=con)}
    payload.setdefault("source", "copy")
    return payload

def update_detail(update_id: int, con: sqlite3.Connection | None = None, headers: Any | None = None) -> dict[str, Any]:
    if headers is not None:
        return trebnik_bridge_query_required("update.detail", {"update_id": int(update_id)}, headers)
    row = one_row(
        """
        SELECT u.*, c.name client_name, c.telegram_id, r.title request_title, s.title service_title
        FROM updates u
        JOIN clients c ON c.id=u.client_id
        LEFT JOIN requests r ON r.id=u.request_id
        LEFT JOIN client_services s ON s.id=u.service_id
        WHERE u.id=?
        """,
        (update_id,),
        con=con,
    )
    if not row:
        raise ApiError(404, "Апдейт не найден.")
    _attach_local_update_attachments([row], con=con)
    return {"ok": True, "update": normalize_client_update_row(row)}

def update_attachment_stream(handler: Any, update_id: int, attachment_index: int, headers: Any) -> None:
    detail = update_detail(update_id, headers=headers)
    update_row = detail.get("update") if isinstance(detail.get("update"), dict) else {}
    attachments = update_row.get("attachments") if isinstance(update_row.get("attachments"), list) else []
    if attachment_index < 0 or attachment_index >= len(attachments):
        raise ApiError(404, "Вложение апдейта не найдено.")
    body, content_type = trebnik_bridge_binary_required(f"/update-attachment/{int(update_id)}/{int(attachment_index)}")
    handler.text(200, body, content_type or "application/octet-stream", cache_control="no-store")

def work_detail(work_id: int, con: sqlite3.Connection | None = None, headers: Any | None = None) -> dict[str, Any]:
    if headers is not None:
        return trebnik_bridge_query_required("work.detail", {"work_id": int(work_id)}, headers)
    work = one_row(
        """
        SELECT w.*, r.title request_title, r.client_id, c.name client_name
        FROM works w
        JOIN requests r ON r.id=w.request_id
        JOIN clients c ON c.id=r.client_id
        WHERE w.id=?
        """,
        (work_id,),
        con=con,
    )
    if not work:
        raise ApiError(404, "Работа не найдена.")
    logs = all_rows("SELECT * FROM work_logs WHERE work_id=? ORDER BY log_date DESC, id DESC", (work_id,), con=con)
    payload = {"ok": True, "work": work, "logs": logs}
    payload.setdefault("source", "copy")
    return payload

def admin_finance_summary_from_copy(con: sqlite3.Connection | None = None) -> dict[str, Any]:
    request_ids = [
        int(row["id"])
        for row in all_rows(
            "SELECT r.id FROM requests r JOIN clients c ON c.id=r.client_id WHERE COALESCE(c.is_archived,0)=0 AND COALESCE(c.is_test,0)=0",
            con=con,
        )
    ]
    service_ids = [
        int(row["id"])
        for row in all_rows(
            "SELECT s.id FROM client_services s JOIN clients c ON c.id=s.client_id WHERE COALESCE(c.is_archived,0)=0 AND COALESCE(c.is_test,0)=0",
            con=con,
        )
    ]
    request_finances = request_finance_map(request_ids, con=con).values()
    service_finances = service_finance_map(service_ids, con=con).values()
    req_total = sum(float(item.get("total") or 0) for item in request_finances)
    req_paid = sum(float(item.get("paid") or 0) for item in request_finances)
    req_pending = sum(float(item.get("pending") or 0) for item in request_finances)
    req_debt = sum(float(item.get("remainder") or 0) for item in request_finances)
    svc_total = sum(float(item.get("total") or item.get("price") or item.get("debt") or 0) for item in service_finances)
    svc_debt = sum(float(item.get("debt") or 0) for item in service_finances)
    svc_paid = sum(float(item.get("paid") or 0) for item in service_finances)
    svc_pending = sum(float(item.get("pending") or 0) for item in service_finances)
    debt = req_debt + svc_debt
    return {
        "summary": {
            "total": money_safe(max(req_total + svc_total, req_paid + svc_paid + debt)),
            "paid": money_safe(req_paid + svc_paid),
            "pending": money_safe(req_pending + svc_pending),
            "debt": money_safe(debt),
        }
    }

def admin_finance_summary(
    con: sqlite3.Connection | None = None,
    headers: Any | None = None,
) -> dict[str, Any]:
    fallback = admin_finance_summary_from_copy(con=con)
    if headers is None or not TREBNIK_BRIDGE_TOKEN:
        return fallback
    try:
        result = trebnik_bridge_query("admin.debt_report", {}, headers) or {}
    except Exception:
        return fallback
    if not result:
        return fallback
    summary = dict(fallback.get("summary") or {})
    if "total_debt" in result:
        summary["debt"] = money_safe(result.get("total_debt") or 0)
    if "total_pending" in result:
        summary["pending"] = money_safe(result.get("total_pending") or 0)
    return {"summary": summary, "source": "bot"}

def admin_summary(
    con: sqlite3.Connection | None = None,
    finance: dict[str, Any] | None = None,
) -> dict[str, Any]:
    overview = one_row(
        """
        SELECT
          (SELECT COUNT(*) FROM clients WHERE COALESCE(is_archived,0)=0 AND COALESCE(is_test,0)=0) clients_count,
          (SELECT COUNT(*) FROM requests r JOIN clients c ON c.id=r.client_id WHERE r.status='active' AND COALESCE(c.is_archived,0)=0 AND COALESCE(c.is_test,0)=0) active_requests_count,
          (SELECT COUNT(*) FROM works w JOIN requests r ON r.id=w.request_id JOIN clients c ON c.id=r.client_id WHERE COALESCE(w.status,'planned') IN ('planned','active') AND COALESCE(c.is_archived,0)=0 AND COALESCE(c.is_test,0)=0) active_works_count,
          (SELECT COUNT(*) FROM client_services s JOIN clients c ON c.id=s.client_id WHERE COALESCE(s.status,'')='active' AND COALESCE(c.is_archived,0)=0 AND COALESCE(c.is_test,0)=0) active_services_count,
          (SELECT COUNT(*) FROM payments p JOIN requests r ON r.id=p.request_id JOIN clients c ON c.id=r.client_id WHERE COALESCE(p.confirmed,0)=0 AND COALESCE(c.is_archived,0)=0 AND COALESCE(c.is_test,0)=0) pending_request_payments,
          (SELECT COUNT(*) FROM service_payments sp JOIN client_services s ON s.id=sp.service_id JOIN clients c ON c.id=s.client_id WHERE COALESCE(sp.confirmed,0)=0 AND COALESCE(c.is_archived,0)=0 AND COALESCE(c.is_test,0)=0) pending_service_payments
        """,
        con=con,
    ) or {}
    state = load_state()
    return {
        "ok": True,
        "overview": overview,
        "finance": finance or admin_finance_summary(con=con),
        "clients": clients_payload(con=con),
        "notes": state.get("notes", [])[-50:],
        "last_sync": getattr(site_settings, "last_sync_info", None),
    }

def normalize_live_agenda_item(item: dict[str, Any]) -> dict[str, Any]:
    row = dict(item)
    row.setdefault("agenda_date", row.get("next_due") or row.get("expected_first_result") or row.get("due_until"))
    row.setdefault("log_default_date", row.get("agenda_date"))
    if "work_type" in row and "type" not in row:
        row["type"] = row.get("work_type")
    return row

def admin_workbench(con: sqlite3.Connection | None = None, headers: Any | None = None) -> dict[str, Any]:
    pending_requests = all_rows(
        """
        SELECT p.*, r.title request_title, w.title work_title, c.name client_name, c.id client_id
        FROM payments p JOIN requests r ON r.id=p.request_id JOIN clients c ON c.id=r.client_id
        LEFT JOIN works w ON w.id=p.work_id
        WHERE COALESCE(p.confirmed,0)=0 AND COALESCE(c.is_test,0)=0 ORDER BY p.created_at DESC LIMIT 50
        """,
        con=con,
    )
    pending_services = all_rows(
        """
        SELECT sp.*, s.title service_title, c.name client_name, c.id client_id
        FROM service_payments sp JOIN client_services s ON s.id=sp.service_id JOIN clients c ON c.id=s.client_id
        WHERE COALESCE(sp.confirmed,0)=0 AND COALESCE(c.is_test,0)=0 ORDER BY sp.created_at DESC LIMIT 50
        """,
        con=con,
    )
    updates = all_rows(
        """
        SELECT u.*, c.name client_name, r.title request_title, s.title service_title
        FROM updates u JOIN clients c ON c.id=u.client_id
        LEFT JOIN requests r ON r.id=u.request_id
        LEFT JOIN client_services s ON s.id=u.service_id
        WHERE COALESCE(u.text,'') NOT LIKE 'Комментарий к платежу:%'
          AND COALESCE(c.is_test,0)=0
        ORDER BY u.created_at DESC, u.id DESC LIMIT 30
        """,
        con=con,
    )
    today = datetime.now().date()
    today_text = today.isoformat()
    work_horizon = (today + timedelta(days=3)).isoformat()
    soon = today + timedelta(days=10)
    expiring = []
    for service in all_rows("""SELECT s.*, c.name client_name FROM client_services s JOIN clients c ON c.id=s.client_id WHERE s.active_until IS NOT NULL AND date(s.active_until) >= date(?) AND COALESCE(s.status,'')='active' AND COALESCE(c.is_test,0)=0 ORDER BY s.active_until ASC LIMIT 50""", (today_text,), con=con):
        dt = parse_date(service.get("active_until"))
        if dt and dt.date() <= soon:
            service["days_left"] = (dt.date() - today).days
            expiring.append(service)
    services = all_rows(
        """
        SELECT s.*, c.name client_name, c.id client_id
        FROM client_services s JOIN clients c ON c.id=s.client_id
        WHERE COALESCE(s.status,'') NOT IN ('archived','cancelled','closed')
          AND COALESCE(c.is_test,0)=0
        ORDER BY
          CASE WHEN COALESCE(s.status,'')='active' THEN 0 ELSE 1 END,
          CASE WHEN s.active_until IS NULL THEN 1 ELSE 0 END,
          s.active_until ASC,
          s.id DESC
        LIMIT 80
        """,
        con=con,
    )
    for service in services:
        service["financials"] = service_finance(int(service.get("id") or 0), con=con)
    def mark_agenda_work(
        work: dict[str, Any],
        *,
        kind: str,
        date_key: str,
        log_default: str | None = None,
        note: str = "",
    ) -> dict[str, Any]:
        raw_date = work.get(date_key)
        dt = parse_date(raw_date)
        agenda_date = dt.date().isoformat() if dt else str(raw_date or "")
        work["agenda_kind"] = kind
        work["agenda_date"] = agenda_date
        work["log_default_date"] = log_default or agenda_date
        work["days_late"] = max((today - dt.date()).days, 0) if dt else 0
        if note:
            work["note"] = note
        return work

    def iso_date_range(start: datetime, end: datetime):
        current = start.date()
        last = end.date()
        while current <= last:
            yield current.isoformat()
            current = current + timedelta(days=1)

    def pending_multi_agenda_item(work: dict[str, Any], logged_dates: set[str]) -> dict[str, Any] | None:
        start = parse_date(work.get("expected_first_result"))
        end = parse_date(work.get("expected_final_result"))
        if not end and start:
            try:
                total_days = int(work.get("total_days") or 0)
            except (TypeError, ValueError):
                total_days = 0
            end = start + timedelta(days=max(total_days, 1) - 1)
        horizon = parse_date(work_horizon)
        if not start or not end or not horizon:
            return None
        if end < start:
            end = start
        if end.date() < today or start.date() > horizon.date():
            return None
        for agenda_date in iso_date_range(start, min(end, horizon)):
            if agenda_date in logged_dates:
                continue
            item = dict(work)
            item["agenda_kind"] = "work_attention" if agenda_date <= today_text else "work_upcoming"
            item["agenda_date"] = agenda_date
            item["log_default_date"] = agenda_date
            item["days_late"] = max((today - parse_date(agenda_date).date()).days, 0)
            item["note"] = "Нет отметки за дату" if agenda_date <= today_text else "Скоро проведение"
            return item
        return None

    periodic_today = all_rows(
        """
        SELECT w.*, r.title request_title, c.name client_name, c.id client_id
        FROM works w JOIN requests r ON r.id=w.request_id JOIN clients c ON c.id=r.client_id
        WHERE COALESCE(w.type,'')='periodic'
          AND w.next_due IS NOT NULL
          AND date(w.next_due) <= date(?)
          AND COALESCE(w.status,'planned') IN ('planned','active')
          AND COALESCE(c.is_test,0)=0
        ORDER BY w.next_due ASC LIMIT 50
        """,
        (today_text,),
        con=con,
    )
    attention_today = all_rows(
        """
        SELECT w.*, r.title request_title, c.name client_name, c.id client_id
        FROM works w JOIN requests r ON r.id=w.request_id JOIN clients c ON c.id=r.client_id
        WHERE COALESCE(w.type,'')='once'
          AND COALESCE(w.status,'planned') IN ('planned','active')
          AND w.expected_first_result IS NOT NULL
          AND date(w.expected_first_result) <= date(?)
          AND COALESCE(c.is_test,0)=0
          AND NOT EXISTS (
            SELECT 1 FROM work_logs wl
            WHERE wl.work_id=w.id AND date(wl.log_date)=date(w.expected_first_result)
          )
        ORDER BY w.expected_first_result ASC, w.id ASC LIMIT 50
        """,
        (today_text,),
        con=con,
    )
    work_today = [
        mark_agenda_work(work, kind="periodic_due", date_key="next_due")
        for work in periodic_today
    ] + [
        mark_agenda_work(
            work,
            kind="work_attention",
            date_key="expected_first_result",
            log_default=work.get("expected_first_result"),
            note="Нет отметки за дату",
        )
        for work in attention_today
    ]
    work_today.sort(key=lambda item: (item.get("agenda_date") or "9999-12-31", int(item.get("id") or 0)))
    periodic_upcoming = all_rows(
        """
        SELECT w.*, r.title request_title, c.name client_name, c.id client_id
        FROM works w JOIN requests r ON r.id=w.request_id JOIN clients c ON c.id=r.client_id
        WHERE COALESCE(w.type,'')='periodic'
          AND w.next_due IS NOT NULL
          AND date(w.next_due) > date(?)
          AND date(w.next_due) <= date(?)
          AND COALESCE(w.status,'planned') IN ('planned','active')
          AND COALESCE(c.is_test,0)=0
        ORDER BY w.next_due ASC LIMIT 50
        """,
        (today_text, work_horizon),
        con=con,
    )
    attention_upcoming = all_rows(
        """
        SELECT w.*, r.title request_title, c.name client_name, c.id client_id
        FROM works w JOIN requests r ON r.id=w.request_id JOIN clients c ON c.id=r.client_id
        WHERE COALESCE(w.type,'')='once'
          AND COALESCE(w.status,'planned') IN ('planned','active')
          AND w.expected_first_result IS NOT NULL
          AND date(w.expected_first_result) > date(?)
          AND date(w.expected_first_result) <= date(?)
          AND COALESCE(c.is_test,0)=0
        ORDER BY w.expected_first_result ASC, w.id ASC LIMIT 50
        """,
        (today_text, work_horizon),
        con=con,
    )
    multi_rows = all_rows(
        """
        SELECT w.*, r.title request_title, c.name client_name, c.id client_id
        FROM works w JOIN requests r ON r.id=w.request_id JOIN clients c ON c.id=r.client_id
        WHERE COALESCE(w.type,'')='multi'
          AND COALESCE(w.status,'planned') IN ('planned','active')
          AND w.expected_first_result IS NOT NULL
          AND date(COALESCE(w.expected_final_result, w.expected_first_result)) >= date(?)
          AND date(w.expected_first_result) <= date(?)
          AND COALESCE(c.is_test,0)=0
        ORDER BY w.expected_first_result ASC, w.id ASC LIMIT 80
        """,
        (today_text, work_horizon),
        con=con,
    )
    multi_logs: dict[int, set[str]] = {int(row.get("id") or 0): set() for row in multi_rows}
    if multi_logs:
        placeholders = _placeholders(len(multi_logs))
        for log in all_rows(
            f"SELECT work_id, date(log_date) log_date FROM work_logs WHERE work_id IN ({placeholders})",
            tuple(multi_logs),
            con=con,
        ):
            multi_logs.setdefault(int(log.get("work_id") or 0), set()).add(str(log.get("log_date") or ""))
    multi_items = [
        item
        for item in (pending_multi_agenda_item(work, multi_logs.get(int(work.get("id") or 0), set())) for work in multi_rows)
        if item
    ]
    work_upcoming = [
        mark_agenda_work(work, kind="periodic_upcoming", date_key="next_due")
        for work in periodic_upcoming
    ] + [
        mark_agenda_work(work, kind="work_upcoming", date_key="expected_first_result")
        for work in attention_upcoming
    ] + [item for item in multi_items if str(item.get("agenda_date") or "") > today_text]
    work_today += [item for item in multi_items if str(item.get("agenda_date") or "") <= today_text]
    work_today.sort(key=lambda item: (item.get("agenda_date") or "9999-12-31", int(item.get("id") or 0)))
    work_upcoming.sort(key=lambda item: (item.get("agenda_date") or "9999-12-31", int(item.get("id") or 0)))
    agenda = work_today + work_upcoming
    agenda_source = "copy"
    if headers is not None:
        live_agenda = trebnik_bridge_query("admin.work_agenda", {"horizon_days": 3}, headers)
        if live_agenda:
            live_today = live_agenda.get("today_items") or live_agenda.get("work_today") or []
            live_upcoming = live_agenda.get("upcoming_items") or live_agenda.get("work_upcoming") or []
            if isinstance(live_today, list) and isinstance(live_upcoming, list):
                work_today = [normalize_live_agenda_item(item) for item in live_today if isinstance(item, dict)]
                work_upcoming = [normalize_live_agenda_item(item) for item in live_upcoming if isinstance(item, dict)]
                agenda = work_today + work_upcoming
                agenda_source = "bot"
    state = load_state()
    community = admin_community_summary()
    return {
        "ok": True,
        "pending_payments": pending_requests + pending_services,
        "recent_updates": updates,
        "services": services,
        "expiring_services": expiring,
        "work_today": work_today,
        "work_upcoming": work_upcoming,
        "work_agenda": agenda,
        "work_agenda_source": agenda_source,
        "inquiries": state.get("inquiries", [])[-80:],
        "client_messages": client_message_rows(limit=80, con=con),
        "fresh_client_messages": client_message_rows(limit=80, con=con, days=7),
        "payment_receipts": payment_receipt_rows(limit=80, con=con),
        "service_extend_requests": service_extend_request_rows(limit=80, con=con),
        "payment_reviews": [],
        "events": state.get("events", [])[-80:],
        "community": community,
    }

def work_catalog_key(title: Any) -> str:
    text = re.sub(r"\s+", " ", str(title or "").strip().lower())
    return text[:180]

def work_catalog_int(value: Any) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None

def work_catalog_money(value: Any) -> float:
    try:
        number = float(str(value or "0").replace(",", "."))
    except (TypeError, ValueError):
        return 0.0
    return max(number, 0.0)

def work_catalog_category(value: Any = "", title: Any = "", goal: Any = "") -> str:
    category = re.sub(r"\s+", " ", clean_text(value, 80).lower()).strip()
    return category or WORK_CATALOG_DEFAULT_CATEGORY

def normalize_work_catalog_item(item: dict[str, Any]) -> dict[str, Any]:
    row = dict(item) if isinstance(item, dict) else {}
    title = clean_text(row.get("title"), 180)
    goal = clean_text(row.get("goal"), 4000)
    key = work_catalog_key(row.get("key") or title)
    return {
        "key": key,
        "title": title,
        "goal": goal,
        "category": work_catalog_category(row.get("category"), title, goal),
        "type": clean_text(row.get("type") or row.get("work_type") or "once", 40),
        "total_days": work_catalog_int(row.get("total_days")),
        "period_days": work_catalog_int(row.get("period_days")),
        "period_times": work_catalog_int(row.get("period_times")),
        "count": int(row.get("count") or 0),
        "last_used_at": row.get("last_used_at") or row.get("created_at") or "",
        "latest_client_name": clean_text(row.get("latest_client_name") or row.get("client_name"), 180),
        "latest_request_title": clean_text(row.get("latest_request_title") or row.get("request_title"), 180),
        "examples": row.get("examples") if isinstance(row.get("examples"), list) else [],
        "source_work_id": row.get("source_work_id") or row.get("id"),
    }

def build_work_catalog_from_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    catalog: dict[str, dict[str, Any]] = {}
    for row in rows:
        item = normalize_work_catalog_item(row)
        key = item.get("key")
        if not key or not item.get("title"):
            continue
        current = catalog.get(key)
        if not current:
            current = {**item, "count": 0, "examples": []}
            catalog[key] = current
        current["count"] = int(current.get("count") or 0) + 1
        if not current.get("goal") and item.get("goal"):
            current["goal"] = item["goal"]
        if not current.get("total_days") and item.get("total_days"):
            current["total_days"] = item["total_days"]
        if not current.get("period_days") and item.get("period_days"):
            current["period_days"] = item["period_days"]
        if not current.get("period_times") and item.get("period_times"):
            current["period_times"] = item["period_times"]
        client_name = item.get("latest_client_name")
        if client_name and client_name not in current["examples"]:
            current["examples"].append(client_name)
            current["examples"] = current["examples"][:4]
    return sorted(
        catalog.values(),
        key=lambda item: (-int(item.get("count") or 0), str(item.get("title") or "").lower()),
    )

def local_work_catalog(con: sqlite3.Connection | None = None) -> list[dict[str, Any]]:
    rows = all_rows(
        """
        SELECT w.*, r.title request_title, c.name client_name, c.id client_id,
               w.created_at last_used_at,
               w.id source_work_id
        FROM works w
        JOIN requests r ON r.id=w.request_id
        JOIN clients c ON c.id=r.client_id
        WHERE TRIM(COALESCE(w.title,'')) <> ''
        ORDER BY datetime(w.created_at) DESC, w.id DESC
        LIMIT 3000
        """,
        con=con,
    )
    return build_work_catalog_from_rows(rows)

def clean_work_catalog_override(data: dict[str, Any]) -> dict[str, Any]:
    source = data if isinstance(data, dict) else {}
    result: dict[str, Any] = {}
    if "title" in source:
        title = clean_text(source.get("title"), 180)
        if title:
            result["title"] = title
    if "goal" in source:
        result["goal"] = clean_text(source.get("goal"), 4000)
    if "category" in source:
        result["category"] = work_catalog_category(source.get("category"), source.get("title"), source.get("goal"))
    if "type" in source:
        work_type = clean_text(source.get("type") or "once", 40)
        result["type"] = work_type if work_type in {"once", "multi", "periodic"} else "once"
    for field in ("total_days", "period_days", "period_times"):
        if field in source:
            result[field] = work_catalog_int(source.get(field))
    return result

def apply_work_catalog_overrides(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    state = load_state()
    overrides = state.get("work_catalog_overrides") if isinstance(state.get("work_catalog_overrides"), dict) else {}
    rows = []
    seen: set[str] = set()
    for item in items:
        normalized = normalize_work_catalog_item(item)
        key = normalized.get("key")
        if not key:
            continue
        override = overrides.get(key) if isinstance(overrides.get(key), dict) else {}
        merged = {**normalized, **{field: override[field] for field in WORK_CATALOG_EDITABLE_FIELDS if field in override}}
        if override.get("updated_at"):
            merged["catalog_updated_at"] = override.get("updated_at")
        if override.get("updated_by"):
            merged["catalog_updated_by"] = override.get("updated_by")
        rows.append(merged)
        seen.add(key)
    for key, override in overrides.items():
        if key in seen or not isinstance(override, dict):
            continue
        title = clean_text(override.get("title"), 180)
        if not title:
            continue
        rows.append(normalize_work_catalog_item({"key": key, "count": 0, **override}))
    return sorted(rows, key=lambda item: (-int(item.get("count") or 0), str(item.get("title") or "").lower()))

def admin_work_catalog(con: sqlite3.Connection | None = None, headers: Any | None = None) -> dict[str, Any]:
    source = "copy"
    items: list[dict[str, Any]] = []
    if headers is not None:
        live = trebnik_bridge_query("admin.work_catalog", {}, headers)
        if isinstance(live, dict) and isinstance(live.get("items"), list):
            items = [item for item in live["items"] if isinstance(item, dict)]
            source = "bot"
    if not items:
        try:
            items = local_work_catalog(con=con)
        except ApiError:
            items = []
    return {"items": apply_work_catalog_overrides(items), "source": source}

def save_ritebook_item(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    payload = data if isinstance(data, dict) else {}
    key = work_catalog_key(payload.get("key") or payload.get("title"))
    if not key:
        raise ApiError(400, "Не понял, какую работу сохранить.")
    override = clean_work_catalog_override(payload)
    if not override.get("title"):
        raise ApiError(400, "Название работы не должно быть пустым.")
    state = load_state()
    overrides = state.setdefault("work_catalog_overrides", {})
    current = overrides.get(key) if isinstance(overrides.get(key), dict) else {}
    overrides[key] = {
        **current,
        **override,
        "updated_at": now_iso(),
        "updated_by": user.get("username"),
    }
    save_state(state)
    log_event("ritebook_updated", username=user.get("username"), key=key, title=override.get("title"))
    catalog = admin_work_catalog(headers=headers)
    item = next((row for row in catalog["items"] if row.get("key") == key), None)
    return {"ok": True, "item": item, "work_catalog": catalog["items"], "source": catalog["source"]}

def admin_dashboard(
    con: sqlite3.Connection | None = None,
    finance: dict[str, Any] | None = None,
    headers: Any | None = None,
) -> dict[str, Any]:
    if headers is not None:
        payload = trebnik_bridge_query_required("admin.dashboard", {}, headers)
        state = load_state()
        payload.setdefault("notes", state.get("notes", [])[-50:])
        payload.setdefault("inquiries", state.get("inquiries", [])[-80:])
        payload.setdefault("events", state.get("events", [])[-80:])
        payload.setdefault("community", admin_community_summary())
        if isinstance(payload.get("work_catalog"), list):
            payload["work_catalog"] = apply_work_catalog_overrides([item for item in payload["work_catalog"] if isinstance(item, dict)])
            payload["work_catalog_source"] = payload.get("work_catalog_source") or payload.get("source") or "bot"
        else:
            payload["work_catalog"] = apply_work_catalog_overrides([])
            payload["work_catalog_source"] = "site"
        payload["source"] = "bot"
        return payload
    summary = admin_summary(con=con, finance=finance)
    workbench = admin_workbench(con=con, headers=headers)
    catalog = admin_work_catalog(con=con, headers=headers)
    payload = {**summary, **workbench, "work_catalog": catalog["items"], "work_catalog_source": catalog["source"]}
    return payload

def normalize_admin_action_payment(item: dict[str, Any]) -> dict[str, Any]:
    row = dict(item or {})
    target_type = row.get("entity_type") or ("service" if row.get("service_id") else "request")
    target_id = row.get("entity_id") or row.get("target_id") or row.get("request_id") or row.get("service_id")
    base = {
        "id": row.get("payment_id") or row.get("id"),
        "payment_id": row.get("payment_id") or row.get("id"),
        "amount": row.get("amount"),
        "created_at": row.get("created_at"),
        "client_id": row.get("client_id"),
        "client_name": row.get("client_name"),
        "target_title": row.get("work_title") or row.get("target_title") or row.get("title"),
        "work_id": row.get("work_id"),
        "work_title": row.get("work_title"),
    }
    if target_type == "service":
        return {**base, "service_id": target_id, "service_title": row.get("service_title") or row.get("title")}
    return {**base, "request_id": target_id, "request_title": row.get("request_title") or row.get("title")}

def admin_actions_dashboard(headers: Any | None = None, con: sqlite3.Connection | None = None) -> dict[str, Any]:
    if headers is not None:
        agenda = trebnik_bridge_query_required("admin.work_agenda", {"horizon_days": 3}, headers)
        payments = trebnik_bridge_query_required("admin.pending_payment_items", {}, headers)
        updates = trebnik_bridge_query_required("admin.recent_client_updates", {"limit": 30, "days": 7}, headers)
        expiring = trebnik_bridge_query_required("admin.expiring_services", {"days": 10}, headers)
        more_time = trebnik_bridge_query_required("service.more_time.pending", {}, headers)
        work_today = [normalize_live_agenda_item(item) for item in (agenda.get("today_items") or []) if isinstance(item, dict)]
        work_upcoming = [normalize_live_agenda_item(item) for item in (agenda.get("upcoming_items") or []) if isinstance(item, dict)]
        pending_rows = [normalize_admin_action_payment(item) for item in (payments.get("items") or []) if isinstance(item, dict)]
        update_rows = [_normalize_update_row(item) if "_normalize_update_row" in globals() else item for item in (updates.get("items") or []) if isinstance(item, dict)]
        return {
            "ok": True,
            "source": "bot",
            "pending_payments": pending_rows,
            "recent_updates": update_rows,
            "fresh_client_messages": update_rows,
            "client_messages": update_rows,
            "expiring_services": expiring.get("items") if isinstance(expiring.get("items"), list) else [],
            "service_extend_requests": more_time.get("items") if isinstance(more_time.get("items"), list) else [],
            "work_today": work_today,
            "work_upcoming": work_upcoming,
            "work_agenda": [*work_today, *work_upcoming],
            "work_agenda_source": "bot",
        }
    return admin_workbench(con=con, headers=headers)

def invite_info(token: str) -> dict[str, Any]:
    raise ApiError(410, "Активация по ссылке отключена. Доступ к Требнику открывает администратор.")

def save_inquiry(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    rate_limit(headers, "inquiry")
    if not bool(data.get("accepted_personal_data")):
        raise ApiError(400, "Чтобы отправить заявку, нужно согласие на обработку данных.")
    name = str(data.get("name") or "").strip()
    contact = str(data.get("contact") or "").strip()
    message = str(data.get("message") or "").strip()
    material_title = str(data.get("material_title") or "").strip()
    route = str(data.get("route") or "").strip()
    if len(name) < 2 or len(contact) < 3 or len(message) < 8:
        raise ApiError(400, "Заполните имя, контакт и сообщение.")
    created_at = now_iso()
    inquiry = {"id": secrets.token_hex(8), "name": name[:120], "contact": contact[:180], "message": message[:2000], "material_title": material_title[:180], "route": route[:40], "accepted_personal_data_at": created_at, "created_at": created_at, "status": "new"}
    state = load_state()
    state["inquiries"].append(inquiry)
    state["inquiries"] = state["inquiries"][-500:]
    state["events"].append({"event": "public_inquiry", "created_at": now_iso(), "name": inquiry["name"], "material_title": inquiry["material_title"]})
    state["events"] = state["events"][-500:]
    save_state(state)
    return {"ok": True, "inquiry": {"id": inquiry["id"], "created_at": inquiry["created_at"]}}

def update_inquiry_status(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    inquiry_id = clean_text(data.get("id"), 40)
    status = clean_text(data.get("status"), 30)
    note = clean_text(data.get("note"), 500)
    if status not in {"new", "processing", "closed"}:
        raise ApiError(400, "Нужен статус: new, processing или closed.")
    state = load_state()
    inquiry = next((item for item in state.get("inquiries", []) if str(item.get("id")) == inquiry_id), None)
    if not inquiry:
        raise ApiError(404, "Заявка не найдена.")
    inquiry["status"] = status
    inquiry["handled_at"] = now_iso()
    inquiry["handled_by"] = user.get("username")
    if note:
        inquiry["admin_note"] = note
    state["events"].append({"event": "inquiry_status", "created_at": now_iso(), "username": user.get("username"), "inquiry_id": inquiry_id, "status": status})
    state["events"] = state["events"][-500:]
    save_state(state)
    return {"ok": True, "inquiry": inquiry}

def save_client_message(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    item, client_id = require_trebnik_client_session(headers)
    kind = clean_text(data.get("kind"), 30) or "client_question"
    if kind == "question":
        kind = "client_question"
    if kind not in {"client_question", "update"}:
        kind = "client_question"
    text = clean_text(data.get("text"), 3000)
    if len(text) < 5:
        raise ApiError(400, "Сообщение слишком короткое.")
    target_type = clean_text(data.get("target_type"), 30)
    target_id = int(data.get("target_id") or 0)
    payload = {"kind": kind, "text": text, "target_type": target_type, "target_id": target_id}
    if client_id:
        payload["client_id"] = client_id
    if data.get("idempotency_key"):
        payload["idempotency_key"] = clean_text(data.get("idempotency_key"), 200)
    command = "client.question.add" if kind == "client_question" else "update.add"
    result = trebnik_bridge_command(command, payload, headers)
    log_event("trebnik_update", client_id=client_id or result.get("bridge", {}).get("client_id"), kind=kind)
    return {"ok": True, "message": result.get("bridge", {}), "sync": result.get("sync"), "warning": result.get("warning")}

def save_payment_receipt(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    item, _client_id = require_trebnik_client_session(headers)
    amount = clean_text(data.get("amount"), 80)
    text = clean_text(data.get("text"), 2000)
    target_type = clean_text(data.get("target_type"), 30)
    target_id = int(data.get("target_id") or 0)
    if target_type not in {"request", "service"} or not target_id:
        raise ApiError(400, "Выберите запрос или услугу, к которой относится платёж.")
    if not amount:
        raise ApiError(400, "Укажите сумму платежа.")
    key = "request_id" if target_type == "request" else "service_id"
    idempotency_key = clean_text(data.get("idempotency_key"), 200)
    payment_payload = {"target_type": target_type, key: target_id, "amount": amount, "note": text}
    if target_type == "request" and data.get("work_id"):
        payment_payload["work_id"] = int(data.get("work_id") or 0)
    if idempotency_key:
        payment_payload["idempotency_key"] = idempotency_key
    result = trebnik_bridge_command("payment.add", payment_payload, headers)
    log_event("trebnik_payment_receipt", target_type=target_type, target_id=target_id, amount=amount, role=item.get("role"))
    return {"ok": True, "receipt": result.get("bridge", {}), "sync": result.get("sync"), "warning": result.get("warning")}

def save_service_extend_request(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    item, _client_id = require_trebnik_client_session(headers)
    service_id = int(data.get("service_id") or 0)
    requested_until = clean_text(data.get("requested_until"), 80)
    text = clean_text(data.get("text"), 1000)
    if not service_id:
        raise ApiError(400, "Услуга не выбрана.")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", requested_until):
        raise ApiError(400, "Выберите дату в поле срока.")
    result = trebnik_bridge_command(
        "service.more_time.request",
        {
            "service_id": service_id,
            "requested_until": requested_until,
            "text": text,
            "idempotency_key": clean_text(data.get("idempotency_key"), 200),
        },
        headers,
    )
    log_event("trebnik_service_more_time_request", service_id=service_id, requested_until=requested_until, role=item.get("role"))
    return {"ok": True, "request": result.get("bridge", {}), "sync": result.get("sync"), "warning": result.get("warning")}

def save_payment_decision(data: dict[str, Any], headers: Any, decision: str) -> dict[str, Any]:
    user = require_admin(headers)
    target_type = clean_text(data.get("target_type"), 30)
    payment_id = int(data.get("payment_id") or 0)
    note = clean_text(data.get("note"), 500)
    if target_type not in {"request", "service"} or not payment_id:
        raise ApiError(400, "Нужен тип платежа и его номер.")
    command = f"payment.{target_type}.reject" if decision == "rejected" else "payment.confirm"
    result = trebnik_bridge_command(
        command,
        {
            "payment_id": payment_id,
            "target_type": target_type,
            "note": note,
            "idempotency_key": clean_text(data.get("idempotency_key"), 200),
        },
        headers,
    )
    log_event("trebnik_payment_review", username=user.get("username"), target_type=target_type, payment_id=payment_id, decision=decision)
    return {"ok": True, "review": result.get("bridge", {}), "sync": result.get("sync"), "warning": result.get("warning") or "Решение записано в Требник."}

def save_service_action(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    item, _client_id = require_trebnik_client_session(headers)
    service_id = int(data.get("service_id") or 0)
    action = clean_text(data.get("action"), 30)
    if not service_id or action not in {"postpone", "stop", "resume"}:
        raise ApiError(400, "Нужно выбрать действие по услуге.")
    result = trebnik_bridge_command(
        "service.action",
        {"service_id": service_id, "action": action, "idempotency_key": clean_text(data.get("idempotency_key"), 200)},
        headers,
    )
    log_event("trebnik_service_action", service_id=service_id, action=action, role=item.get("role"))
    return {"ok": True, "service": result.get("bridge", {}), "sync": result.get("sync"), "warning": result.get("warning")}

def save_client_notification(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    item, client_id = require_trebnik_client_session(headers)
    field = clean_text(data.get("field"), 80)
    if field not in TREBNIK_CLIENT_NOTIFICATION_FIELDS:
        raise ApiError(400, "Такого уведомления нет.")
    result = trebnik_bridge_command("client.notification", {"client_id": client_id, "field": field, "value": bool(data.get("value"))}, headers)
    log_event("trebnik_client_notification", client_id=client_id, field=field, value=bool(data.get("value")), role=item.get("role"))
    return {"ok": True, "notification": result.get("bridge", {}), "sync": result.get("sync"), "warning": result.get("warning")}

def save_client_notifications_all(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    item, client_id = require_trebnik_client_session(headers)
    value = bool(data.get("value"))
    results = []
    warning = ""
    sync_info = None
    for field in sorted(TREBNIK_CLIENT_NOTIFICATION_FIELDS):
        result = trebnik_bridge_command("client.notification", {"client_id": client_id, "field": field, "value": value}, headers)
        results.append(result.get("bridge", {}))
        sync_info = result.get("sync") or sync_info
        warning = result.get("warning") or warning
    log_event("trebnik_client_notifications_all", client_id=client_id, value=value, role=item.get("role"))
    return {"ok": True, "notifications": results, "sync": sync_info, "warning": warning}

def mark_trebnik_client_notifications_read(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    item = require_session(headers)
    client_id = int(data.get("client_id") or session_trebnik_client_id(item) or 0)
    if client_id <= 0:
        raise ApiError(403, "Клиент Требника не выбран.")
    item = require_client_or_admin(headers, client_id)
    notification_id = int(data.get("id") or data.get("notification_id") or 0)
    payload = {"client_id": client_id}
    if notification_id:
        payload["notification_id"] = notification_id
    result = trebnik_bridge_command("client.notifications.read", payload, headers)
    log_event("trebnik_client_notifications_read", client_id=client_id, notification_id=notification_id, role=item.get("role"))
    return {"ok": True, **(result.get("bridge", {}) if isinstance(result.get("bridge"), dict) else {}), "sync": result.get("sync"), "warning": result.get("warning")}

def review_service_more_time(data: dict[str, Any], headers: Any, decision: str) -> dict[str, Any]:
    user = require_admin(headers)
    request_id = int(data.get("request_id") or 0)
    if not request_id:
        raise ApiError(400, "Запрос на новый срок не выбран.")
    command = "service.more_time.reject" if decision == "rejected" else "service.more_time.approve"
    result = trebnik_bridge_command(
        command,
        {
            "request_id": request_id,
            "approved_until": clean_text(data.get("approved_until"), 40),
            "idempotency_key": clean_text(data.get("idempotency_key"), 200),
        },
        headers,
    )
    log_event("trebnik_service_more_time_review", username=user.get("username"), request_id=request_id, decision=decision)
    return {"ok": True, "request": result.get("bridge", {}), "sync": result.get("sync"), "warning": result.get("warning")}

def mark_update_read(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    update_id = int(data.get("update_id") or 0)
    if not update_id:
        raise ApiError(400, "Апдейт не выбран.")
    result = trebnik_bridge_command("update.read", {"update_id": update_id}, headers)
    log_event("trebnik_update_read", username=user.get("username"), update_id=update_id)
    return {"ok": True, "update": result.get("bridge", {}), "sync": result.get("sync"), "warning": result.get("warning")}

def mark_all_updates_read(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    result = trebnik_bridge_command("update.read_all", {}, headers)
    read_count = int(result.get("bridge", {}).get("read_count") or 0)
    log_event("trebnik_updates_read_all", username=user.get("username"), count=read_count)
    return {"ok": True, "read_count": read_count, "sync": result.get("sync"), "warning": result.get("warning")}

def save_work_log(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    work_id = int(data.get("work_id") or 0)
    log_date = clean_text(data.get("log_date") or datetime.now().date().isoformat(), 20)
    comment = clean_text(data.get("comment"), 1000)
    if not work_id:
        raise ApiError(400, "Работа не выбрана.")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", log_date):
        raise ApiError(400, "Выберите дату проведения.")
    result = trebnik_bridge_command(
        "work.log.add",
        {"work_id": work_id, "log_date": log_date, "comment": comment, "notify_client": bool(data.get("notify_client"))},
        headers,
    )
    log_event("trebnik_work_log", username=user.get("username"), work_id=work_id, log_date=log_date)
    return {"ok": True, "work_log": result.get("bridge", {}), "sync": result.get("sync"), "warning": result.get("warning")}

def save_work_logs_bulk(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    work_id = int(data.get("work_id") or 0)
    comment = clean_text(data.get("comment"), 1000)
    raw_dates = data.get("log_dates") if isinstance(data.get("log_dates"), list) else []
    log_dates = []
    for item in raw_dates:
        value = clean_text(item, 20)
        if value and value not in log_dates:
            log_dates.append(value)
    if not work_id:
        raise ApiError(400, "Работа не выбрана.")
    if not log_dates:
        raise ApiError(400, "Даты проведения не выбраны.")
    if len(log_dates) > 31:
        raise ApiError(400, "За один раз можно отметить не больше 31 даты.")
    for value in log_dates:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ApiError(400, "Проверьте даты проведения.")
    result = trebnik_bridge_command(
        "work.log.add_bulk",
        {"work_id": work_id, "log_dates": sorted(log_dates), "comment": comment, "notify_client": bool(data.get("notify_client"))},
        headers,
    )
    logs = result.get("bridge", {}).get("work_logs") or []
    warning = result.get("warning") or ""
    sync_info = result.get("sync")
    log_event("trebnik_work_logs_bulk", username=user.get("username"), work_id=work_id, dates=", ".join(sorted(log_dates)))
    return {"ok": True, "work_logs": logs, "sync": sync_info, "warning": warning}

def admin_live_client(client_id: int, headers: Any) -> dict[str, Any] | None:
    live = trebnik_bridge_query_required("admin.clients", {}, headers)
    for item in live.get("items") if isinstance(live.get("items"), list) else []:
        if int(item.get("id") or 0) == int(client_id):
            return public_client(dict(item))
    return None

def set_trebnik_profile_link(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    admin = require_admin(headers)
    client_id = int(data.get("client_id") or 0)
    user_id = int(data.get("user_id") or 0)
    force = bool(data.get("force"))
    if client_id <= 0:
        raise ApiError(400, "Выберите клиента Требника.")
    client = admin_live_client(client_id, headers)
    if not client:
        raise ApiError(404, "Клиент Требника не найден.")
    with community_connection() as con:
        current = con.execute("SELECT * FROM public_users WHERE trebnik_client_id = ?", (client_id,)).fetchone()
        if not user_id:
            if current:
                con.execute(
                    "UPDATE public_users SET trebnik_client_id = NULL, trebnik_linked_at = NULL, trebnik_linked_by = NULL, updated_at = ? WHERE id = ?",
                    (now_iso(), int(current["id"])),
                )
            log_event("trebnik_profile_unlinked", username=admin.get("username"), client_id=client_id, client_name=client.get("name"))
            return {"ok": True, "linked_user": None, "client_id": client_id}

        user = con.execute("SELECT * FROM public_users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise ApiError(404, "Профиль сайта не найден.")
        if user["blocked"]:
            raise ApiError(400, "Заблокированный профиль нельзя привязать к Требнику.")
        if current and int(current["id"]) != user_id and not force:
            raise ApiError(409, "К этому клиенту уже привязан другой профиль.", {"code": "client_already_linked"})
        old_client_id = int(user["trebnik_client_id"] or 0)
        if old_client_id and old_client_id != client_id and not force:
            raise ApiError(409, "Этот профиль уже привязан к другому клиенту.", {"code": "user_already_linked"})
        if current and int(current["id"]) != user_id:
            con.execute(
                "UPDATE public_users SET trebnik_client_id = NULL, trebnik_linked_at = NULL, trebnik_linked_by = NULL, updated_at = ? WHERE id = ?",
                (now_iso(), int(current["id"])),
            )
        now = now_iso()
        con.execute(
            """
            UPDATE public_users
               SET trebnik_client_id = ?, trebnik_linked_at = ?, trebnik_linked_by = ?, updated_at = ?
             WHERE id = ?
            """,
            (client_id, now, admin.get("username") or admin.get("display_name") or "admin", now, user_id),
        )
        fresh = con.execute("SELECT * FROM public_users WHERE id = ?", (user_id,)).fetchone()
    log_event(
        "trebnik_profile_linked",
        username=admin.get("username"),
        client_id=client_id,
        client_name=client.get("name"),
        user_id=user_id,
        nickname=dict(fresh).get("nickname") if fresh else None,
    )
    return {"ok": True, "linked_user": admin_public_user_payload(fresh), "client_id": client_id}

def create_invite(data: dict[str, Any], headers: Any, base_url: str) -> dict[str, Any]:
    raise ApiError(410, "Клиентские ссылки отключены. Привяжите к клиенту профиль сайта.")

def save_note(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    client_id = int(data.get("client_id") or 0)
    text = str(data.get("text") or "").strip()
    if not text:
        raise ApiError(400, "Текст заметки пустой.")
    client = admin_live_client(client_id, headers)
    if not client:
        raise ApiError(404, "Клиент не найден.")
    note = {"id": secrets.token_hex(8), "client_id": client_id, "client_name": client.get("name") if client else None, "text": text, "created_at": now_iso(), "created_by": user.get("username")}
    state = load_state()
    state["notes"].append(note)
    state["notes"] = state["notes"][-500:]
    state["events"].append({**note, "event": "note_created"})
    save_state(state)
    return {"ok": True, "note": note}

def save_admin_trebnik_action(data: dict[str, Any], headers: Any) -> dict[str, Any]:
    user = require_admin(headers)
    command = clean_text(data.get("command"), 80)
    payload = data.get("payload") if isinstance(data.get("payload"), dict) else {}
    if command not in ADMIN_TREBNIK_COMMANDS:
        raise ApiError(400, "Такое действие в Требнике не разрешено с сайта.")
    payload = dict(payload)
    if data.get("idempotency_key") and not payload.get("idempotency_key"):
        payload["idempotency_key"] = clean_text(data.get("idempotency_key"), 200)
    if command == "client.add" and not payload.get("invite_token"):
        payload["invite_token"] = secrets.token_urlsafe(20)
    result = trebnik_bridge_command(command, payload, headers)
    log_event("trebnik_admin_action", username=user.get("username"), command=command)
    return {"ok": True, "result": result.get("bridge", {}), "sync": result.get("sync"), "warning": result.get("warning")}

__all__ = ['WORK_CATALOG_EDITABLE_FIELDS', 'WORK_CATALOG_DEFAULT_CATEGORY', 'TREBNIK_CLIENT_NOTIFICATION_FIELDS', 'ADMIN_TREBNIK_COMMANDS', 'get_client', 'clients_payload', '_placeholders', 'effective_work_cost', 'work_payment_totals_map', 'request_finance_map', 'request_finance', 'service_finance_map', 'service_finance', 'client_requests', 'client_services', 'client_diagnostics', 'client_updates', 'normalize_client_update_row', 'client_message_rows', 'payment_receipt_rows', 'service_extend_request_rows', 'service_action_logs', 'client_finance', 'attach_work_logs_to_rows', 'client_overview', 'request_detail', 'request_history', 'request_work_logs', 'service_detail', 'update_detail', 'update_attachment_stream', 'work_detail', 'admin_finance_summary_from_copy', 'admin_finance_summary', 'admin_summary', 'normalize_live_agenda_item', 'admin_workbench', 'work_catalog_key', 'work_catalog_int', 'work_catalog_money', 'work_catalog_category', 'normalize_work_catalog_item', 'build_work_catalog_from_rows', 'local_work_catalog', 'clean_work_catalog_override', 'apply_work_catalog_overrides', 'admin_work_catalog', 'save_ritebook_item', 'admin_dashboard', 'normalize_admin_action_payment', 'admin_actions_dashboard', 'invite_info', 'save_inquiry', 'update_inquiry_status', 'save_client_message', 'save_payment_receipt', 'save_service_extend_request', 'save_payment_decision', 'save_service_action', 'save_client_notification', 'save_client_notifications_all', 'mark_trebnik_client_notifications_read', 'review_service_more_time', 'mark_update_read', 'mark_all_updates_read', 'save_work_log', 'save_work_logs_bulk', 'admin_live_client', 'set_trebnik_profile_link', 'create_invite', 'save_note', 'save_admin_trebnik_action']
