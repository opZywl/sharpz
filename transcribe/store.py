from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import threading
import time
import uuid
from collections import deque
from pathlib import Path

from src.i18n import get_lang, t, use_lang
from transcribe import complete as complete_mod
from transcribe.config import BACKEND_PYTHON, OUTPUT_ROOT, VENV_PYTHON, _load_hf_token
from transcribe.errors import JobCanceled, JobFailed, _engine_died, _spawn_failed
from transcribe.formats import to_txt
from transcribe.job_state import _apply_event, _engine_args, _public_view, _terminal_event, engine_argv, job_fingerprint
from transcribe.process import PRIORITY_FLAGS, _kill, _log, _parse_event, _spawn, _wait
from transcribe.worker_client import WorkerClient

TERMINAL_EVENTS = ("done", "error", "canceled")
HEARTBEAT_S = 15.0
DOWNLOAD_PCT = re.compile(r"\[download\]\s+(\d+(?:\.\d+)?)%")
PARTIAL_SUFFIXES = (".part", ".ytdl", ".tmp", ".temp")


class JobStore:
    def __init__(
        self,
        output_root: Path = OUTPUT_ROOT,
        worker_cmd: list | None = None,
        engine_cmd: list | None = None,
        heartbeat_s: float = HEARTBEAT_S,
        use_worker: bool | None = None,
    ) -> None:
        self.output_root = Path(output_root)
        self.log_path = self.output_root / "_worker.log"
        self.upload_dir = self.output_root / "_uploads"
        self.engine_cmd = list(engine_cmd or [VENV_PYTHON, "-m", "transcribe.engine"])
        self.heartbeat_s = heartbeat_s
        self.use_worker = os.environ.get("SHARPZ_WORKER", "1") != "0" if use_worker is None else use_worker
        self.worker = WorkerClient(worker_cmd or [VENV_PYTHON, "-m", "transcribe.worker"], self.log_path)
        self._lock = threading.RLock()
        self._events = threading.Condition(self._lock)
        self._work = threading.Condition(self._lock)
        self._jobs: dict[str, dict] = {}
        self._pending: deque[str] = deque()
        self._thread: threading.Thread | None = None

    def enqueue(self, options: dict) -> tuple[str, bool]:
        fingerprint = job_fingerprint(options)
        with self._lock:
            for job in self._jobs.values():
                if not job["closed"] and job["fingerprint"] == fingerprint:
                    return job["job_id"], True
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
                "options": dict(options),
                "input_path": options.get("input_path"),
                "complete": None,
                "model": options.get("model"),
                "text": None,
                "events": [],
                "closed": False,
                "fingerprint": fingerprint,
                "proc": None,
                "lang": get_lang(),
            }
            self._jobs[job_id] = job
            self._pending.append(job_id)
            self._append_locked(job, {"type": "stage", "stage": "queued", "status": "start", "detail": ""})
            if self._thread is None or not self._thread.is_alive():
                self._thread = threading.Thread(target=self._run, name="transcribe-jobs", daemon=True)
                self._thread.start()
            self._work.notify()
        return job_id, False

    def exists(self, job_id: str) -> bool:
        with self._lock:
            return job_id in self._jobs

    def get(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return None if job is None else _public_view(job)

    def get_text(self, job_id: str) -> str | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            if job["text"] is not None:
                return job["text"]
            segments = list(job["segments"])
        return to_txt(segments)

    def get_file(self, job_id: str, fmt: str) -> Path | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            filename = job["files"].get(fmt)
        if not filename:
            return None
        path = self.output_root / job_id / filename
        return path if path.exists() else None

    def get_input_path(self, job_id: str) -> Path | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            input_path = job.get("input_path")
        if not input_path:
            return None
        path = Path(input_path)
        return path if path.exists() else None

    def get_segments(self, job_id: str) -> list[dict] | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            return list(job["segments"])

    def wait_events(self, job_id: str, after: int, timeout: float) -> tuple[list[tuple[int, dict]], bool] | None:
        cursor = max(0, int(after or 0))
        deadline = time.monotonic() + max(0.0, timeout)
        with self._events:
            while True:
                job = self._jobs.get(job_id)
                if job is None:
                    return None
                log = job["events"]
                if len(log) > cursor:
                    return [(index + 1, log[index]) for index in range(cursor, len(log))], job["closed"]
                if job["closed"]:
                    return ([(len(log), log[-1])] if log else []), True
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return [], False
                self._events.wait(remaining)

    def stream(self, job_id: str, after: int = 0):
        cursor = max(0, int(after or 0))
        while True:
            batch = self.wait_events(job_id, cursor, self.heartbeat_s)
            if batch is None:
                return
            events, closed = batch
            if not events:
                yield ": ping\n\n"
                continue
            for event_id, event in events:
                yield f"id: {event_id}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"
                cursor = max(cursor, event_id)
            if closed:
                return

    def cancel(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            if job["closed"]:
                return {"ok": False, "status": job["status"]}
            if job_id in self._pending:
                self._pending.remove(job_id)
            running = job["status"] == "running"
            proc = job.get("proc")
            input_path = job.get("input_path")
            self._close_locked(job, "canceled")
        if running:
            _kill(proc)
            self.worker.cancel(job_id)
        else:
            self._discard_upload(input_path)
        return {"ok": True, "status": "canceled"}

    def _discard_upload(self, input_path) -> None:
        if not input_path:
            return
        try:
            path = Path(input_path).resolve()
            if self.upload_dir.resolve() in path.parents:
                path.unlink(missing_ok=True)
        except OSError:
            pass

    def _discard_failed_upload(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job["status"] not in ("canceled", "error"):
                return
            input_path = job.get("input_path")
        self._discard_upload(input_path)

    def _append_locked(self, job: dict, event: dict) -> None:
        job["events"].append(event)
        if event.get("type") in TERMINAL_EVENTS:
            job["closed"] = True
        self._events.notify_all()

    def _close_locked(self, job: dict, status: str, **fields) -> None:
        job.update(fields)
        job["status"] = status
        job["stage"] = status
        job["proc"] = None
        if status == "done":
            job["pct"] = 1.0
        self._append_locked(job, _terminal_event(job))
        self._write_meta_locked(job)

    def _finish(self, job_id: str, status: str, **fields) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job["closed"]:
                return False
            self._close_locked(job, status, **fields)
            return True

    def _stopped(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            return job is None or job["closed"]

    def _check_stopped(self, job_id: str) -> None:
        if self._stopped(job_id):
            raise JobCanceled()

    def _update(self, job_id: str, **fields) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None and not job["closed"]:
                job.update(fields)

    def _handle_event(self, job_id: str, event: dict) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job["closed"]:
                return
            _apply_event(job, event)
            self._append_locked(job, event)

    def _attach(self, job_id: str, proc) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            stopped = job is None or job["closed"]
            if not stopped:
                job["proc"] = proc
        if stopped:
            _kill(proc)
            raise JobCanceled()

    def _detach(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job["proc"] = None

    def _run(self) -> None:
        while True:
            with self._work:
                while not self._pending:
                    self._work.wait()
                job_id = self._pending.popleft()
                job = self._jobs.get(job_id)
                if job is None or job["closed"]:
                    continue
                job["status"] = "running"
                started = {"type": "stage", "stage": "start", "status": "start", "detail": ""}
                _apply_event(job, started)
                self._append_locked(job, started)
                lang = job.get("lang")
            with use_lang(lang):
                try:
                    self._process(job_id)
                except Exception as exc:
                    self._finish(job_id, "error", error=t("transcribe.unexpected", error=exc))
                    self._discard_failed_upload(job_id)

    def _process(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            options = dict(job["options"]) if job else None
        if options is None:
            return
        out_dir = self.output_root / job_id
        started = time.perf_counter()
        try:
            out_dir.mkdir(parents=True, exist_ok=True)
            input_path = options.get("input_path")
            if not input_path and options.get("url"):
                input_path = str(self._download_url(job_id, options["url"], out_dir))
                with self._lock:
                    job = self._jobs.get(job_id)
                    if job is not None:
                        job["input_path"] = input_path
                        job["options"]["input_path"] = input_path
                options["input_path"] = input_path
            if not input_path:
                raise JobFailed(t("transcribe.no_audio"))
            result = self._transcribe(job_id, _engine_args(options, input_path, out_dir, job_id), options)
            files = result.get("files") or {}
            if options.get("mode") == "complete":
                if options.get("gen_docs"):
                    self.worker.shutdown()
                self._run_complete(job_id, options, Path(input_path), out_dir)
            text = self._read_text(job_id, out_dir, files)
            self._finish(job_id, "done", text=text, elapsed=round(time.perf_counter() - started, 2))
        except JobCanceled:
            pass
        except JobFailed as exc:
            self._finish(job_id, "error", error=str(exc), elapsed=round(time.perf_counter() - started, 2))
        except Exception as exc:
            self._finish(
                job_id,
                "error",
                error=t("transcribe.unexpected", error=exc),
                elapsed=round(time.perf_counter() - started, 2),
            )
        finally:
            self._detach(job_id)
            self._discard_failed_upload(job_id)

    def _transcribe(self, job_id: str, args: dict, options: dict) -> dict:
        self._check_stopped(job_id)
        if self.use_worker and not options.get("diarize"):
            kind, payload = self.worker.run(
                job_id,
                args,
                lambda event: self._handle_event(job_id, event),
                lambda: self._stopped(job_id),
            )
            if kind != "nostart":
                return self._outcome(job_id, kind, payload)
            _log(self.log_path, "worker", f"motor quente indisponível, usando o motor avulso: {payload.get('detail') or payload.get('code')}")
        self.worker.shutdown()
        return self._run_engine(job_id, args, options)

    def _outcome(self, job_id: str, kind: str, payload: dict) -> dict:
        if kind == "canceled" or self._stopped(job_id):
            raise JobCanceled()
        if kind == "error":
            raise JobFailed(payload.get("message") or t("transcribe.engine_failed"))
        if kind != "done":
            raise JobFailed(_engine_died(payload))
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None and not job["closed"]:
                job["files"] = dict(payload.get("files") or {})
                for stage in payload.get("degraded") or []:
                    if stage not in job["degraded"]:
                        job["degraded"].append(stage)
        return payload

    def _run_engine(self, job_id: str, args: dict, options: dict) -> dict:
        token = options.get("hf_token") or _load_hf_token()
        env_extra = {"SHARPZ_ENGINE_LANG": get_lang()}
        if token:
            env_extra["HF_TOKEN"] = token
        try:
            proc, pump = _spawn(
                self.engine_cmd + engine_argv(args),
                self.log_path,
                f"engine {job_id[:8]}",
                env_extra=env_extra,
            )
        except OSError as exc:
            raise _spawn_failed(exc) from exc
        self._attach(job_id, proc)
        outcome = None
        try:
            for raw in proc.stdout:
                event = _parse_event(raw)
                if event is None:
                    continue
                if event["type"] in ("done", "error"):
                    outcome = event
                    continue
                self._handle_event(job_id, event)
        except (OSError, ValueError):
            pass
        code = _wait(proc)
        self._detach(job_id)
        if outcome is not None and outcome["type"] == "done" and code == 0:
            return self._outcome(job_id, "done", outcome)
        if outcome is not None and outcome["type"] == "error":
            return self._outcome(job_id, "error", outcome)
        return self._outcome(job_id, "died", {"code": code, "detail": pump.last_line() if pump else ""})

    def _download_url(self, job_id: str, url: str, out_dir: Path) -> Path:
        self._handle_event(job_id, {"type": "stage", "stage": "download", "status": "start", "detail": ""})
        python = BACKEND_PYTHON if BACKEND_PYTHON.exists() else Path(sys.executable)
        argv = [
            python, "-m", "yt_dlp",
            "-f", "bestaudio/best",
            "--newline",
            "--no-playlist",
            "-o", str(out_dir / "source.%(ext)s"),
            "--",
            url,
        ]
        try:
            proc, pump = _spawn(argv, self.log_path, f"yt-dlp {job_id[:8]}")
        except OSError as exc:
            raise JobFailed(t("transcribe.ytdlp_failed", error=exc)) from exc
        self._attach(job_id, proc)
        last_pct = -1.0
        try:
            for raw in proc.stdout:
                match = DOWNLOAD_PCT.search(raw)
                if not match:
                    continue
                pct = min(float(match.group(1)) / 100.0, 1.0)
                if pct - last_pct >= 0.01 or (pct >= 1.0 > last_pct):
                    last_pct = pct
                    self._handle_event(job_id, {"type": "progress", "pct": pct, "stage": "download"})
        except (OSError, ValueError):
            pass
        code = _wait(proc)
        self._detach(job_id)
        self._check_stopped(job_id)
        if code != 0:
            detail = pump.last_line() if pump else ""
            message = t("transcribe.download_failed")
            raise JobFailed(message + t("transcribe.detail", detail=detail) if detail else message)
        candidates = sorted(
            path for path in out_dir.glob("source.*")
            if path.is_file() and path.suffix.lower() not in PARTIAL_SUFFIXES
        )
        if not candidates:
            raise JobFailed(t("transcribe.download_missing"))
        self._handle_event(job_id, {"type": "stage", "stage": "download", "status": "done", "detail": ""})
        return candidates[0]

    def _run_ff(self, job_id: str, argv: list) -> tuple[int, str]:
        self._check_stopped(job_id)
        proc = subprocess.Popen(
            [str(item) for item in argv],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=PRIORITY_FLAGS,
        )
        self._attach(job_id, proc)
        try:
            code = proc.wait()
        finally:
            self._detach(job_id)
        self._check_stopped(job_id)
        return code, ""

    def _run_complete(self, job_id: str, options: dict, input_path: Path, out_dir: Path) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            segments = list(job["segments"])
            info = {"language": job["language"], "duration": job["duration"], "model": options.get("model")}

        def emit(event: dict) -> None:
            if self._stopped(job_id):
                raise JobCanceled()
            self._handle_event(job_id, event)

        try:
            manifest = complete_mod.run(
                job_id, input_path, out_dir, segments, info, options, emit,
                run_ff=lambda argv: self._run_ff(job_id, argv),
                should_stop=lambda: self._stopped(job_id),
            )
        except JobCanceled:
            raise
        except complete_mod.Canceled as exc:
            raise JobCanceled() from exc
        except Exception as exc:
            emit({"type": "stage", "stage": "complete", "status": "skipped", "detail": str(exc)})
            return
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job["closed"]:
                return
            manifest = {**complete_mod.empty_manifest(job_id, out_dir, options), **(manifest or {})}
            job["complete"] = manifest
            for stage in manifest.get("degraded", []):
                if stage not in job["degraded"]:
                    job["degraded"].append(stage)

    def _read_text(self, job_id: str, out_dir: Path, files: dict) -> str:
        filename = files.get("txt")
        if filename:
            try:
                return (out_dir / filename).read_text(encoding="utf-8")
            except OSError:
                pass
        return to_txt(self.get_segments(job_id) or [])

    def get_complete_manifest(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            return dict(job["complete"]) if job.get("complete") else None

    def get_complete_file(self, job_id: str, rel: str) -> Path | None:
        base = (self.output_root / job_id).resolve()
        try:
            target = (base / rel).resolve()
        except (OSError, ValueError):
            return None
        if base != target and base not in target.parents:
            return None
        return target if target.exists() and target.is_file() else None

    def get_zip(self, job_id: str) -> Path | None:
        manifest = self.get_complete_manifest(job_id)
        if not manifest or not manifest.get("zip"):
            return None
        path = Path(manifest["zip"])
        return path if path.exists() else None

    def open_complete_folder(self, job_id: str) -> bool:
        manifest = self.get_complete_manifest(job_id)
        target = None
        if manifest and manifest.get("dest_dir") and Path(manifest["dest_dir"]).exists():
            target = Path(manifest["dest_dir"])
        else:
            candidate = self.output_root / job_id
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

    def _write_meta_locked(self, job: dict) -> None:
        out_dir = self.output_root / job["job_id"]
        if not out_dir.is_dir():
            return
        view = _public_view(job)
        view.pop("text", None)
        try:
            (out_dir / "meta.json").write_text(json.dumps(view, ensure_ascii=False, indent=2), encoding="utf-8")
        except (OSError, TypeError, ValueError):
            pass


STORE = JobStore()
