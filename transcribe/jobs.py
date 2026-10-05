from __future__ import annotations

import ast
import functools
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import threading
import time
import uuid
from collections import deque
from pathlib import Path

from transcribe import complete as complete_mod
from transcribe.formats import to_txt

REPO_ROOT = Path(__file__).resolve().parent.parent
VENV_PYTHON = REPO_ROOT / "whisper-venv" / "Scripts" / "python.exe"
BACKEND_PYTHON = REPO_ROOT / "venv" / "Scripts" / "python.exe"
WHISPER_SITE = REPO_ROOT / "whisper-venv" / "Lib" / "site-packages"
DOWNLOAD_SCRIPT = REPO_ROOT / "tools" / "download_model.py"
OUTPUT_ROOT = REPO_ROOT / "output" / "transcripts"
UPLOAD_DIR = OUTPUT_ROOT / "_uploads"

MODEL_INFO = {
    "tiny": {"label": "Tiny", "size_mb": 77, "english_only": False},
    "base": {"label": "Base", "size_mb": 148, "english_only": False},
    "small": {"label": "Small", "size_mb": 486, "english_only": False},
    "medium": {"label": "Medium", "size_mb": 1532, "english_only": False},
    "large-v2": {"label": "Large v2", "size_mb": 3090, "english_only": False},
    "large-v3": {"label": "Large v3", "size_mb": 3091, "english_only": False},
    "large-v3-turbo": {"label": "Large v3 Turbo", "size_mb": 1622, "english_only": False},
    "distil-large-v3": {"label": "Distil Large v3", "size_mb": 1514, "english_only": True},
}
FALLBACK_REPOS = {
    "tiny": "Systran/faster-whisper-tiny",
    "base": "Systran/faster-whisper-base",
    "small": "Systran/faster-whisper-small",
    "medium": "Systran/faster-whisper-medium",
    "large-v2": "Systran/faster-whisper-large-v2",
    "large-v3": "Systran/faster-whisper-large-v3",
    "large-v3-turbo": "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
    "distil-large-v3": "Systran/faster-distil-whisper-large-v3",
}
VALID_MODELS = list(MODEL_INFO)
MODEL_ALIASES = {"turbo": "large-v3-turbo", "large": "large-v3"}
AUTO_MODEL = "auto"
DEFAULT_MODEL = AUTO_MODEL
FAST_MODEL = "large-v3-turbo"
ACCURATE_MODEL = "large-v3"

VALID_FORMATS = ["txt", "srt", "vtt", "json", "lrc"]
TERMINAL_EVENTS = ("done", "error", "canceled")
HEARTBEAT_S = 15.0
LOG_MAX_BYTES = 5 * 1024 * 1024
PRIORITY_FLAGS = getattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS", 0)
SECRET_KEY = re.compile(r"token|secret|password|passwd|api[_-]?key|authorization", re.IGNORECASE)
DOWNLOAD_PCT = re.compile(r"\[download\]\s+(\d+(?:\.\d+)?)%")
PARTIAL_SUFFIXES = (".part", ".ytdl", ".tmp", ".temp")

_LOG_LOCK = threading.Lock()


class JobCanceled(Exception):
    pass


class JobFailed(Exception):
    pass


def _load_hf_token() -> str | None:
    token = os.environ.get("HF_TOKEN")
    if token:
        return token.strip()
    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        try:
            for line in env_path.read_text(encoding="utf-8").splitlines():
                stripped = line.strip()
                if stripped.startswith("HF_TOKEN=") and not stripped.startswith("#"):
                    return stripped.split("=", 1)[1].strip().strip('"').strip("'")
        except Exception:
            pass
    return None


def hf_hub_dir() -> Path:
    for name in ("HF_HUB_CACHE", "HUGGINGFACE_HUB_CACHE"):
        value = os.environ.get(name)
        if value:
            return Path(value).expanduser()
    home = os.environ.get("HF_HOME")
    if home:
        return Path(home).expanduser() / "hub"
    cache = os.environ.get("XDG_CACHE_HOME")
    base = Path(cache).expanduser() if cache else Path.home() / ".cache"
    return base / "huggingface" / "hub"


@functools.lru_cache(maxsize=1)
def model_repos() -> dict[str, str]:
    repos = dict(FALLBACK_REPOS)
    try:
        tree = ast.parse((WHISPER_SITE / "faster_whisper" / "utils.py").read_text(encoding="utf-8"))
    except (OSError, SyntaxError, ValueError):
        return repos
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "_MODELS" for t in node.targets):
            try:
                parsed = ast.literal_eval(node.value)
            except ValueError:
                break
            repos.update({str(key): str(value) for key, value in parsed.items()})
            break
    return repos


def repo_dir(key: str, hub: Path | None = None) -> Path | None:
    repo = model_repos().get(key)
    if not repo:
        return None
    return (hub or hf_hub_dir()) / ("models--" + repo.replace("/", "--"))


def model_cached(key: str, hub: Path | None = None) -> bool:
    folder = repo_dir(key, hub)
    if folder is None:
        return False
    snapshots = folder / "snapshots"
    try:
        commit = (folder / "refs" / "main").read_text(encoding="utf-8").strip()
    except OSError:
        commit = ""
    if commit:
        return (snapshots / commit / "model.bin").is_file()
    return any(path.is_file() for path in snapshots.glob("*/model.bin"))


def repo_bytes(key: str, hub: Path | None = None) -> int:
    folder = repo_dir(key, hub)
    if folder is None:
        return 0
    total = 0
    for root, _dirs, files in os.walk(folder):
        for name in files:
            try:
                info = os.lstat(os.path.join(root, name))
            except OSError:
                continue
            if stat.S_ISREG(info.st_mode):
                total += info.st_size
    return total


def normalize_model_key(value: str | None) -> str | None:
    key = (value or "").strip().lower()
    key = MODEL_ALIASES.get(key, key)
    return key if key in MODEL_INFO else None


def resolve_model(requested: str | None, translate: bool = False, hub: Path | None = None) -> str:
    key = normalize_model_key(requested)
    if translate and key in (None, FAST_MODEL):
        return ACCURATE_MODEL
    if key:
        return key
    return FAST_MODEL if model_cached(FAST_MODEL, hub) else ACCURATE_MODEL


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


def mask_secrets(value):
    if isinstance(value, dict):
        return {
            key: ("***" if item and SECRET_KEY.search(str(key)) else mask_secrets(item))
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [mask_secrets(item) for item in value]
    return value


def save_stream(source, target: Path, chunk_size: int = 1024 * 1024) -> tuple[int, str]:
    digest = hashlib.sha1()
    size = 0
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("wb") as handle:
        while True:
            chunk = source.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
            handle.write(chunk)
            size += len(chunk)
    return size, digest.hexdigest()


def job_fingerprint(options: dict) -> str:
    if options.get("source_sha1"):
        source = {"sha1": options["source_sha1"]}
    elif options.get("input_path"):
        path = Path(str(options["input_path"]))
        try:
            info = path.stat()
            source = {"path": os.path.normcase(str(path.resolve())), "mtime": info.st_mtime_ns, "size": info.st_size}
        except OSError:
            source = {"path": os.path.normcase(str(path))}
    else:
        source = {"url": (options.get("url") or "").strip()}
    settings = {
        key: value
        for key, value in options.items()
        if key not in ("input_path", "url", "source_sha1", "hf_token", "vision")
    }
    vision = options.get("vision") or {}
    settings["hf_token"] = bool(options.get("hf_token"))
    settings["vision"] = {
        "base_url": vision.get("base_url"),
        "model": vision.get("model"),
        "api_key": bool(vision.get("api_key")),
    }
    payload = json.dumps([source, settings], sort_keys=True, default=str)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def engine_argv(args: dict) -> list[str]:
    argv = [
        "--input", str(args["input"]),
        "--out-dir", str(args["out_dir"]),
        "--job-id", str(args["job_id"]),
        "--model", str(args["model"]),
        "--language", str(args["language"]),
        "--formats", str(args["formats"]),
    ]
    for flag in ("vad", "word_timestamps", "diarize", "translate"):
        if args.get(flag):
            argv.append("--" + flag.replace("_", "-"))
    for key in ("min_speakers", "max_speakers", "threads"):
        if args.get(key) is not None:
            argv.extend(["--" + key.replace("_", "-"), str(args[key])])
    return argv


def _log(path: Path, label: str, line: str) -> None:
    text = line.rstrip()
    if not text:
        return
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    with _LOG_LOCK:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as handle:
                handle.write(f"{stamp} [{label}] {text}\n")
        except OSError:
            pass


def _rotate_log(path: Path) -> None:
    with _LOG_LOCK:
        try:
            if path.stat().st_size > LOG_MAX_BYTES:
                path.replace(path.with_name(path.name + ".1"))
        except OSError:
            pass


class _Pump:
    def __init__(self, stream, log_path: Path, label: str) -> None:
        self.tail: deque[str] = deque(maxlen=40)
        self._thread = threading.Thread(target=self._run, args=(stream, log_path, label), daemon=True)
        self._thread.start()

    def _run(self, stream, log_path: Path, label: str) -> None:
        try:
            for line in stream:
                text = line.rstrip()
                if text:
                    self.tail.append(text)
                    _log(log_path, label, text)
        except (OSError, ValueError):
            pass
        finally:
            try:
                stream.close()
            except OSError:
                pass

    def last_line(self, timeout: float = 2.0) -> str:
        self._thread.join(timeout)
        return self.tail[-1].strip() if self.tail else ""


def _spawn(argv: list, log_path: Path, label: str, *, stdin: bool = False, merge: bool = False, env_extra: dict | None = None):
    env = dict(os.environ)
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    if env_extra:
        env.update(env_extra)
    proc = subprocess.Popen(
        [str(item) for item in argv],
        cwd=str(REPO_ROOT),
        stdin=subprocess.PIPE if stdin else subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT if merge else subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        creationflags=PRIORITY_FLAGS,
    )
    pump = None if merge else _Pump(proc.stderr, log_path, label)
    return proc, pump


def _kill(proc) -> None:
    if proc is None:
        return
    try:
        if proc.poll() is None:
            proc.kill()
    except OSError:
        pass


def _parse_event(raw: str) -> dict | None:
    line = raw.strip()
    if not line.startswith("{"):
        return None
    try:
        event = json.loads(line)
    except json.JSONDecodeError:
        return None
    return event if isinstance(event, dict) and event.get("type") else None


def _spawn_failed(exc: OSError) -> JobFailed:
    return JobFailed(
        f"Não consegui iniciar o motor de transcrição ({exc}). "
        "Confira se o whisper-venv está instalado (rode o sharpz.cmd e escolha Instalar)."
    )


def _engine_died(payload: dict) -> str:
    code = payload.get("code")
    message = "O motor de transcrição fechou no meio do trabalho"
    if code is not None:
        message += f" (código {code})"
    message += (
        ". Isso costuma ser falta de memória: feche programas pesados e tente de novo. "
        "O próximo envio abre um motor novo."
    )
    detail = payload.get("detail")
    if detail:
        message += f" Detalhe: {detail}"
    return message


def _wait(proc) -> int | None:
    for stream in (proc.stdin, proc.stdout):
        try:
            if stream:
                stream.close()
        except OSError:
            pass
    try:
        return proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        _kill(proc)
        return proc.wait()


class WorkerClient:
    def __init__(self, command: list, log_path: Path) -> None:
        self.command = list(command)
        self.log_path = log_path
        self._lock = threading.Lock()
        self._proc = None
        self._pump: _Pump | None = None
        self._current: str | None = None

    def _ensure(self):
        with self._lock:
            if self._proc is not None and self._proc.poll() is None:
                return self._proc, self._pump
            if self._proc is not None:
                _wait(self._proc)
            _rotate_log(self.log_path)
            self._proc, self._pump = _spawn(self.command, self.log_path, "worker", stdin=True)
            return self._proc, self._pump

    def _release(self, proc, kill: bool = False) -> int | None:
        with self._lock:
            if self._proc is proc:
                self._proc = None
                self._pump = None
            self._current = None
        if kill:
            _kill(proc)
        return _wait(proc)

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            if self._current != job_id or self._proc is None:
                return False
            proc = self._proc
        _kill(proc)
        return True

    def shutdown(self) -> None:
        with self._lock:
            proc = self._proc
        _kill(proc)

    def run(self, job_id: str, args: dict, on_event, is_stopped) -> tuple[str, dict]:
        request = json.dumps({"type": "job", "job_id": job_id, "args": args}) + "\n"
        last = {"code": None, "detail": ""}
        for _attempt in range(2):
            try:
                proc, pump = self._ensure()
            except OSError as exc:
                return "nostart", {"code": None, "detail": str(exc)}
            with self._lock:
                self._current = job_id
            if is_stopped():
                with self._lock:
                    self._current = None
                return "canceled", {}
            try:
                proc.stdin.write(request)
                proc.stdin.flush()
            except (OSError, ValueError):
                last = {"code": self._release(proc, kill=True), "detail": pump.last_line() if pump else ""}
                continue
            started = False
            try:
                for raw in proc.stdout:
                    event = _parse_event(raw)
                    if event is None or event.pop("job_id", job_id) != job_id:
                        continue
                    started = True
                    if event["type"] in ("done", "error"):
                        with self._lock:
                            self._current = None
                        return event["type"], event
                    on_event(event)
            except (OSError, ValueError):
                pass
            code = self._release(proc)
            if is_stopped():
                return "canceled", {}
            last = {"code": code, "detail": pump.last_line() if pump else ""}
            if started:
                return "died", last
        return "nostart", last


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
            self._close_locked(job, "canceled")
        if running:
            _kill(proc)
            self.worker.cancel(job_id)
        return {"ok": True, "status": "canceled"}

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
                job["stage"] = "start"
            try:
                self._process(job_id)
            except Exception as exc:
                self._finish(job_id, "error", error=f"Erro inesperado na transcrição: {exc}")

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
                raise JobFailed("Nenhuma fonte de áudio disponível para este job.")
            result = self._transcribe(job_id, _engine_args(options, input_path, out_dir, job_id), options)
            files = result.get("files") or {}
            if options.get("mode") == "complete":
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
                error=f"Erro inesperado na transcrição: {exc}",
                elapsed=round(time.perf_counter() - started, 2),
            )
        finally:
            self._detach(job_id)

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
        return self._run_engine(job_id, args, options)

    def _outcome(self, job_id: str, kind: str, payload: dict) -> dict:
        if kind == "canceled" or self._stopped(job_id):
            raise JobCanceled()
        if kind == "error":
            raise JobFailed(payload.get("message") or "O motor de transcrição falhou sem detalhar o erro.")
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
        try:
            proc, pump = _spawn(
                self.engine_cmd + engine_argv(args),
                self.log_path,
                f"engine {job_id[:8]}",
                env_extra={"HF_TOKEN": token} if token else None,
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
            url,
        ]
        try:
            proc, pump = _spawn(argv, self.log_path, f"yt-dlp {job_id[:8]}")
        except OSError as exc:
            raise JobFailed(f"Não consegui iniciar o yt-dlp: {exc}") from exc
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
            message = "Falha ao baixar o áudio da URL. Verifique se o link é válido e acessível."
            raise JobFailed(f"{message} Detalhe: {detail}" if detail else message)
        candidates = sorted(
            path for path in out_dir.glob("source.*")
            if path.is_file() and path.suffix.lower() not in PARTIAL_SUFFIXES
        )
        if not candidates:
            raise JobFailed("O download terminou, mas o arquivo de áudio não foi encontrado.")
        self._handle_event(job_id, {"type": "stage", "stage": "download", "status": "done", "detail": ""})
        return candidates[0]

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
            manifest = complete_mod.run(job_id, input_path, out_dir, segments, info, options, emit)
        except JobCanceled:
            raise
        except Exception as exc:
            emit({"type": "stage", "stage": "complete", "status": "skipped", "detail": str(exc)})
            return
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or job["closed"]:
                return
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
                raise RuntimeError("O motor de transcrição não está instalado. Rode o sharpz.cmd, escolha Instalar e tente de novo.")
            argv = self._command(key) if self._command else [VENV_PYTHON, DOWNLOAD_SCRIPT, key]
            proc, _pump = _spawn(argv, self._log_path, f"download {key}", merge=True)
            self._state[key] = {"status": "running", "error": None}
        threading.Thread(target=self._watch, args=(key, proc), daemon=True).start()
        return "running"

    def _watch(self, key: str, proc) -> None:
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
            state = {"status": "error", "error": "O download terminou, mas o modelo não apareceu no cache do Hugging Face."}
        else:
            detail = f" Detalhe: {tail[-1]}" if tail else ""
            state = {"status": "error", "error": f"Falha ao baixar o modelo {key}.{detail}"}
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


def _apply_event(job: dict, event: dict) -> None:
    kind = event.get("type")
    if kind == "meta":
        job["language"] = event.get("language")
        job["duration"] = event.get("duration")
    elif kind == "progress":
        if event.get("pct") is not None:
            job["pct"] = float(event["pct"])
        if event.get("stage"):
            job["stage"] = event["stage"]
    elif kind == "segment":
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
            job["stage"] = stage
        if event.get("status") == "skipped" and stage and stage not in job["degraded"]:
            job["degraded"].append(stage)


def _terminal_event(job: dict) -> dict:
    if job["status"] == "canceled":
        return {"type": "canceled"}
    if job["status"] == "error":
        return {"type": "error", "message": job.get("error") or "Erro desconhecido na transcrição."}
    return {
        "type": "done",
        "files": dict(job["files"]),
        "segments": len(job["segments"]),
        "degraded": list(job["degraded"]),
        "elapsed": job["elapsed"],
    }


def _public_view(job: dict) -> dict:
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "pct": job["pct"],
        "progress": job["pct"],
        "stage": job["stage"],
        "language": job["language"],
        "duration": job["duration"],
        "segments": list(job["segments"]),
        "files": dict(job["files"]),
        "degraded": list(job["degraded"]),
        "error": job["error"],
        "elapsed": job["elapsed"],
        "options": mask_secrets(job["options"]),
        "input_path": job.get("input_path"),
        "complete": dict(job["complete"]) if job.get("complete") else None,
        "model": job["model"],
        "text": job["text"] if job["status"] == "done" else None,
        "last_event_id": len(job["events"]),
    }


def _engine_args(options: dict, input_path: str, out_dir: Path, job_id: str) -> dict:
    return {
        "input": str(input_path),
        "out_dir": str(out_dir),
        "job_id": job_id,
        "model": options.get("model") or resolve_model(AUTO_MODEL, bool(options.get("translate"))),
        "language": options.get("language") or "auto",
        "formats": ",".join(options.get("formats") or VALID_FORMATS),
        "vad": bool(options.get("vad")),
        "word_timestamps": bool(options.get("word_timestamps")),
        "diarize": bool(options.get("diarize")),
        "translate": bool(options.get("translate")),
        "min_speakers": options.get("min_speakers"),
        "max_speakers": options.get("max_speakers"),
        "threads": options.get("threads"),
    }


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
DOWNLOADS = ModelDownloads()
