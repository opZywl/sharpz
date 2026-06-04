from __future__ import annotations

import os
import shutil
from pathlib import Path

"""Localizacao do ffmpeg/ffprobe compartilhada (engine + complete).

Modulo puro: sem efeitos colaterais de import (nao mexe em sys.stdout, nao
importa ML). Pode ser importado tanto pela engine (venv ML) quanto pelo
processo do servidor (venv backend)."""


def _prepend_path(directory: str) -> None:
    if directory:
        os.environ["PATH"] = directory + os.pathsep + os.environ.get("PATH", "")


def ensure_ffmpeg() -> None:
    """Garante que `ffmpeg` esteja no PATH (Windows: registro + WinGet + imageio)."""
    if shutil.which("ffmpeg"):
        return
    if os.name == "nt":
        try:
            import winreg

            for root, sub in (
                (winreg.HKEY_CURRENT_USER, "Environment"),
                (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
            ):
                try:
                    with winreg.OpenKey(root, sub) as key:
                        value, _ = winreg.QueryValueEx(key, "Path")
                        _prepend_path(os.path.expandvars(value))
                except OSError:
                    pass
            if shutil.which("ffmpeg"):
                return
            import glob

            base = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages")
            for exe in glob.glob(os.path.join(base, "Gyan.FFmpeg*", "**", "ffmpeg.exe"), recursive=True):
                _prepend_path(os.path.dirname(exe))
                if shutil.which("ffmpeg"):
                    return
        except Exception:
            pass
    try:
        import imageio_ffmpeg

        exe = imageio_ffmpeg.get_ffmpeg_exe()
        _prepend_path(str(Path(exe).parent))
    except Exception:
        pass


def ffmpeg_exe() -> str | None:
    ensure_ffmpeg()
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def ffprobe_exe() -> str | None:
    ensure_ffmpeg()
    found = shutil.which("ffprobe")
    if found:
        return found
    ff = ffmpeg_exe()
    if ff:
        candidate = Path(ff).with_name("ffprobe" + (".exe" if os.name == "nt" else ""))
        if candidate.exists():
            return str(candidate)
    return None
