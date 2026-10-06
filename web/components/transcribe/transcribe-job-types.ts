import type { FriendlyError } from "@/components/transcribe/transcribe-utils"
import type { Message } from "@/lib/i18n"
import type {
    CompleteManifest,
    TranscribeEvent,
    TranscribeJob,
    TranscribeSegment,
    TranscribeStatus,
} from "@/lib/transcribe-api"

export type JobPhase = "idle" | "uploading" | TranscribeStatus
export type JobMode = "standard" | "complete"

export interface StartInfo {
    sourceName: string
    mode: JobMode
    uploading: boolean
    sourceBytes: number | null
}

export interface StoredJob {
    jobId: string
    startedAt: number
    sourceName: string
    mode: JobMode
    sourceBytes: number | null
}

export interface PendingUpload {
    abort: AbortController
    sent: boolean
    cancelRequested: boolean
    epoch: number
}

export interface EtaAnchor {
    at: number
    pct: number
}

export interface JobState {
    phase: JobPhase
    jobId: string | null
    sourceName: string
    sourceBytes: number | null
    mode: JobMode
    startedAt: number | null
    finishedAt: number | null
    upload: number
    stage: string
    pct: number
    pctStage: string | null
    language: string | null
    duration: number | null
    elapsed: number | null
    model: string | null
    segments: TranscribeSegment[]
    text: string | null
    files: Record<string, string>
    degraded: string[]
    complete: CompleteManifest | null
    error: FriendlyError | null
    notice: Message | null
    canceling: boolean
    eta: EtaAnchor | null
}

export type Action =
    | { type: "begin"; info: StartInfo; startedAt: number }
    | { type: "upload"; fraction: number }
    | { type: "created"; jobId: string; model: string | null; deduped: boolean }
    | { type: "restore"; stored: StoredJob; job: TranscribeJob; now: number }
    | { type: "snapshot"; job: TranscribeJob; now: number }
    | { type: "event"; event: TranscribeEvent; now: number }
    | { type: "fail"; error: FriendlyError; now: number }
    | { type: "canceled"; notice: Message; now: number }
    | { type: "canceling"; value: boolean }
    | { type: "notice"; notice: Message | null }
    | { type: "clear" }
