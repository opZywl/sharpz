export type Method = "auto" | "ai" | "luma_dark" | "luma_light" | "none"
export type ColorMode = "color" | "binary"
export type Hierarchical = "stacked" | "cutout"
export type PathMode = "spline" | "polygon" | "none"

export interface ModelInfo {
    key: string
    label: string
    is_default: boolean
}

export interface PipelineResult {
    cleaned_png_b64: string
    svg_with_bg: string
    svg_clean: string
    svg_with_bg_preview_b64: string
    svg_clean_preview_b64: string
    method_used: string
    elapsed_ms: number
    image_width: number
    image_height: number
}

export interface CleanResult {
    cleaned_png_b64: string
    method_used: string
    elapsed_ms: number
    image_width: number
    image_height: number
}

export interface SvgResult {
    svg_with_bg: string
    svg_clean: string
    svg_with_bg_preview_b64: string
    svg_clean_preview_b64: string
    elapsed_ms: number
    image_width: number
    image_height: number
    svg_with_bg_bytes: number
    svg_clean_bytes: number
}

export interface KtxPreset {
    key: string
    label: string
    is_default: boolean
}

export interface KtxSingleResult {
    success: boolean
    summary: string
    filename: string | null
    ktx_b64: string | null
    duration_ms: number
    size_input: number
    size_output: number
    ratio: number
}

export interface KtxBatchResult {
    success: boolean
    summary: string
    input_count: number
    output_dir: string | null
}

export interface BatchPipelineFile {
    input_path: string
    success: boolean
    outputs: string[]
    method_used: string | null
    duration_ms: number
    error: string | null
}

export interface BatchPipelineResult {
    success: boolean
    summary: string
    total: number
    success_count: number
    failure_count: number
    output_dir: string | null
    files: BatchPipelineFile[]
}

export interface KtxPatchResult {
    success: boolean
    summary: string
    filename: string | null
    ktx_b64: string | null
    saved_path: string | null
    size_input: number
    size_output: number
}

export interface PortfolioKtxResult {
    success: boolean
    summary: string
    filename: string | null
    ktx_b64: string | null
    saved_path: string | null
    duration_ms: number
    size_input: number
    size_output: number
    target_width: number
    target_height: number
}

export interface CapabilityInfo {
    status: string
    models_count: number
    toktx_found: boolean
    alktx2_found: boolean
    default_model: string
    default_ktx_preset: string
    modules: string[]
    endpoints: string[]
}

export const DEFAULT_MODEL = "birefnet-general"
export const DEFAULT_KTX_PRESET = "ultra"

export const methodOptions: Array<{ value: Method; label: string }> = [
    { value: "auto", label: "Auto" },
    { value: "luma_dark", label: "Luma dark" },
    { value: "luma_light", label: "Luma light" },
    { value: "ai", label: "AI" },
    { value: "none", label: "Sem remocao" },
]

export const colorModeOptions: Array<{ value: ColorMode; label: string }> = [
    { value: "color", label: "Color" },
    { value: "binary", label: "Binary" },
]

export const hierarchicalOptions: Array<{ value: Hierarchical; label: string }> = [
    { value: "stacked", label: "Stacked" },
    { value: "cutout", label: "Cutout" },
]

export const pathModeOptions: Array<{ value: PathMode; label: string }> = [
    { value: "spline", label: "Spline" },
    { value: "polygon", label: "Polygon" },
    { value: "none", label: "None" },
]
