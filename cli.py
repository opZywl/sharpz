"""Command-line interface for cleanup-image.

Examples:
    # Auto-detect (recommended) — picks luma keying for graphics on black/white,
    # AI segmentation for natural images
    python cli.py graphics.png -o output/

    # Force luma keying for neon/glow on dark background
    python cli.py graphics.png -o output/ --method luma_dark

    # Folder of images, AI mode with fast model
    python cli.py samples/ -o output/ --method ai --model u2net

    # Tune SVG output for a logo (binary, no speckle)
    python cli.py logo.png -o output/ --color-mode binary --filter-speckle 8
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import click

from src.processor import (
    AVAILABLE_MODELS,
    DEFAULT_MODEL,
    BackgroundOptions,
    VectorOptions,
    process_image,
)


SUPPORTED_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif"}


def _collect_inputs(path: Path) -> list[Path]:
    if path.is_file():
        return [path]
    if path.is_dir():
        return sorted(p for p in path.rglob("*") if p.suffix.lower() in SUPPORTED_EXT)
    raise click.UsageError(f"Path not found: {path}")


@click.command(context_settings={"help_option_names": ["-h", "--help"]})
@click.argument("input_path", type=click.Path(exists=True, path_type=Path))
@click.option(
    "-o", "--output", "output_dir",
    type=click.Path(path_type=Path),
    default=Path("output"),
    show_default=True,
    help="Output directory.",
)
@click.option(
    "--method",
    type=click.Choice(["auto", "ai", "luma_dark", "luma_light", "none"]),
    default="auto",
    show_default=True,
    help="Background removal method. auto = detect (skips removal if image "
         "already has alpha); ai = semantic segmentation; luma_dark = neon on "
         "black; luma_light = logos on white; none = pass through unchanged.",
)
@click.option(
    "--model",
    type=click.Choice(list(AVAILABLE_MODELS.keys())),
    default=DEFAULT_MODEL,
    show_default=True,
    help="AI model (only used when method=ai or auto picks ai).",
)
# AI / alpha matting
@click.option("--no-alpha-matting", is_flag=True, help="Disable alpha matting (faster, rougher edges).")
@click.option("--fg-threshold", type=int, default=240, show_default=True)
@click.option("--bg-threshold", type=int, default=10, show_default=True)
@click.option("--erode-size", type=int, default=10, show_default=True)
# Luma keying
@click.option("--luma-low", type=float, default=0.04, show_default=True,
              help="Luma threshold low — anything darker becomes fully transparent.")
@click.option("--luma-high", type=float, default=0.95, show_default=True,
              help="Luma threshold high — anything brighter becomes fully opaque.")
@click.option("--no-unpremultiply", is_flag=True,
              help="Disable Unmult (don't recover pure colors from glow).")
@click.option("--luma-denoise", type=click.IntRange(0, 9), default=0, show_default=True,
              help="Median filter window for noise removal (0=off, 3 or 5 recommended).")
@click.option("--luma-gamma", type=float, default=1.0, show_default=True,
              help="Alpha gamma curve (>1 sharper, <1 softer falloff).")
# Color enhancement
@click.option("--saturation", type=float, default=1.0, show_default=True)
@click.option("--contrast", type=float, default=1.0, show_default=True)
@click.option("--brightness", type=float, default=1.0, show_default=True)
@click.option("--edge-smooth", is_flag=True, help="Apply soft alpha-channel smoothing on edges.")
# Output toggles
@click.option("--no-svg", is_flag=True, help="Skip SVG generation, output only cleaned PNG.")
@click.option("--no-bg-removal", is_flag=True, help="Skip background removal, only vectorize.")
# SVG / vtracer
@click.option(
    "--color-mode",
    type=click.Choice(["color", "binary"]),
    default="color",
    show_default=True,
)
@click.option(
    "--hierarchical",
    type=click.Choice(["stacked", "cutout"]),
    default="stacked",
    show_default=True,
)
@click.option(
    "--path-mode",
    type=click.Choice(["spline", "polygon", "none"]),
    default="spline",
    show_default=True,
)
@click.option("--filter-speckle", type=int, default=2, show_default=True)
@click.option("--color-precision", type=int, default=8, show_default=True)
@click.option("--layer-difference", type=int, default=8, show_default=True)
@click.option("--corner-threshold", type=int, default=60, show_default=True)
@click.option("--length-threshold", type=float, default=4.0, show_default=True)
@click.option("--splice-threshold", type=int, default=45, show_default=True)
@click.option("--path-precision", type=int, default=10, show_default=True)
@click.option("--upscale", type=float, default=1.0, show_default=True,
              help="Super-sample multiplier before vectorization (1.5 = 2.25x detail).")
@click.option("--list-models", is_flag=True, help="List available AI models and exit.")
def main(
    input_path: Path,
    output_dir: Path,
    method: str,
    model: str,
    no_alpha_matting: bool,
    fg_threshold: int,
    bg_threshold: int,
    erode_size: int,
    luma_low: float,
    luma_high: float,
    no_unpremultiply: bool,
    luma_denoise: int,
    luma_gamma: float,
    saturation: float,
    contrast: float,
    brightness: float,
    edge_smooth: bool,
    no_svg: bool,
    no_bg_removal: bool,
    color_mode: str,
    hierarchical: str,
    path_mode: str,
    filter_speckle: int,
    color_precision: int,
    layer_difference: int,
    corner_threshold: int,
    length_threshold: float,
    splice_threshold: int,
    path_precision: int,
    upscale: float,
    list_models: bool,
) -> None:
    """Clean image backgrounds and convert PNG to SVG."""
    if list_models:
        click.echo("Available AI models:")
        for key, label in AVAILABLE_MODELS.items():
            marker = " (default)" if key == DEFAULT_MODEL else ""
            click.echo(f"  {key}{marker}")
            click.echo(f"      {label}")
        return

    inputs = _collect_inputs(input_path)
    if not inputs:
        click.echo(f"No supported images found at {input_path}", err=True)
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)
    click.echo(f"Found {len(inputs)} image(s). Output -> {output_dir.resolve()}")

    bg_opts = BackgroundOptions(
        method=method,
        model=model,
        alpha_matting=not no_alpha_matting,
        alpha_matting_foreground_threshold=fg_threshold,
        alpha_matting_background_threshold=bg_threshold,
        alpha_matting_erode_size=erode_size,
        luma_threshold_low=luma_low,
        luma_threshold_high=luma_high,
        luma_unpremultiply=not no_unpremultiply,
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
        splice_threshold=splice_threshold,
        path_precision=path_precision,
        upscale=upscale,
    )

    total_t0 = time.perf_counter()
    failures: list[tuple[Path, str]] = []

    for idx, src in enumerate(inputs, start=1):
        click.echo(f"\n[{idx}/{len(inputs)}] {src.name}")
        t0 = time.perf_counter()
        try:
            if no_bg_removal:
                from src.processor import png_to_svg
                from PIL import Image

                img = Image.open(src)
                svg_path = output_dir / f"{src.stem}.svg"
                png_to_svg(img, output_path=svg_path, options=vec_opts)
                click.echo(f"   -> {svg_path.name}  ({(time.perf_counter() - t0):.2f}s)")
            else:
                result = process_image(
                    src,
                    output_dir=output_dir,
                    bg_options=bg_opts,
                    vec_options=vec_opts,
                    make_svg=not no_svg,
                    base_name=src.stem,
                )
                dt = time.perf_counter() - t0
                click.echo(f"   method: {result.method_used}", nl=False)
                click.echo(f" | -> {result.cleaned_path.name}", nl=False)
                if result.svg_path:
                    click.echo(f", {result.svg_path.name}", nl=False)
                if result.svg_clean_path:
                    click.echo(f", {result.svg_clean_path.name}", nl=False)
                click.echo(f"  ({dt:.2f}s)")
        except Exception as exc:
            failures.append((src, str(exc)))
            click.echo(f"   x FAILED: {exc}", err=True)

    total = time.perf_counter() - total_t0
    success = len(inputs) - len(failures)
    click.echo(f"\nDone. {success}/{len(inputs)} succeeded in {total:.2f}s")
    if failures:
        click.echo("\nFailures:", err=True)
        for src, err in failures:
            click.echo(f"  {src.name}: {err}", err=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
