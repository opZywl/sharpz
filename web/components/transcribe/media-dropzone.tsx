"use client"

import { FileAudio, Globe, HardDrive, Upload, X } from "lucide-react"
import { useRef } from "react"

import { MEDIA_ACCEPT } from "@/components/transcribe/transcribe-utils"
import { useI18n } from "@/lib/i18n/provider"
import { cn } from "@/lib/utils"

export interface DropzoneSource {
    kind: "file" | "path" | "url"
    title: string
    subtitle: string
}

const SOURCE_ICONS = {
    file: FileAudio,
    path: HardDrive,
    url: Globe,
}

export function MediaDropzone({
    dragging,
    source,
    autoStart,
    onPick,
    onClear,
}: {
    dragging: boolean
    source: DropzoneSource | null
    autoStart: boolean
    onPick: (file: File) => void
    onClear: () => void
}) {
    const { t } = useI18n()
    const inputRef = useRef<HTMLInputElement | null>(null)
    const Icon = source ? SOURCE_ICONS[source.kind] : Upload

    function openPicker() {
        inputRef.current?.click()
    }

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={t.mediaDropzone.aria}
            data-dragging={dragging}
            onClick={openPicker}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    openPicker()
                }
            }}
            className={cn(
                "dropzone-shell group relative flex min-h-[210px] cursor-pointer flex-col items-center justify-center gap-4 rounded-xl px-6 py-10 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-foreground/30",
                dragging && "ring-2 ring-foreground/40",
            )}
        >
            <input
                ref={inputRef}
                type="file"
                accept={MEDIA_ACCEPT}
                className="hidden"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                    const picked = event.target.files?.[0] ?? null
                    event.target.value = ""
                    if (picked) onPick(picked)
                }}
            />
            <span className="dropzone-icon grid size-14 place-items-center rounded-full transition-transform group-hover:scale-105">
                <Icon className="size-6" />
            </span>
            {source ? (
                <span className="grid max-w-full gap-1">
                    <span className="truncate font-jakarta text-base font-extrabold">{source.title}</span>
                    <span className="app-muted truncate text-sm">{source.subtitle}</span>
                    <span className="app-faint text-xs">{t.mediaDropzone.replace}</span>
                </span>
            ) : (
                <span className="grid gap-1.5">
                    <span className="font-jakarta text-lg font-extrabold">{t.mediaDropzone.title}</span>
                    <span className="app-muted text-sm">
                        {autoStart ? t.mediaDropzone.autoHint : t.mediaDropzone.manualHint}
                    </span>
                    <span className="app-faint text-xs">{t.transcribe.mediaHint}</span>
                </span>
            )}
            {source ? (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation()
                        onClear()
                    }}
                    className="icon-btn absolute right-3 top-3"
                    aria-label={t.mediaDropzone.remove}
                    title={t.mediaDropzone.remove}
                >
                    <X className="size-4" />
                </button>
            ) : null}
        </div>
    )
}
