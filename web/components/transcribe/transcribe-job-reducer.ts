import type { Action, JobState } from "@/components/transcribe/transcribe-job-types"
import { friendlyError } from "@/components/transcribe/transcribe-utils"
import { normalizeCompleteManifest } from "@/lib/complete-manifest"
import type { Message } from "@/lib/i18n"
import type { TranscribeEvent, TranscribeJob, TranscribeSegment } from "@/lib/transcribe-api"
import { livePhase } from "@/lib/transcribe-phase"

const TERMINAL = new Set<string>(["done", "error", "canceled"])
const PRE_TRANSCRIBE = new Set(["", "queued", "start", "download", "download_model", "load_model"])

const JOB_FAILED: Message = (t) => t.job.failed
const DEDUPED: Message = (t) => t.job.deduped
export const CANCELED: Message = (t) => t.job.canceled

export const INITIAL: JobState = {
    phase: "idle",
    jobId: null,
    sourceName: "",
    sourceBytes: null,
    mode: "standard",
    startedAt: null,
    finishedAt: null,
    upload: 0,
    stage: "",
    pct: 0,
    pctStage: null,
    language: null,
    duration: null,
    elapsed: null,
    model: null,
    segments: [],
    text: null,
    files: {},
    degraded: [],
    complete: null,
    error: null,
    notice: null,
    canceling: false,
    eta: null,
}

export function isTerminal(value: string) {
    return TERMINAL.has(value)
}

function asNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : null
}

function asString(value: unknown) {
    return typeof value === "string" && value ? value : null
}

function asStringArray(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : null
}

function asFiles(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    return Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    )
}

function toSegment(raw: Record<string, unknown>, fallbackId: number): TranscribeSegment {
    return {
        id: asNumber(raw.id) ?? fallbackId,
        start: asNumber(raw.start) ?? 0,
        end: asNumber(raw.end) ?? 0,
        text: typeof raw.text === "string" ? raw.text : "",
        speaker: asString(raw.speaker),
        words: Array.isArray(raw.words) ? (raw.words as TranscribeSegment["words"]) : null,
    }
}

function anchorFor(state: JobState, stage: string, pct: number, now: number) {
    if (stage !== "transcribe") return null
    if (!state.eta || pct < state.eta.pct) return { at: now, pct }
    return state.eta
}

function stagePct(state: JobState, stage: string) {
    return state.pctStage === stage ? state.pct : 0
}

function applySnapshot(state: JobState, job: TranscribeJob, now: number, live: boolean): JobState {
    const pct = asNumber(job.progress) ?? asNumber(job.pct) ?? state.pct
    const stage = job.stage || state.stage
    return {
        ...state,
        phase: job.status,
        stage,
        pct,
        pctStage: stage,
        language: job.language ?? state.language,
        duration: job.duration ?? state.duration,
        elapsed: job.elapsed ?? state.elapsed,
        model: job.model ?? state.model,
        segments: Array.isArray(job.segments)
            ? job.segments.map((segment, index) => toSegment(segment as unknown as Record<string, unknown>, index))
            : state.segments,
        text: job.status === "done" && typeof job.text === "string" ? job.text : state.text,
        files: asFiles(job.files) ?? state.files,
        degraded: asStringArray(job.degraded) ?? state.degraded,
        complete: normalizeCompleteManifest(job.complete) ?? state.complete,
        error: job.status === "error" ? friendlyError(job.error, JOB_FAILED) : state.error,
        notice: job.status === "canceled" ? state.notice ?? CANCELED : state.notice,
        finishedAt: isTerminal(job.status) ? state.finishedAt ?? (live ? now : null) : null,
        eta: anchorFor(state, stage, pct, now),
    }
}

function applyEvent(state: JobState, event: TranscribeEvent, now: number): JobState {
    if (isTerminal(state.phase)) return state
    switch (event.type) {
        case "meta": {
            const stage = PRE_TRANSCRIBE.has(state.stage) ? "transcribe" : state.stage
            return {
                ...state,
                phase: livePhase(state.phase, stage),
                stage,
                language: asString(event.language) ?? state.language,
                duration: asNumber(event.duration) ?? state.duration,
                model: asString(event.model) ?? state.model,
                eta: anchorFor(state, stage, stagePct(state, stage), now),
            }
        }
        case "progress": {
            const stage = asString(event.stage) ?? state.stage
            const pct = asNumber(event.pct) ?? state.pct
            return { ...state, phase: livePhase(state.phase, stage), stage, pct, pctStage: stage, eta: anchorFor(state, stage, pct, now) }
        }
        case "stage": {
            const stage = asString(event.stage)
            if (!stage) return state
            return { ...state, phase: livePhase(state.phase, stage), stage, eta: anchorFor(state, stage, stagePct(state, stage), now) }
        }
        case "segment": {
            const segment = toSegment(event, state.segments.length)
            if (state.segments.some((item) => item.id === segment.id)) return state
            return { ...state, phase: livePhase(state.phase, null), segments: [...state.segments, segment] }
        }
        case "done":
            return {
                ...state,
                phase: "done",
                stage: "done",
                pct: 1,
                pctStage: "done",
                files: asFiles(event.files) ?? state.files,
                degraded: asStringArray(event.degraded) ?? state.degraded,
                elapsed: asNumber(event.elapsed) ?? state.elapsed,
                finishedAt: now,
                eta: null,
            }
        case "error":
            return { ...state, phase: "error", error: friendlyError(event.message, JOB_FAILED), finishedAt: now, eta: null }
        case "canceled":
            return { ...state, phase: "canceled", notice: CANCELED, finishedAt: now, eta: null }
        default:
            return state
    }
}

export function reducer(state: JobState, action: Action): JobState {
    switch (action.type) {
        case "begin": {
            const stage = action.info.uploading ? "uploading" : "queued"
            return {
                ...INITIAL,
                phase: action.info.uploading ? "uploading" : "queued",
                stage,
                sourceName: action.info.sourceName,
                sourceBytes: action.info.sourceBytes,
                mode: action.info.mode,
                startedAt: action.startedAt,
            }
        }
        case "upload":
            return state.phase === "uploading" ? { ...state, upload: action.fraction } : state
        case "created":
            return {
                ...state,
                jobId: action.jobId,
                phase: state.phase === "uploading" ? "queued" : state.phase,
                stage: state.stage === "uploading" ? "queued" : state.stage,
                upload: 1,
                model: action.model ?? state.model,
                notice: action.deduped ? DEDUPED : state.notice,
            }
        case "restore":
            return applySnapshot(
                {
                    ...INITIAL,
                    jobId: action.job.job_id,
                    sourceName: action.stored.sourceName,
                    sourceBytes: action.stored.sourceBytes,
                    mode: action.stored.mode,
                    startedAt: action.stored.startedAt,
                },
                action.job,
                action.now,
                false,
            )
        case "snapshot":
            if (state.jobId !== action.job.job_id) return state
            if (isTerminal(state.phase) && !isTerminal(action.job.status)) return state
            return applySnapshot(state, action.job, action.now, true)
        case "event":
            return applyEvent(state, action.event, action.now)
        case "fail":
            return { ...state, phase: "error", error: action.error, finishedAt: action.now, eta: null, canceling: false }
        case "canceled":
            return {
                ...state,
                phase: "canceled",
                notice: action.notice,
                finishedAt: state.finishedAt ?? action.now,
                eta: null,
                canceling: false,
            }
        case "canceling":
            return { ...state, canceling: action.value }
        case "notice":
            return { ...state, notice: action.notice }
        case "clear":
            return INITIAL
    }
}

export function remainingSeconds(state: JobState, now: number): number | null {
    if (state.phase !== "running" || state.stage !== "transcribe" || !state.eta || !state.duration) return null
    const gained = state.pct - state.eta.pct
    const seconds = (now - state.eta.at) / 1000
    if (gained < 0.02 || seconds < 3) return null
    return Math.max(0, ((1 - state.pct) * seconds) / gained)
}

export function hasProgress(state: JobState) {
    if (state.phase === "uploading") return true
    return state.pct > 0 && state.pctStage === state.stage
}
