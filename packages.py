"""Central de Pacotes do Sharpz.

Detecta tudo que o Sharpz precisa pra funcionar 100% (Node, uv, ffmpeg, motor de
transcricao, modelo large-v3, toktx/KTX-Software, Ollama, node_modules) e instala
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
        emit(f"[erro] executavel nao encontrado: {args[0]}")
        return 127
    except Exception as exc:  # noqa: BLE001
        emit(f"[erro] falha ao iniciar: {exc}")
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


def _hf_cache_dir() -> Path:
    home = os.environ.get("HF_HOME")
    base = Path(home) if home else (Path.home() / ".cache" / "huggingface")
    return base / "hub"


def _check_node() -> tuple[bool, str]:
    path = _which("node")
    if not path:
        return False, "nao encontrado"
    return True, _version_of(["node", "--version"]) or "instalado"


def _check_uv() -> tuple[bool, str]:
    path = _which("uv")
    if not path:
        return False, "nao encontrado"
    return True, _version_of(["uv", "--version"]) or "instalado"


def _check_ffmpeg() -> tuple[bool, str]:
    path = _which("ffmpeg")
    if path:
        return True, _version_of(["ffmpeg", "-version"])[:60] or "instalado"
    return False, "nao encontrado"


def _check_node_modules() -> tuple[bool, str]:
    nm = WEB_DIR / "node_modules"
    if nm.exists() and (nm / "next").exists():
        return True, "dependencias web instaladas"
    return False, "rode npm install"


def _check_whisper_engine() -> tuple[bool, str]:
    if not WHISPER_PY.exists():
        return False, "whisper-venv ausente"
    site = WHISPER_VENV / "Lib" / "site-packages"
    has_fw = (site / "faster_whisper").exists()
    has_wx = (site / "whisperx").exists() or any(site.glob("whisperx*"))
    if has_fw and has_wx:
        return True, "faster-whisper + whisperX"
    if has_fw:
        return True, "faster-whisper (sem whisperX: alinhamento/diarizacao off)"
    return False, "motor nao instalado"


def _check_model() -> tuple[bool, str]:
    base = _hf_cache_dir() / "models--Systran--faster-whisper-large-v3"
    if not base.exists():
        return False, "large-v3 nao baixado"
    for model_bin in base.glob("snapshots/*/model.bin"):
        try:
            size = model_bin.stat().st_size
        except OSError:
            continue
        if size > 500 * 1024 * 1024:
            return True, f"large-v3 pronto ({size // (1024 * 1024)} MB)"
    return False, "download incompleto"


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
        return True, _version_of([path, "--version"])[:60] or "instalado"
    return False, "KTX-Software nao instalado"


def _check_ollama() -> tuple[bool, str]:
    running = False
    try:
        with urllib.request.urlopen("http://localhost:11434/api/tags", timeout=2):
            running = True
    except Exception:
        running = False
    if _which("ollama"):
        return True, "rodando em :11434" if running else "instalado (servico parado)"
    if running:
        return True, "respondendo em :11434"
    return False, "nao instalado"


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
            emit(f"[aviso] winget retornou {rc} (pode ja estar instalado ou exigir reinicio).")
        return rc

    return run


def _install_node_modules(emit: Emit) -> int:
    return _stream_cmd(["cmd", "/c", "npm", "install"], emit, cwd=str(WEB_DIR))


def _install_whisper_engine(emit: Emit) -> int:
    uv = _which("uv")
    if not uv:
        emit("[erro] 'uv' nao encontrado. Instale o pacote 'uv' antes.")
        return 1
    env = _refreshed_env()
    if not WHISPER_PY.exists():
        emit("Criando whisper-venv (Python 3.12)...")
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


def _install_model(emit: Emit) -> int:
    if not WHISPER_PY.exists():
        emit("[erro] Motor de transcricao ausente. Instale 'Motor de transcricao' antes.")
        return 1
    env = _refreshed_env()
    return _stream_cmd([str(WHISPER_PY), str(REPO_ROOT / "tools" / "download_model.py"), "large-v3"], emit, env=env)


def _install_toktx(emit: Emit) -> int:
    emit("Consultando o release mais recente do KTX-Software no GitHub...")
    try:
        req = urllib.request.Request(
            "https://api.github.com/repos/KhronosGroup/KTX-Software/releases/latest",
            headers={"User-Agent": "sharpz-packages"},
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        emit(f"[erro] nao consegui consultar o GitHub: {exc}")
        return 1

    asset = next(
        (a for a in data.get("assets", []) if "Windows-x64" in a["name"] and a["name"].endswith(".exe")),
        None,
    )
    if not asset:
        emit("[erro] instalador Windows-x64 nao encontrado no release.")
        return 1

    name = asset["name"]
    url = asset["browser_download_url"]
    size_mb = asset.get("size", 0) // (1024 * 1024)
    dest = Path(tempfile.gettempdir()) / name
    emit(f"Baixando {name} (~{size_mb} MB)...")
    try:
        urllib.request.urlretrieve(url, dest)
    except Exception as exc:  # noqa: BLE001
        emit(f"[erro] falha no download: {exc}")
        return 1

    emit("Instalando (silencioso /S). Uma janela de permissao (UAC) vai aparecer — clique Sim.")
    ps = [
        "powershell", "-NoProfile", "-Command",
        f"$p = Start-Process -FilePath '{dest}' -ArgumentList '/S' -Verb RunAs -Wait -PassThru; exit $p.ExitCode",
    ]
    rc = _stream_cmd(ps, emit)
    if rc == 0 and find_toktx_path():
        emit("[ok] toktx instalado e detectado.")
    elif rc == 0:
        emit("[ok] Instalador concluiu. Pode ser preciso reabrir o app pra detectar o toktx no PATH.")
    else:
        emit("[erro] Instalacao nao concluiu (UAC negado?). Tente de novo.")
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
        id="node", name="Node.js (LTS)",
        description="Runtime que roda o painel web do Sharpz.",
        category="essencial", optional=False, size_hint="~30 MB",
        checker=_check_node, installer=_winget_installer("OpenJS.NodeJS.LTS"),
        unlocks=["Painel web"],
    ),
    Package(
        id="uv", name="uv (gerenciador Python)",
        description="Cria os ambientes Python isolados e instala as libs de IA rapido.",
        category="essencial", optional=False, size_hint="~15 MB",
        checker=_check_uv, installer=_winget_installer("astral-sh.uv"),
        unlocks=["Motor de transcricao"],
    ),
    Package(
        id="node_modules", name="Dependencias do painel (npm)",
        description="Bibliotecas do front-end (Next.js/React). Instala em web/node_modules.",
        category="essencial", optional=False, size_hint="~300 MB",
        checker=_check_node_modules, installer=_install_node_modules,
        manual_hint="Requer Node.js instalado.",
        unlocks=["Painel web"],
    ),
    Package(
        id="ffmpeg", name="FFmpeg",
        description="Decodifica audio/video pra transcricao.",
        category="transcricao", optional=False, size_hint="~80 MB",
        checker=_check_ffmpeg, installer=_winget_installer("Gyan.FFmpeg"),
        unlocks=["Transcricao"],
    ),
    Package(
        id="whisper_engine", name="Motor de transcricao (faster-whisper + whisperX)",
        description="Bibliotecas de IA (CTranslate2 + torch CPU + whisperX) no whisper-venv. Habilita transcricao, tempo por palavra e diarizacao.",
        category="transcricao", optional=False, size_hint="~2.5 GB",
        checker=_check_whisper_engine, installer=_install_whisper_engine,
        manual_hint="Requer uv instalado.",
        unlocks=["Transcricao", "Tempo por palavra", "Diarizacao"],
    ),
    Package(
        id="model_large_v3", name="Modelo large-v3",
        description="Modelo de transcricao de maxima qualidade (multilingue). Baixado uma vez e cacheado.",
        category="transcricao", optional=False, size_hint="~3 GB",
        checker=_check_model, installer=_install_model,
        manual_hint="Requer o Motor de transcricao instalado.",
        unlocks=["Transcricao large-v3"],
    ),
    Package(
        id="toktx", name="KTX-Software (toktx)",
        description="CLI oficial da Khronos pra gerar texturas KTX2. Habilita PNG -> KTX e Batch KTX.",
        category="ktx", optional=False, size_hint="~40 MB",
        checker=_check_toktx, installer=_install_toktx,
        manual_hint="Instalador oficial pede confirmacao de administrador (UAC).",
        unlocks=["PNG -> KTX", "Batch KTX"],
    ),
    Package(
        id="ollama", name="Ollama (resumo por IA)",
        description="LLM local opcional pra resumir transcricoes. Sem ele o resumo por IA fica indisponivel.",
        category="opcional", optional=True, size_hint="~700 MB",
        checker=_check_ollama, installer=_winget_installer("Ollama.Ollama"),
        manual_hint="Depois de instalar, rode: ollama pull llama3.1",
        unlocks=["Resumo por IA"],
    ),
]

PACKAGES_BY_ID = {pkg.id: pkg for pkg in PACKAGES}


def list_packages() -> list[dict]:
    items = []
    for pkg in PACKAGES:
        try:
            installed, detail = pkg.checker()
        except Exception as exc:  # noqa: BLE001
            installed, detail = False, f"erro ao checar: {exc}"
        items.append({
            "id": pkg.id,
            "name": pkg.name,
            "description": pkg.description,
            "category": pkg.category,
            "optional": pkg.optional,
            "size_hint": pkg.size_hint,
            "installed": installed,
            "detail": detail,
            "installable": pkg.installer is not None,
            "manual_hint": pkg.manual_hint,
            "unlocks": pkg.unlocks,
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
        threading.Thread(target=self._run, args=(job, pkg), daemon=True).start()
        return job_id

    def _run(self, job: _InstallJob, pkg: Package) -> None:
        job.emit(f"== Instalando: {pkg.name} ({pkg.size_hint}) ==")
        try:
            assert pkg.installer is not None
            rc = pkg.installer(job.emit)
        except Exception as exc:  # noqa: BLE001
            job.emit(f"[erro] {type(exc).__name__}: {exc}")
            rc = 1
        installed, detail = (False, "")
        try:
            installed, detail = pkg.checker()
        except Exception:
            pass
        if installed:
            job.emit(f"[ok] {pkg.name}: {detail}")
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
        yield _sse({"type": "error", "message": "job nao encontrado"})
        return
    sub, snapshot, done = job.subscribe()
    for line in snapshot:
        yield _sse({"type": "log", "line": line})
    if done:
        yield _sse({"type": "done", "status": job.status, "returncode": job.returncode})
        return
    while True:
        item = sub.get()
        if item is _SENTINEL:
            yield _sse({"type": "done", "status": job.status, "returncode": job.returncode})
            return
        yield _sse({"type": "log", "line": item})
