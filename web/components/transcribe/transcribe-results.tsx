"use client"

import { CompletePackagePanel } from "@/components/transcribe/complete-package-panel"
import { SummaryPanel } from "@/components/transcribe/summary-panel"
import type { TranscribeOptions } from "@/components/transcribe/transcribe-options"
import { TranscriptResult } from "@/components/transcribe/transcript-result"
import type { JobState, useTranscribeJob } from "@/components/transcribe/use-transcribe-job"

export function TranscribeResults({
    job,
    state,
    busy,
    showResult,
    text,
    fileBase,
    jobModelName,
    tookSeconds,
    options,
}: {
    job: ReturnType<typeof useTranscribeJob>
    state: JobState
    busy: boolean
    showResult: boolean
    text: string
    fileBase: string
    jobModelName: string | null
    tookSeconds: number | null
    options: TranscribeOptions
}) {
    return (
        <>
            {showResult ? (
                <TranscriptResult
                    job={state}
                    text={text}
                    fileBase={fileBase}
                    busy={busy}
                    modelName={jobModelName}
                    tookSeconds={tookSeconds}
                    onClear={job.clear}
                />
            ) : null}

            {state.mode === "complete" && state.phase === "done" && state.jobId ? (
                <CompletePackagePanel key={`complete-${state.jobId}`} jobId={state.jobId} initial={state.complete} />
            ) : null}

            {state.phase === "done" && state.jobId ? (
                <SummaryPanel
                    key={`summary-${state.jobId}`}
                    jobId={state.jobId}
                    language={state.language ?? (options.language === "auto" ? undefined : options.language)}
                    fileBase={fileBase}
                />
            ) : null}
        </>
    )
}
