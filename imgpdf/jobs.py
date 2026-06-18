"""JobStore do modo Imagem -> PDF: worker + fila de eventos + SSE (in-process).

Espelha o padrao de transcribe/jobs.py, mas roda o pipeline no proprio backend
(PyMuPDF/Pillow/urllib estao no venv), sem subprocess.
"""

from __future__ import annotations

import json
import os
import queue
import subprocess
import threading
import time
import uuid
from pathlib import Path

from imgpdf import pipeline as pipeline_mod

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_ROOT = REPO_ROOT / "output" / "pdf"
UPLOAD_DIR = OUTPUT_ROOT / "_uploads"

_SENTINEL = object()


class JobStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._jobs: dict[str, dict] = {}
        self._queue: queue.Queue = queue.Queue()
        self._worker = threading.Thread(target=self._run, daemon=True)
        self._worker.start()

    def enqueue(self, options: dict) -> str:
        job_id = uuid.uuid4().hex
        job = {
            "job_id": job_id,
            "status": "queued",
            "pct": 0.0,
            "stage": "queued",
            "logs": [],
            "manifest": None,
            "degraded": [],
            "error": None,
            "elapsed": None,
            "options": options,
            "input_path": options.get("input_path"),
            "events": queue.Queue(),
        }
        with self._lock:
            self._jobs[job_id] = job
        self._queue.put(job_id)
        return job_id

    def get(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return _public_view(job) if job else None

    def get_pdf(self, job_id: str) -> Path | None:
        return self._manifest_path(job_id, "pdf")

    def get_text(self, job_id: str) -> Path | None:
        return self._manifest_path(job_id, "text_layer")

    def get_preview(self, job_id: str) -> Path | None:
        return self._manifest_path(job_id, "preview")

    def _manifest_path(self, job_id: str, key: str) -> Path | None:
        with self._lock:
            job = self._jobs.get(job_id)
            manifest = job.get("manifest") if job else None
        if not manifest or not manifest.get(key):
            return None
        path = Path(manifest[key])
        return path if path.exists() else None

    def open_folder(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            manifest = job.get("manifest") if job else None
        target = None
        if manifest:
            if manifest.get("dest_dir") and Path(manifest["dest_dir"]).exists():
                target = Path(manifest["dest_dir"])
            elif manifest.get("out_dir") and Path(manifest["out_dir"]).exists():
                target = Path(manifest["out_dir"])
        if target is None:
            candidate = OUTPUT_ROOT / job_id
            target = candidate if candidate.exists() else None
        if target is None:
            return False
        try:
            if os.name == "nt":
                os.startfile(str(target))  # noqa: S606
            else:
                subprocess.Popen(["xdg-open", str(target)])
            return True
        except Exception:
            return False

    def stream(self, job_id: str):
        with self._lock:
            job = self._jobs.get(job_id)
        if job is None:
            yield "data: " + json.dumps({"type": "error", "message": "job nao encontrado"}, ensure_ascii=False) + "\n\n"
            return
        events: queue.Queue = job["events"]
        snapshot = self.get(job_id)
        if snapshot and snapshot["status"] in ("done", "error"):
            yield "data: " + json.dumps(_final_event(snapshot), ensure_ascii=False) + "\n\n"
            return
        while True:
            event = events.get()
            if event is _SENTINEL:
                break
            yield "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"

    def _set(self, job_id: str, **fields) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job.update(fields)

    def _push(self, job_id: str, event: dict) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job["events"].put(event)

    def _close_stream(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job["events"].put(_SENTINEL)

    def _apply_event(self, job_id: str, event: dict) -> None:
        kind = event.get("type")
        if kind == "progress":
            fields = {}
            if event.get("pct") is not None:
                fields["pct"] = float(event["pct"])
            if event.get("stage"):
                fields["stage"] = event["stage"]
            if fields:
                self._set(job_id, **fields)
        elif kind == "stage":
            if event.get("stage"):
                self._set(job_id, stage=event["stage"])
        elif kind == "log":
            with self._lock:
                job = self._jobs.get(job_id)
                if job is not None:
                    job["logs"].append({"level": event.get("level", "info"), "message": event.get("message", "")})

    def _run(self) -> None:
        while True:
            job_id = self._queue.get()
            try:
                self._process(job_id)
            except Exception as exc:
                self._set(job_id, status="error", stage="error", error=str(exc))
                self._push(job_id, {"type": "error", "message": str(exc)})
            finally:
                self._close_stream(job_id)

    def _process(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            options = dict(job["options"]) if job else None
        if options is None:
            return
        if not options.get("input_path") or not Path(options["input_path"]).exists():
            message = "Imagem de entrada indisponivel para este job."
            self._set(job_id, status="error", stage="error", error=message)
            self._push(job_id, {"type": "error", "message": message})
            return

        out_dir = OUTPUT_ROOT / job_id
        out_dir.mkdir(parents=True, exist_ok=True)
        self._set(job_id, status="running", stage="start")
        start = time.perf_counter()

        def emit(event: dict) -> None:
            self._apply_event(job_id, event)
            self._push(job_id, event)

        try:
            manifest = pipeline_mod.run(job_id, Path(options["input_path"]), out_dir, options, emit)
        except Exception as exc:
            elapsed = round(time.perf_counter() - start, 2)
            self._set(job_id, status="error", stage="error", error=str(exc), elapsed=elapsed)
            self._push(job_id, {"type": "error", "message": str(exc)})
            return

        elapsed = round(time.perf_counter() - start, 2)
        self._set(
            job_id, status="done", pct=1.0, stage="done", elapsed=elapsed,
            manifest=manifest, degraded=manifest.get("degraded", []),
        )
        if options.get("open_folder"):
            self.open_folder(job_id)
        self._push(job_id, _final_event(self.get(job_id)))


def _public_view(job: dict) -> dict:
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "pct": job["pct"],
        "stage": job["stage"],
        "logs": list(job["logs"]),
        "manifest": dict(job["manifest"]) if job.get("manifest") else None,
        "degraded": list(job["degraded"]),
        "error": job["error"],
        "elapsed": job["elapsed"],
        "input_path": job.get("input_path"),
    }


def _final_event(snapshot: dict) -> dict:
    if snapshot["status"] == "error":
        return {"type": "error", "message": snapshot.get("error") or "erro desconhecido"}
    return {
        "type": "done",
        "manifest": snapshot.get("manifest"),
        "degraded": snapshot.get("degraded"),
        "elapsed": snapshot.get("elapsed"),
    }


STORE = JobStore()
