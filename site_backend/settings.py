from __future__ import annotations

import mimetypes
import os
import threading
from datetime import timedelta, timezone
from pathlib import Path

try:
    from PIL import Image, ImageOps
except Exception:  # Pillow is installed on the VPS by the deployment step.
    Image = None
    ImageOps = None

mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/svg+xml", ".svg")

WEB_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = WEB_ROOT.parent
DATA_DIR = WEB_ROOT / "data"
LEGACY_DATA_DIR = WEB_ROOT / "данные"
STATIC_DIR = WEB_ROOT / "static"
UPLOADS_DIR = STATIC_DIR / "uploads"
COPY_DB_PATH = DATA_DIR / "trebnik_web.sqlite"
SOURCE_DB_CANDIDATES = [
    *([Path(os.getenv("TREBNIK_SOURCE_DB_PATH", "").strip())] if os.getenv("TREBNIK_SOURCE_DB_PATH", "").strip() else []),
    PROJECT_ROOT / "data" / "trebnik.db",
    WEB_ROOT / "trebnik.db",
]
INDEX_FILE = WEB_ROOT / "index.html"
AUTH_FILE = DATA_DIR / "web_auth.json"
CONTENT_FILE = DATA_DIR / "site_content.json"
CONTENT_BACKUP_DIR = DATA_DIR / "content_backups"
STATE_FILE = DATA_DIR / "site_state.json"
SITE_STORE_DB = DATA_DIR / "site_store.sqlite"
COMMUNITY_DB = DATA_DIR / "site_community.sqlite"
STATE_BACKUP_DIR = DATA_DIR / "state_backups"
AUTH_BACKUP_DIR = DATA_DIR / "auth_backups"
SITE_STORE_BACKUP_DIR = DATA_DIR / "site_store_backups"
MEDIA_TRASH_DIR = DATA_DIR / "media_trash"
COMMUNITY_ATTACHMENTS_DIR = DATA_DIR / "community_message_attachments"
SETUP_KEY_FILE = DATA_DIR / "setup_key.txt"
SESSION_TTL_HOURS = 72
INVITE_TTL_DAYS = 30
PUBLIC_LOGIN_CODE_TTL_MINUTES = 10
PUBLIC_ONLINE_WINDOW_SECONDS = 300
PUBLIC_TRUST_APPROVALS = 5
AUTH_RATE_WINDOW_SECONDS = 300
AUTH_RATE_MAX_ATTEMPTS = 12
SESSION_TOUCH_WINDOW_SECONDS = 30
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
PUBLIC_BASE_URL = os.getenv("TUONELA_PUBLIC_BASE_URL", "").strip().rstrip("/")
TREBNIK_BRIDGE_URL = (os.getenv("TREBNIK_BRIDGE_URL", "http://127.0.0.1:8787").strip() or "http://127.0.0.1:8787").rstrip("/")
TREBNIK_BRIDGE_TOKEN = os.getenv("TREBNIK_BRIDGE_TOKEN", "").strip()
try:
    TREBNIK_BRIDGE_TIMEOUT_SECONDS = max(2, min(60, int(os.getenv("TREBNIK_BRIDGE_TIMEOUT_SECONDS", "8"))))
except ValueError:
    TREBNIK_BRIDGE_TIMEOUT_SECONDS = 8
WRITE_LOCK = threading.RLock()
FILE_LOCK = threading.RLock()
ALLOWED_STATIC_SUFFIXES = {".css", ".js", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".txt", ".woff", ".woff2"}
PUBLIC_SECTION_ROUTES = ("works", "articles", "questions", "services", "cards")
PUBLIC_SECTION_NAMES = {"works": "Работы", "articles": "Статьи", "questions": "Вопросы", "services": "Услуги", "cards": "Карты"}
PUBLIC_SECTION_META_DESCRIPTIONS = {
    "works": "Рабочие записи, наблюдения и материалы сайта.",
    "articles": "Статьи, памятки и разборы перед обращением или сопровождением.",
    "questions": "Лента вопросов и ответов: порядок обращения, сроки, апдейты и границы связи.",
    "services": "Форматы обращения: карты, диагностики, сопровождение и заявки.",
    "cards": "Материалы о картах, раскладах и коротких чтениях.",
}
APP_ROUTES = {"admin", "trebnik", "messages", "privacy", "rules", "personal-data-consent"}
TREBNIK_ADMIN_SUBROUTES = {"actions", "clients", "inquiries", "services", "payments"}
ASSET_VERSION = "update-time-msk-20260530-1"
MONEY_EPSILON = 0.01
SESSION_COOKIE_NAME = "zapiski_session"
VISITOR_COOKIE_NAME = "zapiski_visitor"
DEFAULT_BRAND_LOGO_URL = "/static/zapiski-logo-mark.svg"
ROOT_VERIFICATION_FILES = {
    "5514674ebc384aaca15d0a99abe7abc69c15a38f1e5644aab1db666f7675bd1f.txt": "text/plain; charset=utf-8",
    "googlea89495736ce9174e.html": "text/html; charset=utf-8",
    "yandex_0498dd07a1421e67.html": "text/html; charset=utf-8",
}
STYLE_MODULE_PRELOADS = (
    "/static/styles_modules/00-base.css?v=material-page-compact-20260516-5",
    "/static/styles_modules/01-layout.css?v=profile-admin-links-restore-20260524-1",
    "/static/styles_modules/02-components-forms-modals-auth.css?v=message-attachments-livefix-20260529-5",
    "/static/styles_modules/03-public-pages.css?v=profile-admin-links-restore-20260524-1",
    "/static/styles_modules/04-content-admin.css?v=profile-admin-links-restore-20260524-1",
    "/static/styles_modules/05-admin-trebnik-actions.css?v=profile-admin-links-restore-20260524-1",
    "/static/styles_modules/06-content-editor.css?v=profile-admin-links-restore-20260524-1",
    "/static/styles_modules/07-client-cabinet.css?v=update-modal-adaptive-20260527-1",
    "/static/styles_modules/08-admin-trebnik.css?v=trebnik-mobile-client-list-tail-20260525-1",
    "/static/styles_modules/09-admin-trebnik-clients.css?v=profile-admin-links-restore-20260524-1",
    "/static/styles_modules/10-responsive.css?v=profile-admin-links-restore-20260524-1",
    "/static/styles_modules/11-admin-finance.css?v=trebnik-finance-scroll-20260511-1",
    "/static/styles_modules/12-admin-services.css?v=update-modal-adaptive-20260527-1",
    "/static/styles_modules/13-trebnik-stability.css?v=trebnik-mobile-client-list-tail-20260525-1",
    "/static/styles_modules/14-mobile-complete.css?v=message-attachments-livefix-20260529-5",
)
PUBLIC_STYLE_MODULE_PRELOADS = (
    "/static/styles_modules/00-base.css?v=material-page-compact-20260516-5",
    "/static/styles_modules/01-layout.css?v=profile-admin-links-restore-20260524-1",
    "/static/styles_modules/02-components-forms-modals-auth.css?v=message-attachments-livefix-20260529-5",
    "/static/styles_modules/03-public-pages.css?v=profile-admin-links-restore-20260524-1",
    "/static/styles_modules/06-content-editor.css?v=profile-admin-links-restore-20260524-1",
    "/static/styles_modules/10-responsive.css?v=profile-admin-links-restore-20260524-1",
    "/static/styles_modules/14-mobile-complete.css?v=message-attachments-livefix-20260529-5",
)
ADMIN_STYLE_MODULE_PRELOADS = (
    "/static/styles_modules/04-content-admin.css?v=profile-admin-links-restore-20260524-1",
    "/static/styles_modules/05-admin-trebnik-actions.css?v=profile-admin-links-restore-20260524-1",
    "/static/styles_modules/06-content-editor.css?v=profile-admin-links-restore-20260524-1",
    "/static/styles_modules/07-client-cabinet.css?v=update-modal-adaptive-20260527-1",
    "/static/styles_modules/08-admin-trebnik.css?v=trebnik-mobile-client-list-tail-20260525-1",
    "/static/styles_modules/09-admin-trebnik-clients.css?v=profile-admin-links-restore-20260524-1",
    "/static/styles_modules/11-admin-finance.css?v=trebnik-finance-scroll-20260511-1",
    "/static/styles_modules/12-admin-services.css?v=update-modal-adaptive-20260527-1",
    "/static/styles_modules/13-trebnik-stability.css?v=trebnik-mobile-client-list-tail-20260525-1",
)
TREBNIK_CLIENT_STYLE_MODULE_PRELOADS = (
    "/static/styles_modules/07-client-cabinet.css?v=update-modal-adaptive-20260527-1",
    "/static/styles_modules/08-admin-trebnik.css?v=trebnik-mobile-client-list-tail-20260525-1",
    "/static/styles_modules/09-admin-trebnik-clients.css?v=profile-admin-links-restore-20260524-1",
    "/static/styles_modules/11-admin-finance.css?v=trebnik-finance-scroll-20260511-1",
    "/static/styles_modules/12-admin-services.css?v=update-modal-adaptive-20260527-1",
    "/static/styles_modules/13-trebnik-stability.css?v=trebnik-mobile-client-list-tail-20260525-1",
)
APP_MODULE_PRELOADS = (
    "shared-state.js",
    "api.js",
    "shared-ui.js",
    "public-site.js",
    "community.js",
    "trebnik-client.js",
    "trebnik-admin.js",
    "content-editor.js",
    "auth.js",
    "trebnik-actions.js",
    "public-actions.js",
)
PUBLIC_APP_MODULE_PRELOADS = (
    "shared-state.js",
    "api.js",
    "shared-ui.js",
    "public-site.js",
    "community.js",
    "auth.js",
    "public-actions.js",
)
WORKSPACE_APP_MODULE_PRELOADS = (
    "trebnik-client.js",
    "trebnik-admin.js",
    "content-editor.js",
    "trebnik-actions.js",
)
OLD_HERO_TITLE = "Добро пожаловать"
OLD_HERO_TEXT = "Здесь собраны материалы, личные записи, ответы и рабочие форматы обращения. Для клиентов отдельный кабинет остается спокойной закрытой частью сайта — без лишнего шума и без путаницы."
DEFAULT_HERO_TITLE = "Услуги, материалы и заявки"
DEFAULT_HERO_TEXT = "Здесь можно почитать материалы, выбрать формат обращения и оставить заявку. Для клиентов открывается закрытый клиентский доступ: ход работы, записи, оплаты и сообщения собраны в одном спокойном месте."
MEDIA_UPLOAD_LIMIT_MB = 50
MEDIA_UPLOAD_LIMIT_LABEL = f"{MEDIA_UPLOAD_LIMIT_MB} МБ"
MEDIA_UPLOAD_LIMIT_BYTES = MEDIA_UPLOAD_LIMIT_MB * 1024 * 1024
MEDIA_ORIGINAL_FALLBACK_LIMIT_MB = 15
MEDIA_ORIGINAL_FALLBACK_LIMIT_LABEL = f"{MEDIA_ORIGINAL_FALLBACK_LIMIT_MB} МБ"
MEDIA_ORIGINAL_FALLBACK_LIMIT_BYTES = MEDIA_ORIGINAL_FALLBACK_LIMIT_MB * 1024 * 1024
REQUEST_BODY_LIMIT_BYTES = 72 * 1024 * 1024
MEDIA_UPLOAD_MIME_SUFFIXES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}
COMMUNITY_ATTACHMENT_LIMIT_MB = 25
COMMUNITY_ATTACHMENT_LIMIT_LABEL = f"{COMMUNITY_ATTACHMENT_LIMIT_MB} МБ"
COMMUNITY_ATTACHMENT_LIMIT_BYTES = COMMUNITY_ATTACHMENT_LIMIT_MB * 1024 * 1024
COMMUNITY_MESSAGE_MAX_ATTACHMENTS = 10
COMMUNITY_ATTACHMENT_ALLOWED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif",
    ".pdf", ".txt", ".rtf", ".csv",
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".odt", ".ods", ".odp",
    ".zip", ".rar", ".7z",
}
COMMUNITY_ATTACHMENT_BLOCKED_EXTENSIONS = {
    ".ade", ".adp", ".apk", ".app", ".asp", ".aspx", ".bat", ".bin", ".cmd",
    ".com", ".cpl", ".dll", ".dmg", ".exe", ".gadget", ".hta", ".html", ".jar",
    ".js", ".jse", ".lnk", ".msi", ".msp", ".php", ".ps1", ".scr", ".sh",
    ".svg", ".vb", ".vbe", ".vbs", ".ws", ".wsf",
}
COMMUNITY_ATTACHMENT_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
MEDIA_WEBP_QUALITY = 88
MEDIA_MAX_IMAGE_PIXELS = 80_000_000
if Image is not None:
    Image.MAX_IMAGE_PIXELS = MEDIA_MAX_IMAGE_PIXELS
LEGACY_OWNER_PHOTO_PREFIX = "owner-photo-"
MEDIA_SLOT_PREFIXES = {
    "hero": "hero-",
    "header-visual": "header-visual-",
    "section-cover": "section-cover-",
    "material-cover": "material-cover-",
    "material-inline": "material-inline-",
    "profile-avatar": "profile-avatar-",
    "legacy-owner": LEGACY_OWNER_PHOTO_PREFIX,
}
MEDIA_SLOT_WIDTHS = {
    "hero": (1920, 1280),
    "header-visual": (1280, 960),
    "section-cover": (1920, 1280),
    "material-cover": (1920, 1280),
    "material-inline": (1920, 1280),
    "profile-avatar": (640, 320),
    "legacy-owner": (960, 640),
}
MOSCOW_TZ = timezone(timedelta(hours=3))
AUTH_ATTEMPTS: dict[str, list[datetime]] = {}
COMMUNITY_SCHEMA_READY = False
resolved_copy_db_path: Path | None = None
resolved_source_db_path: Path | None = None
last_sync_info: dict[str, Any] | None = None

__all__ = [name for name in globals() if name.isupper() or name in {"WEB_ROOT", "PROJECT_ROOT", "Image", "ImageOps"}]
