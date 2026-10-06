from __future__ import annotations

import threading
from collections import deque
from pathlib import Path

from src.i18n import get_lang, t
from transcribe.config import DOWNLOAD_SCRIPT, OUTPUT_ROOT, VENV_PYTHON
from transcribe.models import AUTO_MODEL, MODEL_INFO, model_cached, repo_bytes, resolve_model
from transcribe.process import _log, _spawn, _wait


def model_catalog(hub: Path | None = None, downloads: "ModelDownloads | None" = None) -> list[dict]:
    resolved = resolve_model(AUTO_MODEL, hub=hub)
    tracker = downloads or DOWNLOADS
    return [
        {
            "key": key,
            "label": info["label"],
            "downloaded": model_cached(key, hub),
            "is_default": key == resolved,
            "english_only": info["english_only"],
            "size_mb": info["size_mb"],
            "downloading": tracker.is_running(key),
        }
        for key, info in MODEL_INFO.items()
    ]


class ModelDownloads:
    def __init__(self, command=None, hub: Path | None = None, log_path: Path | None = None) -> None:
        self._command = command
        self._hub = hub
        self._log_path = log_path or OUTPUT_ROOT / "_worker.log"
        self._lock = threading.Lock()
        self._state: dict[str, dict] = {}

    def is_running(self, key: str) -> bool:
        with self._lock:
            return (self._state.get(key) or {}).get("status") == "running"

    def start(self, key: str) -> str:
        if model_cached(key, self._hub):
            return "done"
        with self._lock:
            state = self._state.get(key)
            if state and state["status"] == "running":
                return "running"
            if self._command is None and not VENV_PYTHON.exists():
                raise RuntimeError(t("transcribe.engine_missing"))
            argv = self._command(key) if self._command else [VENV_PYTHON, DOWNLOAD_SCRIPT, key]
            proc, _pump = _spawn(argv, self._log_path, f"download {key}", merge=True)
            self._state[key] = {"status": "running", "error": None}
        threading.Thread(target=self._watch, args=(key, proc, get_lang()), daemon=True).start()
        return "running"

    def _watch(self, key: str, proc, lang: str | None = None) -> None:
        tail: deque[str] = deque(maxlen=5)
        try:
            for line in proc.stdout:
                text = line.strip()
                if text:
                    tail.append(text)
                    _log(self._log_path, f"download {key}", text)
        except (OSError, ValueError):
            pass
        code = _wait(proc)
        if code == 0 and model_cached(key, self._hub):
            state = {"status": "done", "error": None}
        elif code == 0:
            state = {"status": "error", "error": t("transcribe.model_not_cached", lang)}
        else:
            detail = t("transcribe.detail", lang, detail=tail[-1]) if tail else ""
            state = {"status": "error", "error": t("transcribe.model_download_failed", lang, key=key, detail=detail)}
        with self._lock:
            self._state[key] = state

    def status(self, key: str) -> dict:
        with self._lock:
            state = dict(self._state.get(key) or {"status": "idle", "error": None})
        if model_cached(key, self._hub):
            state = {"status": "done", "error": None}
        info = MODEL_INFO.get(key)
        return {
            "status": state["status"],
            "downloaded_bytes": repo_bytes(key, self._hub),
            "total_bytes": info["size_mb"] * 1_000_000 if info else None,
            "error": state["error"],
        }


DOWNLOADS = ModelDownloads()
