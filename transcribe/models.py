from __future__ import annotations

import ast
import functools
import os
import stat
from pathlib import Path

from transcribe.config import WHISPER_SITE

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
