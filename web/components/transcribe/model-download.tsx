"use client"

import { Check, Download, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import { useLatest } from "@/components/transcribe/transcribe-hooks"
import { ProgressBar } from "@/components/transcribe/transcribe-progress"
import { friendlyError } from "@/components/transcribe/transcribe-utils"
import { Button } from "@/components/ui/button"
import { useI18n, useMessage } from "@/lib/i18n/provider"
import {
    getModelDownload,
    startModelDownload,
    type ModelDownloadStatus,
    type TranscribeModel,
} from "@/lib/transcribe-api"

const POLL_MS = 2000
const MAX_FAILURES = 5
const MAX_IDLE = 3

export function ModelDownload({ model, label, onDone }: { model: TranscribeModel; label: string; onDone: () => void }) {
    const { t, fmt, resolve } = useI18n()
    const [polling, setPolling] = useState(Boolean(model.downloading))
    const [progress, setProgress] = useState<ModelDownloadStatus | null>(null)
    const [starting, setStarting] = useState(false)
    const [finished, setFinished] = useState(false)
    const [error, setError] = useMessage()
    const onDoneRef = useLatest(onDone)

    useEffect(() => {
        if (model.downloading) setPolling(true)
    }, [model.downloading])

    useEffect(() => {
        if (!polling) return
        let cancelled = false
        let timer: number | null = null
        let failures = 0
        let idle = 0

        const tick = async () => {
            try {
                const next = await getModelDownload(model.key)
                if (cancelled) return
                failures = 0
                setProgress(next)
                if (next.status === "done") {
                    setPolling(false)
                    setFinished(true)
                    onDoneRef.current()
                    return
                }
                if (next.status === "error") {
                    setPolling(false)
                    setError(friendlyError(next.error, (m) => m.modelDownload.failed).message)
                    return
                }
                idle = next.status === "idle" ? idle + 1 : 0
                if (idle >= MAX_IDLE) {
                    setPolling(false)
                    return
                }
            } catch {
                if (cancelled) return
                failures += 1
                if (failures >= MAX_FAILURES) {
                    setPolling(false)
                    setError((m) => m.modelDownload.lost)
                    return
                }
            }
            timer = window.setTimeout(tick, POLL_MS)
        }

        void tick()
        return () => {
            cancelled = true
            if (timer !== null) window.clearTimeout(timer)
        }
    }, [polling, model.key, onDoneRef, setError])

    async function begin() {
        setStarting(true)
        setError(null)
        try {
            const result = await startModelDownload(model.key)
            if (result.status === "done") {
                setFinished(true)
                onDoneRef.current()
                return
            }
            setProgress({ status: "running", downloaded_bytes: 0, total_bytes: null, error: null })
            setPolling(true)
        } catch (err) {
            setError(friendlyError(err, (m) => m.modelDownload.startFailed).message)
        } finally {
            setStarting(false)
        }
    }

    if (finished) {
        return (
            <span className="app-muted inline-flex items-center gap-1.5 text-xs font-semibold">
                <Check className="size-3.5" />
                {t.modelDownload.ready}
            </span>
        )
    }

    if (polling) {
        const expected = model.size_mb ? model.size_mb * 1_000_000 : null
        const total = progress?.total_bytes ?? expected
        const downloaded = progress?.downloaded_bytes ?? 0
        return (
            <div className="grid gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="app-muted inline-flex items-center gap-1.5 font-semibold">
                        <Loader2 className="size-3.5 animate-spin" />
                        {t.modelDownload.downloading}
                    </span>
                    <span className="app-faint tabular-nums">
                        {total ? t.modelDownload.progress(fmt.bytes(downloaded), fmt.bytes(total)) : fmt.bytes(downloaded)}
                    </span>
                </div>
                <ProgressBar fraction={total ? downloaded / total : null} className="h-1.5" />
                <span className="app-faint text-xs">{t.modelDownload.keepUsing}</span>
            </div>
        )
    }

    return (
        <div className="grid gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={begin} disabled={starting} className="w-fit">
                {starting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                {label}
            </Button>
            <span className="app-faint text-xs">{t.modelDownload.pitch}</span>
            {error ? <div className="app-alert rounded-lg px-3 py-2 text-xs">{resolve(error)}</div> : null}
        </div>
    )
}
