from __future__ import annotations

import logging

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from src.i18n import scope_lang, t, use_lang
from src.memory import is_out_of_memory
from src.processor import ModelOutOfMemory, memory_message, release_sessions


logger = logging.getLogger("uvicorn.error")


async def _memory_error_response(exc: BaseException, lang: str) -> JSONResponse:
    await run_in_threadpool(release_sessions)
    logger.warning("Memoria insuficiente: %r", exc.__cause__ or exc)
    with use_lang(lang):
        message = str(exc) if isinstance(exc, ModelOutOfMemory) else memory_message()
    return JSONResponse(status_code=503, content={"detail": message, "code": "memoria_insuficiente"})


async def memory_error_handler(request: Request, exc: MemoryError) -> JSONResponse:
    return await _memory_error_response(exc, scope_lang(request.scope))


async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    lang = scope_lang(request.scope)
    if is_out_of_memory(exc):
        return await _memory_error_response(exc, lang)
    reason = str(exc).strip()
    if reason:
        message = t("server.error.unexpected", lang, reason=reason)
    else:
        message = t("server.error.unexpected_retry", lang)
    return JSONResponse(status_code=500, content={"detail": message, "code": "erro_interno"})
