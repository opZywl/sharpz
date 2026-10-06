"use client"

import { motion } from "framer-motion"
import { AudioLines, Loader2, Play, RotateCcw, Square } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Panel, cardEnter } from "@/components/dashboard/primitives"
import { appendCompleteFields, useCompleteSettings, type CompleteSettings } from "@/components/transcribe/complete-mode-fields"
import { MediaDropzone } from "@/components/transcribe/media-dropzone"
import { TranscribeAlerts } from "@/components/transcribe/transcribe-alerts"
import { TranscribeDropOverlay } from "@/components/transcribe/transcribe-drop-overlay"
import { useLatest, useMicRecorder, usePersistentState } from "@/components/transcribe/transcribe-hooks"
import { TranscribeModePicker } from "@/components/transcribe/transcribe-mode-picker"
import { TranscribeMoreOptions } from "@/components/transcribe/transcribe-more-options"
import {
    AUTO_MODEL,
    DEFAULT_OPTIONS,
    hfTokenStore,
    optionsStore,
    type Mode,
    type TranscribeOptions,
} from "@/components/transcribe/transcribe-options"
import { TranscribeProgress } from "@/components/transcribe/transcribe-progress"
import { TranscribeResults } from "@/components/transcribe/transcribe-results"
import {
    busyMessage,
    describeSource,
    sourceKey,
    sourceName,
    type FormMessage,
    type Source,
    type SourceKind,
} from "@/components/transcribe/transcribe-source"
import {
    FAST_MODEL,
    FORMAT_OPTIONS,
    MODEL_FALLBACK,
    QUALITY_MODEL,
    baseName,
    cleanLocalPath,
    formatClock,
    isMediaFile,
    modelLabel,
    segmentsToText,
    stripPathQuotes,
} from "@/components/transcribe/transcribe-utils"
import { useDocumentMediaDrop } from "@/components/transcribe/use-document-media-drop"
import { useTranscribeJob } from "@/components/transcribe/use-transcribe-job"
import { Button } from "@/components/ui/button"
import { appendFields } from "@/lib/dashboard-utils"
import type { Message } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n/provider"
import { getCapabilities, getModels, type TranscribeCapabilities, type TranscribeModels } from "@/lib/transcribe-api"
import { exceedsProxyLimit, isDirectUpload } from "@/lib/upload-target"

type ActionKind = "run" | "runAgain" | "retry"

export function TranscribeWorkspace() {
    const { t, fmt } = useI18n()
    const job = useTranscribeJob()
    const { state, busy } = job
    const [options, setOptions] = usePersistentState(DEFAULT_OPTIONS, optionsStore)
    const [hfToken, setHfToken] = usePersistentState("", hfTokenStore)
    const [complete, setComplete] = useCompleteSettings()
    const [catalog, setCatalog] = useState<TranscribeModels | null>(null)
    const [capabilities, setCapabilities] = useState<TranscribeCapabilities | null>(null)
    const [file, setFile] = useState<File | null>(null)
    const [localPath, setLocalPath] = useState("")
    const [url, setUrl] = useState("")
    const [sourceKind, setSourceKind] = useState<SourceKind>("file")
    const [minSpeakers, setMinSpeakers] = useState("")
    const [maxSpeakers, setMaxSpeakers] = useState("")
    const [message, setMessage] = useState<FormMessage | null>(null)
    const [startedKey, setStartedKey] = useState("")

    const update = useCallback(
        (patch: Partial<TranscribeOptions>) => setOptions((current) => ({ ...current, ...patch })),
        [setOptions],
    )
    const updateComplete = useCallback(
        (patch: Partial<CompleteSettings>) => setComplete((current) => ({ ...current, ...patch })),
        [setComplete],
    )

    const refreshModels = useCallback(() => {
        getModels()
            .then(setCatalog)
            .catch(() => undefined)
    }, [])

    useEffect(() => {
        let cancelled = false
        getModels()
            .then((data) => {
                if (!cancelled) setCatalog(data)
            })
            .catch(() => undefined)
        getCapabilities()
            .then((data) => {
                if (!cancelled) setCapabilities(data)
            })
            .catch(() => undefined)
        return () => {
            cancelled = true
        }
    }, [])

    const models = catalog?.models.length ? catalog.models : MODEL_FALLBACK
    const findModel = (key: string | null | undefined) => models.find((entry) => entry.key === key) ?? null
    const effectiveModel = options.translate ? QUALITY_MODEL : options.model
    const mode: Mode = effectiveModel === AUTO_MODEL ? "fast" : effectiveModel === QUALITY_MODEL ? "quality" : "custom"
    const resolvedAuto = findModel(catalog?.default_resolved)
    const selectedModel = findModel(effectiveModel === AUTO_MODEL ? catalog?.default_resolved : effectiveModel)
    const turbo = catalog?.models.find((entry) => entry.key === FAST_MODEL) ?? null
    const jobModelName = state.model ? findModel(state.model)?.label ?? state.model : null

    const modelOptions = useMemo(
        () => [
            { value: AUTO_MODEL, label: resolvedAuto ? t.transcribe.autoModelNow(resolvedAuto.label) : t.transcribe.autoModel },
            ...models.map((entry) => ({ value: entry.key, label: modelLabel(t, entry) })),
        ],
        [models, resolvedAuto, t],
    )

    const modeHint = options.translate
        ? t.transcribe.hintTranslate
        : mode === "quality"
          ? t.transcribe.hintQuality
          : mode === "custom"
            ? t.transcribe.hintCustom(selectedModel?.label ?? options.model)
            : !catalog
              ? t.transcribe.hintFastUnknown
              : resolvedAuto?.key === FAST_MODEL
                ? t.transcribe.hintFastTurbo
                : t.transcribe.hintFastFallback(resolvedAuto?.label ?? "Large v3")

    const modelNotes = [
        selectedModel && !selectedModel.downloaded && catalog ? t.transcribe.notDownloaded : null,
        effectiveModel.startsWith("distil") && options.language !== "en" ? t.transcribe.englishOnly : null,
    ].filter((note): note is string => Boolean(note))

    const cleanPath = cleanLocalPath(localPath)
    const trimmedUrl = url.trim()
    const source = useMemo<Source | null>(() => {
        const candidates: Record<SourceKind, Source | null> = {
            file: file ? { kind: "file", file } : null,
            path: cleanPath ? { kind: "path", path: cleanPath } : null,
            url: trimmedUrl ? { kind: "url", url: trimmedUrl } : null,
        }
        return candidates[sourceKind] ?? candidates.file ?? candidates.path ?? candidates.url
    }, [file, cleanPath, trimmedUrl, sourceKind])

    function buildForm(next: Source) {
        const form = new FormData()
        if (next.kind === "file") form.append("file", next.file)
        if (next.kind === "path") form.append("local_path", next.path)
        if (next.kind === "url") form.append("url", next.url)
        appendFields(form, {
            model: effectiveModel,
            language: options.language,
            formats: FORMAT_OPTIONS.filter(({ key }) => key === "txt" || options.formats[key])
                .map(({ key }) => key)
                .join(","),
            vad: options.vad,
            word_timestamps: options.wordTimestamps,
            diarize: options.diarize,
            translate: options.translate,
        })
        if (hfToken.trim()) form.append("hf_token", hfToken.trim())
        if (options.diarize && minSpeakers.trim()) form.append("min_speakers", minSpeakers.trim())
        if (options.diarize && maxSpeakers.trim()) form.append("max_speakers", maxSpeakers.trim())
        appendCompleteFields(form, complete)
        return form
    }

    function startWith(next: Source, note: Message | null = null) {
        if (busy) {
            setMessage(busyMessage(next.kind))
            return
        }
        setMessage(note ? { tone: "info", text: note } : null)
        setStartedKey(sourceKey(next))
        void job.start(buildForm(next), {
            sourceName: sourceName(next, t.transcribe.defaultName),
            mode: complete.enabled ? "complete" : "standard",
            uploading: next.kind === "file",
            sourceBytes: next.kind === "file" ? next.file.size : null,
        })
    }

    function acceptFile(picked: File, count = 1) {
        if (!isMediaFile(picked)) {
            setMessage({ tone: "error", text: (m) => m.transcribe.notMedia(picked.name, m.transcribe.mediaHint) })
            return
        }
        if (picked.size === 0) {
            setMessage({ tone: "error", text: (m) => m.transcribe.emptyFile(picked.name) })
            return
        }
        if (exceedsProxyLimit(picked.size, isDirectUpload(window.location))) {
            setMessage({ tone: "error", text: (m) => m.transcribe.tooLarge })
            return
        }
        setFile(picked)
        setSourceKind("file")
        const note: Message | null = count > 1 ? (m) => m.transcribe.oneAtATime : null
        if (busy) {
            setMessage(busyMessage("file"))
            return
        }
        if (options.autoStart) startWith({ kind: "file", file: picked }, note)
        else setMessage(note ? { tone: "info", text: note } : null)
    }

    const acceptFileRef = useLatest(acceptFile)

    function acceptUrl(link: string) {
        setUrl(link)
        setSourceKind("url")
        if (busy) {
            setMessage(busyMessage("url"))
            return
        }
        if (options.autoStart) startWith({ kind: "url", url: link })
        else setMessage({ tone: "info", text: (m) => m.transcribe.linkReady })
    }

    const acceptUrlRef = useLatest(acceptUrl)

    const recorder = useMicRecorder(
        (recorded) => acceptFile(recorded),
        (text) => setMessage({ tone: "error", text }),
        t.transcribe.recordingPrefix,
    )

    const dragging = useDocumentMediaDrop(acceptFileRef, acceptUrlRef)

    useEffect(() => {
        if (busy) return
        setMessage((current) => (current?.ready ? { tone: "info", text: current.ready } : current))
    }, [busy])

    function handleTranscribe() {
        if (!source) {
            setMessage({ tone: "error", text: (m) => m.transcribe.needSource })
            return
        }
        startWith(source)
    }

    function clearSource() {
        if (source?.kind === "file") setFile(null)
        if (source?.kind === "path") setLocalPath("")
        if (source?.kind === "url") setUrl("")
        setMessage(null)
    }

    function changeMode(next: Mode) {
        if (next === "custom") return
        if (options.translate && next === "fast") {
            setMessage({ tone: "info", text: (m) => m.transcribe.translateLocked })
            return
        }
        update({ model: next === "fast" ? AUTO_MODEL : QUALITY_MODEL })
    }

    function changePath(value: string) {
        const next = stripPathQuotes(value)
        setLocalPath(next)
        if (next.trim()) setSourceKind("path")
    }

    function changeUrl(value: string) {
        setUrl(value)
        if (value.trim()) setSourceKind("url")
    }

    const activeExtras = [
        options.diarize ? t.transcribe.extras.diarize : null,
        options.wordTimestamps ? t.transcribe.extras.words : null,
        options.translate ? t.transcribe.extras.translate : null,
        options.vad ? null : t.transcribe.extras.noVad,
        complete.enabled ? t.transcribe.extras.complete : null,
        options.autoStart ? null : t.transcribe.extras.manual,
        mode === "custom" ? t.transcribe.extras.model(selectedModel?.label ?? options.model) : null,
        source?.kind === "path" ? t.transcribe.extras.path : null,
        source?.kind === "url" ? t.transcribe.extras.url : null,
    ].filter((item): item is string => Boolean(item))

    const text = useMemo(() => state.text ?? segmentsToText(state.segments), [state.text, state.segments])
    const fileBase = baseName(state.sourceName || t.transcribe.defaultName, t.transcribe.defaultName)
    const tookSeconds =
        state.startedAt && state.finishedAt ? (state.finishedAt - state.startedAt) / 1000 : state.elapsed
    const showResult = busy || state.phase === "done" || state.segments.length > 0
    const sameSource = Boolean(startedKey) && sourceKey(source) === startedKey && !busy
    const action: ActionKind = !sameSource
        ? "run"
        : state.phase === "done"
          ? "runAgain"
          : state.phase === "error" || state.phase === "canceled"
            ? "retry"
            : "run"
    const actionLabel = action === "run" ? t.transcribe.run : action === "runAgain" ? t.transcribe.runAgain : t.transcribe.retry
    const showNotice = Boolean(state.notice) && (busy || state.phase === "canceled")

    return (
        <div className="space-y-4">
            {dragging ? (
                <TranscribeDropOverlay options={options} />
            ) : null}

            <motion.div {...cardEnter}>
                <Panel title={t.tools.transcribe.title} subtitle={t.transcribe.subtitle} icon={AudioLines}>
                    <div className="grid gap-4">
                        <MediaDropzone
                            dragging={dragging}
                            source={describeSource(source, t, fmt.bytes)}
                            autoStart={options.autoStart}
                            onPick={(picked) => acceptFile(picked)}
                            onClear={clearSource}
                        />

                        {recorder.recording ? (
                            <div className="status-card flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3">
                                <span className="inline-flex items-center gap-2 text-sm font-semibold tabular-nums">
                                    <span className="size-2.5 animate-pulse rounded-full bg-red-500" />
                                    {t.transcribe.recording(formatClock(recorder.seconds))}
                                </span>
                                <Button type="button" variant="outline" size="sm" onClick={recorder.stop}>
                                    <Square className="size-3.5" />
                                    {t.transcribe.stopAndUse}
                                </Button>
                            </div>
                        ) : null}

                        <TranscribeModePicker
                            options={options}
                            update={update}
                            mode={mode}
                            changeMode={changeMode}
                            turbo={turbo}
                            refreshModels={refreshModels}
                            modeHint={modeHint}
                        />

                        <div className="flex flex-wrap items-center gap-3">
                            <Button type="button" size="lg" onClick={handleTranscribe} disabled={busy}>
                                {busy ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : action === "run" ? (
                                    <Play className="size-4" />
                                ) : (
                                    <RotateCcw className="size-4" />
                                )}
                                {actionLabel}
                            </Button>
                            {!busy && !options.autoStart ? (
                                <span className="app-faint text-xs">{t.transcribe.autoStartOff}</span>
                            ) : null}
                        </div>

                        <TranscribeAlerts message={message} state={state} showNotice={showNotice} />

                        {busy ? <TranscribeProgress job={state} modelName={jobModelName} onCancel={job.cancel} /> : null}

                        <TranscribeMoreOptions
                            options={options}
                            update={update}
                            activeExtras={activeExtras}
                            effectiveModel={effectiveModel}
                            modelOptions={modelOptions}
                            modelNotes={modelNotes}
                            minSpeakers={minSpeakers}
                            setMinSpeakers={setMinSpeakers}
                            maxSpeakers={maxSpeakers}
                            setMaxSpeakers={setMaxSpeakers}
                            hfToken={hfToken}
                            setHfToken={setHfToken}
                            localPath={localPath}
                            changePath={changePath}
                            url={url}
                            changeUrl={changeUrl}
                            recorder={recorder}
                            complete={complete}
                            updateComplete={updateComplete}
                            capabilities={capabilities}
                        />
                    </div>
                </Panel>
            </motion.div>

            <TranscribeResults
                job={job}
                state={state}
                busy={busy}
                showResult={showResult}
                text={text}
                fileBase={fileBase}
                jobModelName={jobModelName}
                tookSeconds={tookSeconds}
                options={options}
            />
        </div>
    )
}
