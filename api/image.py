from __future__ import annotations

import time
from dataclasses import replace as dc_replace
from typing import Literal

from fastapi import APIRouter, File, Form, UploadFile
from starlette.concurrency import run_in_threadpool

from api.helpers import _hex_to_rgb, _hex_to_rgba, _img_to_b64, _read_upload_image, _render_svg_to_b64_png, _require_model
from api.schemas import CleanResponse, PipelineResponse, SvgResponse
from src.processor import (
    DEFAULT_MODEL,
    BackgroundOptions,
    VectorOptions,
    _pick_chroma_key,  # noqa: PLC2701
    png_to_svg,
    remove_background,
    strip_chroma_paths,
)

router = APIRouter()


@router.post("/api/clean", response_model=CleanResponse)
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
    _require_model(model)
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

    def work() -> CleanResponse:
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

    return await run_in_threadpool(work)


@router.post("/api/svg", response_model=SvgResponse)
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

    def work() -> SvgResponse:
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

    return await run_in_threadpool(work)


@router.post("/api/pipeline", response_model=PipelineResponse)
async def pipeline(
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
    saturation: float = Form(1.15),
    contrast: float = Form(1.0),
    color_mode: Literal["color", "binary"] = Form("color"),
    filter_speckle: int = Form(2),
    color_precision: int = Form(8),
    upscale: float = Form(1.0),
    flatten_color: str = Form("#000000"),
) -> PipelineResponse:
    _require_model(model)
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
    )
    vec_opts = VectorOptions(
        color_mode=color_mode,
        filter_speckle=filter_speckle,
        color_precision=color_precision,
        upscale=upscale,
    )

    def work() -> PipelineResponse:
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

    return await run_in_threadpool(work)
