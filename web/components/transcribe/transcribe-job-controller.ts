import type { Dispatch } from "react"

import { CANCELED, isTerminal } from "@/components/transcribe/transcribe-job-reducer"
import type { Action, PendingUpload, StartInfo, StoredJob } from "@/components/transcribe/transcribe-job-types"
import { friendlyError, readStorageJson, removeStorage, writeStorage } from "@/components/transcribe/transcribe-utils"
import { resolveMessage, type Message } from "@/lib/i18n"
import {
    cancelJob,
    getJob,
    isAbortError,
    openStream,
    startTranscription,
    type StartTranscriptionResult,
    type TranscribeJob,
} from "@/lib/transcribe-api"
import { afterCreate, cancelAction } from "@/lib/upload-cancel"

const JOB_KEY = "sharpz.transcribe.job.v1"
const POLL_MS = 2500
const MAX_POLL_FAILURES = 12
const START_FAILED: Message = (t) => t.job.startFailed
const JOB_GONE: Message = (t) => t.job.gone
const LOST_CONNECTION: Message = (t) => t.job.lost
const UPLOAD_CANCELED: Message = (t) => t.job.uploadCanceled

const jobCreatedListeners = new Set<() => void>()

function parseStoredJob(raw: unknown): StoredJob | null {
    if (!raw || typeof raw !== "object") return null
    const value = raw as Record<string, unknown>
    if (typeof value.jobId !== "string" || !value.jobId) return null
    return {
        jobId: value.jobId,
        startedAt: typeof value.startedAt === "number" ? value.startedAt : Date.now(),
        sourceName: typeof value.sourceName === "string" ? value.sourceName : "",
        mode: value.mode === "complete" ? "complete" : "standard",
        sourceBytes:
            typeof value.sourceBytes === "number" && Number.isFinite(value.sourceBytes) && value.sourceBytes > 0
                ? value.sourceBytes
                : null,
    }
}

export function createController(dispatch: Dispatch<Action>) {
    let epoch = 0
    let jobId: string | null = null
    let stream: { jobId: string; source: EventSource } | null = null
    let poll: { jobId: string; timer: number | null; failures: number } | null = null
    let upload: PendingUpload | null = null

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

    const releaseUpload = () => {
        const current = upload
        if (!current) return
        if (cancelAction({ hasUpload: true, bodySent: current.sent, jobId: null }) === "abort") current.abort.abort()
        else current.cancelRequested = true
    }

    const cancelCreated = async (id: string) => {
        try {
            const result = await cancelJob(id)
            return result.ok || result.status === "canceled"
        } catch {
            return false
        }
    }

    const start = async (form: FormData, info: StartInfo) => {
        closeStream()
        stopPolling()
        releaseUpload()
        jobId = null
        epoch += 1
        const startedAt = Date.now()
        dispatch({ type: "begin", info, startedAt })
        const current: PendingUpload = { abort: new AbortController(), sent: false, cancelRequested: false, epoch }
        upload = current
        let lastPercent = -1
        let result: StartTranscriptionResult
        try {
            result = await startTranscription(form, {
                signal: current.abort.signal,
                onUploadSent: () => {
                    current.sent = true
                },
                onUploadProgress: info.uploading
                    ? (fraction) => {
                          const percent = Math.floor(fraction * 100)
                          if (percent === lastPercent || upload !== current) return
                          lastPercent = percent
                          dispatch({ type: "upload", fraction })
                      }
                    : undefined,
            })
        } catch (err) {
            if (upload === current) upload = null
            if (current.epoch !== epoch) return
            if (isAbortError(err) || current.cancelRequested) {
                dispatch({ type: "canceled", notice: UPLOAD_CANCELED, now: Date.now() })
            } else {
                dispatch({ type: "fail", error: friendlyError(err, START_FAILED), now: Date.now() })
            }
            return
        }
        if (upload === current) upload = null
        const next = afterCreate({ deduped: Boolean(result.deduped), cancelRequested: current.cancelRequested })
        if (next === "drop") {
            if (current.epoch === epoch) dispatch({ type: "canceled", notice: UPLOAD_CANCELED, now: Date.now() })
            return
        }
        if (next === "cancel-job" && (await cancelCreated(result.job_id))) {
            if (current.epoch === epoch) dispatch({ type: "canceled", notice: CANCELED, now: Date.now() })
            return
        }
        const stored: StoredJob = {
            jobId: result.job_id,
            startedAt,
            sourceName: info.sourceName,
            mode: info.mode,
            sourceBytes: info.sourceBytes,
        }
        writeStorage(JOB_KEY, JSON.stringify(stored))
        if (current.epoch !== epoch) {
            jobCreatedListeners.forEach((listener) => listener())
            return
        }
        jobId = result.job_id
        dispatch({ type: "created", jobId: result.job_id, model: result.model ?? null, deduped: Boolean(result.deduped) })
        if (current.cancelRequested) dispatch({ type: "canceling", value: false })
        await attach(result.job_id)
    }

    const cancel = async () => {
        const pending = upload
        const action = cancelAction({ hasUpload: Boolean(pending), bodySent: Boolean(pending?.sent), jobId })
        if (pending && action === "abort") {
            pending.abort.abort()
            return
        }
        if (pending && action === "cancel-when-created") {
            pending.cancelRequested = true
            dispatch({ type: "canceling", value: true })
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

    const resume = async (replaceIdle = false) => {
        const stored = parseStoredJob(readStorageJson(JOB_KEY))
        if (!stored) return
        const token = epoch
        let job: TranscribeJob | null
        try {
            job = await getJob(stored.jobId)
        } catch {
            return
        }
        if (token !== epoch || upload) return
        if (jobId && (!replaceIdle || jobId === stored.jobId || stream || poll)) return
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
        releaseUpload()
        upload = null
        closeStream()
        stopPolling()
        if (jobId) forget(jobId)
        jobId = null
        dispatch({ type: "clear" })
    }

    const onJobCreated = () => {
        void resume(true)
    }

    const mount = (live: boolean) => {
        jobCreatedListeners.add(onJobCreated)
        if (upload) upload.epoch = epoch
        if (jobId && live) void attach(jobId)
        else if (!jobId) void resume()
    }

    const dispose = () => {
        epoch += 1
        jobCreatedListeners.delete(onJobCreated)
        closeStream()
        stopPolling()
    }

    return { start, cancel, clear, mount, dispose }
}
