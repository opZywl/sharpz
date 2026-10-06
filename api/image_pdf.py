from __future__ import annotations

import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from api.schemas import ImagePdfJobCreated
from imgpdf.jobs import (
    STORE as IMGPDF_STORE,
    UPLOAD_DIR as IMGPDF_UPLOAD_DIR,
)
from imgpdf.vision import tesseract_available as imgpdf_tesseract_available
from src.i18n import t

router = APIRouter()


@router.post("/api/image-to-pdf", response_model=ImagePdfJobCreated)
async def image_to_pdf_create(
    file: UploadFile | None = File(None),
    local_path: str = Form(""),
    page_mode: Literal["auto", "a4"] = Form("auto"),
    ocr_engine: Literal["auto", "vision", "tesseract"] = Form("auto"),
    verify: bool = Form(True),
    vision_base_url: str = Form(""),
    vision_api_key: str = Form(""),
    vision_model: str = Form(""),
    output_dir: str = Form(""),
    output_name: str = Form(""),
    open_folder: bool = Form(False),
) -> ImagePdfJobCreated:
    input_path: str | None = None
    if file is not None and file.filename:
        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail=t("server.upload_empty"))
        IMGPDF_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        safe_name = Path(file.filename).name or "imagem"
        target = IMGPDF_UPLOAD_DIR / f"{uuid.uuid4().hex}_{safe_name}"
        target.write_bytes(raw)
        input_path = str(target)
    elif local_path.strip():
        candidate = Path(local_path.strip()).expanduser()
        if not candidate.exists():
            raise HTTPException(status_code=400, detail=t("imgpdf.local_missing", path=candidate))
        input_path = str(candidate)
    else:
        raise HTTPException(status_code=400, detail=t("imgpdf.no_source"))

    options = {
        "input_path": input_path,
        "page_mode": page_mode,
        "ocr_engine": ocr_engine,
        "verify": verify,
        "vision": {
            "base_url": vision_base_url.strip(),
            "api_key": vision_api_key.strip(),
            "model": vision_model.strip(),
        },
        "output_dir": output_dir.strip() or None,
        "output_name": output_name.strip() or None,
        "open_folder": open_folder,
    }
    return ImagePdfJobCreated(job_id=IMGPDF_STORE.enqueue(options))


@router.get("/api/image-to-pdf/capabilities")
async def image_to_pdf_capabilities() -> dict:
    return {"tesseract": imgpdf_tesseract_available()}


@router.get("/api/image-to-pdf/jobs/{job_id}")
async def image_to_pdf_job(job_id: str) -> dict:
    state = IMGPDF_STORE.get(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail=t("server.job_not_found"))
    return state


@router.get("/api/image-to-pdf/jobs/{job_id}/stream")
async def image_to_pdf_stream(job_id: str) -> StreamingResponse:
    if IMGPDF_STORE.get(job_id) is None:
        raise HTTPException(status_code=404, detail=t("server.job_not_found"))
    return StreamingResponse(
        IMGPDF_STORE.stream(job_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/api/image-to-pdf/jobs/{job_id}/download")
async def image_to_pdf_download(job_id: str) -> FileResponse:
    if IMGPDF_STORE.get(job_id) is None:
        raise HTTPException(status_code=404, detail=t("server.job_not_found"))
    path = IMGPDF_STORE.get_pdf(job_id)
    if path is None:
        raise HTTPException(status_code=404, detail=t("imgpdf.pdf_missing"))
    return FileResponse(str(path), filename=t("imgpdf.pdf_filename"), media_type="application/pdf")


@router.get("/api/image-to-pdf/jobs/{job_id}/preview")
async def image_to_pdf_preview(job_id: str) -> FileResponse:
    if IMGPDF_STORE.get(job_id) is None:
        raise HTTPException(status_code=404, detail=t("server.job_not_found"))
    path = IMGPDF_STORE.get_preview(job_id)
    if path is None:
        raise HTTPException(status_code=404, detail=t("imgpdf.preview_missing"))
    return FileResponse(str(path), media_type="image/png", content_disposition_type="inline")


@router.post("/api/image-to-pdf/jobs/{job_id}/open-folder")
async def image_to_pdf_open_folder(job_id: str) -> dict:
    if IMGPDF_STORE.get(job_id) is None:
        raise HTTPException(status_code=404, detail=t("server.job_not_found"))
    if not IMGPDF_STORE.open_folder(job_id):
        raise HTTPException(status_code=400, detail=t("server.open_folder_failed"))
    return {"ok": True}
