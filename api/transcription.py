from __future__ import annotations

import json as _json
import mimetypes
import shutil
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from starlette.concurrency import run_in_threadpool

from api.schemas import (
    TranscribeCapabilitiesResponse,
    TranscribeJobCreated,
    TranscribeModelDownloadStarted,
    TranscribeModelDownloadStatus,
    TranscribeModelInfo,
    TranscribeModelsResponse,
    TranscribeSummarizeRequest,
    TranscribeSummarizeResponse,
)
from src.i18n import t
from transcribe.jobs import (
    DEFAULT_MODEL as TRANSCRIBE_DEFAULT_MODEL,
    DOWNLOADS as TRANSCRIBE_DOWNLOADS,
    STORE as TRANSCRIBE_STORE,
    UPLOAD_DIR as TRANSCRIBE_UPLOAD_DIR,
    VALID_FORMATS as TRANSCRIBE_VALID_FORMATS,
    model_catalog as transcribe_model_catalog,
    normalize_model_key as transcribe_model_key,
    resolve_model as transcribe_resolve_model,
    save_stream as transcribe_save_stream,
    venv_available as transcribe_venv_available,
    whisperx_available as transcribe_whisperx_available,
)

router = APIRouter()


def _parse_formats(formats: str) -> list[str]:
    requested = [item.strip().lower() for item in formats.split(",") if item.strip()]
    valid = [item for item in requested if item in TRANSCRIBE_VALID_FORMATS]
    return valid or ["txt", "srt", "vtt", "json"]


def _require_transcribe_job(job_id: str) -> None:
    if not TRANSCRIBE_STORE.exists(job_id):
        raise HTTPException(status_code=404, detail=t("server.job_not_found"))


def _store_transcribe_upload(file: UploadFile) -> tuple[Path, str, int]:
    original = Path(file.filename or "").name or "upload"
    stem = Path(original).stem[:80] or "upload"
    suffix = Path(original).suffix[:12]
    target = TRANSCRIBE_UPLOAD_DIR / f"{uuid.uuid4().hex}_{stem}{suffix}"
    file.file.seek(0)
    size, digest = transcribe_save_stream(file.file, target)
    return target, digest, size


def _transcribe_model_or_404(key: str) -> str:
    model_key = transcribe_model_key(key)
    if model_key is None:
        raise HTTPException(status_code=404, detail=t("transcribe.model_unknown", key=key))
    return model_key


def _last_event_id(request: Request, since: int | None) -> int:
    header = (request.headers.get("last-event-id") or "").strip()
    try:
        from_header = int(header) if header else 0
    except ValueError:
        from_header = 0
    return max(0, from_header, since or 0)


@router.post("/api/transcribe", response_model=TranscribeJobCreated)
async def transcribe_create(
    request: Request,
    file: UploadFile | None = File(None),
    local_path: str = Form(""),
    url: str = Form(None),
    model: str = Form(TRANSCRIBE_DEFAULT_MODEL),
    language: str = Form("auto"),
    formats: str = Form("txt,srt,vtt,json,lrc"),
    vad: bool = Form(True),
    word_timestamps: bool = Form(False),
    diarize: bool = Form(False),
    translate: bool = Form(False),
    hf_token: str = Form(""),
    min_speakers: int | None = Form(None),
    max_speakers: int | None = Form(None),
    threads: int | None = Form(None),
    mode: str = Form("standard"),
    frame_interval: float = Form(3.0),
    scene_threshold: float = Form(0.30),
    gen_docs: bool = Form(False),
    vision_base_url: str = Form(""),
    vision_api_key: str = Form(""),
    vision_model: str = Form(""),
    output_dir: str = Form(""),
    output_name: str = Form(""),
    make_zip: bool = Form(False),
    open_folder: bool = Form(False),
) -> TranscribeJobCreated:
    selected_model = transcribe_resolve_model(model, translate)
    source_url = (url or "").strip()

    input_path: str | None = None
    source_sha1: str | None = None
    upload_target: Path | None = None
    if file is not None and file.filename:
        upload_target, source_sha1, size = await run_in_threadpool(_store_transcribe_upload, file)
        if size == 0:
            upload_target.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail=t("server.upload_empty"))
        input_path = str(upload_target)
    elif local_path.strip():
        candidate = Path(local_path.strip().strip('"')).expanduser()
        if not candidate.is_file():
            raise HTTPException(status_code=400, detail=t("transcribe.local_missing", path=candidate))
        input_path = str(candidate)
    elif source_url:
        input_path = None
    else:
        raise HTTPException(status_code=400, detail=t("transcribe.no_source"))

    options = {
        "input_path": input_path,
        "url": source_url or None,
        "source_sha1": source_sha1,
        "model": selected_model,
        "language": language or "auto",
        "formats": _parse_formats(formats),
        "vad": vad,
        "word_timestamps": word_timestamps,
        "diarize": diarize,
        "translate": translate,
        "hf_token": hf_token.strip() or None,
        "min_speakers": min_speakers,
        "max_speakers": max_speakers,
        "threads": threads,
        "mode": "complete" if mode.strip().lower() == "complete" else "standard",
        "frame_interval": frame_interval,
        "scene_threshold": scene_threshold,
        "gen_docs": gen_docs,
        "vision": {
            "base_url": vision_base_url.strip(),
            "api_key": vision_api_key.strip(),
            "model": vision_model.strip(),
        },
        "output_dir": output_dir.strip() or None,
        "output_name": output_name.strip() or None,
        "make_zip": make_zip,
        "open_folder": open_folder,
    }
    if await request.is_disconnected():
        if upload_target is not None:
            upload_target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=t("transcribe.upload_canceled"))
    job_id, deduped = TRANSCRIBE_STORE.enqueue(options)
    if deduped and upload_target is not None:
        upload_target.unlink(missing_ok=True)
    return TranscribeJobCreated(job_id=job_id, model=selected_model, deduped=deduped)


@router.get("/api/transcribe/models", response_model=TranscribeModelsResponse)
def transcribe_models() -> TranscribeModelsResponse:
    return TranscribeModelsResponse(
        models=[TranscribeModelInfo(**entry) for entry in transcribe_model_catalog()],
        default_resolved=transcribe_resolve_model(TRANSCRIBE_DEFAULT_MODEL),
    )


@router.post("/api/transcribe/models/{key}/download", response_model=TranscribeModelDownloadStarted)
def transcribe_model_download(key: str) -> TranscribeModelDownloadStarted:
    model_key = _transcribe_model_or_404(key)
    try:
        status = TRANSCRIBE_DOWNLOADS.start(model_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=503, detail=t("transcribe.model_download_start_failed", error=exc)) from exc
    return TranscribeModelDownloadStarted(ok=True, status=status)


@router.get("/api/transcribe/models/{key}/download", response_model=TranscribeModelDownloadStatus)
def transcribe_model_download_status(key: str) -> TranscribeModelDownloadStatus:
    return TranscribeModelDownloadStatus(**TRANSCRIBE_DOWNLOADS.status(_transcribe_model_or_404(key)))


@router.get("/api/transcribe/capabilities", response_model=TranscribeCapabilitiesResponse)
def transcribe_capabilities() -> TranscribeCapabilitiesResponse:
    whisperx = transcribe_whisperx_available()
    return TranscribeCapabilitiesResponse(
        ffmpeg=shutil.which("ffmpeg") is not None,
        whisperx=whisperx,
        diarization=whisperx,
        venv=transcribe_venv_available(),
        default_model=transcribe_resolve_model(TRANSCRIBE_DEFAULT_MODEL),
        word_timestamps=transcribe_venv_available(),
    )


@router.get("/api/transcribe/jobs/{job_id}")
async def transcribe_job(job_id: str) -> dict:
    state = TRANSCRIBE_STORE.get(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail=t("server.job_not_found"))
    return state


@router.get("/api/transcribe/jobs/{job_id}/stream")
async def transcribe_job_stream(job_id: str, request: Request, since: int | None = None) -> StreamingResponse:
    _require_transcribe_job(job_id)
    return StreamingResponse(
        TRANSCRIBE_STORE.stream(job_id, _last_event_id(request, since)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


@router.post("/api/transcribe/jobs/{job_id}/cancel")
def transcribe_job_cancel(job_id: str) -> dict:
    result = TRANSCRIBE_STORE.cancel(job_id)
    if result is None:
        raise HTTPException(status_code=404, detail=t("server.job_not_found"))
    return result


@router.get("/api/transcribe/jobs/{job_id}/download")
async def transcribe_job_download(job_id: str, format: str) -> FileResponse:
    _require_transcribe_job(job_id)
    fmt = format.strip().lower()
    path = TRANSCRIBE_STORE.get_file(job_id, fmt)
    if path is None:
        raise HTTPException(status_code=404, detail=t("transcribe.file_unavailable", fmt=fmt))
    return FileResponse(str(path), filename=path.name, media_type="application/octet-stream")


@router.get("/api/transcribe/jobs/{job_id}/audio")
async def transcribe_job_audio(job_id: str) -> FileResponse:
    _require_transcribe_job(job_id)
    path = TRANSCRIBE_STORE.get_input_path(job_id)
    if path is None:
        raise HTTPException(status_code=404, detail=t("transcribe.media_unavailable"))
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(
        str(path),
        media_type=media_type,
        content_disposition_type="inline",
    )


@router.post("/api/transcribe/jobs/{job_id}/summarize", response_model=TranscribeSummarizeResponse)
def transcribe_job_summarize(job_id: str, payload: TranscribeSummarizeRequest) -> TranscribeSummarizeResponse:
    text = TRANSCRIBE_STORE.get_text(job_id)
    if text is None:
        raise HTTPException(status_code=404, detail=t("server.job_not_found"))
    if not text.strip():
        raise HTTPException(status_code=400, detail=t("transcribe.summary.no_text"))

    base_url = payload.base_url.strip().rstrip("/")
    if not base_url:
        raise HTTPException(status_code=400, detail=t("transcribe.summary.base_url"))
    if not payload.model.strip():
        raise HTTPException(status_code=400, detail=t("transcribe.summary.model"))

    body = {
        "model": payload.model.strip(),
        "messages": [
            {
                "role": "system",
                "content": t("transcribe.summary.prompt"),
            },
            {"role": "user", "content": text},
        ],
        "temperature": 0.3,
        "stream": False,
    }
    headers = {"Content-Type": "application/json"}
    if payload.api_key.strip():
        headers["Authorization"] = f"Bearer {payload.api_key.strip()}"

    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=_json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            data = _json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")
        except Exception:
            detail = ""
        raise HTTPException(
            status_code=502,
            detail=t("transcribe.summary.http_error", url=base_url, code=exc.code, detail=detail).strip(),
        )
    except urllib.error.URLError as exc:
        raise HTTPException(
            status_code=502,
            detail=t("transcribe.summary.unreachable", url=base_url, reason=exc.reason),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=t("transcribe.summary.failed", url=base_url, error=exc))

    try:
        summary = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise HTTPException(status_code=502, detail=t("transcribe.summary.bad_response"))

    return TranscribeSummarizeResponse(summary=summary)


@router.get("/api/transcribe/jobs/{job_id}/complete")
async def transcribe_job_complete(job_id: str) -> dict:
    _require_transcribe_job(job_id)
    manifest = TRANSCRIBE_STORE.get_complete_manifest(job_id)
    if manifest is None:
        raise HTTPException(status_code=404, detail=t("transcribe.complete.missing"))
    return manifest


@router.get("/api/transcribe/jobs/{job_id}/complete/file")
async def transcribe_job_complete_file(job_id: str, path: str) -> FileResponse:
    _require_transcribe_job(job_id)
    resolved = TRANSCRIBE_STORE.get_complete_file(job_id, path)
    if resolved is None:
        raise HTTPException(status_code=404, detail=t("transcribe.complete.file_missing"))
    media_type = mimetypes.guess_type(resolved.name)[0] or "application/octet-stream"
    return FileResponse(str(resolved), media_type=media_type, content_disposition_type="inline")


@router.get("/api/transcribe/jobs/{job_id}/complete/zip")
async def transcribe_job_complete_zip(job_id: str) -> FileResponse:
    _require_transcribe_job(job_id)
    zip_path = TRANSCRIBE_STORE.get_zip(job_id)
    if zip_path is None:
        raise HTTPException(status_code=404, detail=t("transcribe.complete.zip_missing"))
    return FileResponse(str(zip_path), filename=zip_path.name, media_type="application/zip")


@router.post("/api/transcribe/jobs/{job_id}/complete/open-folder")
async def transcribe_job_complete_open_folder(job_id: str) -> dict:
    _require_transcribe_job(job_id)
    ok = TRANSCRIBE_STORE.open_complete_folder(job_id)
    if not ok:
        raise HTTPException(status_code=400, detail=t("server.open_folder_failed"))
    return {"ok": True}
