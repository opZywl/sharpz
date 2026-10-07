"use client"

import { Globe, Settings } from "lucide-react"

import { SelectField } from "@/components/dashboard/primitives"
import { ModelDownload } from "@/components/transcribe/model-download"
import type { Mode, TranscribeOptions } from "@/components/transcribe/transcribe-options"
import { languageOptions } from "@/components/transcribe/transcribe-utils"
import { Segmented } from "@/components/ui/segmented"
import { useI18n } from "@/lib/i18n/provider"
import type { TranscribeModel } from "@/lib/transcribe-api"

export function TranscribeModePicker({
    options,
    update,
    mode,
    changeMode,
    turbo,
    refreshModels,
    modeHint,
}: {
    options: TranscribeOptions
    update: (patch: Partial<TranscribeOptions>) => void
    mode: Mode
    changeMode: (next: Mode) => void
    turbo: TranscribeModel | null
    refreshModels: () => void
    modeHint: string
}) {
    const { t } = useI18n()
    return (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(200px,260px)_minmax(0,1fr)]">
            <SelectField
                label={t.transcribe.language}
                icon={Globe}
                value={options.language}
                options={languageOptions(t)}
                onChange={(language) => update({ language })}
            />
            <div className="grid min-w-0 gap-2">
                <span className="field-label">
                    <Settings className="field-label-icon" aria-hidden="true" />
                    {t.transcribe.mode}
                </span>
                <div className="flex flex-wrap items-center gap-3">
                    <Segmented<Mode>
                        value={mode}
                        onChange={changeMode}
                        options={[
                            { value: "fast", label: t.transcribe.fast },
                            { value: "quality", label: t.transcribe.quality },
                        ]}
                        className="h-11"
                    />
                    {turbo && !turbo.downloaded ? (
                        <ModelDownload model={turbo} label={t.transcribe.downloadFast} onDone={refreshModels} />
                    ) : null}
                </div>
                <p className="app-faint text-xs leading-5">{modeHint}</p>
            </div>
        </div>
    )
}
