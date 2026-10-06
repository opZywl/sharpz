from __future__ import annotations

import hashlib
import stat
import time
from pathlib import Path

from transcribe.config import UPLOAD_DIR


def save_stream(source, target: Path, chunk_size: int = 1024 * 1024) -> tuple[int, str]:
    digest = hashlib.sha1()
    size = 0
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        with target.open("wb") as handle:
            while True:
                chunk = source.read(chunk_size)
                if not chunk:
                    break
                digest.update(chunk)
                handle.write(chunk)
                size += len(chunk)
    except BaseException:
        try:
            target.unlink(missing_ok=True)
        except OSError:
            pass
        raise
    return size, digest.hexdigest()


def prune_uploads(upload_dir: Path = UPLOAD_DIR, max_age_s: float = 24 * 3600, now: float | None = None) -> int:
    cutoff = (time.time() if now is None else now) - max_age_s
    removed = 0
    try:
        entries = list(Path(upload_dir).iterdir())
    except OSError:
        return 0
    for entry in entries:
        try:
            info = entry.lstat()
            if stat.S_ISREG(info.st_mode) and info.st_mtime < cutoff:
                entry.unlink()
                removed += 1
        except OSError:
            continue
    return removed
