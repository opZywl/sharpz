"""Cleanup Image - Background removal and PNG to SVG conversion."""

from .processor import (
    remove_background,
    png_to_svg,
    process_image,
    strip_chroma_paths,
    wrap_svg_with_background,
    AVAILABLE_MODELS,
    DEFAULT_MODEL,
)

__all__ = [
    "remove_background",
    "png_to_svg",
    "process_image",
    "strip_chroma_paths",
    "wrap_svg_with_background",
    "AVAILABLE_MODELS",
    "DEFAULT_MODEL",
]
