import type { Messages } from "@/lib/i18n"

export type Method = "auto" | "ai" | "luma_dark" | "luma_light" | "none"
export type ColorMode = "color" | "binary"
export type Hierarchical = "stacked" | "cutout"
export type PathMode = "spline" | "polygon" | "none"

export interface ModelInfo {
    key: string
    label: string
    is_default: boolean
    detail?: string
    heavy?: boolean
    downloaded?: boolean
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

export const DEFAULT_MODEL = "isnet-general-use"
export const DEFAULT_KTX_PRESET = "ultra"

const METHODS: Method[] = ["auto", "luma_dark", "luma_light", "ai", "none"]
const COLOR_MODES: ColorMode[] = ["color", "binary"]
const HIERARCHIES: Hierarchical[] = ["stacked", "cutout"]
const PATH_MODES: PathMode[] = ["spline", "polygon", "none"]

export function methodOptions(t: Messages): Array<{ value: Method; label: string }> {
    return METHODS.map((value) => ({ value, label: t.options.method[value] }))
}

export function methodLabel(t: Messages, method?: string | null) {
    if (method === "no_bg_removal") return t.options.method.no_bg_removal
    return METHODS.includes(method as Method) ? t.options.method[method as Method] : method ?? ""
}

export function colorModeOptions(t: Messages): Array<{ value: ColorMode; label: string }> {
    return COLOR_MODES.map((value) => ({ value, label: t.options.colorMode[value] }))
}

export function hierarchicalOptions(t: Messages): Array<{ value: Hierarchical; label: string }> {
    return HIERARCHIES.map((value) => ({ value, label: t.options.hierarchical[value] }))
}

export function pathModeOptions(t: Messages): Array<{ value: PathMode; label: string }> {
    return PATH_MODES.map((value) => ({ value, label: t.options.pathMode[value] }))
}
