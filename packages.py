"""Central de Pacotes do Sharpz.

Detecta tudo que o Sharpz precisa pra funcionar 100% (Node, uv, ffmpeg, motor de
transcricao, modelos large-v3-turbo e large-v3, toktx/KTX-Software, Ollama, node_modules) e instala
cada item com 1 clique, transmitindo o log ao vivo via SSE.

Sem dependencias externas: so stdlib (subprocess/threading/queue/urllib/winreg).
"""

from __future__ import annotations

import json
import os
import queue
import shutil
import subprocess
import tempfile
import threading
import urllib.request
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

from src.i18n import get_lang, t, use_lang
from transcribe import jobs as transcribe_jobs

REPO_ROOT = Path(__file__).resolve().parent
WHISPER_VENV = REPO_ROOT / "whisper-venv"
WHISPER_PY = WHISPER_VENV / "Scripts" / "python.exe"
WEB_DIR = REPO_ROOT / "web"

_SENTINEL = object()

Emit = Callable[[str], None]


# ----------------------------------------------------------------------------
# Ambiente / helpers de subprocess
# ----------------------------------------------------------------------------

def _refreshed_env() -> dict:
    """os.environ + PATH mesclado do registro (acha ferramentas recem-instaladas)."""
    env = dict(os.environ)
    try:
        import winreg

        parts = []
        for root, key in (
            (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
            (winreg.HKEY_CURRENT_USER, "Environment"),
        ):
            try:
                with winreg.OpenKey(root, key) as handle:
                    value, _ = winreg.QueryValueEx(handle, "Path")
                    if value:
                        parts.append(str(value))
            except OSError:
                continue
        parts.append(env.get("PATH", ""))
        env["PATH"] = ";".join(p for p in parts if p)
    except Exception:
        pass
    env.setdefault("HF_HUB_DISABLE_XET", "1")
    env.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
    return env


def _which(name: str) -> Optional[str]:
    return shutil.which(name, path=_refreshed_env().get("PATH"))


def _stream_cmd(args: list[str], emit: Emit, cwd: Optional[str] = None, env: Optional[dict] = None) -> int:
    """Roda um comando transmitindo cada linha. Retorna o exit code."""
    emit("$ " + " ".join(args))
    try:
        proc = subprocess.Popen(
            args,
            cwd=cwd,
            env=env or _refreshed_env(),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
    except FileNotFoundError:
        emit(t("packages.log.exe_missing", name=args[0]))
        return 127
    except Exception as exc:  # noqa: BLE001
        emit(t("packages.log.start_failed", error=exc))
        return 1

    assert proc.stdout is not None
    for line in proc.stdout:
        emit(line.rstrip("\r\n"))
    proc.wait()
    return proc.returncode or 0


# ----------------------------------------------------------------------------
# Deteccao de cada dependencia
# ----------------------------------------------------------------------------

def _version_of(args: list[str]) -> str:
    try:
        out = subprocess.run(
            args, capture_output=True, text=True, timeout=15, env=_refreshed_env(),
            encoding="utf-8", errors="replace",
        )
        return (out.stdout or out.stderr or "").strip().splitlines()[0] if (out.stdout or out.stderr).strip() else ""
    except Exception:
        return ""


def _check_node() -> tuple[bool, str]:
    path = _which("node")
    if not path:
        return False, t("packages.detail.not_found")
    return True, _version_of(["node", "--version"]) or t("packages.detail.installed")


def _check_uv() -> tuple[bool, str]:
    path = _which("uv")
    if not path:
        return False, t("packages.detail.not_found")
    return True, _version_of(["uv", "--version"]) or t("packages.detail.installed")


def _check_ffmpeg() -> tuple[bool, str]:
    path = _which("ffmpeg")
    if path:
        return True, _version_of(["ffmpeg", "-version"])[:60] or t("packages.detail.installed")
    return False, t("packages.detail.not_found")


def _check_node_modules() -> tuple[bool, str]:
    nm = WEB_DIR / "node_modules"
    if nm.exists() and (nm / "next").exists():
        return True, t("packages.detail.web_deps")
    return False, t("packages.detail.not_installed")


def _check_whisper_engine() -> tuple[bool, str]:
    if not WHISPER_PY.exists():
        return False, t("packages.detail.engine_missing")
    site = WHISPER_VENV / "Lib" / "site-packages"
    has_fw = (site / "faster_whisper").exists()
    has_wx = (site / "whisperx").exists() or any(site.glob("whisperx*"))
    if has_fw and has_wx:
        return True, "faster-whisper + whisperX"
    if has_fw:
        return True, t("packages.detail.engine_partial")
    return False, t("packages.detail.engine_missing")


def _check_model_key(key: str) -> Callable[[], tuple[bool, str]]:
    def check() -> tuple[bool, str]:
        if transcribe_jobs.model_cached(key):
            size = transcribe_jobs.repo_bytes(key) // (1024 * 1024)
            return True, t("packages.detail.model_ready", model=key, size=size)
        if transcribe_jobs.repo_bytes(key) > 0:
            return False, t("packages.detail.model_partial")
        return False, t("packages.detail.model_missing", model=key)

    return check


_TOKTX_DIRS = [
    Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "KTX-Software" / "bin",
    Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "KTX-Software" / "bin",
]


def find_toktx_path() -> Optional[str]:
    path = _which("toktx")
    if path:
        return path
    for directory in _TOKTX_DIRS:
        candidate = directory / "toktx.exe"
        if candidate.exists():
            return str(candidate)
    return None


def _check_toktx() -> tuple[bool, str]:
    path = find_toktx_path()
    if path:
        return True, _version_of([path, "--version"])[:60] or t("packages.detail.installed")
    return False, t("packages.detail.ktx_missing")


def _check_ollama() -> tuple[bool, str]:
    running = False
    try:
        with urllib.request.urlopen("http://localhost:11434/api/tags", timeout=2):
            running = True
    except Exception:
        running = False
    if _which("ollama"):
        return True, t("packages.detail.ollama_running") if running else t("packages.detail.ollama_stopped")
    if running:
        return True, t("packages.detail.ollama_responding")
    return False, t("packages.detail.not_installed")


_TESSERACT_DIRS = [
    Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Tesseract-OCR",
    Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Tesseract-OCR",
]


def find_tesseract_path() -> Optional[str]:
    path = _which("tesseract")
    if path:
        return path
    for directory in _TESSERACT_DIRS:
        candidate = directory / "tesseract.exe"
        if candidate.exists():
            return str(candidate)
    return None


def _check_tesseract() -> tuple[bool, str]:
    path = find_tesseract_path()
    if path:
        return True, _version_of([path, "--version"])[:50] or t("packages.detail.installed")
    return False, t("packages.detail.not_installed")


# ----------------------------------------------------------------------------
# Instaladores
# ----------------------------------------------------------------------------

def _winget_installer(winget_id: str) -> Callable[[Emit], int]:
    def run(emit: Emit) -> int:
        winget = _which("winget") or "winget"
        rc = _stream_cmd(
            [
                winget, "install", "--id", winget_id, "-e", "--silent",
                "--accept-package-agreements", "--accept-source-agreements",
                "--disable-interactivity",
            ],
            emit,
        )
        if rc != 0:
            emit(t("packages.log.winget_code", code=rc))
        return rc

    return run


def _install_node_modules(emit: Emit) -> int:
    return _stream_cmd(["cmd", "/c", "npm", "install"], emit, cwd=str(WEB_DIR))


def _install_whisper_engine(emit: Emit) -> int:
    uv = _which("uv")
    if not uv:
        emit(t("packages.log.uv_missing"))
        return 1
    env = _refreshed_env()
    if not WHISPER_PY.exists():
        emit(t("packages.log.creating_venv"))
        rc = _stream_cmd([uv, "venv", str(WHISPER_VENV), "--python", "3.12"], emit, env=env)
        if rc != 0:
            return rc
    steps = [
        [uv, "pip", "install", "-p", str(WHISPER_PY), "faster-whisper"],
        [uv, "pip", "install", "-p", str(WHISPER_PY), "torch==2.8.0", "torchaudio==2.8.0",
         "--index-url", "https://download.pytorch.org/whl/cpu"],
        [uv, "pip", "install", "-p", str(WHISPER_PY), "whisperx", "imageio-ffmpeg"],
    ]
    for step in steps:
        rc = _stream_cmd(step, emit, env=env)
        if rc != 0:
            return rc
    return 0


def _install_model_key(key: str) -> Callable[[Emit], int]:
    def install(emit: Emit) -> int:
        if not WHISPER_PY.exists():
            emit(t("packages.log.engine_missing"))
            return 1
        env = _refreshed_env()
        return _stream_cmd([str(WHISPER_PY), str(REPO_ROOT / "tools" / "download_model.py"), key], emit, env=env)

    return install


def _install_toktx(emit: Emit) -> int:
    emit(t("packages.log.ktx_release"))
    try:
        req = urllib.request.Request(
            "https://api.github.com/repos/KhronosGroup/KTX-Software/releases/latest",
            headers={"User-Agent": "sharpz-packages"},
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        emit(t("packages.log.github_failed", error=exc))
        return 1

    asset = next(
        (a for a in data.get("assets", []) if "Windows-x64" in a["name"] and a["name"].endswith(".exe")),
        None,
    )
    if not asset:
        emit(t("packages.log.asset_missing"))
        return 1

    name = asset["name"]
    url = asset["browser_download_url"]
    size_mb = asset.get("size", 0) // (1024 * 1024)
    dest = Path(tempfile.gettempdir()) / name
    emit(t("packages.log.downloading", name=name, size=size_mb))
    try:
        urllib.request.urlretrieve(url, dest)
    except Exception as exc:  # noqa: BLE001
        emit(t("packages.log.download_failed", error=exc))
        return 1

    emit(t("packages.log.installing_silent"))
    ps = [
        "powershell", "-NoProfile", "-Command",
        f"$p = Start-Process -FilePath '{dest}' -ArgumentList '/S' -Verb RunAs -Wait -PassThru; exit $p.ExitCode",
    ]
    rc = _stream_cmd(ps, emit)
    if rc == 0 and find_toktx_path():
        emit(t("packages.log.toktx_ok"))
    elif rc == 0:
        emit(t("packages.log.toktx_path"))
    else:
        emit(t("packages.log.install_failed"))
    return rc


# ----------------------------------------------------------------------------
# Registro de pacotes
# ----------------------------------------------------------------------------

@dataclass
class Package:
    id: str
    name: str
    description: str
    category: str            # essencial | transcricao | ktx | opcional
    optional: bool
    size_hint: str
    checker: Callable[[], tuple[bool, str]]
    installer: Optional[Callable[[Emit], int]] = None
    manual_hint: str = ""
    unlocks: list[str] = field(default_factory=list)


PACKAGES: list[Package] = [
    Package(
        id="node", name="packages.node.name",
        description="packages.node.description",
        category="essencial", optional=False, size_hint="~30 MB",
        checker=_check_node, installer=_winget_installer("OpenJS.NodeJS.LTS"),
        unlocks=["packages.unlock.web_panel"],
    ),
    Package(
        id="uv", name="packages.uv.name",
        description="packages.uv.description",
        category="essencial", optional=False, size_hint="~15 MB",
        checker=_check_uv, installer=_winget_installer("astral-sh.uv"),
        unlocks=["packages.unlock.transcription_engine"],
    ),
    Package(
        id="node_modules", name="packages.node_modules.name",
        description="packages.node_modules.description",
        category="essencial", optional=False, size_hint="~300 MB",
        checker=_check_node_modules, installer=_install_node_modules,
        manual_hint="packages.node_modules.manual_hint",
        unlocks=["packages.unlock.web_panel"],
    ),
    Package(
        id="ffmpeg", name="packages.ffmpeg.name",
        description="packages.ffmpeg.description",
        category="transcricao", optional=False, size_hint="~80 MB",
        checker=_check_ffmpeg, installer=_winget_installer("Gyan.FFmpeg"),
        unlocks=["packages.unlock.transcription"],
    ),
    Package(
        id="whisper_engine", name="packages.whisper_engine.name",
        description="packages.whisper_engine.description",
        category="transcricao", optional=False, size_hint="~2.5 GB",
        checker=_check_whisper_engine, installer=_install_whisper_engine,
        manual_hint="packages.whisper_engine.manual_hint",
        unlocks=["packages.unlock.transcription", "packages.unlock.word_timing", "packages.unlock.diarization"],
    ),
    Package(
        id="model_large_v3_turbo", name="packages.model_large_v3_turbo.name",
        description="packages.model_large_v3_turbo.description",
        category="transcricao", optional=False, size_hint="~1.6 GB",
        checker=_check_model_key(transcribe_jobs.FAST_MODEL), installer=_install_model_key(transcribe_jobs.FAST_MODEL),
        manual_hint="packages.model_large_v3_turbo.manual_hint",
        unlocks=["packages.unlock.transcription_fast"],
    ),
    Package(
        id="model_large_v3", name="packages.model_large_v3.name",
        description="packages.model_large_v3.description",
        category="transcricao", optional=True, size_hint="~3 GB",
        checker=_check_model_key(transcribe_jobs.ACCURATE_MODEL),
        installer=_install_model_key(transcribe_jobs.ACCURATE_MODEL),
        manual_hint="packages.model_large_v3.manual_hint",
        unlocks=["packages.unlock.transcription_large"],
    ),
    Package(
        id="toktx", name="packages.toktx.name",
        description="packages.toktx.description",
        category="ktx", optional=False, size_hint="~40 MB",
        checker=_check_toktx, installer=_install_toktx,
        manual_hint="packages.toktx.manual_hint",
        unlocks=["packages.unlock.png_ktx", "packages.unlock.batch_ktx"],
    ),
    Package(
        id="ollama", name="packages.ollama.name",
        description="packages.ollama.description",
        category="opcional", optional=True, size_hint="~700 MB",
        checker=_check_ollama, installer=_winget_installer("Ollama.Ollama"),
        manual_hint="packages.ollama.manual_hint",
        unlocks=["packages.unlock.ai_summary"],
    ),
    Package(
        id="tesseract", name="packages.tesseract.name",
        description="packages.tesseract.description",
        category="opcional", optional=True, size_hint="~100 MB",
        checker=_check_tesseract, installer=_winget_installer("UB-Mannheim.TesseractOCR"),
        manual_hint="packages.tesseract.manual_hint",
        unlocks=["packages.unlock.local_ocr"],
    ),
]

PACKAGES_BY_ID = {pkg.id: pkg for pkg in PACKAGES}


def _size_hint(pkg: Package) -> str:
    return pkg.size_hint.replace(".", ",") if get_lang() == "pt-BR" else pkg.size_hint


def list_packages() -> list[dict]:
    items = []
    for pkg in PACKAGES:
        try:
            installed, detail = pkg.checker()
        except Exception as exc:  # noqa: BLE001
            installed, detail = False, t("packages.detail.check_failed", error=exc)
        items.append({
            "id": pkg.id,
            "name": t(pkg.name),
            "description": t(pkg.description),
            "category": pkg.category,
            "optional": pkg.optional,
            "size_hint": _size_hint(pkg),
            "installed": installed,
            "detail": detail,
            "installable": pkg.installer is not None,
            "manual_hint": t(pkg.manual_hint) if pkg.manual_hint else "",
            "unlocks": [t(key) for key in pkg.unlocks],
        })
    return items


# ----------------------------------------------------------------------------
# Jobs de instalacao + SSE
# ----------------------------------------------------------------------------

class _InstallJob:
    def __init__(self, job_id: str, package_id: str) -> None:
        self.job_id = job_id
        self.package_id = package_id
        self.status = "running"
        self.returncode: Optional[int] = None
        self._log: list[str] = []
        self._subs: list[queue.Queue] = []
        self._lock = threading.Lock()
        self._done = False

    def emit(self, line: str) -> None:
        with self._lock:
            self._log.append(line)
            for sub in self._subs:
                sub.put(line)

    def finish(self, returncode: int) -> None:
        self.returncode = returncode
        self.status = "done" if returncode == 0 else "error"
        with self._lock:
            self._done = True
            for sub in self._subs:
                sub.put(_SENTINEL)

    def subscribe(self) -> tuple[queue.Queue, list[str], bool]:
        sub: queue.Queue = queue.Queue()
        with self._lock:
            snapshot = list(self._log)
            done = self._done
            self._subs.append(sub)
        return sub, snapshot, done

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "job_id": self.job_id,
                "package_id": self.package_id,
                "status": self.status,
                "returncode": self.returncode,
                "log": list(self._log),
            }


class PackageManager:
    def __init__(self) -> None:
        self._jobs: dict[str, _InstallJob] = {}
        self._lock = threading.Lock()

    def start(self, package_id: str) -> Optional[str]:
        pkg = PACKAGES_BY_ID.get(package_id)
        if pkg is None or pkg.installer is None:
            return None
        job_id = uuid.uuid4().hex
        job = _InstallJob(job_id, package_id)
        with self._lock:
            self._jobs[job_id] = job
        threading.Thread(target=self._run, args=(job, pkg, get_lang()), daemon=True).start()
        return job_id

    def _run(self, job: _InstallJob, pkg: Package, lang: str | None = None) -> None:
        with use_lang(lang):
            name = t(pkg.name)
            job.emit(t("packages.log.installing", name=name, size=_size_hint(pkg)))
            try:
                assert pkg.installer is not None
                rc = pkg.installer(job.emit)
            except Exception as exc:  # noqa: BLE001
                job.emit(t("packages.log.crashed", kind=type(exc).__name__, error=exc))
                rc = 1
            installed, detail = (False, "")
            try:
                installed, detail = pkg.checker()
            except Exception:
                pass
            if installed:
                job.emit(f"[ok] {name}: {detail}")
                rc = 0
            job.finish(rc if rc is not None else 0)

    def get(self, job_id: str) -> Optional[_InstallJob]:
        return self._jobs.get(job_id)


MANAGER = PackageManager()


def _sse(payload: dict) -> str:
    return "data: " + json.dumps(payload, ensure_ascii=False) + "\n\n"


def stream_job(job_id: str):
    job = MANAGER.get(job_id)
    if job is None:
        yield _sse({"type": "error", "message": t("server.job_not_found")})
        return
    sub, snapshot, done = job.subscribe()
    for line in snapshot:
        yield _sse({"type": "log", "line": line})
    if done:
        yield _sse({"type": "done", "status": job.status, "returncode": job.returncode})
        return
    while True:
        try:
            item = sub.get(timeout=15)
        except queue.Empty:
            yield ": ping\n\n"
            continue
        if item is _SENTINEL:
            yield _sse({"type": "done", "status": job.status, "returncode": job.returncode})
            return
        yield _sse({"type": "log", "line": item})
