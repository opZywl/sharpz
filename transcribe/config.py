from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
VENV_PYTHON = REPO_ROOT / "whisper-venv" / "Scripts" / "python.exe"
BACKEND_PYTHON = REPO_ROOT / "venv" / "Scripts" / "python.exe"
WHISPER_SITE = REPO_ROOT / "whisper-venv" / "Lib" / "site-packages"
DOWNLOAD_SCRIPT = REPO_ROOT / "tools" / "download_model.py"
OUTPUT_ROOT = REPO_ROOT / "output" / "transcripts"
UPLOAD_DIR = OUTPUT_ROOT / "_uploads"

VALID_FORMATS = ["txt", "srt", "vtt", "json", "lrc"]


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
