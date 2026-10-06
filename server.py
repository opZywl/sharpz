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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.helpers import _has_python_module
from src.i18n import LanguageMiddleware
from src.processor import (
    AVAILABLE_MODELS,
    DEFAULT_MODEL,
    HEAVY_MODELS,
    model_detail,
    model_downloaded,
    model_label,
)
from src.ktx import (
    DEFAULT_PRESET as KTX_DEFAULT_PRESET,
    find_toktx as ktx_find_toktx,
)
from api import image, ktx, batch, ktx_tools, package_center, transcription, image_pdf, editor
from transcribe.jobs import (
    UPLOAD_DIR as TRANSCRIBE_UPLOAD_DIR,
    prune_uploads as transcribe_prune_uploads,
)
from api.errors import memory_error_handler, unexpected_error_handler
from api.schemas import CapabilityResponse, ModelInfo, ModelsResponse
from api.security import LocalOnlyMiddleware


try:
    transcribe_prune_uploads(TRANSCRIBE_UPLOAD_DIR)
except Exception:
    pass


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
app.add_middleware(LanguageMiddleware)
app.add_middleware(LocalOnlyMiddleware)

app.add_exception_handler(MemoryError, memory_error_handler)
app.add_exception_handler(Exception, unexpected_error_handler)


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
            ModelInfo(
                key=k,
                label=model_label(k),
                is_default=(k == DEFAULT_MODEL),
                detail=model_detail(k),
                heavy=k in HEAVY_MODELS,
                downloaded=model_downloaded(k),
            )
            for k in AVAILABLE_MODELS
        ]
    )


app.include_router(image.router)
app.include_router(ktx.router)
app.include_router(batch.router)
app.include_router(ktx_tools.router)
app.include_router(transcription.router)
app.include_router(package_center.router)
app.include_router(image_pdf.router)
app.include_router(editor.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
