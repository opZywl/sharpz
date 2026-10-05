"""Core image processing: background removal + PNG → SVG vectorization.

Two background-removal methods:

* `ai`  — semantic segmentation (rembg + BiRefNet/U2Net). Best for
          photographs and natural objects.
* `luma_dark` — luminance-keyed transparency ("Unmult"). Perfect for
          neon, glow, fire, smoke, lasers and any bright graphic on a
          dark background. Preserves 100% of the glow and color.
* `luma_light` — inverse luma keying. For dark logos / line-art on a
          near-white background.
* `auto` — sample the four corners; if they're near-black or near-white,
          pick the appropriate luma method. Otherwise fall back to AI.

Vectorization uses vtracer (Rust). For high-detail graphics we default
to aggressive precision settings; for logos use binary mode.
"""

from __future__ import annotations

import gc
import io
import os
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
import onnxruntime as ort
import rembg.bg as rembg_bg
import vtracer
from PIL import Image, ImageEnhance, ImageFilter
from pymatting.alpha.estimate_alpha_cf import estimate_alpha_cf
from pymatting.preconditioner.ichol import ichol
from rembg import remove
from rembg.sessions import sessions_class

from src.memory import is_out_of_memory


AVAILABLE_MODELS: dict[str, str] = {
    "isnet-general-use": "ISNet (rápido)",
    "birefnet-general-lite": "BiRefNet Lite (detalhado)",
    "birefnet-general": "BiRefNet (qualidade máxima)",
    "u2net": "U2Net (mais leve)",
    "birefnet-portrait": "BiRefNet Retrato (pessoas)",
    "u2net_human_seg": "U2Net Pessoas (leve)",
    "sam": "Segment Anything (objeto central)",
}

MODEL_DETAILS: dict[str, str] = {
    "isnet-general-use": "Leve e rápido: ~1,5 GB de RAM no pico, bom para a maioria das imagens (~180 MB).",
    "birefnet-general-lite": "Recorte mais fino em cabelo e bordas, mas usa ~6 GB de RAM no pico e é bem mais lento (~220 MB).",
    "birefnet-general": "Melhor recorte, mas o mais pesado: ~970 MB e muitos GB de RAM. Pode deixar o PC lento.",
    "u2net": "O mais leve e rápido; recorte mais simples (~175 MB).",
    "birefnet-portrait": "Especialista em pessoas e rostos. Pesado como o BiRefNet: ~970 MB e muitos GB de RAM.",
    "u2net_human_seg": "Leve, focado em pessoas de corpo inteiro (~175 MB).",
    "sam": "Recorta o objeto que está no centro da imagem.",
}

DEFAULT_MODEL = "isnet-general-use"
HEAVY_MODELS = frozenset({"birefnet-general", "birefnet-portrait", "birefnet-general-lite"})
MODEL_WEIGHT_ORDER = (
    "birefnet-general",
    "birefnet-portrait",
    "birefnet-general-lite",
    "sam",
    "isnet-general-use",
    "u2net_human_seg",
    "u2net",
)
LIGHTER_MODELS = ("isnet-general-use", "birefnet-general-lite", "u2net")
MODEL_FILES: dict[str, tuple[str, ...]] = {
    "sam": ("sam_vit_b_01ec64.encoder.onnx", "sam_vit_b_01ec64.decoder.onnx"),
}
SESSION_IDLE_SECONDS = 600
ICHOL_MAX_NNZ = int(4e9 / 16)

Method = Literal["auto", "ai", "luma_dark", "luma_light", "none"]
ColorMode = Literal["color", "binary"]
Hierarchical = Literal["stacked", "cutout"]
PathMode = Literal["spline", "polygon", "none"]

_session_cache: dict[str, object] = {}
_session_lock = threading.RLock()
_last_used = 0.0
_idle_timer: threading.Timer | None = None


def memory_message(model: str | None = None, alpha_matting: bool = False) -> str:
    if model is None:
        return (
            "Memória insuficiente para concluir a operação. "
            "Feche outros programas ou use uma imagem menor e tente de novo."
        )
    rank = MODEL_WEIGHT_ORDER.index(model) if model in MODEL_WEIGHT_ORDER else -1
    lighter = [
        AVAILABLE_MODELS[key]
        for key in LIGHTER_MODELS
        if MODEL_WEIGHT_ORDER.index(key) > rank
    ][:2]
    parts = [f"Memória insuficiente para rodar o modelo {AVAILABLE_MODELS.get(model, model)}."]
    if lighter:
        parts.append(f"Feche outros programas ou escolha um modelo mais leve: {' ou '.join(lighter)}.")
    else:
        parts.append("Feche outros programas ou use uma imagem menor.")
    if alpha_matting:
        parts.append("Desligar o Alpha matting também reduz o uso de memória.")
    return " ".join(parts)


class ModelOutOfMemory(MemoryError):
    def __init__(self, model: str, alpha_matting: bool = False) -> None:
        self.model = model
        super().__init__(memory_message(model, alpha_matting))


def _sized_ichol(matrix):
    max_nnz = min(ICHOL_MAX_NNZ, max(1_000_000, 4 * matrix.nnz))
    while True:
        try:
            return ichol(matrix, max_nnz=max_nnz)
        except ValueError as exc:
            if "max_nnz" not in str(exc) or max_nnz >= ICHOL_MAX_NNZ:
                raise
            max_nnz = min(ICHOL_MAX_NNZ, max_nnz * 4)


def _estimate_alpha_cf(image, trimap, **kwargs):
    kwargs.setdefault("preconditioner", _sized_ichol)
    return estimate_alpha_cf(image, trimap, **kwargs)


rembg_bg.estimate_alpha_cf = _estimate_alpha_cf


@dataclass
class BackgroundOptions:
    """Tuning knobs for background removal.

    `method` chooses the algorithm. AI is best for natural objects; the
    luma methods preserve glowing/translucent detail that AI segmentation
    would otherwise erase.
    """

    method: Method = "auto"

    # AI (rembg) options
    model: str = DEFAULT_MODEL
    alpha_matting: bool = True
    alpha_matting_foreground_threshold: int = 240
    alpha_matting_background_threshold: int = 10
    alpha_matting_erode_size: int = 10
    post_process_mask: bool = True

    # Luma keying options
    luma_threshold_low: float = 0.04     # noise floor — anything below becomes fully transparent
    luma_threshold_high: float = 0.95    # ceiling — anything above becomes fully opaque
    luma_unpremultiply: bool = True
    luma_denoise: int = 5                # 0 = off; 3 or 5 = median filter window for noisy sources
    luma_gamma: float = 1.0              # >1 makes glow sharper, <1 makes it softer

    # Shared
    edge_smooth: bool = False
    bg_color: tuple[int, int, int, int] | None = None

    # Color enhancement (applied after keying)
    saturation: float = 1.0
    contrast: float = 1.0
    brightness: float = 1.0


@dataclass
class VectorOptions:
    """Tuning knobs for vtracer.

    Defaults are tuned for high-detail color graphics. For logos use
    `color_mode='binary'`. For photographs raise `filter_speckle`.

    `upscale` super-samples the input before tracing — captures finer
    detail at the cost of larger SVG (and slower trace).
    """

    color_mode: ColorMode = "color"
    hierarchical: Hierarchical = "stacked"
    mode: PathMode = "spline"
    filter_speckle: int = 2
    color_precision: int = 8
    layer_difference: int = 8
    corner_threshold: int = 60
    length_threshold: float = 4.0
    max_iterations: int = 10
    splice_threshold: int = 45
    path_precision: int = 10
    upscale: float = 1.0


def _session_class(model: str):
    for session_class in sessions_class:
        if session_class.name() == model:
            return session_class
    raise ValueError(f"Modelo desconhecido: {model}")


def model_downloaded(model: str) -> bool:
    try:
        home = Path(_session_class(model).u2net_home())
    except ValueError:
        return False
    return all((home / name).exists() for name in MODEL_FILES.get(model, (f"{model}.onnx",)))


def _new_session(model: str):
    options = ort.SessionOptions()
    options.enable_cpu_mem_arena = False
    options.enable_mem_pattern = False
    if "OMP_NUM_THREADS" in os.environ:
        threads = int(os.environ["OMP_NUM_THREADS"])
        options.inter_op_num_threads = threads
        options.intra_op_num_threads = threads
    return _session_class(model)(model, options)


def _get_session(model: str):
    session = _session_cache.get(model)
    if session is None:
        _session_cache.clear()
        gc.collect()
        session = _new_session(model)
        _session_cache[model] = session
    return session


def release_sessions() -> None:
    with _session_lock:
        _session_cache.clear()
    gc.collect()


def _release_if_idle() -> None:
    with _session_lock:
        if not _session_cache or time.monotonic() - _last_used < SESSION_IDLE_SECONDS:
            return
        _session_cache.clear()
    gc.collect()


def _schedule_idle_release() -> None:
    global _idle_timer
    if _idle_timer is not None:
        _idle_timer.cancel()
    _idle_timer = threading.Timer(SESSION_IDLE_SECONDS, _release_if_idle)
    _idle_timer.daemon = True
    _idle_timer.start()


def _load_image(source: str | Path | bytes | Image.Image) -> Image.Image:
    if isinstance(source, Image.Image):
        return source.convert("RGBA") if source.mode != "RGBA" else source
    if isinstance(source, (bytes, bytearray)):
        return Image.open(io.BytesIO(source))
    return Image.open(Path(source))


def _detect_method(img: Image.Image) -> Method:
    """Pick the best removal method by inspecting the image.

    Order of detection:
      1. If the image already has substantial transparency (>5% of pixels
         have alpha < 250), return `none` — the alpha channel is already
         doing the job, no removal needed.
      2. If the four corners are uniformly near-black, `luma_dark`.
      3. If the four corners are uniformly near-white, `luma_light`.
      4. Otherwise fall back to `ai`.
    """
    rgba = img.convert("RGBA")
    alpha = np.asarray(rgba.split()[-1])
    transparent_ratio = (alpha < 250).mean()
    if transparent_ratio > 0.05:
        return "none"

    arr = np.asarray(rgba.convert("RGB"), dtype=np.float32) / 255.0
    h, w = arr.shape[:2]
    sample_size = max(8, min(h, w) // 32)
    corners = np.concatenate([
        arr[:sample_size, :sample_size].reshape(-1, 3),
        arr[:sample_size, -sample_size:].reshape(-1, 3),
        arr[-sample_size:, :sample_size].reshape(-1, 3),
        arr[-sample_size:, -sample_size:].reshape(-1, 3),
    ])
    mean = corners.mean(axis=0).mean()
    std = corners.std()

    if mean < 0.10 and std < 0.05:
        return "luma_dark"
    if mean > 0.90 and std < 0.05:
        return "luma_light"
    return "ai"


def _luma_key(
    img: Image.Image,
    *,
    invert: bool,
    threshold_low: float,
    threshold_high: float,
    unpremultiply: bool,
    denoise: int = 0,
    gamma: float = 1.0,
) -> Image.Image:
    """Convert luminance to alpha. Default keys out dark backgrounds.

    Set `invert=True` to key out light backgrounds.

    When `unpremultiply` is True (recommended for glow on black), the RGB
    values are divided by alpha to recover the "pure" color of each
    pixel — so a 50% white glow becomes pure white at 50% opacity. When
    composited back on black this looks identical to the original; on a
    different background the glow blends correctly.

    `denoise` runs a median filter (window size 3 or 5) on the source
    before keying — kills sensor/JPEG noise that unpremultiply would
    otherwise amplify into rainbow speckles.
    """
    src = img.convert("RGBA")
    if denoise and denoise >= 3:
        src = src.filter(ImageFilter.MedianFilter(size=denoise))

    arr = np.asarray(src, dtype=np.float32) / 255.0
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]

    if invert:
        # alpha from darkness: bright pixels become transparent
        value = 1.0 - np.minimum(np.minimum(r, g), b)
    else:
        # alpha from brightness: dark pixels become transparent
        value = np.maximum(np.maximum(r, g), b)

    # Apply linear remap with thresholds. Below threshold_low becomes 0.
    span = max(threshold_high - threshold_low, 1e-6)
    alpha = np.clip((value - threshold_low) / span, 0.0, 1.0)

    # Optional gamma curve to sharpen (>1) or soften (<1) the glow falloff.
    if gamma != 1.0:
        alpha = np.power(alpha, gamma)

    if unpremultiply:
        # Only unpremultiply where alpha is non-trivial; this keeps
        # near-zero pixels from amplifying noise to saturated rainbows.
        safe = np.maximum(alpha, 0.05)
        if not invert:
            r = np.clip(r / safe, 0, 1)
            g = np.clip(g / safe, 0, 1)
            b = np.clip(b / safe, 0, 1)
        else:
            ir, ig, ib = 1 - r, 1 - g, 1 - b
            ir = np.clip(ir / safe, 0, 1)
            ig = np.clip(ig / safe, 0, 1)
            ib = np.clip(ib / safe, 0, 1)
            r, g, b = 1 - ir, 1 - ig, 1 - ib

    # Force RGB to zero/one where alpha is zero (clean transparent regions)
    transparent = alpha == 0
    if not invert:
        r = np.where(transparent, 0, r)
        g = np.where(transparent, 0, g)
        b = np.where(transparent, 0, b)
    else:
        r = np.where(transparent, 1, r)
        g = np.where(transparent, 1, g)
        b = np.where(transparent, 1, b)

    out = np.stack([r, g, b, alpha], axis=-1)
    return Image.fromarray((out * 255).astype(np.uint8), "RGBA")


def _ai_remove(img: Image.Image, opts: BackgroundOptions) -> Image.Image:
    global _last_used
    with _session_lock:
        try:
            session = _get_session(opts.model)
            result = remove(
                img,
                session=session,
                alpha_matting=opts.alpha_matting,
                alpha_matting_foreground_threshold=opts.alpha_matting_foreground_threshold,
                alpha_matting_background_threshold=opts.alpha_matting_background_threshold,
                alpha_matting_erode_size=opts.alpha_matting_erode_size,
                post_process_mask=opts.post_process_mask,
            )
        except Exception as exc:
            if is_out_of_memory(exc):
                _session_cache.clear()
                raise ModelOutOfMemory(opts.model, opts.alpha_matting) from exc
            raise
        finally:
            _last_used = time.monotonic()
    _schedule_idle_release()
    if not isinstance(result, Image.Image):
        result = Image.open(io.BytesIO(result))
    return result.convert("RGBA")


def _enhance_color(
    img: Image.Image,
    saturation: float,
    contrast: float,
    brightness: float,
) -> Image.Image:
    if saturation == 1.0 and contrast == 1.0 and brightness == 1.0:
        return img
    # Enhance preserves alpha when applied to RGBA
    if saturation != 1.0:
        img = ImageEnhance.Color(img).enhance(saturation)
    if contrast != 1.0:
        img = ImageEnhance.Contrast(img).enhance(contrast)
    if brightness != 1.0:
        img = ImageEnhance.Brightness(img).enhance(brightness)
    return img


def _smooth_edges(img: Image.Image) -> Image.Image:
    r, g, b, a = img.split()
    a = a.filter(ImageFilter.SMOOTH)
    return Image.merge("RGBA", (r, g, b, a))


def remove_background(
    source: str | Path | bytes | Image.Image,
    options: BackgroundOptions | None = None,
) -> Image.Image:
    """Remove the background from an image.

    Returns an RGBA Pillow image. When `bg_color` is set the alpha is
    composited over that color and the result becomes opaque.
    """
    opts = options or BackgroundOptions()
    img = _load_image(source)
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    method = opts.method
    if method == "auto":
        method = _detect_method(img)

    if method == "none":
        # Pass-through: image already has the alpha channel we want.
        result = img
    elif method == "luma_dark":
        result = _luma_key(
            img,
            invert=False,
            threshold_low=opts.luma_threshold_low,
            threshold_high=opts.luma_threshold_high,
            unpremultiply=opts.luma_unpremultiply,
            denoise=opts.luma_denoise,
            gamma=opts.luma_gamma,
        )
    elif method == "luma_light":
        result = _luma_key(
            img,
            invert=True,
            threshold_low=opts.luma_threshold_low,
            threshold_high=opts.luma_threshold_high,
            unpremultiply=opts.luma_unpremultiply,
            denoise=opts.luma_denoise,
            gamma=opts.luma_gamma,
        )
    else:
        result = _ai_remove(img, opts)

    result = _enhance_color(result, opts.saturation, opts.contrast, opts.brightness)

    if opts.edge_smooth:
        result = _smooth_edges(result)

    if opts.bg_color is not None:
        bg = Image.new("RGBA", result.size, opts.bg_color)
        bg.alpha_composite(result)
        result = bg

    return result


def png_to_svg(
    source: str | Path | bytes | Image.Image,
    output_path: str | Path | None = None,
    options: VectorOptions | None = None,
    background_color: tuple[int, int, int] | None = None,
) -> str:
    """Convert a PNG (or any raster) to SVG using vtracer.

    Returns the SVG markup as a string. If `output_path` is provided the
    SVG is also written to disk.

    `background_color` flattens the alpha channel onto a solid color
    before tracing — useful when the input has transparency that would
    otherwise be discarded by vtracer.
    """
    opts = options or VectorOptions()
    img = _load_image(source)

    if background_color is not None and img.mode == "RGBA":
        bg = Image.new("RGB", img.size, background_color)
        bg.paste(img, mask=img.split()[3])
        img = bg

    if opts.upscale and opts.upscale != 1.0:
        new_size = (int(img.size[0] * opts.upscale), int(img.size[1] * opts.upscale))
        img = img.resize(new_size, Image.LANCZOS)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as in_tmp:
        img.save(in_tmp.name, format="PNG")
        in_path = Path(in_tmp.name)

    if output_path is None:
        out_tmp = tempfile.NamedTemporaryFile(suffix=".svg", delete=False)
        out_tmp.close()
        out_path = Path(out_tmp.name)
    else:
        out_path = Path(output_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        vtracer.convert_image_to_svg_py(
            str(in_path),
            str(out_path),
            colormode=opts.color_mode,
            hierarchical=opts.hierarchical,
            mode=opts.mode,
            filter_speckle=opts.filter_speckle,
            color_precision=opts.color_precision,
            layer_difference=opts.layer_difference,
            corner_threshold=opts.corner_threshold,
            length_threshold=opts.length_threshold,
            max_iterations=opts.max_iterations,
            splice_threshold=opts.splice_threshold,
            path_precision=opts.path_precision,
        )
        svg = out_path.read_text(encoding="utf-8")
    finally:
        in_path.unlink(missing_ok=True)
        if output_path is None:
            out_path.unlink(missing_ok=True)

    return svg


def _rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


# Chroma key color used to trace transparent areas. Pure green is the
# best choice for neon cyan/magenta/purple imagery — it doesn't appear
# in any of those hues so we can confidently strip green-dominant paths
# (background + anti-aliasing blends) after tracing.
CHROMA_KEY_RGB: tuple[int, int, int] = (0, 255, 0)


def _pick_chroma_key(img: Image.Image) -> tuple[int, int, int]:
    """Pick a chroma key color absent from the image's foreground.

    Tries pure green, magenta, yellow, red. Returns the first one whose
    presence in the opaque pixels is below 0.5%. Falls back to green.
    """
    import numpy as np

    arr = np.asarray(img.convert("RGBA"))
    alpha = arr[..., 3]
    opaque = alpha > 32
    if not opaque.any():
        return CHROMA_KEY_RGB
    rgb = arr[..., :3][opaque]

    candidates: list[tuple[int, int, int]] = [
        (0, 255, 0),    # green
        (255, 0, 255),  # magenta
        (255, 255, 0),  # yellow
        (255, 0, 0),    # red
        (0, 255, 255),  # cyan
    ]

    threshold = 0.005 * len(rgb)
    for cand in candidates:
        # Count opaque pixels close to this candidate (within distance 50)
        dist_sq = np.sum((rgb.astype(np.int32) - np.array(cand)) ** 2, axis=1)
        close = (dist_sq < 50 * 50).sum()
        if close < threshold:
            return cand
    return CHROMA_KEY_RGB


def _is_chroma_path(fill_hex: str, key: tuple[int, int, int]) -> bool:
    """True if the SVG fill color is dominated by the chroma key channel.

    Detects the background path AND anti-aliasing blends with the key.
    Conservative — only catches colors where the key channel is the
    clear dominant one, so foreground edge blends with the key are
    still kept.
    """
    h = fill_hex.lstrip("#")
    if len(h) != 6:
        return False
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    kr, kg, kb = key

    # Identify which channels the key uses (max=255) and which it doesn't (min=0)
    key_channels = [(kr, r), (kg, g), (kb, b)]
    on_channels = [val for k, val in key_channels if k > 200]
    off_channels = [val for k, val in key_channels if k < 50]

    if not on_channels:
        return False

    # Path is "chroma" if all on-channels are bright AND all off-channels are dim
    on_min = min(on_channels)
    off_max = max(off_channels) if off_channels else 0

    # Require the on-channels to be at least 1.6x the off-channels
    if on_min < 130:
        return False
    if off_max > on_min * 0.85:
        return False
    return True


def strip_chroma_paths(svg: str, key: tuple[int, int, int] = CHROMA_KEY_RGB) -> str:
    """Remove every <path .../> whose fill color is the chroma key (or
    a near-blend of it).

    vtracer always emits self-closing <path d="..." fill="#xxxxxx" .../>
    so a single regex pass is sufficient.
    """
    import re

    pattern = re.compile(
        r'<path\s+d="[^"]+"\s+fill="(#[0-9a-fA-F]{6})"[^/]*/>\s*',
        re.IGNORECASE,
    )

    def replace(match: re.Match) -> str:
        return "" if _is_chroma_path(match.group(1), key) else match.group(0)

    return pattern.sub(replace, svg)


def wrap_svg_with_background(svg: str, bg_color: tuple[int, int, int]) -> str:
    """Insert a full-canvas <rect> background into an existing SVG.

    Used to turn the transparent ("clean") SVG into a with-background
    variant by inserting a colored <rect> immediately after <svg ...>.
    """
    import re

    size_match = re.search(r'<svg[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"', svg)
    if not size_match:
        return svg
    w, h = size_match.group(1), size_match.group(2)
    hex_color = _rgb_to_hex(bg_color)

    rect = f'<rect x="0" y="0" width="{w}" height="{h}" fill="{hex_color}"/>'
    return re.sub(r'(<svg[^>]*>)', r'\1\n' + rect, svg, count=1)


@dataclass
class ProcessResult:
    cleaned: Image.Image
    svg: str | None = None              # full SVG (with background, flattened)
    svg_clean: str | None = None        # SVG with the background path removed
    cleaned_path: Path | None = None
    svg_path: Path | None = None        # path of the with-background SVG
    svg_clean_path: Path | None = None  # path of the clean (transparent) SVG
    method_used: str | None = None


def process_image(
    source: str | Path | bytes | Image.Image,
    output_dir: str | Path | None = None,
    bg_options: BackgroundOptions | None = None,
    vec_options: VectorOptions | None = None,
    make_svg: bool = True,
    base_name: str | None = None,
    svg_background: tuple[int, int, int] | None = None,
) -> ProcessResult:
    """Full pipeline: clean background, optionally vectorize.

    `svg_background` flattens transparency onto a background color before
    SVG tracing (vtracer doesn't support transparency well). Defaults to
    None — if the cleaned image has alpha, it's flattened onto the
    original-style dark background for neon imagery.
    """
    bg_options = bg_options or BackgroundOptions()
    cleaned = remove_background(source, bg_options)

    # Resolve which method actually ran (for reporting)
    actual_method = bg_options.method
    if actual_method == "auto":
        original = _load_image(source)
        actual_method = _detect_method(original)

    result = ProcessResult(cleaned=cleaned, method_used=actual_method)

    if make_svg:
        # Pick the bg color for the with-background variant.
        if svg_background is None:
            if actual_method == "luma_light":
                bg_rgb: tuple[int, int, int] = (255, 255, 255)
            elif actual_method in ("luma_dark", "auto"):
                bg_rgb = (0, 0, 0)
            else:
                bg_rgb = (0, 0, 0)
        else:
            bg_rgb = svg_background

        # Single trace: cutout on a chroma key absent from the foreground,
        # then strip every chroma-dominant path. This produces a real
        # transparent SVG with crisp shapes that survives any vec settings
        # (binary mode, low color_precision, etc.) — the stacked trace
        # would collapse into the background under those conditions.
        chroma_key = _pick_chroma_key(cleaned)
        from dataclasses import replace as _dc_replace
        cutout_opts = _dc_replace(vec_options, hierarchical="cutout")
        cutout_svg = png_to_svg(cleaned, options=cutout_opts, background_color=chroma_key)
        clean_svg = strip_chroma_paths(cutout_svg, chroma_key)
        result.svg_clean = clean_svg

        # The with-background variant is the same paths with a <rect> behind.
        result.svg = wrap_svg_with_background(clean_svg, bg_rgb)

    if output_dir is not None:
        out_dir = Path(output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        if base_name is None:
            if isinstance(source, (str, Path)):
                base_name = Path(source).stem
            else:
                base_name = "output"

        cleaned_path = out_dir / f"{base_name}_clean.png"
        cleaned.save(cleaned_path, format="PNG", optimize=True)
        result.cleaned_path = cleaned_path

        if make_svg and result.svg is not None:
            svg_path = out_dir / f"{base_name}.svg"
            svg_path.write_text(result.svg, encoding="utf-8")
            result.svg_path = svg_path

            if result.svg_clean is not None:
                svg_clean_path = out_dir / f"{base_name}_clean.svg"
                svg_clean_path.write_text(result.svg_clean, encoding="utf-8")
                result.svg_clean_path = svg_clean_path

    return result
