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

def ensure_community_schema() -> None:
    global COMMUNITY_SCHEMA_READY
    if COMMUNITY_SCHEMA_READY:
        return
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with FILE_LOCK, sqlite3.connect(str(COMMUNITY_DB), timeout=30) as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA synchronous=NORMAL")
        con.execute("PRAGMA foreign_keys=ON")
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS public_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                nickname TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                bio TEXT NOT NULL DEFAULT '',
                avatar_url TEXT NOT NULL DEFAULT '',
                avatar_updated_at TEXT,
                notification_email_enabled INTEGER NOT NULL DEFAULT 1,
                profile_guest_visible INTEGER NOT NULL DEFAULT 1,
                show_online_status INTEGER NOT NULL DEFAULT 0,
                show_public_activity INTEGER NOT NULL DEFAULT 1,
                trusted INTEGER NOT NULL DEFAULT 0,
                blocked INTEGER NOT NULL DEFAULT 0,
                blocked_at TEXT,
                blocked_by TEXT,
                block_reason TEXT NOT NULL DEFAULT '',
                deleted_at TEXT,
                deleted_by TEXT,
                last_ip TEXT NOT NULL DEFAULT '',
                comments_locked_until TEXT,
                comments_locked_permanent INTEGER NOT NULL DEFAULT 0,
                comments_locked_reason TEXT NOT NULL DEFAULT '',
                comments_locked_by TEXT,
                comments_locked_at TEXT,
                must_change_avatar INTEGER NOT NULL DEFAULT 0,
                must_change_nickname INTEGER NOT NULL DEFAULT 0,
                moderation_note TEXT NOT NULL DEFAULT '',
                approved_actions_count INTEGER NOT NULL DEFAULT 0,
                password_salt TEXT,
                password_hash TEXT,
                password_algorithm TEXT,
                password_set_at TEXT,
                site_admin INTEGER NOT NULL DEFAULT 0,
                site_admin_granted_at TEXT,
                trebnik_client_id INTEGER,
                trebnik_linked_at TEXT,
                trebnik_linked_by TEXT,
                accepted_legal_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_seen TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_public_users_last_seen ON public_users(last_seen);

            CREATE TABLE IF NOT EXISTS public_access_blocks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                value TEXT NOT NULL,
                user_id INTEGER,
                active INTEGER NOT NULL DEFAULT 1,
                reason TEXT NOT NULL DEFAULT '',
                created_by TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(kind, value),
                FOREIGN KEY(user_id) REFERENCES public_users(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_public_access_blocks_lookup ON public_access_blocks(kind, value, active);
            CREATE INDEX IF NOT EXISTS idx_public_access_blocks_user ON public_access_blocks(user_id, active);

            CREATE TABLE IF NOT EXISTS login_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                code_salt TEXT NOT NULL,
                code_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used_at TEXT,
                attempts INTEGER NOT NULL DEFAULT 0,
                purpose TEXT NOT NULL DEFAULT 'login',
                accepted_legal_at TEXT,
                ip TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_login_codes_email_created ON login_codes(email, created_at);

            CREATE TABLE IF NOT EXISTS public_auth_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                token_salt TEXT NOT NULL,
                token_hash TEXT NOT NULL,
                purpose TEXT NOT NULL,
                accepted_legal_at TEXT,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_public_auth_tokens_email_created ON public_auth_tokens(email, purpose, created_at);

            CREATE TABLE IF NOT EXISTS public_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                target_route TEXT NOT NULL,
                target_slug TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                parent_id INTEGER,
                body TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                moderated_at TEXT,
                moderated_by TEXT,
                FOREIGN KEY(parent_id) REFERENCES public_comments(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES public_users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_public_comments_target_status ON public_comments(target_route, target_slug, status, created_at);
            CREATE INDEX IF NOT EXISTS idx_public_comments_status_created ON public_comments(status, created_at);

            CREATE TABLE IF NOT EXISTS comment_likes (
                comment_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY(comment_id, user_id),
                FOREIGN KEY(comment_id) REFERENCES public_comments(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES public_users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_comment_likes_user ON comment_likes(user_id, created_at);

            CREATE TABLE IF NOT EXISTS publication_likes (
                target_route TEXT NOT NULL,
                target_slug TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY(target_route, target_slug, user_id),
                FOREIGN KEY(user_id) REFERENCES public_users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_publication_likes_target ON publication_likes(target_route, target_slug, created_at);
            CREATE INDEX IF NOT EXISTS idx_publication_likes_user ON publication_likes(user_id, created_at);

            CREATE TABLE IF NOT EXISTS public_questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                question TEXT NOT NULL,
                answer TEXT,
                category TEXT NOT NULL DEFAULT '',
                publish_anonymously INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                answered_at TEXT,
                answered_by TEXT,
                FOREIGN KEY(user_id) REFERENCES public_users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_public_questions_status_created ON public_questions(status, created_at);

            CREATE TABLE IF NOT EXISTS community_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event TEXT NOT NULL,
                user_id INTEGER,
                payload TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_community_events_created ON community_events(created_at);

            CREATE TABLE IF NOT EXISTS community_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                target_type TEXT NOT NULL,
                target_route TEXT NOT NULL DEFAULT '',
                target_slug TEXT NOT NULL DEFAULT '',
                active INTEGER NOT NULL DEFAULT 1,
                email_enabled INTEGER NOT NULL DEFAULT 1,
                unsubscribe_token TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES public_users(id) ON DELETE CASCADE,
                UNIQUE(user_id, target_type, target_route, target_slug)
            );
            CREATE INDEX IF NOT EXISTS idx_community_subscriptions_target ON community_subscriptions(target_type, target_route, target_slug, active);
            CREATE INDEX IF NOT EXISTS idx_community_subscriptions_user ON community_subscriptions(user_id, active, updated_at);

            CREATE TABLE IF NOT EXISTS community_notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                actor_user_id INTEGER,
                kind TEXT NOT NULL,
                target_type TEXT NOT NULL DEFAULT '',
                target_route TEXT NOT NULL DEFAULT '',
                target_slug TEXT NOT NULL DEFAULT '',
                target_id INTEGER,
                aggregate_key TEXT,
                title TEXT NOT NULL,
                body TEXT NOT NULL DEFAULT '',
                url TEXT NOT NULL DEFAULT '',
                count INTEGER NOT NULL DEFAULT 1,
                read_at TEXT,
                email_sent_at TEXT,
                email_error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES public_users(id) ON DELETE CASCADE,
                FOREIGN KEY(actor_user_id) REFERENCES public_users(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_community_notifications_user_read ON community_notifications(user_id, read_at, updated_at);
            CREATE INDEX IF NOT EXISTS idx_community_notifications_aggregate ON community_notifications(user_id, aggregate_key);

            CREATE TABLE IF NOT EXISTS community_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                thread_user_id INTEGER NOT NULL,
                author_user_id INTEGER NOT NULL,
                channel TEXT NOT NULL DEFAULT 'owner',
                body TEXT NOT NULL,
                read_by_user_at TEXT,
                read_by_admin_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(thread_user_id) REFERENCES public_users(id) ON DELETE CASCADE,
                FOREIGN KEY(author_user_id) REFERENCES public_users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_community_messages_thread ON community_messages(channel, thread_user_id, id);
            CREATE INDEX IF NOT EXISTS idx_community_messages_user_unread ON community_messages(channel, thread_user_id, read_by_user_at, id);
            CREATE INDEX IF NOT EXISTS idx_community_messages_admin_unread ON community_messages(channel, read_by_admin_at, id);

            CREATE TABLE IF NOT EXISTS community_support_broadcasts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                author_user_id INTEGER NOT NULL,
                body TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(author_user_id) REFERENCES public_users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_community_support_broadcasts_created ON community_support_broadcasts(created_at, id);

            CREATE TABLE IF NOT EXISTS community_support_broadcast_recipients (
                broadcast_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                read_at TEXT,
                PRIMARY KEY(broadcast_id, user_id),
                FOREIGN KEY(broadcast_id) REFERENCES community_support_broadcasts(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES public_users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_community_support_broadcast_recipients_user ON community_support_broadcast_recipients(user_id, read_at, broadcast_id);

            CREATE TABLE IF NOT EXISTS community_message_attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER,
                broadcast_id INTEGER,
                uploader_user_id INTEGER NOT NULL,
                draft_token TEXT NOT NULL UNIQUE,
                stored_name TEXT NOT NULL,
                original_name TEXT NOT NULL,
                content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
                extension TEXT NOT NULL DEFAULT '',
                kind TEXT NOT NULL DEFAULT 'file',
                size_bytes INTEGER NOT NULL DEFAULT 0,
                width INTEGER,
                height INTEGER,
                created_at TEXT NOT NULL,
                attached_at TEXT,
                deleted_at TEXT,
                FOREIGN KEY(message_id) REFERENCES community_messages(id) ON DELETE CASCADE,
                FOREIGN KEY(broadcast_id) REFERENCES community_support_broadcasts(id) ON DELETE CASCADE,
                FOREIGN KEY(uploader_user_id) REFERENCES public_users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_community_message_attachments_message ON community_message_attachments(message_id, id);
            CREATE INDEX IF NOT EXISTS idx_community_message_attachments_broadcast ON community_message_attachments(broadcast_id, id);
            CREATE INDEX IF NOT EXISTS idx_community_message_attachments_draft ON community_message_attachments(uploader_user_id, attached_at, created_at);

            CREATE TABLE IF NOT EXISTS public_profile_hidden_activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                item_type TEXT NOT NULL,
                item_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(user_id, item_type, item_id),
                FOREIGN KEY(user_id) REFERENCES public_users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_public_profile_hidden_activity_user ON public_profile_hidden_activity(user_id, item_type, item_id);
            """
        )
        user_columns = {row[1] for row in con.execute("PRAGMA table_info(public_users)").fetchall()}
        user_migrations = {
            "password_salt": "ALTER TABLE public_users ADD COLUMN password_salt TEXT",
            "password_hash": "ALTER TABLE public_users ADD COLUMN password_hash TEXT",
            "password_algorithm": "ALTER TABLE public_users ADD COLUMN password_algorithm TEXT",
            "password_set_at": "ALTER TABLE public_users ADD COLUMN password_set_at TEXT",
            "site_admin": "ALTER TABLE public_users ADD COLUMN site_admin INTEGER NOT NULL DEFAULT 0",
            "site_admin_granted_at": "ALTER TABLE public_users ADD COLUMN site_admin_granted_at TEXT",
            "bio": "ALTER TABLE public_users ADD COLUMN bio TEXT NOT NULL DEFAULT ''",
            "avatar_url": "ALTER TABLE public_users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''",
            "avatar_updated_at": "ALTER TABLE public_users ADD COLUMN avatar_updated_at TEXT",
            "notification_email_enabled": "ALTER TABLE public_users ADD COLUMN notification_email_enabled INTEGER NOT NULL DEFAULT 1",
            "profile_guest_visible": "ALTER TABLE public_users ADD COLUMN profile_guest_visible INTEGER NOT NULL DEFAULT 1",
            "show_online_status": "ALTER TABLE public_users ADD COLUMN show_online_status INTEGER NOT NULL DEFAULT 0",
            "show_public_activity": "ALTER TABLE public_users ADD COLUMN show_public_activity INTEGER NOT NULL DEFAULT 1",
            "trebnik_client_id": "ALTER TABLE public_users ADD COLUMN trebnik_client_id INTEGER",
            "trebnik_linked_at": "ALTER TABLE public_users ADD COLUMN trebnik_linked_at TEXT",
            "trebnik_linked_by": "ALTER TABLE public_users ADD COLUMN trebnik_linked_by TEXT",
            "blocked_at": "ALTER TABLE public_users ADD COLUMN blocked_at TEXT",
            "blocked_by": "ALTER TABLE public_users ADD COLUMN blocked_by TEXT",
            "block_reason": "ALTER TABLE public_users ADD COLUMN block_reason TEXT NOT NULL DEFAULT ''",
            "deleted_at": "ALTER TABLE public_users ADD COLUMN deleted_at TEXT",
            "deleted_by": "ALTER TABLE public_users ADD COLUMN deleted_by TEXT",
            "last_ip": "ALTER TABLE public_users ADD COLUMN last_ip TEXT NOT NULL DEFAULT ''",
            "comments_locked_until": "ALTER TABLE public_users ADD COLUMN comments_locked_until TEXT",
            "comments_locked_permanent": "ALTER TABLE public_users ADD COLUMN comments_locked_permanent INTEGER NOT NULL DEFAULT 0",
            "comments_locked_reason": "ALTER TABLE public_users ADD COLUMN comments_locked_reason TEXT NOT NULL DEFAULT ''",
            "comments_locked_by": "ALTER TABLE public_users ADD COLUMN comments_locked_by TEXT",
            "comments_locked_at": "ALTER TABLE public_users ADD COLUMN comments_locked_at TEXT",
            "must_change_avatar": "ALTER TABLE public_users ADD COLUMN must_change_avatar INTEGER NOT NULL DEFAULT 0",
            "must_change_nickname": "ALTER TABLE public_users ADD COLUMN must_change_nickname INTEGER NOT NULL DEFAULT 0",
            "moderation_note": "ALTER TABLE public_users ADD COLUMN moderation_note TEXT NOT NULL DEFAULT ''",
        }
        for column, sql in user_migrations.items():
            if column not in user_columns:
                con.execute(sql)
        con.execute("CREATE INDEX IF NOT EXISTS idx_public_users_deleted ON public_users(deleted_at, created_at)")
        con.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_public_users_trebnik_client ON public_users(trebnik_client_id) WHERE trebnik_client_id IS NOT NULL")
        comment_columns = {row[1] for row in con.execute("PRAGMA table_info(public_comments)").fetchall()}
        if "parent_id" not in comment_columns:
            con.execute("ALTER TABLE public_comments ADD COLUMN parent_id INTEGER")
        con.execute("CREATE INDEX IF NOT EXISTS idx_public_comments_parent ON public_comments(parent_id, status, created_at)")
        question_columns = {row[1] for row in con.execute("PRAGMA table_info(public_questions)").fetchall()}
        if "publish_anonymously" not in question_columns:
            con.execute("ALTER TABLE public_questions ADD COLUMN publish_anonymously INTEGER NOT NULL DEFAULT 0")
        code_columns = {row[1] for row in con.execute("PRAGMA table_info(login_codes)").fetchall()}
        if "purpose" not in code_columns:
            con.execute("ALTER TABLE login_codes ADD COLUMN purpose TEXT NOT NULL DEFAULT 'login'")
        message_columns = {row[1] for row in con.execute("PRAGMA table_info(community_messages)").fetchall()}
        if "channel" not in message_columns:
            con.execute("ALTER TABLE community_messages ADD COLUMN channel TEXT NOT NULL DEFAULT 'owner'")
        con.execute("CREATE INDEX IF NOT EXISTS idx_community_messages_thread_channel ON community_messages(channel, thread_user_id, id)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_community_messages_user_unread_channel ON community_messages(channel, thread_user_id, read_by_user_at, id)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_community_messages_admin_unread_channel ON community_messages(channel, read_by_admin_at, id)")
        COMMUNITY_SCHEMA_READY = True

def community_connection() -> sqlite3.Connection:
    ensure_community_schema()
    con = sqlite3.connect(str(COMMUNITY_DB), timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    return con

def community_status() -> dict[str, Any]:
    return {
        "registration_enabled": smtp_configured(),
        "smtp_configured": smtp_configured(),
        "login_code_ttl_minutes": PUBLIC_LOGIN_CODE_TTL_MINUTES,
        "online_window_seconds": PUBLIC_ONLINE_WINDOW_SECONDS,
        "trust_approvals": PUBLIC_TRUST_APPROVALS,
    }

__all__ = ['ensure_community_schema', 'community_connection', 'community_status']
