from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from collections import deque
from pathlib import Path

from transcribe.config import REPO_ROOT

LOG_MAX_BYTES = 5 * 1024 * 1024
PRIORITY_FLAGS = getattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS", 0)

_LOG_LOCK = threading.Lock()


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
