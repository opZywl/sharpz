from __future__ import annotations

from src.i18n import t
from transcribe import complete as complete_mod


class JobCanceled(complete_mod.Canceled):
    pass


class JobFailed(Exception):
    pass


def _spawn_failed(exc: OSError) -> JobFailed:
    return JobFailed(t("transcribe.spawn_failed", error=exc))


def _engine_died(payload: dict) -> str:
    code = payload.get("code")
    message = t("transcribe.engine_died")
    if code is not None:
        message += t("transcribe.engine_died_code", code=code)
    message += t("transcribe.engine_died_hint")
    detail = payload.get("detail")
    if detail:
        message += t("transcribe.detail", detail=detail)
    return message
