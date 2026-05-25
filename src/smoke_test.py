"""End-to-end test: luma keying on the neon graphics.png."""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.processor import (
    BackgroundOptions,
    VectorOptions,
    process_image,
)


def main() -> None:
    project_root = Path(__file__).parent.parent
    src_image = project_root / "graphics.png"
    out_dir = project_root / "output"

    if not src_image.exists():
        print(f"Missing test image: {src_image}")
        sys.exit(1)

    print(f"Processing: {src_image}")
    t0 = time.perf_counter()

    bg_opts = BackgroundOptions(
        method="auto",          # auto-detects luma_dark for the neon-on-black image
        luma_threshold_low=0.04,
        luma_threshold_high=0.95,
        luma_unpremultiply=True,
        luma_denoise=0,
        luma_gamma=1.0,
        saturation=1.20,        # vibrance bump for neon
        contrast=1.05,
    )
    vec_opts = VectorOptions(
        color_mode="color",
        filter_speckle=2,       # preserve fine detail (grid lines, vertex dots)
        color_precision=8,      # max color fidelity
        layer_difference=8,     # more color layers
        path_precision=10,      # smoother curves
        upscale=1.5,            # super-sample for finer detail capture
    )

    result = process_image(
        src_image,
        output_dir=out_dir,
        bg_options=bg_opts,
        vec_options=vec_opts,
        make_svg=True,
        base_name="graphics",
    )

    dt = time.perf_counter() - t0
    print(f"  method:      {result.method_used}")
    print(f"  cleaned PNG: {result.cleaned_path}")
    print(f"  SVG:         {result.svg_path}")
    print(f"  size:        {result.cleaned.size}")
    print(f"  PNG bytes:   {result.cleaned_path.stat().st_size:,}")
    print(f"  SVG bytes:   {result.svg_path.stat().st_size:,}")
    print(f"  elapsed:     {dt:.2f}s")


if __name__ == "__main__":
    main()
