from __future__ import annotations

from urllib.parse import urlsplit

from fastapi.responses import JSONResponse
from starlette.datastructures import Headers

from src.i18n import scope_lang, t


LOCAL_HOSTNAMES = {"127.0.0.1", "localhost", "::1", "testserver"}


def _hostname(value: str | None) -> str | None:
    if not value:
        return None
    return urlsplit(value if "://" in value else "//" + value).hostname


def _is_local_request(headers: Headers) -> bool:
    if _hostname(headers.get("host")) not in LOCAL_HOSTNAMES:
        return False
    origin = headers.get("origin")
    return origin is None or _hostname(origin) in LOCAL_HOSTNAMES


class LocalOnlyMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and not _is_local_request(Headers(scope=scope)):
            response = JSONResponse({"detail": t("server.local_only", scope_lang(scope))}, status_code=403)
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)
