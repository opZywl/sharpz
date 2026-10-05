from __future__ import annotations

import tempfile
import time
from dataclasses import replace as dc_replace
from pathlib import Path

import gradio as gr
import resvg_py
from PIL import Image

from src.processor import (
    AVAILABLE_MODELS,
    DEFAULT_MODEL,
    BackgroundOptions,
    VectorOptions,
    png_to_svg,
    remove_background,
    strip_chroma_paths,
)
from src.processor import _pick_chroma_key  # noqa: PLC2701  (internal helper)

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


def _model_choices() -> list[tuple[str, str]]:
    return [(label, key) for key, label in AVAILABLE_MODELS.items()]


def _hex_to_rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return (r, g, b, alpha)


def _render_svg(svg_path: Path, max_dim: int = 800, background: str | None = None) -> Image.Image:
    kwargs: dict = dict(svg_path=str(svg_path), width=max_dim, height=max_dim)
    if background is not None:
        kwargs["background"] = background
    png_bytes = resvg_py.svg_to_bytes(**kwargs)
    import io
    return Image.open(io.BytesIO(bytes(png_bytes)))


def remove_bg_action(
    image: Image.Image | None,
    method: str,
    model: str,
    alpha_matting: bool,
    fg_threshold: int,
    bg_threshold: int,
    erode_size: int,
    luma_low: float,
    luma_high: float,
    luma_unpremultiply: bool,
    luma_denoise: int,
    luma_gamma: float,
    saturation: float,
    contrast: float,
    use_bg_color: bool,
    bg_color: str,
):
    if image is None:
        return None, None, "⚠ Carregue uma imagem primeiro."

    t0 = time.perf_counter()
    opts = BackgroundOptions(
        method=method,
        model=model,
        alpha_matting=alpha_matting,
        alpha_matting_foreground_threshold=int(fg_threshold),
        alpha_matting_background_threshold=int(bg_threshold),
        alpha_matting_erode_size=int(erode_size),
        luma_threshold_low=float(luma_low),
        luma_threshold_high=float(luma_high),
        luma_unpremultiply=luma_unpremultiply,
        luma_denoise=int(luma_denoise),
        luma_gamma=float(luma_gamma),
        saturation=float(saturation),
        contrast=float(contrast),
        bg_color=_hex_to_rgba(bg_color) if use_bg_color else None,
    )

    cleaned = remove_background(image, opts)
    elapsed = time.perf_counter() - t0

    tmp = tempfile.NamedTemporaryFile(suffix="_clean.png", delete=False)
    tmp.close()
    cleaned.save(tmp.name, format="PNG", optimize=True)

    status = f"<span class='status-ok'>{elapsed:.2f}s</span> · método <b>{method}</b> · modelo <code>{model}</code>"
    return cleaned, tmp.name, status


def vectorize_action(
    image: Image.Image | None,
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
    flatten_bg_color: str,
):
    if image is None:
        return None, None, None, None, "⚠ Carregue uma imagem primeiro."

    t0 = time.perf_counter()
    opts = VectorOptions(
        color_mode=color_mode,
        hierarchical=hierarchical,
        mode=path_mode,
        filter_speckle=int(filter_speckle),
        color_precision=int(color_precision),
        layer_difference=int(layer_difference),
        corner_threshold=int(corner_threshold),
        length_threshold=float(length_threshold),
        splice_threshold=int(splice_threshold),
        path_precision=int(path_precision),
        upscale=float(upscale),
    )

    bg_rgba = _hex_to_rgba(flatten_bg_color)
    bg_color_rgb = bg_rgba[:3]

    tmp_full = tempfile.NamedTemporaryFile(suffix=".svg", delete=False)
    tmp_full.close()
    full_path = Path(tmp_full.name)
    png_to_svg(image, output_path=full_path, options=opts, background_color=bg_color_rgb)

    chroma_key = _pick_chroma_key(image)
    cutout_opts = dc_replace(opts, hierarchical="cutout")
    tmp_clean = tempfile.NamedTemporaryFile(suffix="_clean.svg", delete=False)
    tmp_clean.close()
    clean_path = Path(tmp_clean.name)
    cutout_svg = png_to_svg(image, options=cutout_opts, background_color=chroma_key)
    clean_path.write_text(strip_chroma_paths(cutout_svg, chroma_key), encoding="utf-8")

    elapsed = time.perf_counter() - t0
    full_kb = full_path.stat().st_size / 1024
    clean_kb = clean_path.stat().st_size / 1024

    try:
        preview_full = _render_svg(full_path, max_dim=800)
        preview_clean = _render_svg(clean_path, max_dim=800, background=None)
    except Exception as exc:
        preview_full = preview_clean = None
        return None, str(full_path), None, str(clean_path), f"⚠ Preview falhou: {exc}"

    status = (
        f"<span class='status-ok'>{elapsed:.2f}s</span> · "
        f"com fundo <b>{full_kb:.1f} KB</b> · "
        f"clean <b>{clean_kb:.1f} KB</b>"
    )
    return preview_full, str(full_path), preview_clean, str(clean_path), status


def full_pipeline_action(
    image: Image.Image | None,
    method: str,
    model: str,
    luma_low: float,
    luma_high: float,
    luma_unpremultiply: bool,
    luma_denoise: int,
    saturation: float,
    color_mode: str,
    filter_speckle: int,
    color_precision: int,
    upscale: float,
    flatten_color: str,
):
    cleaned, png_path, bg_status = remove_bg_action(
        image, method, model,
        True, 240, 10, 10,
        luma_low, luma_high, luma_unpremultiply, luma_denoise, 1.0,
        saturation, 1.0,
        False, "#ffffff",
    )
    if cleaned is None:
        return None, None, None, None, None, None, bg_status

    preview_full, full_svg_path, preview_clean, clean_svg_path, vec_status = vectorize_action(
        cleaned, color_mode, "stacked", "spline",
        filter_speckle, color_precision,
        8, 60, 4.0, 45, 10,
        upscale, flatten_color,
    )

    return (
        cleaned, png_path,
        preview_full, full_svg_path,
        preview_clean, clean_svg_path,
        f"{bg_status}<br/>{vec_status}",
    )



APP_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

/* ────────── Design tokens ────────── */
:root {
  --bg: hsl(0 0% 7%);
  --bg-elev: hsl(0 0% 10%);
  --bg-card: #fdfdfd;
  --fg: hsl(0 0% 93%);
  --fg-muted: hsl(240 5% 64.9%);
  --fg-on-card: #1f1f22;
  --border: hsl(240 3.7% 15.9%);
  --border-card: rgba(212, 212, 216, 0.6);
  --primary: hsl(0 0% 98%);
  --primary-fg: hsl(0 0% 7%);
  --accent-blue: #60a5fa;
  --accent-blue-soft: rgba(96, 165, 250, 0.4);
  --accent-violet: #8b5cf6;
  --accent-cyan: #4cc2ff;
  --accent-green: #10a37f;
  --accent-orange: #d97757;
  --shadow-card: 0 0px 60px -25px #ffffff1f inset, 0px 0px 40px 5px #c6c6c635 inset;
  --shadow-soft: 0 3px 13px 0px #00000020;
  --radius: 0.5rem;
  --radius-card: 1rem;
  --radius-inner: 0.75rem;
}

/* ────────── Background — cloud/ellipse gradient + grid noise ────────── */
html, body, gradio-app {
  background: var(--bg) !important;
  color: var(--fg) !important;
  font-family: 'Space Grotesk', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif !important;
  font-feature-settings: "ss01", "cv01";
  letter-spacing: -0.005em;
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(ellipse 800px 400px at 30% 20%, rgba(96, 165, 250, 0.08), transparent 60%),
    radial-gradient(ellipse 600px 300px at 70% 60%, rgba(139, 92, 246, 0.06), transparent 60%),
    radial-gradient(ellipse 1000px 500px at 50% 100%, rgba(96, 165, 250, 0.04), transparent 70%);
  filter: blur(40px);
}

body::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: radial-gradient(900px circle at center, black, transparent 80%);
  -webkit-mask-image: radial-gradient(900px circle at center, black, transparent 80%);
}

.gradio-container {
  background: transparent !important;
  max-width: 1400px !important;
  margin: 0 auto !important;
  padding: 28px 24px 80px !important;
  position: relative;
  z-index: 1;
}

/* ────────── Hero header ────────── */
#hero {
  position: relative;
  padding: 28px 24px 36px;
  margin-bottom: 32px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border);
  background:
    linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01)),
    var(--bg-elev);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  animation: heroEnter 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
}

#hero::before, #hero::after {
  content: '';
  position: absolute;
  border-radius: 100%;
  filter: blur(60px);
  pointer-events: none;
  opacity: 0.55;
}
#hero::before {
  width: 280px; height: 180px;
  top: -40px; left: -40px;
  background: linear-gradient(135deg, rgba(96, 165, 250, 0.45), rgba(96, 165, 250, 0.18));
}
#hero::after {
  width: 320px; height: 200px;
  bottom: -60px; right: -60px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.40), rgba(96, 165, 250, 0.22));
}

#hero .hero-inner { position: relative; z-index: 2; }
#hero h1 {
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-weight: 800;
  font-size: 2.6rem;
  line-height: 1.05;
  letter-spacing: -0.03em;
  margin: 0 0 6px 0;
  background: linear-gradient(120deg, #fafafa 0%, #c4c4c4 60%, #fafafa 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
#hero p {
  color: var(--fg-muted);
  font-size: 0.95rem;
  margin: 0;
  max-width: 720px;
  line-height: 1.55;
}
#hero .badges { margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap; }
#hero .badge {
  font-size: 0.72rem;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  color: var(--fg);
  font-weight: 500;
  letter-spacing: 0.01em;
}
#hero .badge.b-blue { background: rgba(96,165,250,0.10); border-color: rgba(96,165,250,0.25); color: #93c5fd; }
#hero .badge.b-violet { background: rgba(139,92,246,0.10); border-color: rgba(139,92,246,0.25); color: #c4b5fd; }
#hero .badge.b-green { background: rgba(16,163,127,0.12); border-color: rgba(16,163,127,0.30); color: #6ee7b7; }

/* ────────── Tabs ────────── */
.tabs > .tab-nav, .tabs .tab-nav, .tab-nav, button.tab-nav-button { background: transparent !important; }
.tab-nav {
  display: flex;
  gap: 4px;
  padding: 6px !important;
  background: var(--bg-elev) !important;
  border: 1px solid var(--border) !important;
  border-radius: 12px !important;
  margin-bottom: 18px !important;
  width: fit-content !important;
}
.tab-nav button {
  background: transparent !important;
  color: var(--fg-muted) !important;
  border: none !important;
  border-radius: 8px !important;
  padding: 8px 16px !important;
  font-weight: 500 !important;
  font-size: 0.875rem !important;
  font-family: 'Space Grotesk', sans-serif !important;
  transition: all 0.2s ease !important;
}
.tab-nav button.selected {
  background: rgba(255,255,255,0.06) !important;
  color: var(--fg) !important;
  box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 4px 14px rgba(0,0,0,0.35) !important;
}
.tab-nav button:hover:not(.selected) {
  color: var(--fg) !important;
  background: rgba(255,255,255,0.03) !important;
}

/* ────────── Cards / panels ────────── */
.gr-block, .gr-form, .form, .panel, .gr-panel,
div[class*="block-"], div[class*="form-"] {
  background: var(--bg-elev) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius-card) !important;
  box-shadow: var(--shadow-card) !important;
  overflow: hidden;
}

/* Reset double cards */
.gr-block .gr-block, .gr-form .gr-block, .gr-block .gr-form {
  box-shadow: none !important;
  border: none !important;
  background: transparent !important;
}

/* Inner cards / accordions get subtler styling */
.gr-accordion {
  background: rgba(255,255,255,0.02) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius-inner) !important;
  margin-top: 10px !important;
}
.gr-accordion summary, .label-wrap {
  font-family: 'Space Grotesk', sans-serif !important;
  font-weight: 600 !important;
  color: var(--fg) !important;
  font-size: 0.85rem !important;
}

/* ────────── Labels & text ────────── */
label, .label-wrap span, .gr-label {
  color: var(--fg) !important;
  font-family: 'Space Grotesk', sans-serif !important;
  font-weight: 500 !important;
  font-size: 0.82rem !important;
  letter-spacing: 0.005em !important;
}
.info, .gr-info, span.info, p.info {
  color: var(--fg-muted) !important;
  font-size: 0.75rem !important;
  font-weight: 400 !important;
}

/* ────────── Buttons ────────── */
button.gr-button, .gr-button {
  font-family: 'Space Grotesk', sans-serif !important;
  font-weight: 500 !important;
  font-size: 0.875rem !important;
  border-radius: 10px !important;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
  cursor: pointer !important;
  letter-spacing: 0.005em !important;
}

/* Primary button */
button.primary, .gr-button.primary {
  background: linear-gradient(135deg, #fafafa 0%, #e4e4e7 100%) !important;
  color: #0a0a0f !important;
  border: 1px solid rgba(255,255,255,0.1) !important;
  box-shadow:
    0 1px 0 rgba(255,255,255,0.4) inset,
    0 4px 14px rgba(0,0,0,0.4),
    0 0 0 1px rgba(255,255,255,0.03) !important;
  font-weight: 600 !important;
  padding: 12px 24px !important;
}
button.primary:hover, .gr-button.primary:hover {
  background: linear-gradient(135deg, #ffffff 0%, #f4f4f5 100%) !important;
  transform: translateY(-1px);
  box-shadow:
    0 1px 0 rgba(255,255,255,0.5) inset,
    0 8px 24px rgba(96, 165, 250, 0.18),
    0 0 0 1px rgba(96, 165, 250, 0.15) !important;
}
button.primary:active, .gr-button.primary:active {
  transform: translateY(0);
}

/* Secondary buttons */
button.secondary, .gr-button.secondary, button:not(.primary) {
  background: rgba(255,255,255,0.04) !important;
  color: var(--fg) !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
}
button.secondary:hover, .gr-button.secondary:hover, button:not(.primary):not(.tab-nav button):hover {
  background: rgba(255,255,255,0.07) !important;
  border-color: rgba(255,255,255,0.14) !important;
}

/* ────────── Sliders (Win11 style — #4cc2ff thumb) ────────── */
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  height: 4px !important;
  border-radius: 10px !important;
  background: rgba(255,255,255,0.10) !important;
  outline: none;
  cursor: pointer;
}
input[type="range"]::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 10px;
  background: rgba(255,255,255,0.10);
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent-cyan);
  border: 5px solid #1a1a1a;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.5), 0 0 12px rgba(76,194,255,0.35);
  margin-top: -7px;
  transition: border-width 0.1s ease, background 0.1s ease, box-shadow 0.2s ease;
}
input[type="range"]::-webkit-slider-thumb:hover {
  border-width: 4px;
  background: #6ccfff;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.5), 0 0 18px rgba(76,194,255,0.55);
}
input[type="range"]::-webkit-slider-thumb:active {
  border-width: 6px;
  background: #6ccfff;
}

/* ────────── Text inputs / dropdowns / textareas ────────── */
input[type="text"], input[type="number"], textarea, select,
.gr-input, .gr-textbox, .gr-dropdown input {
  background: rgba(0,0,0,0.25) !important;
  color: var(--fg) !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  border-radius: 10px !important;
  font-family: 'Space Grotesk', sans-serif !important;
  font-size: 0.875rem !important;
  padding: 10px 14px !important;
  transition: border-color 0.2s, box-shadow 0.2s;
}
input[type="text"]:focus, input[type="number"]:focus, textarea:focus,
.gr-input:focus, .gr-textbox:focus {
  border-color: rgba(96, 165, 250, 0.5) !important;
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.15) !important;
  outline: none !important;
}

/* Dropdown menu items */
ul.options li, .gr-dropdown ul li {
  background: var(--bg-elev) !important;
  color: var(--fg) !important;
  font-family: 'Space Grotesk', sans-serif !important;
}

/* ────────── Radio / Checkbox ────────── */
.gr-radio label, .gr-checkbox label {
  background: rgba(255,255,255,0.03) !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  border-radius: 10px !important;
  padding: 8px 14px !important;
  font-family: 'Space Grotesk', sans-serif !important;
  color: var(--fg-muted) !important;
  transition: all 0.2s ease !important;
}
.gr-radio label:hover, .gr-checkbox label:hover {
  border-color: rgba(96,165,250,0.30) !important;
  color: var(--fg) !important;
}
.gr-radio input:checked + *, .gr-radio label.selected {
  background: rgba(96,165,250,0.10) !important;
  border-color: rgba(96,165,250,0.40) !important;
  color: #93c5fd !important;
}

/* ────────── Image/file upload areas ────────── */
.gr-image, .image-frame, .file, .file-preview, .upload-container {
  background: rgba(0,0,0,0.3) !important;
  border: 1.5px dashed rgba(255,255,255,0.10) !important;
  border-radius: var(--radius-inner) !important;
}
.gr-image:hover, .image-frame:hover, .file:hover {
  border-color: rgba(96,165,250,0.30) !important;
}

/* Image preview itself (rendered output) */
.gr-image img, .image img {
  border-radius: var(--radius-inner) !important;
  background:
    repeating-conic-gradient(rgba(255,255,255,0.04) 0% 25%, transparent 0% 50%) 50% / 24px 24px;
}

/* ────────── Status markdown ────────── */
.gr-markdown, .markdown {
  font-family: 'Space Grotesk', sans-serif !important;
  color: var(--fg) !important;
  font-size: 0.85rem !important;
}
.gr-markdown code, .markdown code {
  background: rgba(255,255,255,0.06) !important;
  padding: 2px 6px !important;
  border-radius: 4px !important;
  font-size: 0.78rem !important;
  color: #93c5fd !important;
}
.status-ok { color: #6ee7b7; font-weight: 600; }

/* ────────── Color picker ────────── */
.gr-colorpicker input {
  border-radius: 8px !important;
  padding: 4px !important;
}

/* ────────── Footer ────────── */
#footer {
  margin-top: 32px;
  padding: 18px 0;
  text-align: center;
  color: var(--fg-muted);
  font-size: 0.75rem;
  font-family: 'Space Grotesk', sans-serif;
  letter-spacing: 0.02em;
  border-top: 1px solid var(--border);
}
#footer code {
  background: rgba(255,255,255,0.06);
  padding: 2px 8px;
  border-radius: 4px;
  color: #93c5fd;
  font-size: 0.7rem;
}

/* ────────── Scrollbar ────────── */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.08);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); background-clip: padding-box; border: 2px solid transparent; }

/* ────────── Animations (mimicking Framer Motion entry patterns) ────────── */
@keyframes heroEnter {
  from { opacity: 0; transform: translateY(-12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeLeft {
  from { opacity: 0; transform: translateX(-16px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes fadeRight {
  from { opacity: 0; transform: translateX(16px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.tab-nav { animation: fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 0.1s; }
.tabitem { animation: fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 0.2s; }
.gr-row > .gr-column:nth-child(1) > .gr-block { animation: fadeLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 0.25s; }
.gr-row > .gr-column:nth-child(2) > .gr-block { animation: fadeRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 0.3s; }

/* Loading shimmer on processing buttons */
button.primary.processing::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
  animation: shimmer 1.5s infinite;
}

/* ────────── Misc Gradio cleanup ────────── */
.gradio-container .footer, .built-with, footer { display: none !important; }
.gr-block.padded { padding: 18px !important; }
.gr-row { gap: 16px !important; }
"""


HERO_HTML = """
<div id="hero">
  <div class="hero-inner">
    <h1>Sharpz</h1>
    <p>
      Remoção de fundo de alta fidelidade com <b>luma keying</b> (Unmult) para neon/glow
      e <b>segmentação AI</b> (BiRefNet · ISNet · U2Net) para fotos. Vetorização PNG → SVG
      com dois traces simultâneos: um <b>com fundo</b> e um <b>clean transparente</b>.
    </p>
    <div class="badges">
      <span class="badge b-blue">Luma Keying</span>
      <span class="badge b-violet">BiRefNet</span>
    </div>
  </div>
</div>
"""

def convert_ktx_single_action(
    image: Image.Image | None,
    preset_key: str,
    auto_align: bool,
    auto_preset: bool,
    validate_quality: bool,
) -> tuple[str, str | None]:
    """Converte uma unica imagem (uploaded) -> KTX, retorna status + file path."""
    if image is None:
        return "❌ Envie uma imagem primeiro.", None

    if ktx_find_toktx() is None:
        return f"❌ {ktx_install_hint()}", None

    try:
        with tempfile.TemporaryDirectory(delete=False) as tmpdir:
            tmpdir_path = Path(tmpdir)
            input_png = tmpdir_path / "input.png"
            output_ktx = tmpdir_path / "output.ktx"
            image.save(input_png, format="PNG")

            result = ktx_convert_file(
                input_png, output_ktx,
                preset=preset_key, overwrite=True,
                auto_align=auto_align, auto_preset=auto_preset,
                validate_quality=validate_quality,
            )

            if not result.success:
                return f"❌ {result.error}", None

            ratio_text = f"{result.ratio:.1f}x menor" if result.ratio > 1 else f"{1 / result.ratio:.1f}x maior"
            lines = [
                f"✓ **Convertido em {result.duration_ms}ms**",
                f"PNG: {result.size_input / 1024:.0f} KB → KTX: {result.size_output / 1024:.0f} KB ({ratio_text})",
                f"Preset: `{'auto' if auto_preset else preset_key}`",
            ]
            if result.preprocessed and result.pre_size != result.final_size:
                ow, oh = result.pre_size or (0, 0)
                nw, nh = result.final_size or (0, 0)
                lines.append(f"Pre-aligned: {ow}×{oh} → {nw}×{nh} (multiplo de 4 pra max qualidade BasisU)")
            if result.psnr is not None:
                lines.append(f"Qualidade: **PSNR {result.psnr:.1f} dB** {result.quality_grade}  •  SSIM {result.ssim:.4f}" if result.ssim else f"Qualidade: PSNR {result.psnr:.1f} dB {result.quality_grade}")
            return "\n".join(lines), str(output_ktx)
    except Exception as e:
        return f"❌ Erro inesperado: {e}", None


def convert_ktx_batch_action(
    folder_path: str,
    output_path: str,
    preset_key: str,
    recursive: bool,
    flatten: bool,
    auto_align: bool,
    auto_preset: bool,
    validate_quality: bool,
    max_workers: int,
    progress: gr.Progress = gr.Progress(),
) -> str:
    """Converte pasta inteira -> output dir. Retorna texto summarize."""
    if not folder_path:
        return "❌ Informe o caminho da pasta de input."
    if not output_path:
        return "❌ Informe o caminho do diretorio de output."

    folder = Path(folder_path).expanduser().resolve()
    out = Path(output_path).expanduser().resolve()

    if not folder.exists() or not folder.is_dir():
        return f"❌ Pasta nao existe ou nao eh diretorio: {folder}"

    if ktx_find_toktx() is None:
        return f"❌ {ktx_install_hint()}"

    images = ktx_collect_images(folder, recursive=recursive)
    if not images:
        return f"❌ Nenhuma imagem PNG/JPG em {folder}."

    progress(0, desc=f"Processando {len(images)} imagem(ns)...")

    def _on_progress(idx: int, total: int, _result) -> None:
        progress(idx / total, desc=f"[{idx}/{total}] {_result.input_path.name}")

    base = None if flatten else folder
    results = ktx_batch_convert(
        images, out,
        preset=preset_key, base_dir=base, overwrite=True,
        auto_align=auto_align, auto_preset=auto_preset,
        validate_quality=validate_quality,
        max_workers=max_workers,
        on_progress=_on_progress,
    )
    return ktx_summarize(results)


def build_app() -> gr.Blocks:
    with gr.Blocks(title="Sharpz") as demo:
        gr.HTML(HERO_HTML)

        with gr.Tabs():
            # ═══════════════ TAB 1: Pipeline Completo ═══════════════
            with gr.Tab("⚡  Pipeline"):
                with gr.Row():
                    with gr.Column(scale=1):
                        full_input = gr.Image(
                            label="Imagem original", type="pil", height=380,
                        )
                        with gr.Accordion("Configurações", open=True):
                            full_method = gr.Radio(
                                choices=[
                                    ("Auto", "auto"),
                                    ("Luma Dark", "luma_dark"),
                                    ("Luma Light", "luma_light"),
                                    ("AI", "ai"),
                                ],
                                value="auto",
                                label="Método de remoção",
                            )
                            full_model = gr.Dropdown(
                                choices=_model_choices(),
                                value=DEFAULT_MODEL,
                                label="Modelo AI (apenas para método AI)",
                            )
                            with gr.Row():
                                full_luma_low = gr.Slider(0.0, 0.5, 0.04, step=0.01, label="Luma low")
                                full_luma_high = gr.Slider(0.5, 1.0, 0.95, step=0.01, label="Luma high")
                            with gr.Row():
                                full_unmult = gr.Checkbox(value=True, label="Unmult")
                                full_denoise = gr.Slider(0, 7, 0, step=1, label="Denoise")
                            full_sat = gr.Slider(0.5, 2.0, 1.15, step=0.05, label="Saturação")
                            full_color_mode = gr.Radio(
                                ["color", "binary"], value="color", label="Modo SVG"
                            )
                            with gr.Row():
                                full_speckle = gr.Slider(0, 20, 2, step=1, label="Filter speckle")
                                full_precision = gr.Slider(1, 8, 8, step=1, label="Color precision")
                                full_upscale = gr.Slider(1.0, 3.0, 1.0, step=0.25, label="Upscale")
                            full_flatten_color = gr.ColorPicker(
                                value="#000000", label="Cor de fundo do SVG (com bg)",
                            )
                        full_btn = gr.Button("Processar tudo", variant="primary", size="lg")

                    with gr.Column(scale=1):
                        full_clean = gr.Image(label="PNG (transparente)", type="pil", height=320)
                        full_png_file = gr.File(label="Baixar PNG")
                        with gr.Row():
                            with gr.Column():
                                full_svg_preview_bg = gr.Image(label="SVG · com fundo", height=280)
                                full_svg_file_bg = gr.File(label="Baixar SVG com bg")
                            with gr.Column():
                                full_svg_preview_clean = gr.Image(label="SVG · clean (transparente)", height=280)
                                full_svg_file_clean = gr.File(label="Baixar SVG clean")
                        full_status = gr.Markdown()

                full_btn.click(
                    full_pipeline_action,
                    inputs=[
                        full_input, full_method, full_model,
                        full_luma_low, full_luma_high, full_unmult, full_denoise,
                        full_sat, full_color_mode, full_speckle, full_precision,
                        full_upscale, full_flatten_color,
                    ],
                    outputs=[
                        full_clean, full_png_file,
                        full_svg_preview_bg, full_svg_file_bg,
                        full_svg_preview_clean, full_svg_file_clean,
                        full_status,
                    ],
                )

            # ═══════════════ TAB 2: Remover Fundo ═══════════════
            with gr.Tab("Remover Fundo"):
                with gr.Row():
                    with gr.Column(scale=1):
                        bg_input = gr.Image(label="Imagem original", type="pil", height=420)
                        bg_method = gr.Radio(
                            choices=[
                                ("Auto", "auto"),
                                ("Luma Dark", "luma_dark"),
                                ("Luma Light", "luma_light"),
                                ("AI", "ai"),
                            ],
                            value="auto", label="Método",
                        )
                        bg_model = gr.Dropdown(
                            choices=_model_choices(), value=DEFAULT_MODEL, label="Modelo AI",
                        )
                        with gr.Accordion("Luma Keying", open=True):
                            with gr.Row():
                                bg_luma_low = gr.Slider(0.0, 0.5, 0.04, step=0.01, label="Threshold low")
                                bg_luma_high = gr.Slider(0.5, 1.0, 0.95, step=0.01, label="Threshold high")
                            with gr.Row():
                                bg_unmult = gr.Checkbox(value=True, label="Unmult")
                                bg_denoise = gr.Slider(0, 7, 0, step=1, label="Denoise")
                                bg_gamma = gr.Slider(0.3, 3.0, 1.0, step=0.1, label="Gamma")
                        with gr.Accordion("Alpha matting (AI)", open=False):
                            bg_alpha = gr.Checkbox(value=True, label="Habilitar")
                            with gr.Row():
                                bg_fg = gr.Slider(0, 255, 240, step=1, label="FG threshold")
                                bg_bg_th = gr.Slider(0, 255, 10, step=1, label="BG threshold")
                                bg_erode = gr.Slider(0, 50, 10, step=1, label="Erode")
                        with gr.Accordion("Color enhancement", open=False):
                            with gr.Row():
                                bg_sat = gr.Slider(0.5, 2.0, 1.0, step=0.05, label="Saturação")
                                bg_contrast = gr.Slider(0.5, 2.0, 1.0, step=0.05, label="Contraste")
                        with gr.Accordion("Cor de fundo", open=False):
                            bg_use_color = gr.Checkbox(value=False, label="Aplicar")
                            bg_color = gr.ColorPicker(value="#ffffff", label="Cor")
                        bg_btn = gr.Button("Remover fundo", variant="primary", size="lg")

                    with gr.Column(scale=1):
                        bg_output = gr.Image(label="Resultado", type="pil", height=420)
                        bg_file = gr.File(label="Baixar PNG")
                        bg_status = gr.Markdown()

                bg_btn.click(
                    remove_bg_action,
                    inputs=[
                        bg_input, bg_method, bg_model,
                        bg_alpha, bg_fg, bg_bg_th, bg_erode,
                        bg_luma_low, bg_luma_high, bg_unmult, bg_denoise, bg_gamma,
                        bg_sat, bg_contrast,
                        bg_use_color, bg_color,
                    ],
                    outputs=[bg_output, bg_file, bg_status],
                )

            # ═══════════════ TAB 3: PNG → SVG ═══════════════
            with gr.Tab("PNG → SVG"):
                with gr.Row():
                    with gr.Column(scale=1):
                        vec_input = gr.Image(label="Imagem PNG", type="pil", height=420)
                        with gr.Row():
                            vec_color_mode = gr.Radio(
                                ["color", "binary"], value="color", label="Cor"
                            )
                            vec_hierarchical = gr.Radio(
                                ["stacked", "cutout"], value="stacked", label="Hierarquia"
                            )
                            vec_path_mode = gr.Radio(
                                ["spline", "polygon", "none"], value="spline", label="Path"
                            )
                        vec_upscale = gr.Slider(1.0, 3.0, 1.0, step=0.25, label="Upscale")
                        with gr.Accordion("Avançado", open=False):
                            vec_speckle = gr.Slider(0, 20, 2, step=1, label="Filter speckle")
                            vec_precision = gr.Slider(1, 8, 8, step=1, label="Color precision")
                            vec_layer = gr.Slider(0, 256, 8, step=1, label="Layer difference")
                            vec_corner = gr.Slider(0, 180, 60, step=1, label="Corner threshold")
                            vec_length = gr.Slider(0, 20, 4, step=0.5, label="Length threshold")
                            vec_splice = gr.Slider(0, 180, 45, step=1, label="Splice threshold")
                            vec_path_precision = gr.Slider(1, 10, 10, step=1, label="Path precision")
                        vec_flatten_color = gr.ColorPicker(value="#000000", label="Cor do fundo")
                        vec_btn = gr.Button("Gerar SVG", variant="primary", size="lg")

                    with gr.Column(scale=1):
                        with gr.Row():
                            with gr.Column():
                                vec_preview_bg = gr.Image(label="SVG · com fundo", height=340)
                                vec_file_bg = gr.File(label="Baixar SVG com bg")
                            with gr.Column():
                                vec_preview_clean = gr.Image(label="SVG · clean", height=340)
                                vec_file_clean = gr.File(label="Baixar SVG clean")
                        vec_status = gr.Markdown()

                vec_btn.click(
                    vectorize_action,
                    inputs=[
                        vec_input, vec_color_mode, vec_hierarchical, vec_path_mode,
                        vec_speckle, vec_precision, vec_layer, vec_corner,
                        vec_length, vec_splice, vec_path_precision, vec_upscale,
                        vec_flatten_color,
                    ],
                    outputs=[
                        vec_preview_bg, vec_file_bg,
                        vec_preview_clean, vec_file_clean,
                        vec_status,
                    ],
                )

            with gr.Tab("PNG → KTX"):
                gr.Markdown(
                    "**KTX2 batch converter** — texturas comprimidas (Basis Universal) "
                    "prontas pro pipeline 3D. Default agora é **`ultra`** (UASTC q4 + zcmp22 + "
                    "mipmaps) — encode lento mas qualidade quase indistinguível do PNG.\n\n"
                    "Requer [`toktx`](https://github.com/KhronosGroup/KTX-Software/releases) "
                    "no PATH. Validation PSNR/SSIM precisa `scikit-image` + `ktx` CLI v4.3+."
                )

                ktx_preset_choices = [(desc, key) for key, desc in ktx_list_presets()]

                with gr.Tab("Single (upload)"):
                    with gr.Row():
                        with gr.Column(scale=1):
                            ktx_single_input = gr.Image(label="Imagem PNG/JPG", type="pil", height=380)
                            ktx_single_preset = gr.Dropdown(
                                choices=ktx_preset_choices,
                                value=KTX_DEFAULT_PRESET,
                                label="Preset de codificacao",
                            )
                            with gr.Row():
                                ktx_single_align = gr.Checkbox(
                                    value=True,
                                    label="Auto-align (pad pra mult. de 4)",
                                    info="BasisU max qualidade",
                                )
                                ktx_single_auto = gr.Checkbox(
                                    value=False,
                                    label="Auto-preset (alpha → ultra_rgba)",
                                )
                                ktx_single_validate = gr.Checkbox(
                                    value=False,
                                    label="Validate PSNR/SSIM",
                                    info="+~1s/img",
                                )
                            ktx_single_btn = gr.Button("Converter pra KTX", variant="primary", size="lg")
                        with gr.Column(scale=1):
                            ktx_single_status = gr.Markdown()
                            ktx_single_file = gr.File(label="Baixar .ktx")

                    ktx_single_btn.click(
                        convert_ktx_single_action,
                        inputs=[
                            ktx_single_input, ktx_single_preset,
                            ktx_single_align, ktx_single_auto, ktx_single_validate,
                        ],
                        outputs=[ktx_single_status, ktx_single_file],
                    )

                with gr.Tab("Batch (pasta)"):
                    gr.Markdown(
                        "Converte **pasta inteira** PNG/JPG → .ktx em paralelo. "
                        "Caminhos absolutos (ex: `C:/caminho/para/imagens`)."
                    )
                    with gr.Row():
                        with gr.Column(scale=1):
                            ktx_batch_input = gr.Textbox(
                                label="Pasta de input",
                                placeholder="C:/caminho/para/imagens",
                            )
                            ktx_batch_output = gr.Textbox(
                                label="Pasta de output",
                                placeholder="C:/caminho/para/output_ktx",
                            )
                            ktx_batch_preset = gr.Dropdown(
                                choices=ktx_preset_choices,
                                value=KTX_DEFAULT_PRESET,
                                label="Preset",
                            )
                            with gr.Row():
                                ktx_batch_recursive = gr.Checkbox(value=True, label="Recursivo")
                                ktx_batch_flatten = gr.Checkbox(value=False, label="Flatten")
                            with gr.Row():
                                ktx_batch_align = gr.Checkbox(
                                    value=True,
                                    label="Auto-align",
                                    info="pad pra mult. 4",
                                )
                                ktx_batch_auto = gr.Checkbox(
                                    value=False,
                                    label="Auto-preset",
                                )
                                ktx_batch_validate = gr.Checkbox(
                                    value=False,
                                    label="Validate PSNR",
                                )
                            ktx_batch_jobs = gr.Slider(
                                minimum=1, maximum=16, step=1, value=4,
                                label="Threads em paralelo",
                                info="toktx eh single-thread, escala linear ate # cores",
                            )
                            ktx_batch_btn = gr.Button("Processar pasta", variant="primary", size="lg")
                        with gr.Column(scale=1):
                            ktx_batch_status = gr.Markdown()

                    ktx_batch_btn.click(
                        convert_ktx_batch_action,
                        inputs=[
                            ktx_batch_input, ktx_batch_output, ktx_batch_preset,
                            ktx_batch_recursive, ktx_batch_flatten,
                            ktx_batch_align, ktx_batch_auto, ktx_batch_validate,
                            ktx_batch_jobs,
                        ],
                        outputs=[ktx_batch_status],
                    )


    return demo


if __name__ == "__main__":
    app = build_app()
    app.launch(
        server_name="127.0.0.1",
        server_port=7860,
        inbrowser=True,
        show_error=True,
        favicon_path=str(Path(__file__).parent / "web" / "app" / "favicon.ico"),
        theme=gr.themes.Base(
            primary_hue=gr.themes.colors.gray,
            secondary_hue=gr.themes.colors.gray,
            neutral_hue=gr.themes.colors.gray,
            font=["Space Grotesk", "system-ui", "sans-serif"],
        ).set(
            body_background_fill="#121212",
            body_background_fill_dark="#121212",
            background_fill_primary="#1a1a1a",
            background_fill_primary_dark="#1a1a1a",
            background_fill_secondary="#121212",
            background_fill_secondary_dark="#121212",
            border_color_primary="#2a2a3e",
            border_color_primary_dark="#2a2a3e",
            color_accent="#60a5fa",
            color_accent_soft="#60a5fa",
            body_text_color="#eeeeee",
            body_text_color_dark="#eeeeee",
            body_text_color_subdued="#9ca3af",
            block_background_fill="#1a1a1a",
            block_background_fill_dark="#1a1a1a",
            block_border_color="#2a2a3e",
            block_border_color_dark="#2a2a3e",
            block_label_background_fill="transparent",
            block_label_background_fill_dark="transparent",
            block_label_text_color="#eeeeee",
            block_label_text_color_dark="#eeeeee",
            input_background_fill="rgba(0,0,0,0.25)",
            input_background_fill_dark="rgba(0,0,0,0.25)",
            input_border_color="rgba(255,255,255,0.08)",
            input_border_color_dark="rgba(255,255,255,0.08)",
            input_border_color_focus="rgba(96,165,250,0.5)",
            input_border_color_focus_dark="rgba(96,165,250,0.5)",
            button_primary_background_fill="linear-gradient(135deg, #fafafa, #e4e4e7)",
            button_primary_background_fill_hover="linear-gradient(135deg, #ffffff, #f4f4f5)",
            button_primary_text_color="#0a0a0f",
            slider_color="#4cc2ff",
            slider_color_dark="#4cc2ff",
        ),
        css=APP_CSS,
    )
