import { apiFetch, responseError } from "@/lib/dashboard-utils"
import { withLang, type Lang } from "@/lib/i18n"

export interface ImgPdfLog {
    level: "info" | "warn" | "ok"
    message: string
}

export interface ImgPdfReport {
    chars: number
    hyphens: number
    spaces: number
    glitches: Record<string, number>
    glitch_total: number
    terms_missing: string[]
    clean: boolean
    blocks_placed: number
    page_mode: string
    page_pt: number[]
    image_px: number[]
}

export interface ImgPdfManifest {
    pdf: string
    pdf_name: string
    text_layer: string
    preview: string | null
    out_dir: string
    dest_dir: string | null
    dest_pdf: string | null
    engine: string
    blocks: number
    report: ImgPdfReport
    degraded: string[]
}

export interface ImgPdfJob {
    job_id: string
    status: "queued" | "running" | "done" | "error"
    pct: number
    stage: string
    logs: ImgPdfLog[]
    manifest: ImgPdfManifest | null
    degraded: string[]
    error: string | null
    elapsed: number | null
    input_path: string | null
}

export interface ImgPdfEvent {
    type: "log" | "progress" | "stage" | "done" | "error"
    [key: string]: unknown
}

export interface ImgPdfCapabilities {
    tesseract: boolean
}

export interface StartImgPdfResult {
    job_id: string
}

const BASE = "/api/image-to-pdf"

export async function startImageToPdf(form: FormData): Promise<StartImgPdfResult> {
    const response = await apiFetch(BASE, { method: "POST", body: form })
    if (!response.ok) throw await responseError(response)
    return (await response.json()) as StartImgPdfResult
}

export async function getImgPdfJob(jobId: string): Promise<ImgPdfJob> {
    const response = await apiFetch(`${BASE}/jobs/${jobId}`)
    if (!response.ok) throw await responseError(response)
    return (await response.json()) as ImgPdfJob
}

export function openImgPdfStream(jobId: string, onEvent: (event: ImgPdfEvent) => void): EventSource {
    const source = new EventSource(withLang(`${BASE}/jobs/${jobId}/stream`))
    source.onmessage = (message) => {
        try {
            onEvent(JSON.parse(message.data) as ImgPdfEvent)
        } catch {
            return
        }
    }
    source.onerror = () => {
        if (source.readyState === EventSource.CLOSED) {
            onEvent({ type: "error", reason: "disconnected" })
        }
    }
    return source
}

export function imgPdfDownloadUrl(jobId: string, lang?: Lang): string {
    return withLang(`${BASE}/jobs/${jobId}/download`, lang)
}

export function imgPdfPreviewUrl(jobId: string, lang?: Lang): string {
    return withLang(`${BASE}/jobs/${jobId}/preview`, lang)
}

export async function openImgPdfFolder(jobId: string): Promise<void> {
    const response = await apiFetch(`${BASE}/jobs/${jobId}/open-folder`, { method: "POST" })
    if (!response.ok) throw await responseError(response)
}

export async function getImgPdfCapabilities(): Promise<ImgPdfCapabilities> {
    const response = await apiFetch(`${BASE}/capabilities`)
    if (!response.ok) throw await responseError(response)
    return (await response.json()) as ImgPdfCapabilities
}
