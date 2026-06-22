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
import importlib.util
import json as _json
import mimetypes
import shutil
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import replace as dc_replace
from pathlib import Path
from typing import Literal

import resvg_py
from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from PIL import Image
from pydantic import BaseModel

from src.processor import (
    AVAILABLE_MODELS,
    DEFAULT_MODEL,
    BackgroundOptions,
    VectorOptions,
    _pick_chroma_key,  # noqa: PLC2701
    png_to_svg,
    process_image,
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
from add_ktx_orientation import patch_orientation
from packages import (
    MANAGER as pkg_manager,
    list_packages as pkg_list_packages,
    stream_job as pkg_stream_job,
)
from transcribe.jobs import (
    DEFAULT_MODEL as TRANSCRIBE_DEFAULT_MODEL,
    STORE as TRANSCRIBE_STORE,
    UPLOAD_DIR as TRANSCRIBE_UPLOAD_DIR,
    VALID_FORMATS as TRANSCRIBE_VALID_FORMATS,
    VALID_MODELS as TRANSCRIBE_VALID_MODELS,
    model_catalog as transcribe_model_catalog,
    venv_available as transcribe_venv_available,
    whisperx_available as transcribe_whisperx_available,
)
from imgpdf.jobs import (
    STORE as IMGPDF_STORE,
    UPLOAD_DIR as IMGPDF_UPLOAD_DIR,
)
from imgpdf.vision import tesseract_available as imgpdf_tesseract_available
from imgpdf import editor as imgpdf_editor


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


SUPPORTED_BATCH_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif"}
PORTFOLIO_KTX_WIDTH = 960
PORTFOLIO_KTX_HEIGHT = 540


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


def _img_to_b64(img: Image.Image, fmt: str = "png") -> str:
    buf = io.BytesIO()
    if str(fmt).lower() == "webp":
        img.save(buf, format="WEBP", quality=92, method=6)
    else:
        img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


async def _read_upload_image(file: UploadFile) -> tuple[bytes, Image.Image]:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        src_img = Image.open(io.BytesIO(raw))
        src_img.load()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image: {exc}") from exc
    return raw, src_img


def _render_svg_to_b64_png(svg: str, max_dim: int = 800, background: str | None = None) -> str:
    kwargs: dict = dict(svg_string=svg, width=max_dim, height=max_dim)
    if background is not None:
        kwargs["background"] = background
    png_bytes = bytes(resvg_py.svg_to_bytes(**kwargs))
    return base64.b64encode(png_bytes).decode("ascii")


def _has_python_module(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def _safe_download_name(name: str | None, default: str, suffix: str) -> str:
    raw = Path(name or default).name.strip()
    safe = "".join(ch for ch in raw if ch.isalnum() or ch in "._- ")
    safe = safe.strip(" .") or default
    if not safe.lower().endswith(suffix):
        safe += suffix
    return safe


def _collect_pipeline_inputs(path: Path, recursive: bool = True) -> list[Path]:
    if path.is_file():
        return [path] if path.suffix.lower() in SUPPORTED_BATCH_EXT else []
    if path.is_dir():
        pattern = "**/*" if recursive else "*"
        return sorted(p for p in path.glob(pattern) if p.is_file() and p.suffix.lower() in SUPPORTED_BATCH_EXT)
    return []


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


class CapabilityResponse(BaseModel):
    status: str
    models_count: int
    toktx_found: bool
    alktx2_found: bool
    default_model: str
    default_ktx_preset: str
    modules: list[str]
    endpoints: list[str]


class BatchPipelineFile(BaseModel):
    input_path: str
    success: bool
    outputs: list[str] = []
    method_used: str | None = None
    duration_ms: int = 0
    error: str | None = None


class BatchPipelineResponse(BaseModel):
    success: bool
    summary: str
    total: int = 0
    success_count: int = 0
    failure_count: int = 0
    output_dir: str | None = None
    files: list[BatchPipelineFile] = []


class KtxPatchResponse(BaseModel):
    success: bool
    summary: str
    filename: str | None = None
    ktx_b64: str | None = None
    saved_path: str | None = None
    size_input: int = 0
    size_output: int = 0


class PortfolioKtxResponse(BaseModel):
    success: bool
    summary: str
    filename: str | None = None
    ktx_b64: str | None = None
    saved_path: str | None = None
    duration_ms: int = 0
    size_input: int = 0
    size_output: int = 0
    target_width: int = PORTFOLIO_KTX_WIDTH
    target_height: int = PORTFOLIO_KTX_HEIGHT


class TranscribeJobCreated(BaseModel):
    job_id: str


class TranscribeModelInfo(BaseModel):
    key: str
    label: str
    downloaded: bool
    is_default: bool


class TranscribeModelsResponse(BaseModel):
    models: list[TranscribeModelInfo]


class TranscribeCapabilitiesResponse(BaseModel):
    ffmpeg: bool
    whisperx: bool
    diarization: bool
    venv: bool
    default_model: str


class TranscribeSummarizeRequest(BaseModel):
    base_url: str
    api_key: str = ""
    model: str
    language: str = "pt"


class TranscribeSummarizeResponse(BaseModel):
    summary: str


# ────────── Endpoints ──────────


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/capabilities", response_model=CapabilityResponse)
async def capabilities() -> CapabilityResponse:
    endpoints = sorted(
        route.path
        for route in app.routes
        if getattr(route, "path", "").startswith("/api")
    )
    return CapabilityResponse(
        status="ok",
        models_count=len(AVAILABLE_MODELS),
        toktx_found=ktx_find_toktx() is not None,
        alktx2_found=_has_python_module("alktx2"),
        default_model=DEFAULT_MODEL,
        default_ktx_preset=KTX_DEFAULT_PRESET,
        modules=[
            "background_removal",
            "svg_vectorization",
            "pipeline_batch",
            "ktx_toktx",
            "ktx_orientation_patch",
            "portfolio_ktx_960x540",
            "image_to_pdf",
        ],
        endpoints=endpoints,
    )


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
    output_format: Literal["png", "webp"] = Form("png"),
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
    _, src_img = await _read_upload_image(file)

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
        cleaned_png_b64=_img_to_b64(cleaned, output_format),
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
    _, src_img = await _read_upload_image(file)

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
    output_format: Literal["png", "webp"] = Form("png"),
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
    _, src_img = await _read_upload_image(file)

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
        cleaned_png_b64=_img_to_b64(cleaned, output_format),
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

    _, image = await _read_upload_image(file)

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


@app.post("/api/batch/pipeline", response_model=BatchPipelineResponse)
async def batch_pipeline(
    input_path: str = Form(...),
    output_dir: str = Form("output"),
    recursive: bool = Form(True),
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
    no_svg: bool = Form(False),
    no_bg_removal: bool = Form(False),
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
) -> BatchPipelineResponse:
    source = Path(input_path).expanduser().resolve()
    out = Path(output_dir).expanduser().resolve()

    if not source.exists():
        return BatchPipelineResponse(success=False, summary=f"Input not found: {source}")

    inputs = _collect_pipeline_inputs(source, recursive=recursive)
    if not inputs:
        return BatchPipelineResponse(success=False, summary=f"No supported images found in {source}")

    out.mkdir(parents=True, exist_ok=True)

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
    )
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

    files: list[BatchPipelineFile] = []
    total_t0 = time.perf_counter()
    svg_bg = _hex_to_rgb(flatten_color)

    for src in inputs:
        start = time.perf_counter()
        try:
            if no_bg_removal:
                svg_path = out / f"{src.stem}.svg"
                with Image.open(src) as img:
                    png_to_svg(img, output_path=svg_path, options=vec_opts, background_color=svg_bg)
                files.append(
                    BatchPipelineFile(
                        input_path=str(src),
                        success=True,
                        outputs=[str(svg_path)],
                        method_used="no_bg_removal",
                        duration_ms=int((time.perf_counter() - start) * 1000),
                    )
                )
                continue

            result = process_image(
                src,
                output_dir=out,
                bg_options=bg_opts,
                vec_options=vec_opts,
                make_svg=not no_svg,
                base_name=src.stem,
                svg_background=svg_bg,
            )
            outputs = [
                str(path)
                for path in (result.cleaned_path, result.svg_path, result.svg_clean_path)
                if path is not None
            ]
            files.append(
                BatchPipelineFile(
                    input_path=str(src),
                    success=True,
                    outputs=outputs,
                    method_used=result.method_used,
                    duration_ms=int((time.perf_counter() - start) * 1000),
                )
            )
        except Exception as exc:
            files.append(
                BatchPipelineFile(
                    input_path=str(src),
                    success=False,
                    duration_ms=int((time.perf_counter() - start) * 1000),
                    error=str(exc),
                )
            )

    failures = [item for item in files if not item.success]
    success_count = len(files) - len(failures)
    total_ms = int((time.perf_counter() - total_t0) * 1000)
    lines = [
        f"Processed {success_count}/{len(files)} image(s) in {total_ms / 1000:.2f}s",
        f"Output: {out}",
    ]
    if failures:
        lines.append("")
        lines.append("Failures:")
        lines.extend(f"- {Path(item.input_path).name}: {item.error}" for item in failures)

    return BatchPipelineResponse(
        success=not failures,
        summary="\n".join(lines),
        total=len(files),
        success_count=success_count,
        failure_count=len(failures),
        output_dir=str(out),
        files=files,
    )


@app.post("/api/ktx/orientation", response_model=KtxPatchResponse)
async def ktx_orientation(
    file: UploadFile = File(...),
    output_name: str = Form(""),
    output_path: str = Form(""),
) -> KtxPatchResponse:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    stem = Path(output_name or file.filename or "texture").stem or "texture"
    filename = _safe_download_name(stem, "texture", ".ktx")

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            input_ktx = tmp / "input.ktx"
            input_ktx.write_bytes(raw)
            patch_orientation(input_ktx)
            patched = input_ktx.read_bytes()
    except Exception as exc:
        return KtxPatchResponse(success=False, summary=f"KTX orientation patch failed: {exc}")

    saved_path = None
    if output_path.strip():
        out_dir = Path(output_path).expanduser().resolve()
        out_dir.mkdir(parents=True, exist_ok=True)
        saved = out_dir / filename
        saved.write_bytes(patched)
        saved_path = str(saved)

    return KtxPatchResponse(
        success=True,
        summary="KTXorientation=rd is present.",
        filename=filename,
        ktx_b64=base64.b64encode(patched).decode("ascii"),
        saved_path=saved_path,
        size_input=len(raw),
        size_output=len(patched),
    )


@app.post("/api/ktx/portfolio", response_model=PortfolioKtxResponse)
async def portfolio_ktx(
    file: UploadFile = File(...),
    output_name: str = Form(""),
    output_path: str = Form(""),
) -> PortfolioKtxResponse:
    if not _has_python_module("alktx2"):
        return PortfolioKtxResponse(
            success=False,
            summary=(
                "alktx2 is not installed in this venv. "
                "Install with: python -m pip install alktx2"
            ),
        )

    raw, image = await _read_upload_image(file)
    stem = Path(output_name or file.filename or "portfolio-texture").stem or "portfolio-texture"
    filename = _safe_download_name(stem, "portfolio-texture", ".ktx")
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
        return PortfolioKtxResponse(success=False, summary=f"Portfolio KTX conversion failed: {exc}")

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
            f"Fit {source_size[0]}x{source_size[1]} -> {fitted_size[0]}x{fitted_size[1]}",
            f"Canvas {PORTFOLIO_KTX_WIDTH}x{PORTFOLIO_KTX_HEIGHT}, ETC1S q255, sRGB, no mipmaps",
            f"PNG {len(raw) / 1024:.0f} KB -> KTX {len(ktx_bytes) / 1024:.0f} KB",
        ]
    )
    if saved_path:
        summary += f"\nSaved: {saved_path}"

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


# ────────── Transcribe ──────────


def _parse_formats(formats: str) -> list[str]:
    requested = [item.strip().lower() for item in formats.split(",") if item.strip()]
    valid = [item for item in requested if item in TRANSCRIBE_VALID_FORMATS]
    return valid or ["txt", "srt", "vtt", "json"]


@app.post("/api/transcribe", response_model=TranscribeJobCreated)
async def transcribe_create(
    file: UploadFile | None = File(None),
    local_path: str = Form(""),
    url: str = Form(None),
    model: str = Form(TRANSCRIBE_DEFAULT_MODEL),
    language: str = Form("auto"),
    formats: str = Form("txt,srt,vtt,json,lrc"),
    vad: bool = Form(False),
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
    selected_model = model if model in TRANSCRIBE_VALID_MODELS else TRANSCRIBE_DEFAULT_MODEL

    source_url = (url or "").strip()

    input_path: str | None = None
    if file is not None and file.filename:
        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail="Arquivo enviado esta vazio.")
        TRANSCRIBE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        safe_name = Path(file.filename).name or "upload"
        target = TRANSCRIBE_UPLOAD_DIR / f"{uuid.uuid4().hex}_{safe_name}"
        target.write_bytes(raw)
        input_path = str(target)
    elif local_path.strip():
        candidate = Path(local_path.strip()).expanduser()
        if not candidate.exists():
            raise HTTPException(status_code=400, detail=f"Caminho local nao encontrado: {candidate}")
        input_path = str(candidate)
    elif source_url:
        input_path = None
    else:
        raise HTTPException(status_code=400, detail="Envie um arquivo, informe local_path ou uma url.")

    options = {
        "input_path": input_path,
        "url": source_url or None,
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
    job_id = TRANSCRIBE_STORE.enqueue(options)
    return TranscribeJobCreated(job_id=job_id)


@app.get("/api/transcribe/models", response_model=TranscribeModelsResponse)
async def transcribe_models() -> TranscribeModelsResponse:
    return TranscribeModelsResponse(
        models=[TranscribeModelInfo(**entry) for entry in transcribe_model_catalog()]
    )


@app.get("/api/transcribe/capabilities", response_model=TranscribeCapabilitiesResponse)
async def transcribe_capabilities() -> TranscribeCapabilitiesResponse:
    whisperx = transcribe_whisperx_available()
    return TranscribeCapabilitiesResponse(
        ffmpeg=shutil.which("ffmpeg") is not None,
        whisperx=whisperx,
        diarization=whisperx,
        venv=transcribe_venv_available(),
        default_model=TRANSCRIBE_DEFAULT_MODEL,
    )


@app.get("/api/transcribe/jobs/{job_id}")
async def transcribe_job(job_id: str) -> dict:
    state = TRANSCRIBE_STORE.get(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Job nao encontrado.")
    return state


@app.get("/api/transcribe/jobs/{job_id}/stream")
async def transcribe_job_stream(job_id: str) -> StreamingResponse:
    if TRANSCRIBE_STORE.get(job_id) is None:
        raise HTTPException(status_code=404, detail="Job nao encontrado.")
    return StreamingResponse(
        TRANSCRIBE_STORE.stream(job_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/transcribe/jobs/{job_id}/download")
async def transcribe_job_download(job_id: str, format: str) -> FileResponse:
    if TRANSCRIBE_STORE.get(job_id) is None:
        raise HTTPException(status_code=404, detail="Job nao encontrado.")
    fmt = format.strip().lower()
    path = TRANSCRIBE_STORE.get_file(job_id, fmt)
    if path is None:
        raise HTTPException(status_code=404, detail=f"Arquivo '{fmt}' indisponivel para este job.")
    return FileResponse(str(path), filename=path.name, media_type="application/octet-stream")


@app.get("/api/transcribe/jobs/{job_id}/audio")
async def transcribe_job_audio(job_id: str) -> FileResponse:
    if TRANSCRIBE_STORE.get(job_id) is None:
        raise HTTPException(status_code=404, detail="Job nao encontrado.")
    path = TRANSCRIBE_STORE.get_input_path(job_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Midia de entrada indisponivel para este job.")
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(
        str(path),
        media_type=media_type,
        content_disposition_type="inline",
    )


@app.post("/api/transcribe/jobs/{job_id}/summarize", response_model=TranscribeSummarizeResponse)
async def transcribe_job_summarize(job_id: str, payload: TranscribeSummarizeRequest) -> TranscribeSummarizeResponse:
    segments = TRANSCRIBE_STORE.get_segments(job_id)
    if segments is None:
        raise HTTPException(status_code=404, detail="Job nao encontrado.")
    text = "\n".join((seg.get("text") or "").strip() for seg in segments if (seg.get("text") or "").strip())
    if not text.strip():
        raise HTTPException(status_code=400, detail="Este job ainda nao tem texto transcrito para resumir.")

    base_url = payload.base_url.strip().rstrip("/")
    if not base_url:
        raise HTTPException(status_code=400, detail="Informe a base_url do endpoint LLM (ex: http://localhost:11434/v1).")
    if not payload.model.strip():
        raise HTTPException(status_code=400, detail="Informe o modelo do LLM.")

    body = {
        "model": payload.model.strip(),
        "messages": [
            {
                "role": "system",
                "content": "Voce resume transcricoes em PORTUGUES de forma clara e estruturada (titulo, bullets dos pontos principais, e proximos passos se houver).",
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
            detail=f"O LLM em {base_url} respondeu com erro {exc.code}. {detail}".strip(),
        )
    except urllib.error.URLError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Nao consegui falar com o LLM em {base_url}. Verifique se o Ollama/endpoint esta rodando. ({exc.reason})",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Falha ao resumir via LLM em {base_url}: {exc}")

    try:
        summary = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise HTTPException(status_code=502, detail="Resposta do LLM em formato inesperado (sem choices/message).")

    return TranscribeSummarizeResponse(summary=summary)


@app.get("/api/transcribe/jobs/{job_id}/complete")
async def transcribe_job_complete(job_id: str) -> dict:
    if TRANSCRIBE_STORE.get(job_id) is None:
        raise HTTPException(status_code=404, detail="Job nao encontrado.")
    manifest = TRANSCRIBE_STORE.get_complete_manifest(job_id)
    if manifest is None:
        raise HTTPException(status_code=404, detail="Este job nao tem pacote Complete.")
    return manifest


@app.get("/api/transcribe/jobs/{job_id}/complete/file")
async def transcribe_job_complete_file(job_id: str, path: str) -> FileResponse:
    if TRANSCRIBE_STORE.get(job_id) is None:
        raise HTTPException(status_code=404, detail="Job nao encontrado.")
    resolved = TRANSCRIBE_STORE.get_complete_file(job_id, path)
    if resolved is None:
        raise HTTPException(status_code=404, detail="Arquivo nao encontrado no pacote.")
    media_type = mimetypes.guess_type(resolved.name)[0] or "application/octet-stream"
    return FileResponse(str(resolved), media_type=media_type, content_disposition_type="inline")


@app.get("/api/transcribe/jobs/{job_id}/complete/zip")
async def transcribe_job_complete_zip(job_id: str) -> FileResponse:
    if TRANSCRIBE_STORE.get(job_id) is None:
        raise HTTPException(status_code=404, detail="Job nao encontrado.")
    zip_path = TRANSCRIBE_STORE.get_zip(job_id)
    if zip_path is None:
        raise HTTPException(status_code=404, detail="Zip indisponivel para este job.")
    return FileResponse(str(zip_path), filename=zip_path.name, media_type="application/zip")


@app.post("/api/transcribe/jobs/{job_id}/complete/open-folder")
async def transcribe_job_complete_open_folder(job_id: str) -> dict:
    if TRANSCRIBE_STORE.get(job_id) is None:
        raise HTTPException(status_code=404, detail="Job nao encontrado.")
    ok = TRANSCRIBE_STORE.open_complete_folder(job_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Nao foi possivel abrir a pasta neste ambiente.")
    return {"ok": True}


class PackageInfo(BaseModel):
    id: str
    name: str
    description: str
    category: str
    optional: bool
    size_hint: str
    installed: bool
    detail: str
    installable: bool
    manual_hint: str
    unlocks: list[str]


class PackagesResponse(BaseModel):
    packages: list[PackageInfo]


class PackageInstallStarted(BaseModel):
    job_id: str


@app.get("/api/packages", response_model=PackagesResponse)
async def packages_list() -> PackagesResponse:
    return PackagesResponse(packages=[PackageInfo(**item) for item in pkg_list_packages()])


@app.post("/api/packages/{package_id}/install", response_model=PackageInstallStarted)
async def packages_install(package_id: str) -> PackageInstallStarted:
    job_id = pkg_manager.start(package_id)
    if job_id is None:
        raise HTTPException(status_code=404, detail="Pacote desconhecido ou sem instalador automatico.")
    return PackageInstallStarted(job_id=job_id)


@app.get("/api/packages/jobs/{job_id}/stream")
async def packages_stream(job_id: str) -> StreamingResponse:
    return StreamingResponse(
        pkg_stream_job(job_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/packages/jobs/{job_id}")
async def packages_job(job_id: str) -> dict:
    job = pkg_manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job nao encontrado.")
    return job.snapshot()


# ────────── Image -> PDF ──────────


class ImagePdfJobCreated(BaseModel):
    job_id: str


@app.post("/api/image-to-pdf", response_model=ImagePdfJobCreated)
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
            raise HTTPException(status_code=400, detail="Arquivo enviado esta vazio.")
        IMGPDF_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        safe_name = Path(file.filename).name or "imagem"
        target = IMGPDF_UPLOAD_DIR / f"{uuid.uuid4().hex}_{safe_name}"
        target.write_bytes(raw)
        input_path = str(target)
    elif local_path.strip():
        candidate = Path(local_path.strip()).expanduser()
        if not candidate.exists():
            raise HTTPException(status_code=400, detail=f"Caminho local nao encontrado: {candidate}")
        input_path = str(candidate)
    else:
        raise HTTPException(status_code=400, detail="Envie uma imagem ou informe local_path.")

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


@app.get("/api/image-to-pdf/capabilities")
async def image_to_pdf_capabilities() -> dict:
    return {"tesseract": imgpdf_tesseract_available()}


@app.get("/api/image-to-pdf/jobs/{job_id}")
async def image_to_pdf_job(job_id: str) -> dict:
    state = IMGPDF_STORE.get(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Job nao encontrado.")
    return state


@app.get("/api/image-to-pdf/jobs/{job_id}/stream")
async def image_to_pdf_stream(job_id: str) -> StreamingResponse:
    if IMGPDF_STORE.get(job_id) is None:
        raise HTTPException(status_code=404, detail="Job nao encontrado.")
    return StreamingResponse(
        IMGPDF_STORE.stream(job_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/image-to-pdf/jobs/{job_id}/download")
async def image_to_pdf_download(job_id: str) -> FileResponse:
    if IMGPDF_STORE.get(job_id) is None:
        raise HTTPException(status_code=404, detail="Job nao encontrado.")
    path = IMGPDF_STORE.get_pdf(job_id)
    if path is None:
        raise HTTPException(status_code=404, detail="PDF indisponivel para este job.")
    return FileResponse(str(path), filename="documento.pdf", media_type="application/pdf")


@app.get("/api/image-to-pdf/jobs/{job_id}/preview")
async def image_to_pdf_preview(job_id: str) -> FileResponse:
    if IMGPDF_STORE.get(job_id) is None:
        raise HTTPException(status_code=404, detail="Job nao encontrado.")
    path = IMGPDF_STORE.get_preview(job_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Preview indisponivel para este job.")
    return FileResponse(str(path), media_type="image/png", content_disposition_type="inline")


@app.post("/api/image-to-pdf/jobs/{job_id}/open-folder")
async def image_to_pdf_open_folder(job_id: str) -> dict:
    if IMGPDF_STORE.get(job_id) is None:
        raise HTTPException(status_code=404, detail="Job nao encontrado.")
    if not IMGPDF_STORE.open_folder(job_id):
        raise HTTPException(status_code=400, detail="Nao foi possivel abrir a pasta neste ambiente.")
    return {"ok": True}


# ────────── Editor (Canva-like) ──────────


@app.post("/api/editor/import")
async def editor_import(
    file: UploadFile = File(...),
    render_bg: bool = Form(False),
) -> dict:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    name = (file.filename or "").lower()
    try:
        if name.endswith(".pdf"):
            return imgpdf_editor.extract_elements(raw, render_bg=render_bg)
        # imagem: vira 1 PDF de 1 pagina e extrai (sem texto -> 0 elementos, mas serve de fundo)
        import fitz
        doc = fitz.open(stream=raw, filetype=Path(name).suffix.lstrip(".") or "png")
        pdf_bytes = doc.convert_to_pdf()
        doc.close()
        return imgpdf_editor.extract_elements(pdf_bytes, render_bg=True)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Nao consegui ler o arquivo: {exc}")


@app.post("/api/editor/export")
async def editor_export(payload: dict = Body(...)) -> Response:
    if not isinstance(payload, dict) or not payload.get("elements"):
        raise HTTPException(status_code=400, detail="Envie elements no corpo.")
    try:
        data = imgpdf_editor.build_pdf(payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao gerar PDF: {exc}")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="documento-editado.pdf"'},
    )


@app.post("/api/editor/render-html")
async def editor_render_html(payload: dict = Body(...)) -> Response:
    html = (payload or {}).get("html") if isinstance(payload, dict) else None
    if not html or not isinstance(html, str):
        raise HTTPException(status_code=400, detail="Envie 'html' no corpo.")
    try:
        data = imgpdf_editor.render_html_pdf(html)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="documento-editado.pdf"'},
    )


@app.post("/api/editor/render-png")
async def editor_render_png(payload: dict = Body(...)) -> Response:
    if not isinstance(payload, dict) or not payload.get("html"):
        raise HTTPException(status_code=400, detail="Envie 'html' no corpo.")
    try:
        data = imgpdf_editor.render_html_png(
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
        headers={"Content-Disposition": 'attachment; filename="documento-editado.png"'},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
