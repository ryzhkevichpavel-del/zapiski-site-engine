from __future__ import annotations

import argparse
import json
import mimetypes
import sys
import threading
import time
import webbrowser
from email.utils import formatdate
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote, urlparse

from site_backend import public_site as public_site_routes
from site_backend import runtime_compat
from site_backend import router as backend_router
from site_backend import settings as _settings
from site_backend import (
    auth_service as _auth_service,
    community_service as _community_service,
    community_store as _community_store,
    content_editor_service as _content_editor_service,
    content_service as _content_service,
    errors as _errors,
    mailer as _mailer,
    media_service as _media_service,
    public_render as _public_render,
    serialization as _serialization,
    site_store as _site_store,
    snapshot_store as _snapshot_store,
    storage as _storage,
    traffic as _traffic,
    trebnik_bridge as _trebnik_bridge,
    trebnik_site as _trebnik_site,
)
from site_backend.settings import *
from site_backend.errors import ApiError, api_error_payload
from site_backend.serialization import json_safe, now_iso

_SERVICE_MODULES = (
    _errors,
    _serialization,
    _storage,
    _site_store,
    _community_store,
    _media_service,
    _snapshot_store,
    _content_service,
    _auth_service,
    _trebnik_bridge,
    _traffic,
    _mailer,
    _community_service,
    _trebnik_site,
    _content_editor_service,
    _public_render,
)

_STATE_NAMES = {"COMMUNITY_SCHEMA_READY", "resolved_copy_db_path", "resolved_source_db_path", "last_sync_info"}
_COMPAT = runtime_compat.RuntimeCompat(_SERVICE_MODULES, _settings, _STATE_NAMES)
_SERVICE_EXPORTS = _COMPAT.exports


def _sync_to_service_modules() -> None:
    _COMPAT.sync_to_modules(globals())


def _sync_from_service_modules() -> None:
    _COMPAT.sync_from_modules(globals())


def _service_call(name: str, *args: Any, **kwargs: Any) -> Any:
    return _COMPAT.service_call(globals(), name, *args, **kwargs)


def __getattr__(name: str) -> Any:
    return _COMPAT.proxy(globals(), name)


_sync_to_service_modules()
file_cache_header = _SERVICE_EXPORTS["file_cache_header"]


class Handler(BaseHTTPRequestHandler):
    server_version = "ZapiskiSite/5.0"

    def base_url(self) -> str:
        if PUBLIC_BASE_URL:
            return PUBLIC_BASE_URL
        host = (self.headers.get("X-Forwarded-Host") or self.headers.get("Host") or f"{DEFAULT_HOST}:{self.server.server_port}").strip()
        proto = (self.headers.get("X-Forwarded-Proto") or "http").split(",", 1)[0].strip() or "http"
        return f"{proto}://{host}"

    def cors_origin(self) -> str | None:
        origin = self.headers.get("Origin")
        if not origin:
            return None
        try:
            origin_host = urlparse(origin).netloc
        except Exception:
            return None
        host = self.headers.get("Host") or ""
        if origin_host == host or origin_host.startswith("127.0.0.1") or origin_host.startswith("localhost"):
            return origin
        return None

    def add_cors(self) -> None:
        origin = self.cors_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def is_https_request(self) -> bool:
        proto = (self.headers.get("X-Forwarded-Proto") or "").split(",", 1)[0].strip().lower()
        return proto == "https"

    def session_cookie(self, token: str) -> str:
        max_age = SESSION_TTL_HOURS * 60 * 60
        secure = "; Secure" if self.is_https_request() else ""
        return f"{SESSION_COOKIE_NAME}={quote(token, safe='')}; Path=/; Max-Age={max_age}; SameSite=Lax; HttpOnly{secure}"

    def clear_session_cookie(self) -> str:
        secure = "; Secure" if self.is_https_request() else ""
        return f"{SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; HttpOnly{secure}"

    def visitor_cookie(self, token: str) -> str:
        secure = "; Secure" if self.is_https_request() else ""
        return f"{VISITOR_COOKIE_NAME}={quote(token, safe='')}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly{secure}"

    def add_security_headers(self) -> None:
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        )
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        host = (self.headers.get("X-Forwarded-Host") or self.headers.get("Host") or "").lower()
        proto = (self.headers.get("X-Forwarded-Proto") or "").split(",", 1)[0].strip().lower()
        if proto == "https" and "localhost" not in host and "127.0.0.1" not in host:
            self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.add_cors()
        self.add_security_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS")
        self.end_headers()

    def do_HEAD(self) -> None:
        path = unquote(urlparse(self.path).path or "/")
        try:
            if path.startswith("/api/"):
                self.json(200, {"ok": True}, write_body=False)
            else:
                self.site_response(path, write_body=False)
        except ApiError as exc:
            if path.startswith("/api/"):
                self.json(exc.status, api_error_payload(exc), write_body=False)
            else:
                self.site_not_found(write_body=False)
        except Exception:
            self.json(500, {"ok": False, "error": "Внутренняя ошибка сервера."}, write_body=False)

    def do_GET(self) -> None:
        path = unquote(urlparse(self.path).path or "/")
        try:
            if path.startswith("/api/"):
                self.api_get(path)
            else:
                self.site_response(path)
        except ApiError as exc:
            if path.startswith("/api/"):
                self.json(exc.status, api_error_payload(exc))
            else:
                self.site_not_found()
        except BrokenPipeError:
            pass
        except Exception as exc:
            print(f"[{now_iso()}] internal error: {type(exc).__name__}: {exc}")
            self.json(500, {"ok": False, "error": "Внутренняя ошибка сервера."})

    def do_POST(self) -> None:
        path = unquote(urlparse(self.path).path or "/")
        try:
            if not path.startswith("/api/"):
                raise ApiError(404, "Маршрут не найден.")
            length = int(self.headers.get("Content-Length") or 0)
            if length > REQUEST_BODY_LIMIT_BYTES:
                raise ApiError(413, f"Запрос слишком большой. Для изображений выберите файл до {MEDIA_UPLOAD_LIMIT_LABEL}.")
            self.api_post(path, self.rfile.read(length), self.headers.get("Content-Type") or "")
        except ApiError as exc:
            self.json(exc.status, api_error_payload(exc))
        except BrokenPipeError:
            pass
        except Exception as exc:
            print(f"[{now_iso()}] internal error: {type(exc).__name__}: {exc}")
            self.json(500, {"ok": False, "error": "Внутренняя ошибка сервера."})

    def api_get(self, path: str) -> None:
        return backend_router.api_get(self, sys.modules[__name__], path)

    def api_post(self, path: str, raw_body: bytes, content_type: str) -> None:
        return backend_router.api_post(self, sys.modules[__name__], path, raw_body, content_type)

    def site_response(self, path: str, write_body: bool = True) -> None:
        return public_site_routes.site_response(self, sys.modules[__name__], path, write_body=write_body)

    def site_not_found(self, write_body: bool = True) -> None:
        return public_site_routes.site_not_found(self, sys.modules[__name__], write_body=write_body)

    def json(self, status: int, payload: dict[str, Any], write_body: bool = True, cookies: list[str] | None = None) -> None:
        body = json.dumps(json_safe(payload), ensure_ascii=False).encode("utf-8")
        self.send_response(int(status))
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        for cookie in cookies or []:
            self.send_header("Set-Cookie", cookie)
        self.add_security_headers()
        self.add_cors()
        self.end_headers()
        if write_body:
            self.wfile.write(body)

    def text(self, status: int, body: bytes, content_type: str, write_body: bool = True, cache_control: str = "no-store", cookies: list[str] | None = None) -> None:
        self.send_response(int(status))
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache_control)
        for cookie in cookies or []:
            self.send_header("Set-Cookie", cookie)
        self.add_security_headers()
        self.end_headers()
        if write_body:
            self.wfile.write(body)

    def file(self, path: Path, write_body: bool = True) -> None:
        if not path.exists():
            raise ApiError(404, "Файл не найден.")
        stat = path.stat()
        etag = f'W/"{int(stat.st_mtime)}-{stat.st_size}"'
        last_modified = formatdate(stat.st_mtime, usegmt=True)
        if self.headers.get("If-None-Match") == etag or self.headers.get("If-Modified-Since") == last_modified:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Last-Modified", last_modified)
            self.send_header("Cache-Control", file_cache_header(path))
            self.add_security_headers()
            self.end_headers()
            return
        body = path.read_bytes()
        ctype, _ = mimetypes.guess_type(str(path))
        self.send_response(200)
        self.send_header("Content-Type", ctype or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", file_cache_header(path))
        self.send_header("ETag", etag)
        self.send_header("Last-Modified", last_modified)
        self.add_security_headers()
        self.end_headers()
        if write_body:
            self.wfile.write(body)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[{now_iso()}] {self.address_string()} {fmt % args}")


class Server(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 128


def main() -> None:
    parser = argparse.ArgumentParser(description="Сайт Записки чернокнижника.")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--open-browser", action="store_true")
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    _service_call("load_auth")
    _service_call("load_content")
    _service_call("load_state")
    _service_call("ensure_community_schema")
    server = Server((DEFAULT_HOST, int(args.port)), Handler)
    url = f"http://{DEFAULT_HOST}:{args.port}"
    print(f"Записки чернокнижника: {url}")
    if not _service_call("admin_exists"):
        key = _service_call("setup_key")
        print("Первичная настройка закрыта ключом.")
        print(f"Ключ настройки: {key}")
        print(f"Файл с ключом: {SETUP_KEY_FILE}")
    print(f"Папка данных: {DATA_DIR}")
    if args.open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nСервер остановлен.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
