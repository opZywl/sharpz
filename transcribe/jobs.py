from __future__ import annotations

from src.i18n import get_lang, t, use_lang
from transcribe import complete as complete_mod
from transcribe.config import (
    BACKEND_PYTHON,
    DOWNLOAD_SCRIPT,
    OUTPUT_ROOT,
    REPO_ROOT,
    UPLOAD_DIR,
    VALID_FORMATS,
    VENV_PYTHON,
    WHISPER_SITE,
    _load_hf_token,
    venv_available,
    whisperx_available,
)
from transcribe.models import (
    ACCURATE_MODEL,
    AUTO_MODEL,
    DEFAULT_MODEL,
    FALLBACK_REPOS,
    FAST_MODEL,
    MODEL_ALIASES,
    MODEL_INFO,
    VALID_MODELS,
    hf_hub_dir,
    model_cached,
    model_repos,
    normalize_model_key,
    repo_bytes,
    repo_dir,
    resolve_model,
)
from transcribe.process import (
    _LOG_LOCK,
    LOG_MAX_BYTES,
    PRIORITY_FLAGS,
    _kill,
    _log,
    _parse_event,
    _Pump,
    _rotate_log,
    _spawn,
    _wait,
)
from transcribe.errors import JobCanceled, JobFailed, _engine_died, _spawn_failed
from transcribe.worker_client import WorkerClient
from transcribe.uploads import prune_uploads, save_stream
from transcribe.job_state import (
    SECRET_KEY,
    _apply_event,
    _engine_args,
    _public_view,
    _terminal_event,
    engine_argv,
    job_fingerprint,
    mask_secrets,
)
from transcribe.formats import to_txt
from transcribe.store import (
    DOWNLOAD_PCT,
    HEARTBEAT_S,
    PARTIAL_SUFFIXES,
    STORE,
    TERMINAL_EVENTS,
    JobStore,
)
from transcribe.downloads import DOWNLOADS, ModelDownloads, model_catalog
