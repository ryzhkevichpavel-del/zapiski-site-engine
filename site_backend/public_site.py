from __future__ import annotations

from pathlib import Path
from typing import Any

PUBLIC_HTML_CACHE_CONTROL = "private, max-age=60, stale-while-revalidate=300"


def html_cache_control(route: str, status: int, viewer: dict[str, Any] | None) -> str:
    if status != 200 or viewer or route in {"admin", "trebnik", "messages"}:
        return "no-store"
    return PUBLIC_HTML_CACHE_CONTROL


def site_response(handler: Any, app: Any, path: str, write_body: bool = True) -> None:
    if path == "/robots.txt":
        return handler.text(200, app.robots_txt(handler.base_url()), "text/plain; charset=utf-8", write_body=write_body)
    if path == "/sitemap.xml":
        return handler.text(200, app.sitemap_xml(handler.base_url(), app.public_content()), "application/xml; charset=utf-8", write_body=write_body)
    root_verification_files = getattr(app, "ROOT_VERIFICATION_FILES", {})
    if path.strip("/") in root_verification_files:
        target = (app.WEB_ROOT / path.lstrip("/")).resolve()
        if target.is_file() and target.parent == app.WEB_ROOT.resolve():
            return handler.text(200, target.read_bytes(), root_verification_files[path.strip("/")], write_body=write_body, cache_control="public, max-age=86400")
    target = (app.WEB_ROOT / path.lstrip("/")).resolve()
    if target.is_file() and app.allowed_static(target):
        return handler.file(target, write_body=write_body)
    if Path(path).suffix:
        raise app.ApiError(404, "Файл не найден.")
    viewer = app.public_user(app.session(handler.headers))
    content = app.public_content()
    status, route, slug, app_html = app.resolve_page(path, content)
    title = None
    description = None
    canonical_path = None
    og_type = "website"
    if route == "u" and slug:
        profile_payload = app.community_profile(slug, handler.headers)
        app_html = app.profile_ssr_html(profile_payload)
        title, description, canonical_path, og_type = app.profile_ssr_meta(profile_payload, content, slug)
    body = app.render_html_document(
        content,
        route=route,
        slug=slug,
        app_html=app_html,
        base_url=handler.base_url(),
        status=status,
        viewer=viewer,
        title=title,
        description=description,
        canonical_path=canonical_path,
        og_type=og_type,
    )
    return handler.text(status, body, "text/html; charset=utf-8", write_body=write_body, cache_control=html_cache_control(route, status, viewer))


def site_not_found(handler: Any, app: Any, write_body: bool = True) -> None:
    content = app.public_content()
    viewer = app.public_user(app.session(handler.headers))
    body = app.render_html_document(
        content,
        route="not-found",
        app_html=app.not_found_html(content),
        base_url=handler.base_url(),
        status=404,
        title=f"Страница не найдена — {app.site_name(content)}",
        description="Такой страницы нет.",
        canonical_path="/",
        viewer=viewer,
    )
    return handler.text(404, body, "text/html; charset=utf-8", write_body=write_body, cache_control="no-store")
