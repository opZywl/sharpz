from __future__ import annotations

import gc
import json
import os
import queue
import sys
import threading

from src.i18n import t, use_lang
from transcribe import engine

IDLE_SECONDS = float(os.environ.get("SHARPZ_WORKER_IDLE_S") or 300)


class ModelCache:
    def __init__(self) -> None:
        self.key: tuple | None = None
        self.model = None

    def get(self, args, emit_fn):
        key = (str(args.model), engine.COMPUTE_TYPE, int(args.threads or engine.DEFAULT_THREADS))
        if self.model is not None and self.key == key:
            return self.model
        self.clear()
        self.model = engine.load_whisper_model(key[0], key[2], emit_fn)
        self.key = key
        return self.model

    def clear(self) -> None:
        self.model = None
        self.key = None
        gc.collect()


def read_requests(inbox: queue.Queue) -> None:
    for line in sys.stdin:
        if line.strip():
            inbox.put(line)
    os._exit(0)


def handle(raw: str, cache: ModelCache) -> None:
    try:
        request = json.loads(raw)
    except json.JSONDecodeError:
        return
    if not isinstance(request, dict) or request.get("type") != "job":
        return
    job_id = str(request.get("job_id") or "")

    def emit_fn(event: dict) -> None:
        engine.emit({**event, "job_id": job_id})

    with use_lang(request.get("lang")):
        try:
            args = engine.args_from_dict({**(request.get("args") or {}), "job_id": job_id})
        except (KeyError, TypeError, ValueError, SystemExit) as exc:
            emit_fn({"type": "error", "message": t("transcribe.bad_request", error=exc)})
            return
        failure = engine.run_job(args, emit_fn, cache.get)
    if failure is not None and engine.is_memory_error(failure):
        cache.clear()


def main() -> None:
    engine.configure_output()
    inbox: queue.Queue = queue.Queue()
    threading.Thread(target=read_requests, args=(inbox,), daemon=True).start()
    cache = ModelCache()
    while True:
        try:
            raw = inbox.get(timeout=IDLE_SECONDS)
        except queue.Empty:
            break
        handle(raw, cache)
    for stream in (sys.stdout, sys.stderr, sys.__stdout__):
        try:
            stream.flush()
        except (AttributeError, OSError, ValueError):
            pass
    os._exit(0)


if __name__ == "__main__":
    main()
