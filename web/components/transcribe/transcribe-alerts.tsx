"use client"

import { TriangleAlert } from "lucide-react"

import type { FormMessage } from "@/components/transcribe/transcribe-source"
import type { JobState } from "@/components/transcribe/use-transcribe-job"
import { useI18n } from "@/lib/i18n/provider"
import { cn } from "@/lib/utils"

export function TranscribeAlerts({
    message,
    state,
    showNotice,
}: {
    message: FormMessage | null
    state: JobState
    showNotice: boolean
}) {
    const { t, resolve } = useI18n()
    return (
        <>
            {message ? (
                <div
                    className={cn(
                        "rounded-xl px-4 py-3 text-sm",
                        message.tone === "error" ? "app-alert" : "status-card",
                    )}
                    role={message.tone === "error" ? "alert" : "status"}
                >
                    {resolve(message.text)}
                </div>
            ) : null}

            {state.phase === "error" && state.error ? (
                <div className="app-alert rounded-xl px-4 py-3 text-sm" role="alert">
                    <div className="flex gap-2">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                        <span className="whitespace-pre-wrap">{resolve(state.error.message)}</span>
                    </div>
                    {state.error.detail ? (
                        <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-semibold">{t.transcribe.details}</summary>
                            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{state.error.detail}</pre>
                        </details>
                    ) : null}
                </div>
            ) : null}

            {showNotice && state.notice ? (
                <div className="status-card rounded-xl px-4 py-3 text-sm" role="status">
                    {resolve(state.notice)}
                </div>
            ) : null}
        </>
    )
}
