"""Cleanup Image - Background removal and PNG to SVG conversion."""

from importlib import import_module

__all__ = [
    "remove_background",
    "png_to_svg",
    "process_image",
    "strip_chroma_paths",
    "wrap_svg_with_background",
    "AVAILABLE_MODELS",
    "DEFAULT_MODEL",
]

_SUBMODULES = {"i18n", "ktx", "memory", "processor"}


def __getattr__(name: str):
    if name in __all__:
        return getattr(import_module(".processor", __name__), name)
    if name in _SUBMODULES:
        return import_module(f".{name}", __name__)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
