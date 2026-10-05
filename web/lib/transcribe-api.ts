import { responseError } from "@/lib/dashboard-utils"

export type TranscribeStatus = "queued" | "running" | "done" | "error" | "canceled"

export interface TranscribeWord {
    start: number
    end: number
    word: string
    speaker: string | null
}

export interface TranscribeSegment {
    id?: number
    start: number
    end: number
    text: string
    speaker: string | null
    words?: TranscribeWord[] | null
}

export interface TranscribeModel {
    key: string
    label: string
    downloaded: boolean
    is_default: boolean
    english_only?: boolean
    size_mb?: number | null
    downloading?: boolean
}

export interface TranscribeModels {
    models: TranscribeModel[]
    default_resolved: string | null
}

export interface TranscribeCapabilities {
    ffmpeg: boolean
    whisperx: boolean
    diarization: boolean
    venv: boolean
    default_model: string
}

export interface CompleteManifest {
    slug: string
    title: string
    out_dir: string
    dest_dir: string | null
    zip: string | null
    frames: number
    images: string[]
    captions: Record<string, string | null>
    contact_sheets: string[]
    docs: string[]
    transcripts: string[]
    docs_generated: boolean
    degraded: string[]
}

export interface TranscribeJob {
    job_id: string
    status: TranscribeStatus
    pct: number
    progress?: number | null
    stage: string
    language: string | null
    duration: number | null
    segments: TranscribeSegment[]
    files: Record<string, string>
    degraded: string[]
    error: string | null
    elapsed: number | null
    options: Record<string, unknown>
    complete: CompleteManifest | null
    model?: string | null
    text?: string | null
    last_event_id?: number | null
}

export interface TranscribeEvent {
    type: "meta" | "progress" | "segment" | "stage" | "done" | "error" | "canceled"
    [key: string]: unknown
}

export interface StartTranscriptionResult {
    job_id: string
    model?: string | null
    deduped?: boolean
}

export interface StartTranscriptionOptions {
    onUploadProgress?: (fraction: number) => void
    signal?: AbortSignal
}

export interface CancelJobResult {
    ok: boolean
    status: TranscribeStatus
}

export type ModelDownloadState = "idle" | "running" | "done" | "error"

export interface ModelDownloadStatus {
    status: ModelDownloadState
    downloaded_bytes: number
    total_bytes: number | null
    error: string | null
}

export interface StartModelDownloadResult {
    ok: boolean
    status: ModelDownloadState
}

export interface StreamHandlers {
    onEvent: (event: TranscribeEvent) => void
    onError: () => void
}

export interface SummarizeOptions {
    base_url: string
    api_key?: string
    model: string
    language?: string
}

export interface SummarizeResult {
    summary: string
}

const BASE = "/api/transcribe"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${BASE}${path}`, init)
    if (!response.ok) throw await responseError(response)
    return (await response.json()) as T
}

function xhrError(xhr: XMLHttpRequest): Promise<Error> {
    if (xhr.status === 413) {
        return Promise.resolve(
            new Error("O arquivo é grande demais para enviar por aqui. Use “Caminho no computador” em Mais opções."),
        )
    }
    try {
        return responseError(new Response(xhr.responseText, { status: xhr.status, statusText: xhr.statusText }))
    } catch {
        return Promise.resolve(new Error(`Erro HTTP ${xhr.status}.`))
    }
}

export function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError"
}

export function startTranscription(
    form: FormData,
    options: StartTranscriptionOptions = {},
): Promise<StartTranscriptionResult> {
    return new Promise((resolve, reject) => {
        const { signal, onUploadProgress } = options
        if (signal?.aborted) {
            reject(new DOMException("Envio cancelado.", "AbortError"))
            return
        }
        const xhr = new XMLHttpRequest()
        const abort = () => xhr.abort()
        const settle = () => signal?.removeEventListener("abort", abort)
        xhr.open("POST", BASE)
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) onUploadProgress?.(event.loaded / event.total)
        }
        xhr.onload = () => {
            settle()
            if (xhr.status < 200 || xhr.status >= 300) {
                xhrError(xhr).then(reject)
                return
            }
            try {
                resolve(JSON.parse(xhr.responseText) as StartTranscriptionResult)
            } catch {
                reject(new Error("O servidor respondeu num formato inesperado ao criar a transcrição."))
            }
        }
        xhr.onerror = () => {
            settle()
            reject(new Error("Não consegui enviar o arquivo para o servidor do Sharpz. Confira se ele está rodando e tente de novo."))
        }
        xhr.onabort = () => {
            settle()
            reject(new DOMException("Envio cancelado.", "AbortError"))
        }
        signal?.addEventListener("abort", abort, { once: true })
        xhr.send(form)
    })
}

export async function getJob(jobId: string): Promise<TranscribeJob | null> {
    const response = await fetch(`${BASE}/jobs/${jobId}`)
    if (response.status === 404) return null
    if (!response.ok) throw await responseError(response)
    return (await response.json()) as TranscribeJob
}

export function cancelJob(jobId: string): Promise<CancelJobResult> {
    return request<CancelJobResult>(`/jobs/${jobId}/cancel`, { method: "POST" })
}

export function openStream(jobId: string, handlers: StreamHandlers, since = 0): EventSource {
    const query = since > 0 ? `?since=${since}` : ""
    const source = new EventSource(`${BASE}/jobs/${jobId}/stream${query}`)
    source.onmessage = (message) => {
        let event: TranscribeEvent
        try {
            event = JSON.parse(message.data) as TranscribeEvent
        } catch {
            return
        }
        handlers.onEvent(event)
    }
    source.onerror = () => handlers.onError()
    return source
}

export function downloadUrl(jobId: string, format: string): string {
    return `${BASE}/jobs/${jobId}/download?format=${encodeURIComponent(format)}`
}

export async function fetchJobFile(jobId: string, format: string): Promise<Blob> {
    const response = await fetch(downloadUrl(jobId, format))
    if (!response.ok) throw await responseError(response)
    return response.blob()
}

export function audioUrl(jobId: string): string {
    return `${BASE}/jobs/${jobId}/audio`
}

export function summarize(jobId: string, options: SummarizeOptions): Promise<SummarizeResult> {
    return request<SummarizeResult>(`/jobs/${jobId}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
    })
}

export function getComplete(jobId: string): Promise<CompleteManifest> {
    return request<CompleteManifest>(`/jobs/${jobId}/complete`)
}

export function completeFileUrl(jobId: string, path: string): string {
    return `${BASE}/jobs/${jobId}/complete/file?path=${encodeURIComponent(path)}`
}

export function completeZipUrl(jobId: string): string {
    return `${BASE}/jobs/${jobId}/complete/zip`
}

export async function openCompleteFolder(jobId: string): Promise<void> {
    await request<unknown>(`/jobs/${jobId}/complete/open-folder`, { method: "POST" })
}

export async function getModels(): Promise<TranscribeModels> {
    const data = await request<{ models?: TranscribeModel[]; default_resolved?: string | null }>("/models")
    return { models: data.models ?? [], default_resolved: data.default_resolved ?? null }
}

export function getCapabilities(): Promise<TranscribeCapabilities> {
    return request<TranscribeCapabilities>("/capabilities")
}

export function startModelDownload(key: string): Promise<StartModelDownloadResult> {
    return request<StartModelDownloadResult>(`/models/${encodeURIComponent(key)}/download`, { method: "POST" })
}

export function getModelDownload(key: string): Promise<ModelDownloadStatus> {
    return request<ModelDownloadStatus>(`/models/${encodeURIComponent(key)}/download`)
}
