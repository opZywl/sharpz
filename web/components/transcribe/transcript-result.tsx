"use client"

import { motion } from "framer-motion"
import { FileText, Headphones, Loader2, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type WaveSurfer from "wavesurfer.js"

import { Metric, Panel, cardEnter } from "@/components/dashboard/primitives"
import { CopyButton, JobFileButton, SaveTextButton } from "@/components/transcribe/transcribe-actions"
import { useLatest, useStickToBottom } from "@/components/transcribe/transcribe-hooks"
import { degradedLabels, formatClock } from "@/components/transcribe/transcribe-utils"
import type { JobState } from "@/components/transcribe/use-transcribe-job"
import { Button } from "@/components/ui/button"
import { Segmented } from "@/components/ui/segmented"
import { useI18n } from "@/lib/i18n/provider"
import { audioUrl, type TranscribeSegment } from "@/lib/transcribe-api"
import { cn } from "@/lib/utils"

type ResultTab = "text" | "segments"

function Waiting({ busy, text }: { busy: boolean; text: string }) {
    return (
        <div className="flex items-center justify-center gap-2 px-4 py-10 text-center">
            {busy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : null}
            <span className="app-muted text-sm">{text}</span>
        </div>
    )
}

function SegmentsView({
    jobId,
    segments,
    busy,
    canListen,
}: {
    jobId: string | null
    segments: TranscribeSegment[]
    busy: boolean
    canListen: boolean
}) {
    const { lang, t } = useI18n()
    const [waveRequested, setWaveRequested] = useState(false)
    const [waveStatus, setWaveStatus] = useState<"loading" | "ready" | "failed">("loading")
    const [active, setActive] = useState<number | null>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const surferRef = useRef<WaveSurfer | null>(null)
    const pendingRef = useRef<number | null>(null)
    const segmentsRef = useLatest(segments)
    const langRef = useLatest(lang)
    const list = useStickToBottom<HTMLDivElement>(segments.length, jobId)

    const speakers = useMemo(() => {
        const counts = new Map<string, number>()
        segments.forEach((segment) => {
            if (segment.speaker) counts.set(segment.speaker, (counts.get(segment.speaker) ?? 0) + 1)
        })
        return Array.from(counts.entries())
    }, [segments])

    const playAt = useCallback(
        (index: number) => {
            const surfer = surferRef.current
            const segment = segmentsRef.current[index]
            if (!surfer || !segment) return
            surfer.setTime(segment.start)
            surfer.play().catch(() => undefined)
        },
        [segmentsRef],
    )

    useEffect(() => {
        const container = containerRef.current
        if (!waveRequested || !jobId || !container) return
        let disposed = false
        let instance: WaveSurfer | null = null
        setWaveStatus("loading")

        import("wavesurfer.js")
            .then(({ default: WaveSurferClass }) => {
                if (disposed) return
                const styles = getComputedStyle(document.documentElement)
                const strong = styles.getPropertyValue("--app-text").trim() || "#111113"
                const faint = styles.getPropertyValue("--app-faint").trim() || "#8a8a93"
                const created = WaveSurferClass.create({
                    container,
                    height: 72,
                    waveColor: faint,
                    progressColor: strong,
                    cursorColor: strong,
                    barWidth: 2,
                    barGap: 1,
                    barRadius: 2,
                    mediaControls: true,
                    url: audioUrl(jobId, langRef.current),
                })
                instance = created
                surferRef.current = created
                created.on("ready", () => {
                    if (disposed) return
                    setWaveStatus("ready")
                    const pending = pendingRef.current
                    pendingRef.current = null
                    if (pending !== null) playAt(pending)
                })
                created.on("timeupdate", (time) => {
                    if (disposed) return
                    const index = segmentsRef.current.findIndex((segment) => time >= segment.start && time <= segment.end)
                    if (index !== -1) setActive(index)
                })
                created.on("error", () => {
                    if (!disposed) setWaveStatus("failed")
                })
            })
            .catch(() => {
                if (!disposed) setWaveStatus("failed")
            })

        return () => {
            disposed = true
            if (surferRef.current === instance) surferRef.current = null
            try {
                instance?.destroy()
            } catch {
                return
            }
        }
    }, [waveRequested, jobId, playAt, segmentsRef, langRef])

    function handleSegment(index: number) {
        setActive(index)
        if (!canListen) return
        if (surferRef.current && waveStatus === "ready") {
            playAt(index)
            return
        }
        pendingRef.current = index
        setWaveRequested(true)
    }

    return (
        <div className="grid gap-3">
            {canListen ? (
                <div className="status-card grid gap-2 rounded-xl p-3">
                    {waveRequested ? (
                        <>
                            <div className="flex items-center justify-between gap-2">
                                <span className="field-label">{t.result.waveform}</span>
                                <span className="app-faint text-xs">
                                    {waveStatus === "failed"
                                        ? t.result.waveFailedShort
                                        : waveStatus === "ready"
                                          ? t.result.waveReady
                                          : t.result.waveLoading}
                                </span>
                            </div>
                            <div ref={containerRef} className={cn("min-h-[72px] w-full", waveStatus === "failed" && "hidden")} />
                            {waveStatus === "failed" ? (
                                <p className="app-muted text-sm">{t.result.waveFailed}</p>
                            ) : null}
                        </>
                    ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="app-muted text-sm">{t.result.waveIdle}</span>
                            <Button type="button" variant="outline" size="sm" onClick={() => setWaveRequested(true)}>
                                <Headphones className="size-4" />
                                {t.result.listen}
                            </Button>
                        </div>
                    )}
                </div>
            ) : null}

            {speakers.length ? (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="field-label">{t.result.speakers}</span>
                    {speakers.map(([name, count]) => (
                        <span key={name} className="status-pill px-2.5 py-1 text-[11px] font-bold">
                            {name} · {t.result.segmentsCount(count)}
                        </span>
                    ))}
                </div>
            ) : null}

            <div ref={list.ref} onScroll={list.onScroll} className="preview-card max-h-[460px] overflow-auto p-2">
                {segments.length ? (
                    <div className="grid gap-1">
                        {segments.map((segment, index) => (
                            <button
                                key={`${segment.id ?? index}-${segment.start}`}
                                type="button"
                                onClick={() => handleSegment(index)}
                                data-active={active === index}
                                className={cn(
                                    "w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-foreground/5",
                                    active === index && "bg-foreground/10",
                                )}
                            >
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <code className="app-codeblock rounded px-1.5 py-0.5 font-semibold tabular-nums">
                                        [{formatClock(segment.start)}]
                                    </code>
                                    {segment.speaker ? (
                                        <span className="status-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]">
                                            {segment.speaker}
                                        </span>
                                    ) : null}
                                </div>
                                <p className="mt-1 text-sm leading-6">{segment.text.trim()}</p>
                            </button>
                        ))}
                    </div>
                ) : (
                    <Waiting busy={busy} text={busy ? t.result.segmentsWaiting : t.result.noSegments} />
                )}
            </div>
        </div>
    )
}

export function TranscriptResult({
    job,
    text,
    fileBase,
    busy,
    modelName,
    tookSeconds,
    onClear,
}: {
    job: JobState
    text: string
    fileBase: string
    busy: boolean
    modelName: string | null
    tookSeconds: number | null
    onClear: () => void
}) {
    const { t, fmt } = useI18n()
    const [tab, setTab] = useState<ResultTab>("text")
    const textScroll = useStickToBottom<HTMLDivElement>(text.length, job.jobId)
    const done = job.phase === "done"
    const extraFiles = done && job.jobId ? Object.keys(job.files).filter((format) => format !== "txt") : []
    const language = fmt.languageName(job.language)
    const subtitle = busy
        ? t.result.subtitleBusy
        : done
          ? t.result.subtitleDone
          : job.phase === "canceled"
            ? t.result.subtitleCanceled
            : t.result.subtitleError

    return (
        <motion.div {...cardEnter}>
            <Panel title={t.result.title} subtitle={subtitle} icon={FileText}>
                <div className="grid gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <CopyButton text={text} />
                        <SaveTextButton text={text} fileName={`${fileBase}.txt`} label={t.result.downloadTxt} />
                        {extraFiles.map((format) => (
                            <JobFileButton key={format} jobId={job.jobId as string} format={format} fileName={`${fileBase}.${format}`} />
                        ))}
                        {!busy ? (
                            <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onClear}>
                                <X className="size-4" />
                                {t.result.clear}
                            </Button>
                        ) : null}
                    </div>

                    {done ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Metric label={t.result.language} value={language ?? "—"} />
                            <Metric label={t.result.audio} value={job.duration ? formatClock(job.duration) : "—"} />
                            <Metric label={t.result.took} value={tookSeconds !== null ? formatClock(tookSeconds) : "—"} />
                            <Metric label={t.result.model} value={modelName ?? "—"} />
                        </div>
                    ) : null}

                    {done && job.degraded.length ? (
                        <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
                            {t.result.degraded(degradedLabels(t, job.degraded).join(", "))}
                            {job.degraded.includes("diarize") ? t.result.diarizeHint : null}
                        </div>
                    ) : null}

                    <Segmented<ResultTab>
                        value={tab}
                        onChange={setTab}
                        options={[
                            { value: "text", label: t.result.tabText },
                            { value: "segments", label: t.result.tabSegments(job.segments.length) },
                        ]}
                    />

                    <div className={cn(tab !== "text" && "hidden")}>
                        <div
                            ref={textScroll.ref}
                            onScroll={textScroll.onScroll}
                            className="preview-card max-h-[60vh] min-h-[160px] overflow-auto p-4 sm:p-5"
                        >
                            {text ? (
                                <p className="whitespace-pre-wrap break-words text-[15px] leading-7">{text}</p>
                            ) : (
                                <Waiting busy={busy} text={busy ? t.result.textWaiting : t.result.noText} />
                            )}
                        </div>
                    </div>

                    <div className={cn(tab !== "segments" && "hidden")}>
                        <SegmentsView
                            key={job.jobId ?? "no-job"}
                            jobId={job.jobId}
                            segments={job.segments}
                            busy={busy}
                            canListen={done && Boolean(job.jobId)}
                        />
                    </div>
                </div>
            </Panel>
        </motion.div>
    )
}
