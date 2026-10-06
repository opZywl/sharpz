from __future__ import annotations

import base64
import importlib.util
import io
from pathlib import Path

import resvg_py
from fastapi import HTTPException, UploadFile
from PIL import Image

from src.i18n import t
from src.processor import AVAILABLE_MODELS


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
        raise HTTPException(status_code=400, detail=t("server.file_empty"))

    try:
        src_img = Image.open(io.BytesIO(raw))
        src_img.load()
    except MemoryError:
        raise
    except Image.DecompressionBombError as exc:
        raise HTTPException(status_code=413, detail=t("server.image_too_large")) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=t("server.image_invalid")) from exc
    return raw, src_img


def _require_model(model: str) -> None:
    if model not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail=t("server.model_unknown", model=model))


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
