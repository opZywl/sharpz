from __future__ import annotations

import errno
import unicodedata
from collections.abc import Iterator

OOM_WINERRORS = frozenset({8, 14, 1455})

OOM_MARKERS = (
    "bad allocation",
    "bad_alloc",
    "failed to allocate",
    "is smaller than requested bytes",
    "out of memory",
    "not enough memory",
    "insufficient memory",
    "cannot allocate memory",
    "unable to allocate",
    "allocation failed",
    "paging file",
    "arquivo de paginacao",
    "recursos de memoria",
    "memoria insuficiente",
)


def _fold(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii").lower()


def _has_marker(text: str | None) -> bool:
    folded = _fold(text or "")
    return any(marker in folded for marker in OOM_MARKERS)


def _chain(exc: BaseException) -> Iterator[BaseException]:
    seen: set[int] = set()
    stack: list[BaseException | None] = [exc]
    while stack:
        current = stack.pop()
        if current is None or id(current) in seen:
            continue
        seen.add(id(current))
        yield current
        if isinstance(current, BaseExceptionGroup):
            stack.extend(current.exceptions)
        stack.append(current.__context__)
        stack.append(current.__cause__)


def _single_is_oom(exc: BaseException) -> bool:
    if isinstance(exc, MemoryError):
        return True
    if isinstance(exc, OSError):
        if getattr(exc, "winerror", None) in OOM_WINERRORS or exc.errno == errno.ENOMEM:
            return True
        return _has_marker(exc.strerror if exc.strerror is not None else str(exc))
    if isinstance(exc, RuntimeError) or type(exc).__module__.partition(".")[0] == "onnxruntime":
        return _has_marker(str(exc))
    return False


def is_out_of_memory(exc: BaseException) -> bool:
    return any(_single_is_oom(item) for item in _chain(exc))
