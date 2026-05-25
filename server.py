"""FastAPI backend for cleanup-image.

Wraps src.processor with HTTP endpoints:
  POST /api/pipeline   — upload image, returns base64 PNG + 2 SVG strings
  POST /api/clean      — only background removal, returns PNG bytes
  POST /api/svg        — only vectorization, returns 2 SVG strings
  GET  /api/models     — list available AI models

Run with:
  python server.py
or:
  uvicorn server:app --reload --port 8000
"""

from __future__ import annotations

import base64
import io
import tempfile
import time
from dataclasses import replace as dc_replace
from pathlib import Path
from typing import Literal

import resvg_py
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

from src.processor import (
    AVAILABLE_MODELS,
    DEFAULT_MODEL,
    BackgroundOptions,
    VectorOptions,
    _pick_chroma_key,  # noqa: PLC2701
    png_to_svg,
    remove_background,
    strip_chroma_paths,
)
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


app = FastAPI(title="Cleanup Image API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5174", "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _hex_to_rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    r, g, b = _hex_to_rgb(hex_color)
    return r, g, b, alpha


def _img_to_b64_png(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _render_svg_to_b64_png(svg: str, max_dim: int = 800, background: str | None = None) -> str:
    kwargs: dict = dict(svg_string=svg, width=max_dim, height=max_dim)
    if background is not None:
        kwargs["background"] = background
    png_bytes = bytes(resvg_py.svg_to_bytes(**kwargs))
    return base64.b64encode(png_bytes).decode("ascii")


# ────────── Models ──────────


class ModelInfo(BaseModel):
    key: str
    label: str
    is_default: bool


class ModelsResponse(BaseModel):
    models: list[ModelInfo]


class PipelineResponse(BaseModel):
    cleaned_png_b64: str
    svg_with_bg: str
    svg_clean: str
    svg_with_bg_preview_b64: str
    svg_clean_preview_b64: str
    method_used: str
    elapsed_ms: int
    image_width: int
    image_height: int


class CleanResponse(BaseModel):
    cleaned_png_b64: str
    method_used: str
    elapsed_ms: int
    image_width: int
    image_height: int


class SvgResponse(BaseModel):
    svg_with_bg: str
    svg_clean: str
    svg_with_bg_preview_b64: str
    svg_clean_preview_b64: str
    elapsed_ms: int
    image_width: int
    image_height: int
    svg_with_bg_bytes: int
    svg_clean_bytes: int


class KtxPresetInfo(BaseModel):
    key: str
    label: str
    is_default: bool


class KtxPresetsResponse(BaseModel):
    presets: list[KtxPresetInfo]
    default_preset: str
    toktx_found: bool
    install_hint: str | None = None


class KtxSingleResponse(BaseModel):
    success: bool
    summary: str
    filename: str | None = None
    ktx_b64: str | None = None
    duration_ms: int = 0
    size_input: int = 0
    size_output: int = 0
    ratio: float = 0


class KtxBatchResponse(BaseModel):
    success: bool
    summary: str
    input_count: int = 0
    output_dir: str | None = None


# ────────── Endpoints ──────────


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/models", response_model=ModelsResponse)
async def list_models() -> ModelsResponse:
    return ModelsResponse(
        models=[
            ModelInfo(key=k, label=v, is_default=(k == DEFAULT_MODEL))
            for k, v in AVAILABLE_MODELS.items()
        ]
    )


@app.post("/api/clean", response_model=CleanResponse)
async def clean_image(
    file: UploadFile = File(...),
    method: Literal["auto", "ai", "luma_dark", "luma_light", "none"] = Form("auto"),
    model: str = Form(DEFAULT_MODEL),
    alpha_matting: bool = Form(True),
    alpha_matting_foreground_threshold: int = Form(240),
    alpha_matting_background_threshold: int = Form(10),
    alpha_matting_erode_size: int = Form(10),
    luma_low: float = Form(0.04),
    luma_high: float = Form(0.95),
    luma_unpremultiply: bool = Form(True),
    luma_denoise: int = Form(0),
    luma_gamma: float = Form(1.0),
    saturation: float = Form(1.0),
    contrast: float = Form(1.0),
    brightness: float = Form(1.0),
    edge_smooth: bool = Form(False),
    use_bg_color: bool = Form(False),
    bg_color: str = Form("#ffffff"),
) -> CleanResponse:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        src_img = Image.open(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image: {exc}") from exc

    bg_opts = BackgroundOptions(
        method=method,
        model=model,
        alpha_matting=alpha_matting,
        alpha_matting_foreground_threshold=alpha_matting_foreground_threshold,
        alpha_matting_background_threshold=alpha_matting_background_threshold,
        alpha_matting_erode_size=alpha_matting_erode_size,
        luma_threshold_low=luma_low,
        luma_threshold_high=luma_high,
        luma_unpremultiply=luma_unpremultiply,
        luma_denoise=luma_denoise,
        luma_gamma=luma_gamma,
        saturation=saturation,
        contrast=contrast,
        brightness=brightness,
        edge_smooth=edge_smooth,
        bg_color=_hex_to_rgba(bg_color) if use_bg_color else None,
    )

    t0 = time.perf_counter()
    cleaned = remove_background(src_img, bg_opts)
    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    actual_method = method
    if method == "auto":
        from src.processor import _detect_method  # noqa: PLC2701
        actual_method = _detect_method(src_img.convert("RGBA"))

    return CleanResponse(
        cleaned_png_b64=_img_to_b64_png(cleaned),
        method_used=actual_method,
        elapsed_ms=elapsed_ms,
        image_width=cleaned.width,
        image_height=cleaned.height,
    )


@app.post("/api/svg", response_model=SvgResponse)
async def vectorize_image(
    file: UploadFile = File(...),
    color_mode: Literal["color", "binary"] = Form("color"),
    hierarchical: Literal["stacked", "cutout"] = Form("stacked"),
    path_mode: Literal["spline", "polygon", "none"] = Form("spline"),
    filter_speckle: int = Form(2),
    color_precision: int = Form(8),
    layer_difference: int = Form(8),
    corner_threshold: int = Form(60),
    length_threshold: float = Form(4.0),
    max_iterations: int = Form(10),
    splice_threshold: int = Form(45),
    path_precision: int = Form(10),
    upscale: float = Form(1.0),
    flatten_color: str = Form("#000000"),
) -> SvgResponse:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        src_img = Image.open(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image: {exc}") from exc

    vec_opts = VectorOptions(
        color_mode=color_mode,
        hierarchical=hierarchical,
        mode=path_mode,
        filter_speckle=filter_speckle,
        color_precision=color_precision,
        layer_difference=layer_difference,
        corner_threshold=corner_threshold,
        length_threshold=length_threshold,
        max_iterations=max_iterations,
        splice_threshold=splice_threshold,
        path_precision=path_precision,
        upscale=upscale,
    )

    t0 = time.perf_counter()
    flatten_rgb = _hex_to_rgb(flatten_color)
    svg_with_bg = png_to_svg(src_img, options=vec_opts, background_color=flatten_rgb)

    chroma_key = _pick_chroma_key(src_img.convert("RGBA"))
    cutout_opts = dc_replace(vec_opts, hierarchical="cutout")
    raw_cutout_svg = png_to_svg(src_img, options=cutout_opts, background_color=chroma_key)
    svg_clean = strip_chroma_paths(raw_cutout_svg, chroma_key)

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    svg_with_bg_preview = _render_svg_to_b64_png(svg_with_bg, max_dim=600)
    svg_clean_preview = _render_svg_to_b64_png(svg_clean, max_dim=600, background=None)

    return SvgResponse(
        svg_with_bg=svg_with_bg,
        svg_clean=svg_clean,
        svg_with_bg_preview_b64=svg_with_bg_preview,
        svg_clean_preview_b64=svg_clean_preview,
        elapsed_ms=elapsed_ms,
        image_width=src_img.width,
        image_height=src_img.height,
        svg_with_bg_bytes=len(svg_with_bg.encode("utf-8")),
        svg_clean_bytes=len(svg_clean.encode("utf-8")),
    )


@app.post("/api/pipeline", response_model=PipelineResponse)
async def pipeline(
    file: UploadFile = File(...),
    method: Literal["auto", "ai", "luma_dark", "luma_light", "none"] = Form("auto"),
    model: str = Form(DEFAULT_MODEL),
    luma_low: float = Form(0.04),
    luma_high: float = Form(0.95),
    luma_unpremultiply: bool = Form(True),
    luma_denoise: int = Form(0),
    luma_gamma: float = Form(1.0),
    saturation: float = Form(1.15),
    contrast: float = Form(1.0),
    color_mode: Literal["color", "binary"] = Form("color"),
    filter_speckle: int = Form(2),
    color_precision: int = Form(8),
    upscale: float = Form(1.0),
    flatten_color: str = Form("#000000"),
) -> PipelineResponse:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        src_img = Image.open(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image: {exc}") from exc

    bg_opts = BackgroundOptions(
        method=method,
        model=model,
        luma_threshold_low=luma_low,
        luma_threshold_high=luma_high,
        luma_unpremultiply=luma_unpremultiply,
        luma_denoise=luma_denoise,
        luma_gamma=luma_gamma,
        saturation=saturation,
        contrast=contrast,
    )
    vec_opts = VectorOptions(
        color_mode=color_mode,
        filter_speckle=filter_speckle,
        color_precision=color_precision,
        upscale=upscale,
    )

    t0 = time.perf_counter()
    cleaned = remove_background(src_img, bg_opts)

    flatten_rgb = _hex_to_rgb(flatten_color)
    svg_with_bg = png_to_svg(cleaned, options=vec_opts, background_color=flatten_rgb)

    chroma_key = _pick_chroma_key(cleaned)
    cutout_opts = dc_replace(vec_opts, hierarchical="cutout")
    raw_cutout_svg = png_to_svg(cleaned, options=cutout_opts, background_color=chroma_key)
    svg_clean = strip_chroma_paths(raw_cutout_svg, chroma_key)

    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    # Render previews via resvg (server-side rasterization)
    svg_with_bg_preview = _render_svg_to_b64_png(svg_with_bg, max_dim=600)
    svg_clean_preview = _render_svg_to_b64_png(svg_clean, max_dim=600, background=None)

    # Resolve actual method that ran (for the response)
    actual_method = method
    if method == "auto":
        from src.processor import _detect_method  # noqa: PLC2701
        actual_method = _detect_method(src_img.convert("RGBA"))

    return PipelineResponse(
        cleaned_png_b64=_img_to_b64_png(cleaned),
        svg_with_bg=svg_with_bg,
        svg_clean=svg_clean,
        svg_with_bg_preview_b64=svg_with_bg_preview,
        svg_clean_preview_b64=svg_clean_preview,
        method_used=actual_method,
        elapsed_ms=elapsed_ms,
        image_width=cleaned.width,
        image_height=cleaned.height,
    )


@app.get("/api/ktx/presets", response_model=KtxPresetsResponse)
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


@app.post("/api/ktx/single", response_model=KtxSingleResponse)
async def ktx_single(
    file: UploadFile = File(...),
    preset: str = Form(KTX_DEFAULT_PRESET),
    auto_align: bool = Form(True),
    auto_preset: bool = Form(False),
    validate_quality: bool = Form(False),
) -> KtxSingleResponse:
    if ktx_find_toktx() is None:
        return KtxSingleResponse(success=False, summary=ktx_install_hint())

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        image = Image.open(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image: {exc}") from exc

    filename_stem = Path(file.filename or "texture").stem or "texture"
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
            return KtxSingleResponse(success=False, summary=result.error or "KTX conversion failed")

        summary_lines = [
            f"Converted {filename_stem}.ktx in {result.duration_ms}ms",
            f"PNG {result.size_input / 1024:.0f} KB -> KTX {result.size_output / 1024:.0f} KB",
            f"Preset: {'auto' if auto_preset else preset}",
        ]
        if result.preprocessed and result.pre_size != result.final_size:
            summary_lines.append(f"Aligned {result.pre_size} -> {result.final_size}")
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


@app.post("/api/ktx/batch", response_model=KtxBatchResponse)
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
        return KtxBatchResponse(success=False, summary=ktx_install_hint())

    folder = Path(folder_path).expanduser().resolve()
    out = Path(output_path).expanduser().resolve()

    if not folder.exists() or not folder.is_dir():
        return KtxBatchResponse(success=False, summary=f"Input folder not found: {folder}")

    images = ktx_collect_images(folder, recursive=recursive)
    if not images:
        return KtxBatchResponse(success=False, summary=f"No PNG/JPG images found in {folder}")

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
