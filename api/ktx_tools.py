from __future__ import annotations

import base64
import tempfile
import time
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image
from starlette.concurrency import run_in_threadpool

from add_ktx_orientation import patch_orientation
from api.constants import PORTFOLIO_KTX_HEIGHT, PORTFOLIO_KTX_WIDTH
from api.helpers import _has_python_module, _read_upload_image, _safe_download_name
from api.schemas import KtxPatchResponse, PortfolioKtxResponse
from src.i18n import t

router = APIRouter()


def _fit_to_portfolio_canvas(img: Image.Image, output_path: Path) -> tuple[tuple[int, int], tuple[int, int]]:
    src = img.convert("RGB")
    width, height = src.size
    scale = min(PORTFOLIO_KTX_WIDTH / width, PORTFOLIO_KTX_HEIGHT / height)
    target_w = max(4, int(round(width * scale)) // 4 * 4)
    target_h = max(4, int(round(height * scale)) // 4 * 4)

    resized = src.resize((target_w, target_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (PORTFOLIO_KTX_WIDTH, PORTFOLIO_KTX_HEIGHT), (0, 0, 0))
    offset_x = (PORTFOLIO_KTX_WIDTH - target_w) // 2
    offset_y = (PORTFOLIO_KTX_HEIGHT - target_h) // 2
    canvas.paste(resized, (offset_x, offset_y))
    canvas.save(output_path, format="PNG")
    return (width, height), (target_w, target_h)


@router.post("/api/ktx/orientation", response_model=KtxPatchResponse)
async def ktx_orientation(
    file: UploadFile = File(...),
    output_name: str = Form(""),
    output_path: str = Form(""),
) -> KtxPatchResponse:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail=t("server.file_empty"))

    stem = Path(output_name or file.filename or "texture").stem or "texture"
    filename = _safe_download_name(stem, "texture", ".ktx")

    def work() -> KtxPatchResponse:
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                tmp = Path(tmpdir)
                input_ktx = tmp / "input.ktx"
                input_ktx.write_bytes(raw)
                patch_orientation(input_ktx)
                patched = input_ktx.read_bytes()
        except Exception as exc:
            return KtxPatchResponse(success=False, summary=t("server.orientation.failed", error=exc))

        saved_path = None
        if output_path.strip():
            out_dir = Path(output_path).expanduser().resolve()
            out_dir.mkdir(parents=True, exist_ok=True)
            saved = out_dir / filename
            saved.write_bytes(patched)
            saved_path = str(saved)

        return KtxPatchResponse(
            success=True,
            summary=t("server.orientation.done"),
            filename=filename,
            ktx_b64=base64.b64encode(patched).decode("ascii"),
            saved_path=saved_path,
            size_input=len(raw),
            size_output=len(patched),
        )

    return await run_in_threadpool(work)


@router.post("/api/ktx/portfolio", response_model=PortfolioKtxResponse)
async def portfolio_ktx(
    file: UploadFile = File(...),
    output_name: str = Form(""),
    output_path: str = Form(""),
) -> PortfolioKtxResponse:
    if not _has_python_module("alktx2"):
        return PortfolioKtxResponse(success=False, summary=t("server.portfolio.missing"))

    raw, image = await _read_upload_image(file)
    stem = Path(output_name or file.filename or "portfolio-texture").stem or "portfolio-texture"
    filename = _safe_download_name(stem, "portfolio-texture", ".ktx")

    def work() -> PortfolioKtxResponse:
        start = time.perf_counter()
        try:
            from alktx2 import encode_image_to_ktx2

            with tempfile.TemporaryDirectory() as tmpdir:
                tmp = Path(tmpdir)
                aligned_png = tmp / "aligned.png"
                output_ktx = tmp / filename
                source_size, fitted_size = _fit_to_portfolio_canvas(image, aligned_png)

                encode_image_to_ktx2(
                    str(aligned_png),
                    str(output_ktx),
                    codec="etc1s",
                    quality=255,
                    srgb=True,
                    mipmaps=False,
                    threads=0,
                    verbose=False,
                )
                patch_orientation(output_ktx)
                ktx_bytes = output_ktx.read_bytes()
        except Exception as exc:
            return PortfolioKtxResponse(success=False, summary=t("server.portfolio.failed", error=exc))

        saved_path = None
        if output_path.strip():
            out_dir = Path(output_path).expanduser().resolve()
            out_dir.mkdir(parents=True, exist_ok=True)
            saved = out_dir / filename
            saved.write_bytes(ktx_bytes)
            saved_path = str(saved)

        duration_ms = int((time.perf_counter() - start) * 1000)
        summary = "\n".join(
            [
                t(
                    "server.portfolio.fitted",
                    before=f"{source_size[0]}x{source_size[1]}",
                    after=f"{fitted_size[0]}x{fitted_size[1]}",
                ),
                t("server.portfolio.canvas", size=f"{PORTFOLIO_KTX_WIDTH}x{PORTFOLIO_KTX_HEIGHT}"),
                f"PNG {len(raw) / 1024:.0f} KB -> KTX {len(ktx_bytes) / 1024:.0f} KB",
            ]
        )
        if saved_path:
            summary += "\n" + t("server.portfolio.saved", path=saved_path)

        return PortfolioKtxResponse(
            success=True,
            summary=summary,
            filename=filename,
            ktx_b64=base64.b64encode(ktx_bytes).decode("ascii"),
            saved_path=saved_path,
            duration_ms=duration_ms,
            size_input=len(raw),
            size_output=len(ktx_bytes),
        )

    return await run_in_threadpool(work)
