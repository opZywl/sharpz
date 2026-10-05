"use client"

import { useEffect, useReducer, useState, type Dispatch } from "react"

import {
    friendlyError,
    readStorageJson,
    removeStorage,
    writeStorage,
    type FriendlyError,
} from "@/components/transcribe/transcribe-utils"
import { resolveMessage, type Message } from "@/lib/i18n"
import {
    cancelJob,
    getJob,
    isAbortError,
    openStream,
    startTranscription,
    type CompleteManifest,
    type StartTranscriptionResult,
    type TranscribeEvent,
    type TranscribeJob,
    type TranscribeSegment,
    type TranscribeStatus,
} from "@/lib/transcribe-api"

export type JobPhase = "idle" | "uploading" | TranscribeStatus
export type JobMode = "standard" | "complete"

export interface StartInfo {
    sourceName: string
    mode: JobMode
    uploading: boolean
}

interface StoredJob {
    jobId: string
    startedAt: number
    sourceName: string
    mode: JobMode
}

interface EtaAnchor {
    at: number
    pct: number
}

export interface JobState {
    phase: JobPhase
    jobId: string | null
    sourceName: string
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

type Action =
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

const JOB_KEY = "sharpz.transcribe.job.v1"
const POLL_MS = 2500
const MAX_POLL_FAILURES = 12
const TERMINAL = new Set<string>(["done", "error", "canceled"])
const PRE_TRANSCRIBE = new Set(["", "queued", "start", "download", "download_model", "load_model"])

const JOB_FAILED: Message = (t) => t.job.failed
const START_FAILED: Message = (t) => t.job.startFailed
const JOB_GONE: Message = (t) => t.job.gone
const LOST_CONNECTION: Message = (t) => t.job.lost
const DEDUPED: Message = (t) => t.job.deduped
const CANCELED: Message = (t) => t.job.canceled
const UPLOAD_CANCELED: Message = (t) => t.job.uploadCanceled

const INITIAL: JobState = {
    phase: "idle",
    jobId: null,
    sourceName: "",
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

function isTerminal(value: string) {
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

function livePhase(phase: JobPhase, stage: string | null): JobPhase {
    if (isTerminal(phase)) return phase
    return stage === "queued" ? "queued" : "running"
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
        complete: job.complete ?? state.complete,
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

function reducer(state: JobState, action: Action): JobState {
    switch (action.type) {
        case "begin": {
            const stage = action.info.uploading ? "uploading" : "queued"
            return {
                ...INITIAL,
                phase: action.info.uploading ? "uploading" : "queued",
                stage,
                sourceName: action.info.sourceName,
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

function parseStoredJob(raw: unknown): StoredJob | null {
    if (!raw || typeof raw !== "object") return null
    const value = raw as Record<string, unknown>
    if (typeof value.jobId !== "string" || !value.jobId) return null
    return {
        jobId: value.jobId,
        startedAt: typeof value.startedAt === "number" ? value.startedAt : Date.now(),
        sourceName: typeof value.sourceName === "string" ? value.sourceName : "",
        mode: value.mode === "complete" ? "complete" : "standard",
    }
}

function createController(dispatch: Dispatch<Action>) {
    let epoch = 0
    let jobId: string | null = null
    let stream: { jobId: string; source: EventSource } | null = null
    let poll: { jobId: string; timer: number | null; failures: number } | null = null
    let upload: AbortController | null = null

    const forget = (id: string) => {
        const stored = parseStoredJob(readStorageJson(JOB_KEY))
        if (!stored || stored.jobId === id) removeStorage(JOB_KEY)
    }

    const closeStream = () => {
        stream?.source.close()
        stream = null
    }

    const stopPolling = () => {
        if (poll?.timer != null) window.clearTimeout(poll.timer)
        poll = null
    }

    const fail = (message: Message) => {
        dispatch({ type: "fail", error: { message, detail: null }, now: Date.now() })
    }

    const settle = (id: string, status: string) => {
        if (status !== "done") {
            forget(id)
            return
        }
        const token = epoch
        getJob(id)
            .then((job) => {
                if (token === epoch && jobId === id && job) dispatch({ type: "snapshot", job, now: Date.now() })
            })
            .catch(() => undefined)
    }

    const startPolling = (id: string) => {
        if (poll?.jobId === id) return
        stopPolling()
        const current = { jobId: id, timer: null as number | null, failures: 0 }
        poll = current
        const tick = async () => {
            current.timer = null
            let job: TranscribeJob | null
            try {
                job = await getJob(id)
            } catch {
                if (poll !== current) return
                current.failures += 1
                if (current.failures >= MAX_POLL_FAILURES) {
                    stopPolling()
                    fail(LOST_CONNECTION)
                    return
                }
                current.timer = window.setTimeout(tick, POLL_MS)
                return
            }
            if (poll !== current) return
            if (!job) {
                stopPolling()
                forget(id)
                fail(JOB_GONE)
                return
            }
            current.failures = 0
            dispatch({ type: "snapshot", job, now: Date.now() })
            if (isTerminal(job.status)) {
                stopPolling()
                if (job.status !== "done") forget(id)
                return
            }
            current.timer = window.setTimeout(tick, POLL_MS)
        }
        current.timer = window.setTimeout(tick, POLL_MS)
    }

    const connect = (id: string, since: number) => {
        if (stream?.jobId === id) return
        closeStream()
        stopPolling()
        const source = openStream(
            id,
            {
                onEvent: (event) => {
                    if (stream?.source !== source || jobId !== id) return
                    dispatch({ type: "event", event, now: Date.now() })
                    if (isTerminal(event.type)) {
                        closeStream()
                        settle(id, event.type)
                    }
                },
                onError: () => {
                    if (stream?.source !== source) return
                    closeStream()
                    startPolling(id)
                },
            },
            since,
        )
        stream = { jobId: id, source }
    }

    const attach = async (id: string) => {
        const token = epoch
        let since = 0
        try {
            const job = await getJob(id)
            if (token !== epoch || jobId !== id) return
            if (!job) {
                forget(id)
                fail(JOB_GONE)
                return
            }
            dispatch({ type: "snapshot", job, now: Date.now() })
            if (isTerminal(job.status)) {
                if (job.status !== "done") forget(id)
                return
            }
            since = job.last_event_id ?? 0
        } catch {
            if (token !== epoch || jobId !== id) return
        }
        connect(id, since)
    }

    const start = async (form: FormData, info: StartInfo) => {
        closeStream()
        stopPolling()
        upload?.abort()
        jobId = null
        epoch += 1
        const token = epoch
        const startedAt = Date.now()
        dispatch({ type: "begin", info, startedAt })
        const controller = new AbortController()
        upload = controller
        let lastPercent = -1
        let result: StartTranscriptionResult
        try {
            result = await startTranscription(form, {
                signal: controller.signal,
                onUploadProgress: info.uploading
                    ? (fraction) => {
                          const percent = Math.floor(fraction * 100)
                          if (percent === lastPercent || upload !== controller) return
                          lastPercent = percent
                          dispatch({ type: "upload", fraction })
                      }
                    : undefined,
            })
        } catch (err) {
            if (upload === controller) upload = null
            if (token !== epoch) return
            if (isAbortError(err)) dispatch({ type: "canceled", notice: UPLOAD_CANCELED, now: Date.now() })
            else dispatch({ type: "fail", error: friendlyError(err, START_FAILED), now: Date.now() })
            return
        }
        if (upload === controller) upload = null
        const stored: StoredJob = { jobId: result.job_id, startedAt, sourceName: info.sourceName, mode: info.mode }
        writeStorage(JOB_KEY, JSON.stringify(stored))
        if (token !== epoch) return
        jobId = result.job_id
        dispatch({ type: "created", jobId: result.job_id, model: result.model ?? null, deduped: Boolean(result.deduped) })
        await attach(result.job_id)
    }

    const cancel = async () => {
        if (upload) {
            upload.abort()
            return
        }
        const id = jobId
        if (!id) return
        const token = epoch
        dispatch({ type: "canceling", value: true })
        try {
            const result = await cancelJob(id)
            if (token !== epoch || jobId !== id) return
            if (result.ok || result.status === "canceled") {
                closeStream()
                stopPolling()
                forget(id)
                dispatch({ type: "canceled", notice: CANCELED, now: Date.now() })
                return
            }
            const job = await getJob(id)
            if (token !== epoch || jobId !== id) return
            if (job) dispatch({ type: "snapshot", job, now: Date.now() })
        } catch (err) {
            if (token !== epoch || jobId !== id) return
            const reason = friendlyError(err, (t) => t.job.unknown).message
            dispatch({ type: "notice", notice: (t) => t.job.cancelFailed(resolveMessage(reason, t)) })
        } finally {
            if (token === epoch) dispatch({ type: "canceling", value: false })
        }
    }

    const resume = async () => {
        const stored = parseStoredJob(readStorageJson(JOB_KEY))
        if (!stored) return
        const token = epoch
        let job: TranscribeJob | null
        try {
            job = await getJob(stored.jobId)
        } catch {
            return
        }
        if (token !== epoch || jobId || upload) return
        if (!job || job.status === "error" || job.status === "canceled") {
            forget(stored.jobId)
            return
        }
        jobId = stored.jobId
        dispatch({ type: "restore", stored, job, now: Date.now() })
        if (!isTerminal(job.status)) connect(stored.jobId, job.last_event_id ?? 0)
    }

    const clear = () => {
        epoch += 1
        upload?.abort()
        upload = null
        closeStream()
        stopPolling()
        if (jobId) forget(jobId)
        jobId = null
        dispatch({ type: "clear" })
    }

    const dispose = () => {
        epoch += 1
        closeStream()
        stopPolling()
    }

    return { start, cancel, resume, clear, dispose }
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

export function useTranscribeJob() {
    const [state, dispatch] = useReducer(reducer, INITIAL)
    const [controller] = useState(() => createController(dispatch))

    useEffect(() => {
        void controller.resume()
        return () => controller.dispose()
    }, [controller])

    const busy = state.phase === "uploading" || state.phase === "queued" || state.phase === "running"
    return { state, busy, start: controller.start, cancel: controller.cancel, clear: controller.clear }
}
