from __future__ import annotations

from pydantic import BaseModel

from api.constants import PORTFOLIO_KTX_HEIGHT, PORTFOLIO_KTX_WIDTH


class ModelInfo(BaseModel):
    key: str
    label: str
    is_default: bool
    detail: str = ""
    heavy: bool = False
    downloaded: bool = True


class ModelsResponse(BaseModel):
    models: list[ModelInfo]


class PipelineResponse(BaseModel):
    cleaned_png_b64: str
    svg_with_bg: str
    svg_clean: str
    svg_with_bg_preview_b64: str
    svg_clean_preview_b64: str
    method_used: str
    elapsed_ms: int
    image_width: int
    image_height: int


class CleanResponse(BaseModel):
    cleaned_png_b64: str
    method_used: str
    elapsed_ms: int
    image_width: int
    image_height: int


class SvgResponse(BaseModel):
    svg_with_bg: str
    svg_clean: str
    svg_with_bg_preview_b64: str
    svg_clean_preview_b64: str
    elapsed_ms: int
    image_width: int
    image_height: int
    svg_with_bg_bytes: int
    svg_clean_bytes: int


class KtxPresetInfo(BaseModel):
    key: str
    label: str
    is_default: bool


class KtxPresetsResponse(BaseModel):
    presets: list[KtxPresetInfo]
    default_preset: str
    toktx_found: bool
    install_hint: str | None = None


class KtxSingleResponse(BaseModel):
    success: bool
    summary: str
    filename: str | None = None
    ktx_b64: str | None = None
    duration_ms: int = 0
    size_input: int = 0
    size_output: int = 0
    ratio: float = 0


class KtxBatchResponse(BaseModel):
    success: bool
    summary: str
    input_count: int = 0
    output_dir: str | None = None


class CapabilityResponse(BaseModel):
    status: str
    models_count: int
    toktx_found: bool
    alktx2_found: bool
    default_model: str
    default_ktx_preset: str
    modules: list[str]
    endpoints: list[str]


class BatchPipelineFile(BaseModel):
    input_path: str
    success: bool
    outputs: list[str] = []
    method_used: str | None = None
    duration_ms: int = 0
    error: str | None = None


class BatchPipelineResponse(BaseModel):
    success: bool
    summary: str
    total: int = 0
    success_count: int = 0
    failure_count: int = 0
    output_dir: str | None = None
    files: list[BatchPipelineFile] = []


class KtxPatchResponse(BaseModel):
    success: bool
    summary: str
    filename: str | None = None
    ktx_b64: str | None = None
    saved_path: str | None = None
    size_input: int = 0
    size_output: int = 0


class PortfolioKtxResponse(BaseModel):
    success: bool
    summary: str
    filename: str | None = None
    ktx_b64: str | None = None
    saved_path: str | None = None
    duration_ms: int = 0
    size_input: int = 0
    size_output: int = 0
    target_width: int = PORTFOLIO_KTX_WIDTH
    target_height: int = PORTFOLIO_KTX_HEIGHT


class TranscribeJobCreated(BaseModel):
    job_id: str
    model: str
    deduped: bool = False


class TranscribeModelInfo(BaseModel):
    key: str
    label: str
    downloaded: bool
    is_default: bool
    english_only: bool = False
    size_mb: int = 0
    downloading: bool = False


class TranscribeModelsResponse(BaseModel):
    models: list[TranscribeModelInfo]
    default_resolved: str


class TranscribeModelDownloadStarted(BaseModel):
    ok: bool
    status: str


class TranscribeModelDownloadStatus(BaseModel):
    status: str
    downloaded_bytes: int
    total_bytes: int | None = None
    error: str | None = None


class TranscribeCapabilitiesResponse(BaseModel):
    ffmpeg: bool
    whisperx: bool
    diarization: bool
    venv: bool
    default_model: str
    word_timestamps: bool


class TranscribeSummarizeRequest(BaseModel):
    base_url: str
    api_key: str = ""
    model: str
    language: str = "pt"


class TranscribeSummarizeResponse(BaseModel):
    summary: str


class PackageInfo(BaseModel):
    id: str
    name: str
    description: str
    category: str
    optional: bool
    size_hint: str
    installed: bool
    detail: str
    installable: bool
    manual_hint: str
    unlocks: list[str]


class PackagesResponse(BaseModel):
    packages: list[PackageInfo]


class PackageInstallStarted(BaseModel):
    job_id: str


class ImagePdfJobCreated(BaseModel):
    job_id: str
