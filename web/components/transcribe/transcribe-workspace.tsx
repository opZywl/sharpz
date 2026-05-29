"use client"

import { motion } from "framer-motion"
import {
    Archive,
    Captions,
    Check,
    ChevronDown,
    Clipboard,
    ClipboardCheck,
    Download,
    Loader2,
    Play,
    Settings2,
    Users,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
    downloadUrl,
    getCapabilities,
    getModels,
    openStream,
    startTranscription,
    type TranscribeCapabilities,
    type TranscribeEvent,
    type TranscribeModel,
    type TranscribeSegment,
} from "@/lib/transcribe-api"

type Status = "idle" | "running" | "done" | "error"

interface ModelOption {
    value: string
    label: string
}

interface LanguageOption {
    value: string
    label: string
}

const cardEnter = {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const },
}

const DEFAULT_MODEL = "large-v3"
const HF_TOKEN_KEY = "cleanup-image.hf-token"

const MEDIA_ACCEPT = ".mp4,.mkv,.mov,.webm,.mp3,.wav,.m4a,video/*,audio/*"

const baseModels: Array<{ key: string; label: string }> = [
    { key: "tiny", label: "Tiny" },
    { key: "base", label: "Base" },
    { key: "small", label: "Small" },
    { key: "medium", label: "Medium" },
    { key: "large-v2", label: "Large v2" },
    { key: "large-v3", label: "Large v3" },
    { key: "large-v3-turbo", label: "Large v3 Turbo" },
    { key: "distil-large-v3", label: "Distil Large v3" },
]

const languageOptions: LanguageOption[] = [
    { value: "auto", label: "Detectar (auto)" },
    { value: "pt", label: "Portugues" },
    { value: "en", label: "Ingles" },
    { value: "es", label: "Espanhol" },
    { value: "fr", label: "Frances" },
    { value: "de", label: "Alemao" },
    { value: "it", label: "Italiano" },
]

const formatLabels: Array<{ key: string; label: string }> = [
    { key: "txt", label: "TXT" },
    { key: "srt", label: "SRT" },
    { key: "vtt", label: "VTT" },
    { key: "json", label: "JSON" },
    { key: "lrc", label: "LRC" },
]

function formatBytes(bytes: number) {
    if (!bytes) return "0 KB"
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatTimecode(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00"
    const total = Math.floor(seconds)
    const minutes = Math.floor(total / 60)
    const secs = total % 60
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
}

function DashboardShell({
    children,
    className,
    innerClassName,
}: {
    children: React.ReactNode
    className?: string
    innerClassName?: string
}) {
    return (
        <div className={cn("dashboard-shell", className)}>
            <div className={cn("dashboard-inner", innerClassName)}>
                <div className="dashboard-dot-layer" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
                <div className="relative z-10">{children}</div>
            </div>
        </div>
    )
}

function Panel({
    title,
    subtitle,
    icon: Icon,
    children,
    className,
}: {
    title: string
    subtitle?: string
    icon?: typeof Captions
    children: React.ReactNode
    className?: string
}) {
    return (
        <DashboardShell className={className} innerClassName="p-4 sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        {Icon ? (
                            <span className="panel-icon size-8 shrink-0 rounded-lg">
                                <Icon className="size-4" />
                            </span>
                        ) : null}
                        <h2 className="font-jakarta text-lg font-extrabold uppercase leading-none tracking-tight">
                            {title}
                        </h2>
                    </div>
                    {subtitle ? <p className="app-muted mt-2 text-sm leading-5">{subtitle}</p> : null}
                </div>
            </div>
            {children}
        </DashboardShell>
    )
}

function SelectField<T extends string>({
    label,
    value,
    options,
    onChange,
    className,
}: {
    label: string
    value: T
    options: Array<{ value: T; label: string }>
    onChange: (value: T) => void
    className?: string
}) {
    const [open, setOpen] = useState(false)
    const current = options.find((option) => option.value === value) ?? options[0]

    return (
        <div
            className={cn("relative flex min-w-0 flex-col gap-2", className)}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setOpen(false)
                }
            }}
        >
            <span className="field-label">{label}</span>
            <button
                type="button"
                className="field-control flex w-full min-w-0 items-center justify-between gap-3 px-3 text-left text-xs font-bold uppercase tracking-[0.12em]"
                onClick={() => setOpen((next) => !next)}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className="min-w-0 truncate">{current?.label ?? value}</span>
                <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
            </button>
            {open ? (
                <div className="select-menu" role="listbox">
                    {options.map((option) => {
                        const selected = option.value === value
                        return (
                            <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                data-active={selected}
                                className="select-option"
                                onClick={() => {
                                    onChange(option.value)
                                    setOpen(false)
                                }}
                            >
                                <span className="min-w-0 truncate">{option.label}</span>
                                {selected ? <Check className="size-3.5 shrink-0" /> : null}
                            </button>
                        )
                    })}
                </div>
            ) : null}
        </div>
    )
}

function TextField({
    label,
    value,
    onChange,
    placeholder,
    type = "text",
}: {
    label: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
    type?: string
}) {
    return (
        <label className="flex min-w-0 flex-col gap-2">
            <span className="field-label">{label}</span>
            <input
                type={type}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                className="app-input text-sm"
            />
        </label>
    )
}

function CheckboxRow({
    checked,
    onChange,
    label,
    helper,
}: {
    checked: boolean
    onChange: (checked: boolean) => void
    label: string
    helper?: string
}) {
    return (
        <label className="checkbox-row flex cursor-pointer items-center gap-3 transition-colors">
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                className="size-4 rounded accent-foreground"
            />
            <span className="min-w-0">
                <span className="block text-sm font-semibold">{label}</span>
                {helper ? <span className="app-faint block text-xs">{helper}</span> : null}
            </span>
        </label>
    )
}

function Metric({
    label,
    value,
    helper,
}: {
    label: string
    value: string
    helper?: string
}) {
    return (
        <div className="metric-tile">
            <div className="app-faint text-[10px] font-semibold uppercase tracking-[0.2em]">{label}</div>
            <div className="mt-1 font-jakarta text-xl font-extrabold leading-none">{value}</div>
            {helper ? <div className="app-faint mt-1 truncate text-xs">{helper}</div> : null}
        </div>
    )
}

function EmptyState({ text }: { text: string }) {
    return (
        <div className="empty-state px-4 py-10 text-center">
            <Captions className="app-faint mx-auto size-8" />
            <p className="app-muted mt-3 text-sm">{text}</p>
        </div>
    )
}

function MediaField({
    file,
    onChange,
    label,
    helper,
}: {
    file: File | null
    onChange: (file: File | null) => void
    label: string
    helper: string
}) {
    return (
        <div className="dropzone-shell rounded-xl p-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg px-4 py-8 text-center">
                <input
                    type="file"
                    accept={MEDIA_ACCEPT}
                    className="hidden"
                    onChange={(event) => onChange(event.target.files?.[0] ?? null)}
                />
                <span className="dropzone-icon grid size-12 place-items-center rounded-full">
                    <Archive className="size-5" />
                </span>
                <span>
                    <span className="block text-sm font-semibold">{file?.name ?? label}</span>
                    <span className="app-faint mt-1 block text-xs">{file ? formatBytes(file.size) : helper}</span>
                </span>
            </label>
            {file ? (
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => onChange(null)}>
                    Limpar arquivo
                </Button>
            ) : null}
        </div>
    )
}

export function TranscribeWorkspace() {
    const [models, setModels] = useState<TranscribeModel[]>([])
    const [capabilities, setCapabilities] = useState<TranscribeCapabilities | null>(null)

    const [file, setFile] = useState<File | null>(null)
    const [localPath, setLocalPath] = useState("")

    const [model, setModel] = useState(DEFAULT_MODEL)
    const [language, setLanguage] = useState("auto")
    const [diarize, setDiarize] = useState(false)
    const [wordTimestamps, setWordTimestamps] = useState(false)
    const [vad, setVad] = useState(true)
    const [translate, setTranslate] = useState(false)
    const [minSpeakers, setMinSpeakers] = useState("")
    const [maxSpeakers, setMaxSpeakers] = useState("")
    const [hfToken, setHfToken] = useState("")
    const [formats, setFormats] = useState<Record<string, boolean>>({
        txt: true,
        srt: true,
        vtt: false,
        json: false,
        lrc: false,
    })

    const [status, setStatus] = useState<Status>("idle")
    const [pct, setPct] = useState(0)
    const [stage, setStage] = useState<string>("")
    const [segments, setSegments] = useState<TranscribeSegment[]>([])
    const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null)
    const [duration, setDuration] = useState<number | null>(null)
    const [elapsed, setElapsed] = useState<number | null>(null)
    const [degraded, setDegraded] = useState<string[]>([])
    const [resultFiles, setResultFiles] = useState<Record<string, string>>({})
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [jobId, setJobId] = useState<string | null>(null)

    const sourceRef = useRef<EventSource | null>(null)
    const segmentsEndRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        let cancelled = false

        async function load() {
            try {
                const [modelsData, capabilitiesData] = await Promise.all([getModels(), getCapabilities()])
                if (cancelled) return
                setModels(modelsData)
                setCapabilities(capabilitiesData)
                const defaultModel = modelsData.find((entry) => entry.is_default)?.key
                if (defaultModel) setModel(defaultModel)
                else if (capabilitiesData.default_model) setModel(capabilitiesData.default_model)
            } catch {
                if (!cancelled) {
                    setModels([])
                    setCapabilities(null)
                }
            }
        }

        load()
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        try {
            const saved = window.localStorage.getItem(HF_TOKEN_KEY)
            if (saved) setHfToken(saved)
        } catch {
            // ignora indisponibilidade de localStorage
        }
    }, [])

    useEffect(() => {
        try {
            window.localStorage.setItem(HF_TOKEN_KEY, hfToken)
        } catch {
            // ignora indisponibilidade de localStorage
        }
    }, [hfToken])

    useEffect(() => {
        return () => {
            sourceRef.current?.close()
        }
    }, [])

    useEffect(() => {
        segmentsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }, [segments.length])

    const modelOptions: ModelOption[] = useMemo(() => {
        const downloadedByKey = new Map(models.map((entry) => [entry.key, entry.downloaded]))
        return baseModels.map((entry) => ({
            value: entry.key,
            label: downloadedByKey.get(entry.key) ? `${entry.label} (baixado)` : entry.label,
        }))
    }, [models])

    const selectedFormats = useMemo(
        () => formatLabels.filter((entry) => formats[entry.key]).map((entry) => entry.key),
        [formats],
    )

    const transcriptText = useMemo(
        () => segments.map((segment) => segment.text.trim()).filter(Boolean).join("\n"),
        [segments],
    )

    function resetJobState() {
        setStatus("running")
        setPct(0)
        setStage("queued")
        setSegments([])
        setDetectedLanguage(null)
        setDuration(null)
        setElapsed(null)
        setDegraded([])
        setResultFiles({})
        setError(null)
        setCopied(false)
    }

    function handleEvent(event: TranscribeEvent) {
        if (event.type === "meta") {
            if (typeof event.language === "string") setDetectedLanguage(event.language)
            if (typeof event.duration === "number") setDuration(event.duration)
            return
        }
        if (event.type === "progress") {
            if (typeof event.pct === "number") setPct(event.pct)
            if (typeof event.stage === "string") setStage(event.stage)
            return
        }
        if (event.type === "stage") {
            if (typeof event.stage === "string") setStage(event.stage)
            return
        }
        if (event.type === "segment") {
            const segment: TranscribeSegment = {
                id: typeof event.id === "number" ? event.id : undefined,
                start: typeof event.start === "number" ? event.start : 0,
                end: typeof event.end === "number" ? event.end : 0,
                text: typeof event.text === "string" ? event.text : "",
                speaker: typeof event.speaker === "string" ? event.speaker : null,
            }
            setSegments((current) => [...current, segment])
            return
        }
        if (event.type === "done") {
            if (event.files && typeof event.files === "object") {
                setResultFiles(event.files as Record<string, string>)
            }
            if (Array.isArray(event.degraded)) setDegraded(event.degraded as string[])
            if (typeof event.elapsed === "number") setElapsed(event.elapsed)
            setPct(1)
            setStage("done")
            setStatus("done")
            sourceRef.current?.close()
            sourceRef.current = null
            return
        }
        if (event.type === "error") {
            setError(typeof event.message === "string" ? event.message : "Erro durante a transcricao.")
            setStatus("error")
            sourceRef.current?.close()
            sourceRef.current = null
        }
    }

    async function handleTranscribe() {
        if (!file && !localPath.trim()) {
            setError("Carregue um arquivo de video/audio ou informe um caminho local.")
            return
        }
        if (!selectedFormats.length) {
            setError("Selecione ao menos um formato de saida.")
            return
        }

        sourceRef.current?.close()
        sourceRef.current = null
        resetJobState()

        try {
            const form = new FormData()
            if (file) form.append("file", file)
            if (localPath.trim()) form.append("local_path", localPath.trim())
            form.append("model", model)
            form.append("language", language)
            form.append("formats", selectedFormats.join(","))
            form.append("vad", String(vad))
            form.append("word_timestamps", String(wordTimestamps))
            form.append("diarize", String(diarize))
            form.append("translate", String(translate))
            if (hfToken.trim()) form.append("hf_token", hfToken.trim())
            if (diarize && minSpeakers.trim()) form.append("min_speakers", minSpeakers.trim())
            if (diarize && maxSpeakers.trim()) form.append("max_speakers", maxSpeakers.trim())

            const { job_id } = await startTranscription(form)
            setJobId(job_id)
            sourceRef.current = openStream(job_id, handleEvent)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro inesperado ao iniciar a transcricao.")
            setStatus("error")
        }
    }

    async function handleCopy() {
        if (!transcriptText) return
        try {
            await navigator.clipboard.writeText(transcriptText)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1800)
        } catch {
            setError("Nao foi possivel copiar para a area de transferencia.")
        }
    }

    const running = status === "running"
    const availableFiles = Object.keys(resultFiles)

    return (
        <div className="space-y-4">
            {error ? (
                <div className="app-alert rounded-xl px-4 py-3 text-sm">
                    <div className="flex gap-2">
                        <Captions className="mt-0.5 size-4 shrink-0" />
                        <span className="whitespace-pre-wrap">{error}</span>
                    </div>
                </div>
            ) : null}

            <motion.div {...cardEnter} className="grid gap-4 xl:grid-cols-[minmax(290px,0.72fr)_minmax(0,1.28fr)]">
                <Panel title="Fonte" subtitle="Aceita video ou audio. Use o caminho local para arquivos grandes." icon={Captions}>
                    <div className="grid gap-4">
                        <MediaField
                            file={file}
                            onChange={setFile}
                            label="Escolher video/audio"
                            helper="mp4, mkv, mov, webm, mp3, wav, m4a"
                        />
                        <TextField
                            label="Caminho local (alternativo)"
                            value={localPath}
                            onChange={setLocalPath}
                            placeholder="C:/Users/zywl/Downloads/video.mp4"
                        />
                        {capabilities ? (
                            <div className="grid gap-2">
                                <div className="status-card flex items-center justify-between rounded-xl px-3 py-2">
                                    <span className="app-faint text-xs font-semibold uppercase tracking-[0.16em]">ffmpeg</span>
                                    <span className="status-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]" data-tone={capabilities.ffmpeg ? "good" : "bad"}>
                                        {capabilities.ffmpeg ? "ok" : "missing"}
                                    </span>
                                </div>
                                <div className="status-card flex items-center justify-between rounded-xl px-3 py-2">
                                    <span className="app-faint text-xs font-semibold uppercase tracking-[0.16em]">whisperx</span>
                                    <span className="status-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]" data-tone={capabilities.whisperx ? "good" : "bad"}>
                                        {capabilities.whisperx ? "ok" : "missing"}
                                    </span>
                                </div>
                                <div className="status-card flex items-center justify-between rounded-xl px-3 py-2">
                                    <span className="app-faint text-xs font-semibold uppercase tracking-[0.16em]">diarizacao</span>
                                    <span className="status-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]" data-tone={capabilities.diarization ? "good" : "bad"}>
                                        {capabilities.diarization ? "ok" : "missing"}
                                    </span>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </Panel>

                <Panel title="Opcoes de transcricao" subtitle="Modelo, idioma, diarizacao, timestamps e formatos de saida." icon={Settings2}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 md:grid-cols-2">
                            <SelectField label="Modelo" value={model} options={modelOptions} onChange={setModel} />
                            <SelectField label="Idioma" value={language} options={languageOptions} onChange={setLanguage} />
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                            <CheckboxRow checked={diarize} onChange={setDiarize} label="Diarizacao (identificar locutores)" helper="Requer whisperx + token HuggingFace." />
                            <CheckboxRow checked={wordTimestamps} onChange={setWordTimestamps} label="Timestamps por palavra" helper="Alinhamento fino por palavra." />
                            <CheckboxRow checked={vad} onChange={setVad} label="Filtrar silencio (VAD)" helper="Remove trechos sem fala." />
                            <CheckboxRow checked={translate} onChange={setTranslate} label="Traduzir para ingles" helper="Saida em ingles." />
                        </div>

                        {diarize ? (
                            <div className="grid gap-3 md:grid-cols-2">
                                <TextField label="Min locutores" value={minSpeakers} onChange={setMinSpeakers} placeholder="auto" type="number" />
                                <TextField label="Max locutores" value={maxSpeakers} onChange={setMaxSpeakers} placeholder="auto" type="number" />
                            </div>
                        ) : null}

                        <div className="grid gap-2">
                            <span className="field-label">Formatos de saida</span>
                            <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-5">
                                {formatLabels.map((entry) => (
                                    <CheckboxRow
                                        key={entry.key}
                                        checked={Boolean(formats[entry.key])}
                                        onChange={(checked) => setFormats((current) => ({ ...current, [entry.key]: checked }))}
                                        label={entry.label}
                                    />
                                ))}
                            </div>
                        </div>

                        <TextField
                            label="Token HuggingFace (opcional, p/ diarizacao)"
                            value={hfToken}
                            onChange={setHfToken}
                            placeholder="hf_..."
                            type="password"
                        />

                        <Button onClick={handleTranscribe} disabled={running} size="lg" className="w-full">
                            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                            Transcrever
                        </Button>
                    </div>
                </Panel>
            </motion.div>

            <motion.div {...cardEnter}>
                <Panel title="Resultado" subtitle="Progresso, segmentos ao vivo e downloads ficam aqui." icon={Users}>
                    {status === "idle" ? (
                        <EmptyState text="Configure as opcoes e clique em Transcrever para iniciar." />
                    ) : (
                        <div className="space-y-4">
                            {status === "running" || status === "done" ? (
                                <div className="grid gap-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="app-faint font-semibold uppercase tracking-[0.16em]">{stage || "processando"}</span>
                                        <span className="font-jakarta font-extrabold">{Math.round(pct * 100)}%</span>
                                    </div>
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
                                        <div
                                            className="h-full rounded-full bg-foreground/70 transition-all"
                                            style={{ width: `${Math.min(100, Math.max(0, pct * 100))}%` }}
                                        />
                                    </div>
                                </div>
                            ) : null}

                            {status === "done" ? (
                                <div className="grid gap-3 md:grid-cols-4">
                                    <Metric label="Idioma" value={detectedLanguage ?? "n/a"} />
                                    <Metric label="Duracao" value={duration != null ? formatTimecode(duration) : "n/a"} />
                                    <Metric label="Tempo" value={elapsed != null ? `${elapsed.toFixed(1)}s` : "n/a"} />
                                    <Metric label="Segmentos" value={String(segments.length)} helper={degraded.length ? `degradado: ${degraded.join(", ")}` : undefined} />
                                </div>
                            ) : null}

                            {degraded.length ? (
                                <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
                                    Etapas degradadas: {degraded.join(", ")}. A transcricao base foi gerada mesmo assim.
                                </div>
                            ) : null}

                            <div className="preview-card max-h-[420px] overflow-auto p-3">
                                {segments.length ? (
                                    <div className="grid gap-1.5">
                                        {segments.map((segment, index) => (
                                            <div key={`${segment.id ?? index}-${segment.start}`} className="rounded-lg px-2 py-1.5">
                                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                                    <code className="app-codeblock rounded px-1.5 py-0.5 font-semibold">
                                                        [{formatTimecode(segment.start)}]
                                                    </code>
                                                    {segment.speaker ? (
                                                        <span className="status-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]">
                                                            {segment.speaker}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <p className="mt-1 text-sm leading-5">{segment.text.trim()}</p>
                                            </div>
                                        ))}
                                        <div ref={segmentsEndRef} />
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center gap-2 px-4 py-10 text-center">
                                        <Loader2 className="size-4 animate-spin" />
                                        <span className="app-muted text-sm">Aguardando os primeiros segmentos...</span>
                                    </div>
                                )}
                            </div>

                            {status === "done" ? (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button type="button" variant="outline" onClick={handleCopy} disabled={!transcriptText}>
                                        {copied ? <ClipboardCheck className="size-4" /> : <Clipboard className="size-4" />}
                                        {copied ? "Copiado" : "Copiar texto"}
                                    </Button>
                                    {jobId
                                        ? availableFiles.map((format) => (
                                              <Button key={format} asChild variant="outline">
                                                  <a href={downloadUrl(jobId, format)}>
                                                      <Download className="size-4" />
                                                      {format.toUpperCase()}
                                                  </a>
                                              </Button>
                                          ))
                                        : null}
                                </div>
                            ) : null}
                        </div>
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
