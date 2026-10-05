"use client"

import { Loader2, Square, Timer } from "lucide-react"

import { useNow } from "@/components/transcribe/transcribe-hooks"
import { formatClock, stageLabel } from "@/components/transcribe/transcribe-utils"
import { hasProgress, remainingSeconds, type JobState } from "@/components/transcribe/use-transcribe-job"
import { Button } from "@/components/ui/button"
import { pick } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n/provider"
import { cn } from "@/lib/utils"

export function ProgressBar({ fraction, className }: { fraction: number | null; className?: string }) {
    const determinate = fraction !== null
    return (
        <div className={cn("h-2 w-full overflow-hidden rounded-full bg-foreground/10", className)}>
            <div
                className={cn("h-full rounded-full bg-foreground/70 transition-all", !determinate && "animate-pulse bg-foreground/30")}
                style={{ width: determinate ? `${Math.max(2, Math.min(100, fraction * 100))}%` : "100%" }}
            />
        </div>
    )
}

export function TranscribeProgress({
    job,
    modelName,
    onCancel,
}: {
    job: JobState
    modelName: string | null
    onCancel: () => void
}) {
    const { t, fmt } = useI18n()
    const now = useNow(true)
    const uploading = job.phase === "uploading"
    const determinate = hasProgress(job)
    const fraction = uploading ? job.upload : Math.min(1, Math.max(0, job.pct))
    const percent = fmt.percent(fraction)
    const label = uploading ? t.transcribe.uploading(percent) : stageLabel(t, job.stage)
    const elapsed = job.startedAt ? (now - job.startedAt) / 1000 : null
    const remaining = remainingSeconds(job, now)
    const language = fmt.languageName(job.language)
    const details = [
        job.sourceName || null,
        job.duration ? t.transcribe.audioLength(formatClock(job.duration)) : null,
        language ? t.transcribe.languageIs(language) : null,
        modelName ? t.transcribe.modelIs(modelName) : null,
    ].filter(Boolean)
    const hint = pick(t.transcribe.stageHints, job.stage)

    return (
        <div className="status-card grid gap-3 rounded-xl p-4" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                    <span className="truncate text-sm font-semibold">{label}</span>
                    {determinate && !uploading ? (
                        <span className="font-jakarta text-sm font-extrabold">{percent}</span>
                    ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {elapsed !== null ? (
                        <span className="app-muted inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums">
                            <Timer className="size-3.5" />
                            {formatClock(elapsed)}
                        </span>
                    ) : null}
                    {remaining !== null ? (
                        <span className="app-muted text-xs font-semibold tabular-nums">{t.transcribe.remaining(formatClock(remaining))}</span>
                    ) : null}
                    <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={job.canceling}>
                        {job.canceling ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-3.5" />}
                        {job.canceling ? t.transcribe.canceling : t.common.cancel}
                    </Button>
                </div>
            </div>
            <ProgressBar fraction={determinate ? fraction : null} />
            {details.length || hint ? (
                <div className="app-faint flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate">{details.join(" · ")}</span>
                    {hint ? <span>{hint}</span> : null}
                </div>
            ) : null}
        </div>
    )
}
