"use client"

import { motion } from "framer-motion"
import { AudioLines, ChevronDown, Loader2, Mic, Play, RotateCcw, Settings2, Square, TriangleAlert, Upload } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { CheckboxRow, Panel, SelectField, TextField, cardEnter } from "@/components/dashboard/primitives"
import {
    CompleteModeFields,
    appendCompleteFields,
    useCompleteSettings,
    type CompleteSettings,
} from "@/components/transcribe/complete-mode-fields"
import { CompletePackagePanel } from "@/components/transcribe/complete-package-panel"
import { MediaDropzone, type DropzoneSource } from "@/components/transcribe/media-dropzone"
import { ModelDownload } from "@/components/transcribe/model-download"
import { SummaryPanel } from "@/components/transcribe/summary-panel"
import { useLatest, useMicRecorder, usePersistentState } from "@/components/transcribe/transcribe-hooks"
import { TranscribeProgress } from "@/components/transcribe/transcribe-progress"
import {
    FAST_MODEL,
    FORMAT_OPTIONS,
    LANGUAGE_OPTIONS,
    MEDIA_HINT,
    MODEL_FALLBACK,
    QUALITY_MODEL,
    baseName,
    cleanLocalPath,
    formatClock,
    isMediaFile,
    modelLabel,
    pathTail,
    readStorageJson,
    segmentsToText,
    stringStore,
    stripPathQuotes,
    writeStorage,
    type FormatKey,
    type Store,
} from "@/components/transcribe/transcribe-utils"
import { TranscriptResult } from "@/components/transcribe/transcript-result"
import { useTranscribeJob } from "@/components/transcribe/use-transcribe-job"
import { Button } from "@/components/ui/button"
import { Segmented } from "@/components/ui/segmented"
import { appendFields, formatBytes } from "@/lib/dashboard-utils"
import { getCapabilities, getModels, type TranscribeCapabilities, type TranscribeModels } from "@/lib/transcribe-api"
import { cn } from "@/lib/utils"

interface TranscribeOptions {
    language: string
    model: string
    diarize: boolean
    wordTimestamps: boolean
    vad: boolean
    translate: boolean
    formats: Record<FormatKey, boolean>
    autoStart: boolean
    moreOpen: boolean
}

type SourceKind = "file" | "path" | "url"
type Source = { kind: "file"; file: File } | { kind: "path"; path: string } | { kind: "url"; url: string }
type Mode = "fast" | "quality" | "custom"

interface FormMessage {
    tone: "error" | "info"
    text: string
}

const AUTO_MODEL = "auto"
const KNOWN_MODELS = new Set([AUTO_MODEL, ...MODEL_FALLBACK.map((entry) => entry.key)])
const BUSY_MESSAGE = "Já tem uma transcrição em andamento. O arquivo ficou pronto: clique em Transcrever quando ela terminar."
const READY_MESSAGE = "A transcrição anterior terminou. O arquivo novo está pronto: clique em Transcrever."

const DEFAULT_OPTIONS: TranscribeOptions = {
    language: "pt",
    model: AUTO_MODEL,
    diarize: false,
    wordTimestamps: false,
    vad: true,
    translate: false,
    formats: { txt: true, srt: true, vtt: false, json: false, lrc: false },
    autoStart: true,
    moreOpen: false,
}

function pickBoolean(value: unknown, fallback: boolean) {
    return typeof value === "boolean" ? value : fallback
}

function sanitizeOptions(raw: unknown): TranscribeOptions | null {
    if (!raw || typeof raw !== "object") return null
    const value = raw as Record<string, unknown>
    const savedFormats = value.formats && typeof value.formats === "object" ? (value.formats as Record<string, unknown>) : {}
    const formats = Object.fromEntries(
        FORMAT_OPTIONS.map(({ key }) => [key, key === "txt" || pickBoolean(savedFormats[key], DEFAULT_OPTIONS.formats[key])]),
    ) as Record<FormatKey, boolean>
    const language = typeof value.language === "string" ? value.language : ""
    const model = typeof value.model === "string" ? value.model : ""
    return {
        language: LANGUAGE_OPTIONS.some((option) => option.value === language) ? language : DEFAULT_OPTIONS.language,
        model: KNOWN_MODELS.has(model) ? model : DEFAULT_OPTIONS.model,
        diarize: pickBoolean(value.diarize, DEFAULT_OPTIONS.diarize),
        wordTimestamps: pickBoolean(value.wordTimestamps, DEFAULT_OPTIONS.wordTimestamps),
        vad: pickBoolean(value.vad, DEFAULT_OPTIONS.vad),
        translate: pickBoolean(value.translate, DEFAULT_OPTIONS.translate),
        formats,
        autoStart: pickBoolean(value.autoStart, DEFAULT_OPTIONS.autoStart),
        moreOpen: pickBoolean(value.moreOpen, DEFAULT_OPTIONS.moreOpen),
    }
}

const optionsStore: Store<TranscribeOptions> = {
    load: () => sanitizeOptions(readStorageJson("sharpz.transcribe.options.v1")),
    save: (value) => writeStorage("sharpz.transcribe.options.v1", JSON.stringify(value)),
}

const hfTokenStore = stringStore("cleanup-image.hf-token")

function sourceName(source: Source) {
    if (source.kind === "file") return source.file.name
    if (source.kind === "path") return pathTail(source.path)
    return "transcricao"
}

function sourceKey(source: Source | null) {
    if (!source) return ""
    if (source.kind === "file") return `file:${source.file.name}:${source.file.size}:${source.file.lastModified}`
    return source.kind === "path" ? `path:${source.path}` : `url:${source.url}`
}

function describeSource(source: Source | null): DropzoneSource | null {
    if (!source) return null
    if (source.kind === "file") return { kind: "file", title: source.file.name, subtitle: formatBytes(source.file.size) }
    if (source.kind === "path") return { kind: "path", title: pathTail(source.path), subtitle: `Caminho no computador: ${source.path}` }
    return { kind: "url", title: source.url, subtitle: "Link da internet: o áudio é baixado antes de transcrever." }
}

function OptionGroup({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="grid gap-3">
            <span className="field-label">{title}</span>
            {children}
        </section>
    )
}

function CapabilityPill({ label, ok }: { label: string; ok: boolean }) {
    return (
        <span className="status-card inline-flex items-center gap-2 rounded-xl px-3 py-2">
            <span className="app-faint text-xs font-semibold uppercase tracking-[0.16em]">{label}</span>
            <span className="status-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]" data-tone={ok ? "good" : "bad"}>
                {ok ? "ok" : "faltando"}
            </span>
        </span>
    )
}

export function TranscribeWorkspace() {
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
    const [dragging, setDragging] = useState(false)
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
            { value: AUTO_MODEL, label: resolvedAuto ? `Automático (agora: ${resolvedAuto.label})` : "Automático (Rápido)" },
            ...models.map((entry) => ({ value: entry.key, label: modelLabel(entry) })),
        ],
        [models, resolvedAuto],
    )

    const modeHint = options.translate
        ? "Traduzir para inglês usa sempre a Máxima qualidade."
        : mode === "quality"
          ? "Usa o Large v3: o mais preciso, e o mais lento."
          : mode === "custom"
            ? `Usando o modelo escolhido em Mais opções: ${selectedModel?.label ?? options.model}.`
            : !catalog
              ? "Usa o modelo mais rápido que estiver baixado."
              : resolvedAuto?.key === FAST_MODEL
                ? "Usa o Large v3 Turbo: bem mais rápido e quase igual em qualidade."
                : `Por enquanto o Rápido usa o ${resolvedAuto?.label ?? "Large v3"}, porque o modelo rápido ainda não foi baixado.`

    const modelNotes = [
        selectedModel && !selectedModel.downloaded && catalog
            ? "Esse modelo ainda não foi baixado: a primeira transcrição demora mais, porque ele baixa antes."
            : null,
        effectiveModel.startsWith("distil") && options.language !== "en" ? "Esse modelo só entende inglês." : null,
    ].filter(Boolean)

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

    function startWith(next: Source, note: string | null = null) {
        if (busy) {
            setMessage({ tone: "info", text: BUSY_MESSAGE })
            return
        }
        setMessage(note ? { tone: "info", text: note } : null)
        setStartedKey(sourceKey(next))
        void job.start(buildForm(next), {
            sourceName: sourceName(next),
            mode: complete.enabled ? "complete" : "standard",
            uploading: next.kind === "file",
        })
    }

    function acceptFile(picked: File, count = 1) {
        if (!isMediaFile(picked)) {
            setMessage({ tone: "error", text: `“${picked.name}” não é áudio nem vídeo. Escolha um destes: ${MEDIA_HINT}.` })
            return
        }
        if (picked.size === 0) {
            setMessage({ tone: "error", text: `“${picked.name}” está vazio.` })
            return
        }
        setFile(picked)
        setSourceKind("file")
        const note = count > 1 ? "Solte um arquivo por vez: usei só o primeiro." : null
        if (busy) {
            setMessage({ tone: "info", text: BUSY_MESSAGE })
            return
        }
        if (options.autoStart) startWith({ kind: "file", file: picked }, note)
        else setMessage(note ? { tone: "info", text: note } : null)
    }

    const acceptFileRef = useLatest(acceptFile)

    const recorder = useMicRecorder(
        (recorded) => acceptFile(recorded),
        (text) => setMessage({ tone: "error", text }),
    )

    useEffect(() => {
        let depth = 0
        const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files")
        const onDragEnter = (event: DragEvent) => {
            if (!hasFiles(event)) return
            depth += 1
            setDragging(true)
        }
        const onDragOver = (event: DragEvent) => {
            if (!hasFiles(event)) return
            event.preventDefault()
            if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
        }
        const onDragLeave = (event: DragEvent) => {
            if (!hasFiles(event)) return
            depth = Math.max(0, depth - 1)
            if (depth === 0) setDragging(false)
        }
        const onDrop = (event: DragEvent) => {
            if (!hasFiles(event)) return
            event.preventDefault()
            depth = 0
            setDragging(false)
            const dropped = Array.from(event.dataTransfer?.files ?? [])
            if (dropped[0]) acceptFileRef.current(dropped[0], dropped.length)
        }
        const onPaste = (event: ClipboardEvent) => {
            const pasted = Array.from(event.clipboardData?.files ?? [])
            if (!pasted[0]) return
            event.preventDefault()
            acceptFileRef.current(pasted[0], pasted.length)
        }
        document.addEventListener("dragenter", onDragEnter)
        document.addEventListener("dragover", onDragOver)
        document.addEventListener("dragleave", onDragLeave)
        document.addEventListener("drop", onDrop)
        document.addEventListener("paste", onPaste)
        return () => {
            document.removeEventListener("dragenter", onDragEnter)
            document.removeEventListener("dragover", onDragOver)
            document.removeEventListener("dragleave", onDragLeave)
            document.removeEventListener("drop", onDrop)
            document.removeEventListener("paste", onPaste)
        }
    }, [acceptFileRef])

    useEffect(() => {
        if (busy) return
        setMessage((current) => (current?.text === BUSY_MESSAGE ? { tone: "info", text: READY_MESSAGE } : current))
    }, [busy])

    function handleTranscribe() {
        if (!source) {
            setMessage({
                tone: "error",
                text: "Solte ou escolha um áudio ou vídeo primeiro. Em Mais opções também dá para usar um caminho do computador, um link ou o microfone.",
            })
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
            setMessage({
                tone: "info",
                text: "Traduzir para inglês usa sempre a Máxima qualidade. Desligue a tradução em Mais opções para usar o Rápido.",
            })
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
        options.diarize ? "Separar quem fala" : null,
        options.wordTimestamps ? "Tempo por palavra" : null,
        options.translate ? "Traduzir para inglês" : null,
        options.vad ? null : "Sem filtro de silêncio",
        complete.enabled ? "Modo Complete" : null,
        options.autoStart ? null : "Começa só no botão",
        mode === "custom" ? `Modelo ${selectedModel?.label ?? options.model}` : null,
        source?.kind === "path" ? "Caminho do computador" : null,
        source?.kind === "url" ? "Link da internet" : null,
    ].filter((item): item is string => Boolean(item))

    const text = useMemo(() => state.text ?? segmentsToText(state.segments), [state.text, state.segments])
    const fileBase = baseName(state.sourceName || "transcricao")
    const tookSeconds =
        state.startedAt && state.finishedAt ? (state.finishedAt - state.startedAt) / 1000 : state.elapsed
    const showResult = busy || state.phase === "done" || state.segments.length > 0
    const sameSource = Boolean(startedKey) && sourceKey(source) === startedKey && !busy
    const actionLabel = !sameSource
        ? "Transcrever"
        : state.phase === "done"
          ? "Transcrever de novo"
          : state.phase === "error" || state.phase === "canceled"
            ? "Tentar de novo"
            : "Transcrever"
    const showNotice = Boolean(state.notice) && (busy || state.phase === "canceled")

    return (
        <div className="space-y-4">
            {dragging ? (
                <div className="pointer-events-none fixed inset-3 z-[90] grid place-items-center rounded-2xl border-2 border-dashed border-foreground/40 bg-background/70 backdrop-blur-sm">
                    <div className="grid justify-items-center gap-3 text-center">
                        <span className="dropzone-icon grid size-16 place-items-center rounded-full">
                            <Upload className="size-7" />
                        </span>
                        <span className="font-jakarta text-xl font-extrabold">
                            {options.autoStart ? "Solte para transcrever" : "Solte para escolher este arquivo"}
                        </span>
                    </div>
                </div>
            ) : null}

            <motion.div {...cardEnter}>
                <Panel
                    title="Transcrição"
                    subtitle="Solte um áudio ou vídeo e receba o texto. Funciona com áudio do WhatsApp."
                    icon={AudioLines}
                >
                    <div className="grid gap-4">
                        <MediaDropzone
                            dragging={dragging}
                            source={describeSource(source)}
                            autoStart={options.autoStart}
                            onPick={(picked) => acceptFile(picked)}
                            onClear={clearSource}
                        />

                        {recorder.recording ? (
                            <div className="status-card flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3">
                                <span className="inline-flex items-center gap-2 text-sm font-semibold tabular-nums">
                                    <span className="size-2.5 animate-pulse rounded-full bg-red-500" />
                                    Gravando do microfone · {formatClock(recorder.seconds)}
                                </span>
                                <Button type="button" variant="outline" size="sm" onClick={recorder.stop}>
                                    <Square className="size-3.5" />
                                    Parar e usar a gravação
                                </Button>
                            </div>
                        ) : null}

                        <div className="grid items-start gap-4 lg:grid-cols-[minmax(200px,260px)_minmax(0,1fr)]">
                            <SelectField
                                label="Idioma"
                                value={options.language}
                                options={LANGUAGE_OPTIONS}
                                onChange={(language) => update({ language })}
                            />
                            <div className="grid min-w-0 gap-2">
                                <span className="field-label">Modo</span>
                                <div className="flex flex-wrap items-center gap-3">
                                    <Segmented<Mode>
                                        value={mode}
                                        onChange={changeMode}
                                        options={[
                                            { value: "fast", label: "Rápido" },
                                            { value: "quality", label: "Máxima qualidade" },
                                        ]}
                                        className="h-11"
                                    />
                                    {turbo && !turbo.downloaded ? (
                                        <ModelDownload model={turbo} label="Baixar modelo rápido (1,6 GB)" onDone={refreshModels} />
                                    ) : null}
                                </div>
                                <p className="app-faint text-xs leading-5">{modeHint}</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <Button type="button" size="lg" onClick={handleTranscribe} disabled={busy}>
                                {busy ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : actionLabel === "Transcrever" ? (
                                    <Play className="size-4" />
                                ) : (
                                    <RotateCcw className="size-4" />
                                )}
                                {actionLabel}
                            </Button>
                            {!busy && !options.autoStart ? (
                                <span className="app-faint text-xs">Começar sozinho está desligado em Mais opções.</span>
                            ) : null}
                        </div>

                        {message ? (
                            <div
                                className={cn(
                                    "rounded-xl px-4 py-3 text-sm",
                                    message.tone === "error" ? "app-alert" : "status-card",
                                )}
                                role={message.tone === "error" ? "alert" : "status"}
                            >
                                {message.text}
                            </div>
                        ) : null}

                        {state.phase === "error" && state.error ? (
                            <div className="app-alert rounded-xl px-4 py-3 text-sm" role="alert">
                                <div className="flex gap-2">
                                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                                    <span className="whitespace-pre-wrap">{state.error.message}</span>
                                </div>
                                {state.error.detail ? (
                                    <details className="mt-2">
                                        <summary className="cursor-pointer text-xs font-semibold">Ver detalhes técnicos</summary>
                                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{state.error.detail}</pre>
                                    </details>
                                ) : null}
                            </div>
                        ) : null}

                        {showNotice ? (
                            <div className="status-card rounded-xl px-4 py-3 text-sm" role="status">
                                {state.notice}
                            </div>
                        ) : null}

                        {busy ? <TranscribeProgress job={state} modelName={jobModelName} onCancel={job.cancel} /> : null}

                        <div className="grid gap-4 border-t border-foreground/10 pt-4">
                            <button
                                type="button"
                                onClick={() => update({ moreOpen: !options.moreOpen })}
                                aria-expanded={options.moreOpen}
                                className="flex w-full items-center justify-between gap-3 text-left"
                            >
                                <span className="flex min-w-0 flex-wrap items-center gap-2">
                                    <Settings2 className="size-4 shrink-0" />
                                    <span className="text-sm font-semibold">Mais opções</span>
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
                                        label="Começar assim que soltar o arquivo"
                                        helper="Vale para soltar, escolher, colar (Ctrl+V) ou parar a gravação do microfone."
                                    />

                                    <OptionGroup title="Modelo e precisão">
                                        <div className="grid gap-2 md:max-w-md">
                                            <SelectField
                                                label="Modelo exato"
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
                                                label="Tempo por palavra"
                                                helper="Guarda o tempo de cada palavra no JSON. Fica um pouco mais lento."
                                            />
                                            <CheckboxRow
                                                checked={options.vad}
                                                onChange={(vad) => update({ vad })}
                                                label="Filtrar silêncio"
                                                helper="Pula os trechos sem fala. Deixa mais rápido."
                                            />
                                            <CheckboxRow
                                                checked={options.translate}
                                                onChange={(translate) => update({ translate })}
                                                label="Traduzir para inglês"
                                                helper="O texto sai em inglês. Usa sempre a Máxima qualidade."
                                            />
                                        </div>
                                    </OptionGroup>

                                    <OptionGroup title="Quem fala">
                                        <CheckboxRow
                                            checked={options.diarize}
                                            onChange={(diarize) => update({ diarize })}
                                            label="Separar quem fala (diarização)"
                                            helper="Precisa de um token da Hugging Face e de aceitar os termos do pyannote no site dela. Fica bem mais lenta."
                                        />
                                        {options.diarize ? (
                                            <div className="grid gap-3 md:grid-cols-2">
                                                <TextField
                                                    label="Mínimo de pessoas"
                                                    value={minSpeakers}
                                                    onChange={setMinSpeakers}
                                                    placeholder="automático"
                                                    type="number"
                                                />
                                                <TextField
                                                    label="Máximo de pessoas"
                                                    value={maxSpeakers}
                                                    onChange={setMaxSpeakers}
                                                    placeholder="automático"
                                                    type="number"
                                                />
                                            </div>
                                        ) : null}
                                        <TextField
                                            label="Token da Hugging Face (para separar quem fala)"
                                            value={hfToken}
                                            onChange={setHfToken}
                                            placeholder="hf_..."
                                            type="password"
                                        />
                                    </OptionGroup>

                                    <OptionGroup title="Arquivos gerados">
                                        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                                            {FORMAT_OPTIONS.map((format) => (
                                                <CheckboxRow
                                                    key={format.key}
                                                    checked={format.key === "txt" || options.formats[format.key]}
                                                    onChange={(checked) => {
                                                        if (format.key !== "txt") update({ formats: { ...options.formats, [format.key]: checked } })
                                                    }}
                                                    label={format.label}
                                                    helper={format.helper}
                                                />
                                            ))}
                                        </div>
                                    </OptionGroup>

                                    <OptionGroup title="Outras fontes">
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <TextField
                                                label="Caminho no computador"
                                                value={localPath}
                                                onChange={changePath}
                                                placeholder="C:\Users\zywl\Downloads\video.mp4"
                                            />
                                            <TextField
                                                label="Link do YouTube ou de outro site"
                                                value={url}
                                                onChange={changeUrl}
                                                placeholder="https://www.youtube.com/watch?v=..."
                                            />
                                        </div>
                                        <p className="app-faint text-xs leading-5">
                                            O caminho lê o arquivo direto do disco, sem enviar: bom para vídeos grandes. Vale a última fonte que você
                                            escolheu ou preencheu.
                                        </p>
                                        <div className="flex flex-wrap items-center gap-3">
                                            {recorder.recording ? (
                                                <Button type="button" variant="outline" onClick={recorder.stop}>
                                                    <Square className="size-4" />
                                                    Parar ({formatClock(recorder.seconds)})
                                                </Button>
                                            ) : (
                                                <Button type="button" variant="outline" onClick={recorder.start}>
                                                    <Mic className="size-4" />
                                                    Gravar do microfone
                                                </Button>
                                            )}
                                            <span className="app-faint text-xs">
                                                A gravação vira um arquivo e segue o mesmo caminho de um arquivo solto aqui.
                                            </span>
                                        </div>
                                    </OptionGroup>

                                    <CompleteModeFields settings={complete} onChange={updateComplete} />

                                    {capabilities ? (
                                        <OptionGroup title="O que está instalado">
                                            <div className="flex flex-wrap gap-2">
                                                <CapabilityPill label="ffmpeg" ok={capabilities.ffmpeg} />
                                                <CapabilityPill label="Tempo por palavra" ok={capabilities.whisperx} />
                                                <CapabilityPill label="Diarização" ok={capabilities.diarization} />
                                            </div>
                                        </OptionGroup>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </Panel>
            </motion.div>

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
                <CompletePackagePanel key={state.jobId} jobId={state.jobId} initial={state.complete} />
            ) : null}

            {state.phase === "done" && state.jobId ? (
                <SummaryPanel
                    key={state.jobId}
                    jobId={state.jobId}
                    language={state.language ?? (options.language === "auto" ? undefined : options.language)}
                    fileBase={fileBase}
                />
            ) : null}
        </div>
    )
}
