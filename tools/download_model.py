from __future__ import annotations

import importlib.util
import os
import sys
import threading
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ATTEMPTS = 12
RETRY_DELAY_S = 4
PROGRESS_EVERY_S = 5

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "120")


def catalog():
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))
    from transcribe import jobs

    return jobs


def faster_whisper_utils():
    spec = importlib.util.find_spec("faster_whisper")
    if spec is None or not spec.submodule_search_locations:
        return None
    path = Path(list(spec.submodule_search_locations)[0]) / "utils.py"
    utils_spec = importlib.util.spec_from_file_location("sharpz_faster_whisper_utils", path)
    module = importlib.util.module_from_spec(utils_spec)
    utils_spec.loader.exec_module(module)
    return module


def report_progress(key: str, stop: threading.Event) -> None:
    jobs = catalog()
    total_mb = (jobs.MODEL_INFO.get(key) or {}).get("size_mb")
    while not stop.wait(PROGRESS_EVERY_S):
        done_mb = jobs.repo_bytes(key) // 1_000_000
        suffix = f" de ~{total_mb} MB" if total_mb else " MB"
        print(f"[download {key}] {done_mb}{suffix}", flush=True)


def main(argv: list[str]) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    requested = (argv[1] if len(argv) > 1 else catalog().FAST_MODEL).strip()
    key = catalog().MODEL_ALIASES.get(requested.lower(), requested)
    utils = faster_whisper_utils()
    if utils is None:
        print("[falha] faster-whisper não está instalado neste Python. Rode o sharpz.cmd e escolha Instalar.", flush=True)
        return 1
    if key not in utils._MODELS and "/" not in key:
        print(f"[falha] modelo desconhecido: {requested}. Use um destes: {', '.join(utils._MODELS)}", flush=True)
        return 2

    stop = threading.Event()
    threading.Thread(target=report_progress, args=(key, stop), daemon=True).start()
    try:
        for attempt in range(1, ATTEMPTS + 1):
            try:
                print(f"[download {key}] tentativa {attempt}...", flush=True)
                path = utils.download_model(key)
                print(f"[ok] modelo pronto em {path}", flush=True)
                return 0
            except Exception as exc:
                print(f"[retry] falha: {type(exc).__name__}: {str(exc)[:140]}", flush=True)
                time.sleep(RETRY_DELAY_S)
    finally:
        stop.set()
    print("[falha] não consegui baixar o modelo após várias tentativas", flush=True)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
