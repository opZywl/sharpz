from __future__ import annotations

import json
import subprocess
import threading
from pathlib import Path

from src.i18n import get_lang
from transcribe.process import _Pump, _kill, _parse_event, _rotate_log, _spawn, _wait


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
            self._proc = None
            self._pump = None
            self._current = None
        if proc is None:
            return
        try:
            if proc.stdin:
                proc.stdin.close()
        except OSError:
            pass
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _kill(proc)
        _wait(proc)

    def run(self, job_id: str, args: dict, on_event, is_stopped) -> tuple[str, dict]:
        request = json.dumps({"type": "job", "job_id": job_id, "args": args, "lang": get_lang()}) + "\n"
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
