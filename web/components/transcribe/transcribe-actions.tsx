"use client"

import { Clipboard, ClipboardCheck, Download, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import { saveBlob, saveText } from "@/components/transcribe/transcribe-utils"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n/provider"
import { downloadUrl, fetchJobFile } from "@/lib/transcribe-api"

export function CopyButton({ text, label }: { text: string; label?: string }) {
    const { t } = useI18n()
    const [state, setState] = useState<"idle" | "copied" | "failed">("idle")

    useEffect(() => {
        if (state === "idle") return
        const timer = window.setTimeout(() => setState("idle"), 2000)
        return () => window.clearTimeout(timer)
    }, [state])

    async function copy() {
        try {
            await navigator.clipboard.writeText(text)
            setState("copied")
        } catch {
            setState("failed")
        }
    }

    return (
        <Button type="button" variant="outline" size="sm" onClick={copy} disabled={!text}>
            {state === "copied" ? <ClipboardCheck className="size-4" /> : <Clipboard className="size-4" />}
            {state === "copied" ? t.actions.copied : state === "failed" ? t.actions.copyFailed : label ?? t.actions.copyAll}
        </Button>
    )
}

export function SaveTextButton({ text, fileName, label }: { text: string; fileName: string; label: string }) {
    return (
        <Button type="button" variant="outline" size="sm" onClick={() => saveText(text, fileName)} disabled={!text}>
            <Download className="size-4" />
            {label}
        </Button>
    )
}

export function JobFileButton({ jobId, format, fileName }: { jobId: string; format: string; fileName: string }) {
    const { lang, t } = useI18n()
    const [state, setState] = useState<"idle" | "saving" | "failed">("idle")
    const href = downloadUrl(jobId, format, lang)
    const formatLabel = format.toUpperCase()

    async function save(event: React.MouseEvent<HTMLAnchorElement>) {
        event.preventDefault()
        if (state === "saving") return
        setState("saving")
        try {
            saveBlob(await fetchJobFile(jobId, format), fileName)
            setState("idle")
        } catch {
            setState("failed")
        }
    }

    return (
        <Button asChild variant="outline" size="sm">
            <a href={href} download={fileName} onClick={save} title={state === "failed" ? t.actions.downloadFailed : fileName}>
                {state === "saving" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                {state === "failed" ? t.actions.retry(formatLabel) : formatLabel}
            </a>
        </Button>
    )
}
