from __future__ import annotations

import base64
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, UploadFile
from starlette.concurrency import run_in_threadpool

from api.helpers import _read_upload_image
from api.schemas import KtxBatchResponse, KtxPresetInfo, KtxPresetsResponse, KtxSingleResponse
from src.i18n import t
from src.ktx import (
    DEFAULT_PRESET as KTX_DEFAULT_PRESET,
    batch_convert as ktx_batch_convert,
    collect_images as ktx_collect_images,
    convert_file as ktx_convert_file,
    find_toktx as ktx_find_toktx,
    install_hint as ktx_install_hint,
    list_presets as ktx_list_presets,
    summarize as ktx_summarize,
)

router = APIRouter()


@router.get("/api/ktx/presets", response_model=KtxPresetsResponse)
async def ktx_presets() -> KtxPresetsResponse:
    toktx_found = ktx_find_toktx() is not None
    return KtxPresetsResponse(
        presets=[
            KtxPresetInfo(key=key, label=label, is_default=(key == KTX_DEFAULT_PRESET))
            for key, label in ktx_list_presets()
        ],
        default_preset=KTX_DEFAULT_PRESET,
        toktx_found=toktx_found,
        install_hint=None if toktx_found else ktx_install_hint(),
    )


@router.post("/api/ktx/single", response_model=KtxSingleResponse)
async def ktx_single(
    file: UploadFile = File(...),
    preset: str = Form(KTX_DEFAULT_PRESET),
    auto_align: bool = Form(True),
    auto_preset: bool = Form(False),
    validate_quality: bool = Form(False),
) -> KtxSingleResponse:
    if ktx_find_toktx() is None:
        return KtxSingleResponse(success=False, summary=t("server.ktx.missing"))

    _, image = await _read_upload_image(file)

    filename_stem = Path(file.filename or "texture").stem or "texture"

    def work() -> KtxSingleResponse:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            input_png = tmp / "input.png"
            output_ktx = tmp / f"{filename_stem}.ktx"
            image.save(input_png, format="PNG")

            result = ktx_convert_file(
                input_png,
                output_ktx,
                preset=preset,
                overwrite=True,
                auto_align=auto_align,
                auto_preset=auto_preset,
                validate_quality=validate_quality,
            )

            if not result.success:
                return KtxSingleResponse(success=False, summary=result.error or t("server.ktx.failed"))

            summary_lines = [
                t("server.ktx.converted", name=f"{filename_stem}.ktx", ms=result.duration_ms),
                f"PNG {result.size_input / 1024:.0f} KB -> KTX {result.size_output / 1024:.0f} KB",
                f"Preset: {'auto' if auto_preset else preset}",
            ]
            if result.preprocessed and result.pre_size != result.final_size:
                summary_lines.append(t("server.ktx.aligned", before=result.pre_size, after=result.final_size))
            if result.psnr is not None:
                quality = f"PSNR {result.psnr:.1f} dB {result.quality_grade}"
                if result.ssim is not None:
                    quality += f" / SSIM {result.ssim:.4f}"
                summary_lines.append(quality)

            return KtxSingleResponse(
                success=True,
                summary="\n".join(summary_lines),
                filename=output_ktx.name,
                ktx_b64=base64.b64encode(output_ktx.read_bytes()).decode("ascii"),
                duration_ms=result.duration_ms,
                size_input=result.size_input,
                size_output=result.size_output,
                ratio=result.ratio,
            )

    return await run_in_threadpool(work)


@router.post("/api/ktx/batch", response_model=KtxBatchResponse)
async def ktx_batch(
    folder_path: str = Form(...),
    output_path: str = Form(...),
    preset: str = Form(KTX_DEFAULT_PRESET),
    recursive: bool = Form(True),
    flatten: bool = Form(False),
    auto_align: bool = Form(True),
    auto_preset: bool = Form(False),
    validate_quality: bool = Form(False),
    max_workers: int = Form(4),
) -> KtxBatchResponse:
    if ktx_find_toktx() is None:
        return KtxBatchResponse(success=False, summary=t("server.ktx.missing"))

    def work() -> KtxBatchResponse:
        folder = Path(folder_path).expanduser().resolve()
        out = Path(output_path).expanduser().resolve()

        if not folder.exists() or not folder.is_dir():
            return KtxBatchResponse(success=False, summary=t("server.ktx.input_missing", path=folder))

        images = ktx_collect_images(folder, recursive=recursive)
        if not images:
            return KtxBatchResponse(success=False, summary=t("server.ktx.no_images", path=folder))

        workers = max(1, min(int(max_workers), 16))
        results = ktx_batch_convert(
            images,
            out,
            preset=preset,
            base_dir=None if flatten else folder,
            overwrite=True,
            auto_align=auto_align,
            auto_preset=auto_preset,
            validate_quality=validate_quality,
            max_workers=workers,
        )
        fail_count = sum(1 for result in results if not result.success)

        return KtxBatchResponse(
            success=fail_count == 0,
            summary=ktx_summarize(results),
            input_count=len(images),
            output_dir=str(out),
        )

    return await run_in_threadpool(work)
