from __future__ import annotations

import json
import os
import queue
import subprocess
import threading
import time
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
VENV_PYTHON = REPO_ROOT / "whisper-venv" / "Scripts" / "python.exe"
OUTPUT_ROOT = REPO_ROOT / "output" / "transcripts"
UPLOAD_DIR = OUTPUT_ROOT / "_uploads"

VALID_MODELS = [
    "tiny",
    "base",
    "small",
    "medium",
    "large-v2",
    "large-v3",
    "large-v3-turbo",
    "distil-large-v3",
]
DEFAULT_MODEL = "large-v3"

VALID_FORMATS = ["txt", "srt", "vtt", "json", "lrc"]

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
            "language": None,
            "duration": None,
            "segments": [],
            "files": {},
            "degraded": [],
            "error": None,
            "elapsed": None,
            "options": options,
            "events": queue.Queue(),
        }
        with self._lock:
            self._jobs[job_id] = job
        self._queue.put(job_id)
        return job_id

    def get(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            return _public_view(job)

    def get_file(self, job_id: str, fmt: str) -> Path | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            filename = job["files"].get(fmt)
        if not filename:
            return None
        path = OUTPUT_ROOT / job_id / filename
        return path if path.exists() else None

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

    def _run(self) -> None:
        while True:
            job_id = self._queue.get()
            try:
                self._process(job_id)
            except Exception as exc:
                self._set(job_id, status="error", error=str(exc))
                self._push(job_id, {"type": "error", "message": str(exc)})
            finally:
                self._close_stream(job_id)

    def _process(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            options = dict(job["options"]) if job else None
        if options is None:
            return

        out_dir = OUTPUT_ROOT / job_id
        out_dir.mkdir(parents=True, exist_ok=True)

        argv = _build_argv(options, out_dir, job_id)
        env = dict(os.environ)
        env["PYTHONUTF8"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"

        self._set(job_id, status="running", stage="start")
        start = time.perf_counter()

        proc = subprocess.Popen(
            argv,
            cwd=str(REPO_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
        )

        for raw in proc.stdout:
            line = raw.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            self._apply_event(job_id, event)
            self._push(job_id, event)

        proc.wait()
        stderr = proc.stderr.read() if proc.stderr else ""
        elapsed = round(time.perf_counter() - start, 2)

        if proc.returncode == 0:
            with self._lock:
                job = self._jobs.get(job_id)
                final_elapsed = job.get("elapsed") if job else None
            self._set(
                job_id,
                status="done",
                pct=1.0,
                stage="done",
                elapsed=final_elapsed if final_elapsed is not None else elapsed,
            )
            self._write_meta(job_id, out_dir)
            self._push(job_id, _final_event(self.get(job_id)))
        else:
            message = (stderr or "").strip() or f"motor finalizou com codigo {proc.returncode}"
            self._set(job_id, status="error", stage="error", error=message, elapsed=elapsed)
            self._push(job_id, {"type": "error", "message": message})

    def _apply_event(self, job_id: str, event: dict) -> None:
        kind = event.get("type")
        if kind == "meta":
            self._set(
                job_id,
                language=event.get("language"),
                duration=event.get("duration"),
            )
        elif kind == "progress":
            fields = {}
            if event.get("pct") is not None:
                fields["pct"] = float(event["pct"])
            if event.get("stage"):
                fields["stage"] = event["stage"]
            if fields:
                self._set(job_id, **fields)
        elif kind == "segment":
            with self._lock:
                job = self._jobs.get(job_id)
                if job is not None:
                    job["segments"].append(
                        {
                            "start": event.get("start"),
                            "end": event.get("end"),
                            "text": event.get("text", ""),
                            "speaker": event.get("speaker"),
                            "words": event.get("words"),
                        }
                    )
        elif kind == "stage":
            stage = event.get("stage")
            if stage:
                self._set(job_id, stage=stage)
            if event.get("status") == "skipped" and stage:
                with self._lock:
                    job = self._jobs.get(job_id)
                    if job is not None and stage not in job["degraded"]:
                        job["degraded"].append(stage)
        elif kind == "done":
            fields = {}
            files = event.get("files")
            if files:
                fields["files"] = files
            if event.get("elapsed") is not None:
                fields["elapsed"] = event["elapsed"]
            degraded = event.get("degraded")
            if degraded:
                fields["degraded"] = degraded
            if fields:
                self._set(job_id, **fields)

    def _write_meta(self, job_id: str, out_dir: Path) -> None:
        snapshot = self.get(job_id)
        if snapshot is None:
            return
        meta_path = out_dir / "meta.json"
        with meta_path.open("w", encoding="utf-8") as handle:
            json.dump(snapshot, handle, ensure_ascii=False, indent=2)


def _public_view(job: dict) -> dict:
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "pct": job["pct"],
        "stage": job["stage"],
        "language": job["language"],
        "duration": job["duration"],
        "segments": list(job["segments"]),
        "files": dict(job["files"]),
        "degraded": list(job["degraded"]),
        "error": job["error"],
        "elapsed": job["elapsed"],
        "options": dict(job["options"]),
    }


def _final_event(snapshot: dict) -> dict:
    if snapshot["status"] == "error":
        return {"type": "error", "message": snapshot.get("error") or "erro desconhecido"}
    return {
        "type": "done",
        "files": snapshot["files"],
        "segments": len(snapshot["segments"]),
        "degraded": snapshot["degraded"],
        "elapsed": snapshot["elapsed"],
    }


def _build_argv(options: dict, out_dir: Path, job_id: str) -> list[str]:
    formats = options.get("formats") or ["txt", "srt", "vtt", "json", "lrc"]
    formats_csv = ",".join(formats)
    argv = [
        str(VENV_PYTHON),
        "-m",
        "transcribe.engine",
        "--input",
        str(options["input_path"]),
        "--out-dir",
        str(out_dir),
        "--job-id",
        job_id,
        "--model",
        options.get("model") or DEFAULT_MODEL,
        "--language",
        options.get("language") or "auto",
        "--formats",
        formats_csv,
    ]
    if options.get("vad"):
        argv.append("--vad")
    if options.get("word_timestamps"):
        argv.append("--word-timestamps")
    if options.get("diarize"):
        argv.append("--diarize")
    if options.get("translate"):
        argv.append("--translate")
    if options.get("hf_token"):
        argv.extend(["--hf-token", str(options["hf_token"])])
    if options.get("min_speakers") is not None:
        argv.extend(["--min-speakers", str(options["min_speakers"])])
    if options.get("max_speakers") is not None:
        argv.extend(["--max-speakers", str(options["max_speakers"])])
    if options.get("threads") is not None:
        argv.extend(["--threads", str(options["threads"])])
    return argv


def model_catalog() -> list[dict]:
    hub = Path.home() / ".cache" / "huggingface" / "hub"
    catalog = []
    for key in VALID_MODELS:
        folder = hub / f"models--Systran--faster-whisper-{key}"
        catalog.append(
            {
                "key": key,
                "label": _model_label(key),
                "downloaded": folder.exists(),
                "is_default": key == DEFAULT_MODEL,
            }
        )
    return catalog


def _model_label(key: str) -> str:
    labels = {
        "tiny": "Tiny",
        "base": "Base",
        "small": "Small",
        "medium": "Medium",
        "large-v2": "Large v2",
        "large-v3": "Large v3",
        "large-v3-turbo": "Large v3 Turbo",
        "distil-large-v3": "Distil Large v3",
    }
    return labels.get(key, key)


def venv_available() -> bool:
    return VENV_PYTHON.exists()


def whisperx_available() -> bool:
    site_packages = REPO_ROOT / "whisper-venv" / "Lib" / "site-packages"
    if (site_packages / "whisperx").exists():
        return True
    for entry in site_packages.glob("whisperx*"):
        if entry.is_dir():
            return True
    return False


STORE = JobStore()
