from __future__ import annotations

from typing import Any

class ApiError(Exception):
    def __init__(self, status: int, message: str, details: Any | None = None) -> None:
        super().__init__(message)
        self.status = int(status)
        self.message = message
        self.details = details

def api_error_payload(exc: ApiError) -> dict[str, Any]:
    from .serialization import json_safe

    payload: dict[str, Any] = {"ok": False, "error": exc.message}
    if isinstance(exc.details, dict):
        payload.update(json_safe(exc.details))
    elif exc.details is not None:
        payload["details"] = json_safe(exc.details)
    return payload

__all__ = ['ApiError', 'api_error_payload']
