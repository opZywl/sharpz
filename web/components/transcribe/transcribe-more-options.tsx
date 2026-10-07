"use client"

import { ChevronDown, Mic, Settings2, Square } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"

import { CheckboxRow, SelectField, TextField } from "@/components/dashboard/primitives"
import { CompleteModeFields, type CompleteSettings } from "@/components/transcribe/complete-mode-fields"
import type { useMicRecorder } from "@/components/transcribe/transcribe-hooks"
import type { TranscribeOptions } from "@/components/transcribe/transcribe-options"
import { FORMAT_OPTIONS, formatClock } from "@/components/transcribe/transcribe-utils"
import { Button } from "@/components/ui/button"
import { wordTimestampsAvailable } from "@/lib/capabilities"
import { useI18n } from "@/lib/i18n/provider"
import type { TranscribeCapabilities } from "@/lib/transcribe-api"
import { cn } from "@/lib/utils"

function OptionGroup({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="grid gap-3">
            <span className="field-label">{title}</span>
            {children}
        </section>
    )
}

function CapabilityPill({ label, ok }: { label: string; ok: boolean }) {
    const { t } = useI18n()
    return (
        <span className="status-card inline-flex items-center gap-2 rounded-xl px-3 py-2">
            <span className="app-faint text-xs font-semibold uppercase tracking-[0.16em]">{label}</span>
            <span className="status-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]" data-tone={ok ? "good" : "bad"}>
                {ok ? t.status.ok : t.status.missing}
            </span>
        </span>
    )
}

export function TranscribeMoreOptions({
    options,
    update,
    activeExtras,
    effectiveModel,
    modelOptions,
    modelNotes,
    minSpeakers,
    setMinSpeakers,
    maxSpeakers,
    setMaxSpeakers,
    hfToken,
    setHfToken,
    localPath,
    changePath,
    url,
    changeUrl,
    recorder,
    complete,
    updateComplete,
    capabilities,
}: {
    options: TranscribeOptions
    update: (patch: Partial<TranscribeOptions>) => void
    activeExtras: string[]
    effectiveModel: string
    modelOptions: Array<{ value: string; label: string }>
    modelNotes: string[]
    minSpeakers: string
    setMinSpeakers: Dispatch<SetStateAction<string>>
    maxSpeakers: string
    setMaxSpeakers: Dispatch<SetStateAction<string>>
    hfToken: string
    setHfToken: Dispatch<SetStateAction<string>>
    localPath: string
    changePath: (value: string) => void
    url: string
    changeUrl: (value: string) => void
    recorder: ReturnType<typeof useMicRecorder>
    complete: CompleteSettings
    updateComplete: (patch: Partial<CompleteSettings>) => void
    capabilities: TranscribeCapabilities | null
}) {
    const { t } = useI18n()
    return (
        <div className="more-options grid gap-4 border-t border-foreground/10 pt-4">
            <button
                type="button"
                onClick={() => update({ moreOpen: !options.moreOpen })}
                aria-expanded={options.moreOpen}
                className="flex w-full items-center justify-between gap-3 text-left"
            >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <Settings2 className="size-4 shrink-0" />
                    <span className="text-sm font-semibold">{t.transcribe.more}</span>
                    {activeExtras.map((item) => (
                        <span
                            key={item}
                            className="status-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]"
                            data-tone="warn"
                        >
                            {item}
                        </span>
                    ))}
                </span>
                <ChevronDown className={cn("size-4 shrink-0 transition-transform", options.moreOpen && "rotate-180")} />
            </button>

            {options.moreOpen ? (
                <div className="grid gap-5">
                    <CheckboxRow
                        checked={options.autoStart}
                        onChange={(autoStart) => update({ autoStart })}
                        label={t.transcribe.autoStart}
                        helper={t.transcribe.autoStartHelper}
                    />

                    <OptionGroup title={t.transcribe.groups.model}>
                        <div className="grid gap-2 md:max-w-md">
                            <SelectField
                                label={t.transcribe.exactModel}
                                value={effectiveModel}
                                options={modelOptions}
                                onChange={(model) => update({ model })}
                            />
                            {modelNotes.map((note) => (
                                <p key={note} className="text-xs leading-5 text-amber-700 dark:text-amber-300">
                                    {note}
                                </p>
                            ))}
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                            <CheckboxRow
                                checked={options.wordTimestamps}
                                onChange={(wordTimestamps) => update({ wordTimestamps })}
                                label={t.transcribe.words}
                                helper={t.transcribe.wordsHelper}
                            />
                            <CheckboxRow
                                checked={options.vad}
                                onChange={(vad) => update({ vad })}
                                label={t.transcribe.vad}
                                helper={t.transcribe.vadHelper}
                            />
                            <CheckboxRow
                                checked={options.translate}
                                onChange={(translate) => update({ translate })}
                                label={t.transcribe.translate}
                                helper={t.transcribe.translateHelper}
                            />
                        </div>
                    </OptionGroup>

                    <OptionGroup title={t.transcribe.groups.speakers}>
                        <CheckboxRow
                            checked={options.diarize}
                            onChange={(diarize) => update({ diarize })}
                            label={t.transcribe.diarize}
                            helper={t.transcribe.diarizeHelper}
                        />
                        {options.diarize ? (
                            <div className="grid gap-3 md:grid-cols-2">
                                <TextField
                                    label={t.transcribe.minSpeakers}
                                    value={minSpeakers}
                                    onChange={setMinSpeakers}
                                    placeholder={t.placeholders.automatic}
                                    type="number"
                                />
                                <TextField
                                    label={t.transcribe.maxSpeakers}
                                    value={maxSpeakers}
                                    onChange={setMaxSpeakers}
                                    placeholder={t.placeholders.automatic}
                                    type="number"
                                />
                            </div>
                        ) : null}
                        <TextField
                            label={t.transcribe.hfToken}
                            value={hfToken}
                            onChange={setHfToken}
                            placeholder="hf_..."
                            type="password"
                        />
                    </OptionGroup>

                    <OptionGroup title={t.transcribe.groups.files}>
                        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                            {FORMAT_OPTIONS.map((format) => (
                                <CheckboxRow
                                    key={format.key}
                                    checked={format.key === "txt" || options.formats[format.key]}
                                    onChange={(checked) => {
                                        if (format.key !== "txt") update({ formats: { ...options.formats, [format.key]: checked } })
                                    }}
                                    label={format.label}
                                    helper={t.transcribe.formats[format.key]}
                                />
                            ))}
                        </div>
                    </OptionGroup>

                    <OptionGroup title={t.transcribe.groups.sources}>
                        <div className="grid gap-3 md:grid-cols-2">
                            <TextField
                                label={t.transcribe.localPath}
                                value={localPath}
                                onChange={changePath}
                                placeholder={t.placeholders.videoFile}
                            />
                            <TextField
                                label={t.transcribe.url}
                                value={url}
                                onChange={changeUrl}
                                placeholder="https://www.youtube.com/watch?v=..."
                            />
                        </div>
                        <p className="app-faint text-xs leading-5">{t.transcribe.sourcesHint}</p>
                        <div className="flex flex-wrap items-center gap-3">
                            {recorder.recording ? (
                                <Button type="button" variant="outline" onClick={recorder.stop}>
                                    <Square className="size-4" />
                                    {t.transcribe.stop(formatClock(recorder.seconds))}
                                </Button>
                            ) : (
                                <Button type="button" variant="outline" onClick={recorder.start}>
                                    <Mic className="size-4" />
                                    {t.transcribe.record}
                                </Button>
                            )}
                            <span className="app-faint text-xs">{t.transcribe.recordHint}</span>
                        </div>
                    </OptionGroup>

                    <CompleteModeFields settings={complete} onChange={updateComplete} />

                    {capabilities ? (
                        <OptionGroup title={t.transcribe.groups.installed}>
                            <div className="flex flex-wrap gap-2">
                                <CapabilityPill label="ffmpeg" ok={capabilities.ffmpeg} />
                                <CapabilityPill label={t.transcribe.words} ok={wordTimestampsAvailable(capabilities)} />
                                <CapabilityPill label={t.transcribe.diarization} ok={capabilities.diarization} />
                            </div>
                        </OptionGroup>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}
