from __future__ import annotations

from typing import Any
from urllib.parse import parse_qs, urlparse


def handle_get(handler: Any, app: Any, parts: list[str]) -> tuple[bool, dict[str, Any] | None]:
    if parts == ["api", "admin", "community"]:
        app.require_admin(handler.headers)
        return True, {"ok": True, "community": app.admin_community_summary()}
    if parts == ["api", "admin", "profiles"]:
        return True, app.admin_profiles(handler.headers)
    if len(parts) == 4 and parts[:3] == ["api", "admin", "profiles"]:
        return True, app.admin_profile_detail(int(parts[3]), handler.headers)
    if parts == ["api", "community", "questions"]:
        return True, app.public_questions_feed(handler.headers)
    if len(parts) == 4 and parts[:3] == ["api", "community", "questions"]:
        return True, app.public_question_detail(int(parts[3]), handler.headers)
    if parts == ["api", "community", "publications", "likes"]:
        params = parse_qs(urlparse(handler.path).query)
        return True, app.public_publication_likes(params.get("route", [""])[0], params.get("slug", [""])[0], handler.headers)
    if parts == ["api", "community", "notifications"]:
        return True, app.community_notifications(handler.headers)
    if parts == ["api", "community", "messages"]:
        params = parse_qs(urlparse(handler.path).query)
        return True, app.community_messages(params.get("thread_user_id", [""])[0], handler.headers, params.get("channel", ["owner"])[0])
    if len(parts) == 5 and parts[:4] == ["api", "community", "messages", "attachments"]:
        app.community_message_attachment_stream(handler, int(parts[4]), handler.headers)
        return True, None
    if parts == ["api", "community", "messages", "summary"]:
        return True, app.community_messages_summary(handler.headers)
    if parts == ["api", "community", "subscriptions"]:
        return True, app.community_subscriptions(handler.headers)
    if parts == ["api", "community", "unsubscribe"]:
        params = parse_qs(urlparse(handler.path).query)
        return True, app.unsubscribe_community_email(params.get("token", [""])[0])
    if len(parts) == 4 and parts[:2] == ["api", "community"] and parts[2] == "profile":
        return True, app.community_profile(parts[3], handler.headers)
    if len(parts) == 4 and parts[:3] == ["api", "community", "comments"]:
        params = parse_qs(urlparse(handler.path).query)
        route = params.get("route", [""])[0]
        slug = params.get("slug", [""])[0]
        if parts[3] == "list":
            return True, app.community_comments(route, slug, handler.headers)
        if parts[3] == "likes":
            raise app.ApiError(400, "Нужен номер комментария.")
        raise app.ApiError(404, "Маршрут API не найден.")
    if len(parts) == 5 and parts[:3] == ["api", "community", "comments"] and parts[4] == "likes":
        return True, app.public_comment_likes(int(parts[3]), handler.headers)
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
    if parts == ["api", "community", "auth", "request-code"]:
        return True, app.request_public_login_code(data, handler.headers)
    if parts == ["api", "community", "auth", "verify-code"]:
        payload = app.verify_public_login_code(data, handler.headers)
        if payload.get("token"):
            cookies.append(handler.session_cookie(str(payload.get("token"))))
        return True, payload
    if parts == ["api", "community", "auth", "register", "request-code"]:
        return True, app.request_public_registration_code(data, handler.headers)
    if parts == ["api", "community", "auth", "register", "verify-code"]:
        return True, app.verify_public_registration_code(data, handler.headers)
    if parts == ["api", "community", "auth", "register", "complete"]:
        payload = app.complete_public_registration(data, handler.headers)
        if payload.get("token"):
            cookies.append(handler.session_cookie(str(payload.get("token"))))
        return True, payload
    if parts == ["api", "community", "auth", "login"]:
        payload = app.login_public_password(data, handler.headers)
        if payload.get("token"):
            cookies.append(handler.session_cookie(str(payload.get("token"))))
        return True, payload
    if parts == ["api", "community", "auth", "password-reset", "request-code"]:
        return True, app.request_public_password_reset(data, handler.headers)
    if parts == ["api", "community", "auth", "password-reset", "complete"]:
        payload = app.complete_public_password_reset(data, handler.headers)
        if payload.get("token"):
            cookies.append(handler.session_cookie(str(payload.get("token"))))
        return True, payload
    if parts == ["api", "community", "profile"]:
        return True, app.update_public_profile(data, handler.headers)
    if parts == ["api", "community", "profile", "activity", "hide"]:
        return True, app.hide_public_profile_activity(data, handler.headers)
    if parts == ["api", "community", "account"]:
        return True, app.update_public_account(data, handler.headers)
    if parts == ["api", "community", "comments"]:
        return True, app.save_public_comment(data, handler.headers)
    if parts == ["api", "community", "comments", "like"]:
        return True, app.like_public_comment(data, handler.headers)
    if parts == ["api", "community", "publications", "like"]:
        return True, app.like_publication(data, handler.headers)
    if parts == ["api", "community", "questions"]:
        return True, app.save_public_question(data, handler.headers)
    if parts == ["api", "community", "notifications", "read"]:
        return True, app.mark_community_notifications_read(data, handler.headers)
    if parts == ["api", "community", "messages"]:
        return True, app.save_community_message(data, handler.headers)
    if parts == ["api", "community", "messages", "attachment"]:
        return True, app.save_community_message_attachment_upload(raw_body, content_type, handler.headers)
    if parts == ["api", "community", "subscriptions"]:
        return True, app.set_community_subscription(data, handler.headers)
    if parts == ["api", "admin", "community", "comment"]:
        return True, app.moderate_public_comment(data, handler.headers)
    if parts == ["api", "admin", "community", "question", "create"]:
        return True, app.create_public_question_admin(data, handler.headers)
    if parts == ["api", "admin", "community", "question"]:
        return True, app.answer_public_question(data, handler.headers)
    if parts == ["api", "admin", "community", "user"]:
        return True, app.update_public_user_admin(data, handler.headers)
    if parts == ["api", "admin", "profiles", "update"]:
        return True, app.admin_update_profile(data, handler.headers)
    if parts == ["api", "admin", "profiles", "delete"]:
        return True, app.admin_delete_profile(data, handler.headers)
    if parts == ["api", "admin", "community", "smtp-test"]:
        return True, app.test_smtp_api(data, handler.headers)
    return False, None
