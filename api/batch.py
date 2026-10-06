from __future__ import annotations

import time
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Form
from PIL import Image
from starlette.concurrency import run_in_threadpool

from api.constants import SUPPORTED_BATCH_EXT
from api.helpers import _hex_to_rgb, _require_model
from api.schemas import BatchPipelineFile, BatchPipelineResponse
from src.i18n import t
from src.memory import is_out_of_memory
from src.processor import (
    DEFAULT_MODEL,
    BackgroundOptions,
    ModelOutOfMemory,
    VectorOptions,
    memory_message,
    png_to_svg,
    process_image,
    release_sessions,
)

router = APIRouter()


def _collect_pipeline_inputs(path: Path, recursive: bool = True) -> list[Path]:
    if path.is_file():
        return [path] if path.suffix.lower() in SUPPORTED_BATCH_EXT else []
    if path.is_dir():
        pattern = "**/*" if recursive else "*"
        return sorted(p for p in path.glob(pattern) if p.is_file() and p.suffix.lower() in SUPPORTED_BATCH_EXT)
    return []


@router.post("/api/batch/pipeline", response_model=BatchPipelineResponse)
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
    _require_model(model)

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

    def work() -> BatchPipelineResponse:
        source = Path(input_path).expanduser().resolve()
        out = Path(output_dir).expanduser().resolve()

        if not source.exists():
            return BatchPipelineResponse(success=False, summary=t("server.batch.path_missing", path=source))

        inputs = _collect_pipeline_inputs(source, recursive=recursive)
        if not inputs:
            return BatchPipelineResponse(success=False, summary=t("server.batch.no_images", path=source))

        out.mkdir(parents=True, exist_ok=True)

        files: list[BatchPipelineFile] = []
        total_t0 = time.perf_counter()
        svg_bg = _hex_to_rgb(flatten_color)
        out_of_memory = False

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
                out_of_memory = is_out_of_memory(exc)
                error = str(exc)
                if out_of_memory and not isinstance(exc, ModelOutOfMemory):
                    error = memory_message()
                files.append(
                    BatchPipelineFile(
                        input_path=str(src),
                        success=False,
                        duration_ms=int((time.perf_counter() - start) * 1000),
                        error=error,
                    )
                )
                if out_of_memory:
                    release_sessions()
                    break

        failures = [item for item in files if not item.success]
        success_count = len(files) - len(failures)
        skipped = len(inputs) - len(files)
        total_ms = int((time.perf_counter() - total_t0) * 1000)
        lines = [
            t("server.batch.processed", done=success_count, total=len(inputs), seconds=f"{total_ms / 1000:.2f}"),
            t("server.batch.output", path=out),
        ]
        if out_of_memory and skipped:
            lines.append(t("server.batch.out_of_memory", count=skipped))
        if failures:
            lines.append("")
            lines.append(t("server.batch.failures"))
            lines.extend(f"- {Path(item.input_path).name}: {item.error}" for item in failures)

        return BatchPipelineResponse(
            success=not failures,
            summary="\n".join(lines),
            total=len(inputs),
            success_count=success_count,
            failure_count=len(inputs) - success_count,
            output_dir=str(out),
            files=files,
        )

    return await run_in_threadpool(work)
