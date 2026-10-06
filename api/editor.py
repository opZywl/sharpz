from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from imgpdf import editor as imgpdf_editor
from src.i18n import t

router = APIRouter()


@router.post("/api/editor/import")
async def editor_import(
    file: UploadFile = File(...),
    render_bg: bool = Form(False),
) -> dict:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail=t("server.file_empty"))
    name = (file.filename or "").lower()

    def work() -> dict:
        if name.endswith(".pdf"):
            return imgpdf_editor.extract_elements(raw, render_bg=render_bg)
        # imagem: vira 1 PDF de 1 pagina e extrai (sem texto -> 0 elementos, mas serve de fundo)
        import fitz
        doc = fitz.open(stream=raw, filetype=Path(name).suffix.lstrip(".") or "png")
        pdf_bytes = doc.convert_to_pdf()
        doc.close()
        return imgpdf_editor.extract_elements(pdf_bytes, render_bg=True)

    try:
        return await run_in_threadpool(work)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=t("editor.read_failed", error=exc))


def _editor_disposition(extension: str) -> dict[str, str]:
    return {"Content-Disposition": f'attachment; filename="{t("editor.filename")}.{extension}"'}


@router.post("/api/editor/export")
async def editor_export(payload: dict = Body(...)) -> Response:
    if not isinstance(payload, dict) or not payload.get("elements"):
        raise HTTPException(status_code=400, detail=t("editor.elements_missing"))
    try:
        data = await run_in_threadpool(imgpdf_editor.build_pdf, payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=t("editor.pdf_failed", error=exc))
    return Response(
        content=data,
        media_type="application/pdf",
        headers=_editor_disposition("pdf"),
    )


@router.post("/api/editor/render-html")
async def editor_render_html(payload: dict = Body(...)) -> Response:
    html = (payload or {}).get("html") if isinstance(payload, dict) else None
    if not html or not isinstance(html, str):
        raise HTTPException(status_code=400, detail=t("editor.html_missing"))
    try:
        data = await run_in_threadpool(imgpdf_editor.render_html_pdf, html)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return Response(
        content=data,
        media_type="application/pdf",
        headers=_editor_disposition("pdf"),
    )


@router.post("/api/editor/render-png")
async def editor_render_png(payload: dict = Body(...)) -> Response:
    if not isinstance(payload, dict) or not payload.get("html"):
        raise HTTPException(status_code=400, detail=t("editor.html_missing"))
    try:
        data = await run_in_threadpool(
            imgpdf_editor.render_html_png,
            payload["html"],
            float(payload.get("w") or 595.276),
            float(payload.get("h") or 841.89),
            int(payload.get("scale") or 2),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return Response(
        content=data,
        media_type="image/png",
        headers=_editor_disposition("png"),
    )
