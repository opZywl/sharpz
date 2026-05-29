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
}

export interface TranscribeCapabilities {
    ffmpeg: boolean
    whisperx: boolean
    diarization: boolean
    venv: boolean
    default_model: string
}

export interface TranscribeJob {
    job_id: string
    status: "queued" | "running" | "done" | "error"
    pct: number
    stage: string
    language: string | null
    duration: number | null
    segments: TranscribeSegment[]
    files: Record<string, string>
    degraded: string[]
    error: string | null
    elapsed: number | null
    options: Record<string, unknown>
}

export interface TranscribeEvent {
    type: "meta" | "progress" | "segment" | "stage" | "done" | "error"
    [key: string]: unknown
}

export interface StartTranscriptionResult {
    job_id: string
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

export async function startTranscription(form: FormData): Promise<StartTranscriptionResult> {
    const response = await fetch(BASE, { method: "POST", body: form })
    if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `HTTP ${response.status}`)
    }
    return (await response.json()) as StartTranscriptionResult
}

export async function getJob(jobId: string): Promise<TranscribeJob> {
    const response = await fetch(`${BASE}/jobs/${jobId}`)
    if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `HTTP ${response.status}`)
    }
    return (await response.json()) as TranscribeJob
}

export function openStream(jobId: string, onEvent: (event: TranscribeEvent) => void): EventSource {
    const source = new EventSource(`${BASE}/jobs/${jobId}/stream`)
    source.onmessage = (message) => {
        try {
            const parsed = JSON.parse(message.data) as TranscribeEvent
            onEvent(parsed)
        } catch {
            // ignora linhas que nao sao JSON valido
        }
    }
    return source
}

export function downloadUrl(jobId: string, format: string): string {
    return `${BASE}/jobs/${jobId}/download?format=${encodeURIComponent(format)}`
}

export function audioUrl(jobId: string): string {
    return `${BASE}/jobs/${jobId}/audio`
}

export async function summarize(jobId: string, options: SummarizeOptions): Promise<SummarizeResult> {
    const response = await fetch(`${BASE}/jobs/${jobId}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
    })
    if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `HTTP ${response.status}`)
    }
    return (await response.json()) as SummarizeResult
}

export async function getModels(): Promise<TranscribeModel[]> {
    const response = await fetch(`${BASE}/models`)
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
    }
    const data = (await response.json()) as { models: TranscribeModel[] }
    return data.models
}

export async function getCapabilities(): Promise<TranscribeCapabilities> {
    const response = await fetch(`${BASE}/capabilities`)
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
    }
    return (await response.json()) as TranscribeCapabilities
}
