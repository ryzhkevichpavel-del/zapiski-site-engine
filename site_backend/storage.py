from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from .errors import ApiError
from .serialization import clone_json, json_safe
from .settings import AUTH_BACKUP_DIR, CONTENT_BACKUP_DIR, CONTENT_FILE, FILE_LOCK

def read_json(path: Path, default: Any) -> Any:
    with FILE_LOCK:
        if not path.exists():
            return default
        try:
            return json.loads(path.read_text("utf-8"))
        except Exception:
            return default

def read_protected_json(path: Path, default: Any, backup_folder: Path, label: str) -> Any:
    with FILE_LOCK:
        if not path.exists():
            return clone_json(default)
        try:
            data = json.loads(path.read_text("utf-8"))
        except Exception as exc:
            backup_file(path, backup_folder, "поврежденный-файл")
            raise ApiError(500, f"Файл {label} поврежден. Я сохранил копию и не стал сбрасывать данные на пустой шаблон.") from exc
        if not isinstance(data, type(default)):
            backup_file(path, backup_folder, "неверная-структура")
            raise ApiError(500, f"Файл {label} имеет неверную структуру. Я сохранил копию и остановил действие.")
        return data

def write_json(path: Path, data: Any) -> None:
    with FILE_LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(json_safe(data), ensure_ascii=False, indent=2), "utf-8")
        tmp.replace(path)

def backup_file(path: Path, folder: Path, label: str) -> Path | None:
    with FILE_LOCK:
        if not path.exists():
            return None
        folder.mkdir(parents=True, exist_ok=True)
        safe_label = re.sub(r"[^0-9A-Za-zа-яА-Я_-]+", "-", str(label or "backup")).strip("-") or "backup"
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        target = folder / f"{path.stem}_{stamp}_{safe_label}{path.suffix}"
        target.write_bytes(path.read_bytes())
        return target

def read_content_json() -> dict[str, Any] | None:
    with FILE_LOCK:
        if not CONTENT_FILE.exists():
            return None
        try:
            data = json.loads(CONTENT_FILE.read_text("utf-8"))
        except Exception as exc:
            backup_file(CONTENT_FILE, CONTENT_BACKUP_DIR, "поврежденный-файл")
            raise ApiError(500, "Файл контента поврежден. Я сохранил копию в content_backups и не стал заменять сайт шаблоном.") from exc
    if not isinstance(data, dict):
        backup_file(CONTENT_FILE, CONTENT_BACKUP_DIR, "неверная-структура")
        raise ApiError(500, "Файл контента имеет неверный формат. Я сохранил копию и не стал перезаписывать данные.")
    return data

__all__ = ['read_json', 'read_protected_json', 'write_json', 'backup_file', 'read_content_json']
