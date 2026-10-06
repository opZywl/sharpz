"use client"

import { Upload } from "lucide-react"

import type { TranscribeOptions } from "@/components/transcribe/transcribe-options"
import { useI18n } from "@/lib/i18n/provider"

export function TranscribeDropOverlay({ options }: { options: TranscribeOptions }) {
    const { t } = useI18n()
    return (
        <div className="pointer-events-none fixed inset-3 z-[90] grid place-items-center rounded-2xl border-2 border-dashed border-foreground/40 bg-background/70 backdrop-blur-sm">
            <div className="grid justify-items-center gap-3 text-center">
                <span className="dropzone-icon grid size-16 place-items-center rounded-full">
                    <Upload className="size-7" />
                </span>
                <span className="font-jakarta text-xl font-extrabold">
                    {options.autoStart ? t.transcribe.dropToStart : t.transcribe.dropToPick}
                </span>
            </div>
        </div>
    )
}
