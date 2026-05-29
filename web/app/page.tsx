"use client"

import { motion } from "framer-motion"
import {
    Activity,
    AlertTriangle,
    Archive,
    AudioLines,
    Box,
    Check,
    CheckCircle2,
    ChevronDown,
    Cpu,
    Download,
    FileCode2,
    FolderOpen,
    FolderSync,
    Gauge,
    ImagePlus,
    Layers,
    Loader2,
    PackageCheck,
    Play,
    RefreshCw,
    Scissors,
    Search,
    Server,
    Settings2,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    Wand2,
    type LucideIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Dropzone } from "@/components/dropzone"
import { ThemeToggle } from "@/components/theme-toggle"
import { TranscribeWorkspace } from "@/components/transcribe/transcribe-workspace"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

type Workspace =
    | "pipeline"
    | "clean"
    | "svg"
    | "batch-pipeline"
    | "ktx-single"
    | "ktx-batch"
    | "ktx-orientation"
    | "portfolio-ktx"
    | "transcribe"
    | "system"
type Method = "auto" | "ai" | "luma_dark" | "luma_light" | "none"
type ColorMode = "color" | "binary"
type Hierarchical = "stacked" | "cutout"
type PathMode = "spline" | "polygon" | "none"

interface ModelInfo {
    key: string
    label: string
    is_default: boolean
}

interface PipelineResult {
    cleaned_png_b64: string
    svg_with_bg: string
    svg_clean: string
    svg_with_bg_preview_b64: string
    svg_clean_preview_b64: string
    method_used: string
    elapsed_ms: number
    image_width: number
    image_height: number
}

interface CleanResult {
    cleaned_png_b64: string
    method_used: string
    elapsed_ms: number
    image_width: number
    image_height: number
}

interface SvgResult {
    svg_with_bg: string
    svg_clean: string
    svg_with_bg_preview_b64: string
    svg_clean_preview_b64: string
    elapsed_ms: number
    image_width: number
    image_height: number
    svg_with_bg_bytes: number
    svg_clean_bytes: number
}

interface KtxPreset {
    key: string
    label: string
    is_default: boolean
}

interface KtxSingleResult {
    success: boolean
    summary: string
    filename: string | null
    ktx_b64: string | null
    duration_ms: number
    size_input: number
    size_output: number
    ratio: number
}

interface KtxBatchResult {
    success: boolean
    summary: string
    input_count: number
    output_dir: string | null
}

interface BatchPipelineFile {
    input_path: string
    success: boolean
    outputs: string[]
    method_used: string | null
    duration_ms: number
    error: string | null
}

interface BatchPipelineResult {
    success: boolean
    summary: string
    total: number
    success_count: number
    failure_count: number
    output_dir: string | null
    files: BatchPipelineFile[]
}

interface KtxPatchResult {
    success: boolean
    summary: string
    filename: string | null
    ktx_b64: string | null
    saved_path: string | null
    size_input: number
    size_output: number
}

interface PortfolioKtxResult {
    success: boolean
    summary: string
    filename: string | null
    ktx_b64: string | null
    saved_path: string | null
    duration_ms: number
    size_input: number
    size_output: number
    target_width: number
    target_height: number
}

interface CapabilityInfo {
    status: string
    models_count: number
    toktx_found: boolean
    alktx2_found: boolean
    default_model: string
    default_ktx_preset: string
    modules: string[]
    endpoints: string[]
}

const DEFAULT_MODEL = "birefnet-general"
const DEFAULT_KTX_PRESET = "ultra"

const workspaces: Array<{
    id: Workspace
    title: string
    label: string
    description: string
    icon: LucideIcon
    accent: string
}> = [
    {
        id: "pipeline",
        title: "Pipeline",
        label: "Clean + SVG",
        description: "Remove fundo, gera PNG transparente e dois SVGs em um fluxo.",
        icon: Wand2,
        accent: "text-emerald-500 dark:text-emerald-200",
    },
    {
        id: "clean",
        title: "Remover Fundo",
        label: "PNG alpha",
        description: "Controle completo de AI, luma keying, alpha matting e cor final.",
        icon: Scissors,
        accent: "text-zinc-700 dark:text-stone-100",
    },
    {
        id: "svg",
        title: "PNG -> SVG",
        label: "Vtracer",
        description: "Todos os parametros de vetor, hierarquia, spline e precisao.",
        icon: FileCode2,
        accent: "text-amber-600 dark:text-amber-200",
    },
    {
        id: "batch-pipeline",
        title: "Batch Pipeline",
        label: "Pastas PNG/SVG",
        description: "Executa o mesmo fluxo do CLI em pastas locais, com PNG, SVG ou apenas vetor.",
        icon: FolderOpen,
        accent: "text-violet-600 dark:text-violet-200",
    },
    {
        id: "ktx-single",
        title: "PNG -> KTX",
        label: "Single",
        description: "Converte um upload para KTX2 com presets do pipeline 3D.",
        icon: Box,
        accent: "text-sky-600 dark:text-sky-200",
    },
    {
        id: "ktx-batch",
        title: "Batch KTX",
        label: "Pastas",
        description: "Converte uma pasta local inteira de PNG/JPG para KTX2.",
        icon: FolderSync,
        accent: "text-orange-600 dark:text-orange-200",
    },
    {
        id: "ktx-orientation",
        title: "Patch KTX",
        label: "KTXorientation",
        description: "Injeta KTXorientation=rd em arquivos KTX2 gerados por ferramentas que nao escrevem esse KV.",
        icon: ShieldCheck,
        accent: "text-lime-600 dark:text-lime-200",
    },
    {
        id: "portfolio-ktx",
        title: "Portfolio KTX",
        label: "960 x 540",
        description: "Converte imagens para o formato fixo usado no portfolio 3D, com canvas 960x540 e orientation patch.",
        icon: PackageCheck,
        accent: "text-cyan-600 dark:text-cyan-200",
    },
    {
        id: "transcribe",
        title: "Transcricao",
        label: "Video -> Texto",
        description: "Transcreve video ou audio com Whisper, com diarizacao, timestamps por palavra e exportacao em varios formatos.",
        icon: AudioLines,
        accent: "text-rose-600 dark:text-rose-200",
    },
    {
        id: "system",
        title: "Sistema",
        label: "Status",
        description: "Mostra modulos carregados, endpoints expostos, modelos AI e ferramentas KTX disponiveis.",
        icon: Server,
        accent: "text-zinc-700 dark:text-zinc-100",
    },
]

const methodOptions: Array<{ value: Method; label: string }> = [
    { value: "auto", label: "Auto" },
    { value: "luma_dark", label: "Luma dark" },
    { value: "luma_light", label: "Luma light" },
    { value: "ai", label: "AI" },
    { value: "none", label: "Sem remocao" },
]

const colorModeOptions: Array<{ value: ColorMode; label: string }> = [
    { value: "color", label: "Color" },
    { value: "binary", label: "Binary" },
]

const hierarchicalOptions: Array<{ value: Hierarchical; label: string }> = [
    { value: "stacked", label: "Stacked" },
    { value: "cutout", label: "Cutout" },
]

const pathModeOptions: Array<{ value: PathMode; label: string }> = [
    { value: "spline", label: "Spline" },
    { value: "polygon", label: "Polygon" },
    { value: "none", label: "None" },
]

const cardEnter = {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const },
}

function pngData(base64: string) {
    return `data:image/png;base64,${base64}`
}

function svgData(svg: string) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function ktxData(base64: string) {
    return `data:application/octet-stream;base64,${base64}`
}

function appendFields(fd: FormData, fields: Record<string, string | number | boolean>) {
    Object.entries(fields).forEach(([key, value]) => fd.append(key, String(value)))
}

async function postForm<T>(url: string, fd: FormData): Promise<T> {
    const response = await fetch(url, { method: "POST", body: fd })
    if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `HTTP ${response.status}`)
    }
    return (await response.json()) as T
}

function formatBytes(bytes: number) {
    if (!bytes) return "0 KB"
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
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
        <div
            className={cn(
                "dashboard-shell",
                className,
            )}
        >
            <div
                className={cn(
                    "dashboard-inner",
                    innerClassName,
                )}
            >
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
    icon?: LucideIcon
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

function ColorField({
    label,
    value,
    onChange,
}: {
    label: string
    value: string
    onChange: (value: string) => void
}) {
    return (
        <label className="flex min-w-0 flex-col gap-2">
            <span className="field-label">{label}</span>
            <span className="field-control flex items-center gap-3 px-3">
                <input
                    type="color"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className="h-7 w-11 cursor-pointer rounded-md border-0 bg-transparent p-0"
                />
                <code className="text-xs font-semibold uppercase tracking-[0.12em]">{value}</code>
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

function PreviewTile({
    title,
    subtitle,
    src,
    downloadHref,
    downloadName,
    transparent,
}: {
    title: string
    subtitle?: string
    src: string
    downloadHref: string
    downloadName: string
    transparent?: boolean
}) {
    return (
        <div className="preview-card">
            <div className="preview-head flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{title}</div>
                    {subtitle ? <div className="app-faint truncate text-xs">{subtitle}</div> : null}
                </div>
                <Button asChild size="sm" variant="outline">
                    <a href={downloadHref} download={downloadName}>
                        <Download className="size-3.5" />
                        Baixar
                    </a>
                </Button>
            </div>
            <div className={cn("preview-body relative flex aspect-square items-center justify-center", transparent && "checker")}>
                <img src={src} alt={title} className="absolute inset-0 size-full object-contain p-3" />
            </div>
        </div>
    )
}

function EmptyState({ text }: { text: string }) {
    return (
        <div className="empty-state px-4 py-10 text-center">
            <ImagePlus className="app-faint mx-auto size-8" />
            <p className="app-muted mt-3 text-sm">{text}</p>
        </div>
    )
}

function FileField({
    file,
    onChange,
    accept,
    label,
    helper,
}: {
    file: File | null
    onChange: (file: File | null) => void
    accept: string
    label: string
    helper: string
}) {
    return (
        <div className="dropzone-shell rounded-xl p-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg px-4 py-8 text-center">
                <input
                    type="file"
                    accept={accept}
                    className="hidden"
                    onChange={(event) => onChange(event.target.files?.[0] ?? null)}
                />
                <span className="dropzone-icon grid size-12 place-items-center rounded-full">
                    <Archive className="size-5" />
                </span>
                <span>
                    <span className="block text-sm font-semibold">{file?.name ?? label}</span>
                    <span className="app-faint mt-1 block text-xs">
                        {file ? formatBytes(file.size) : helper}
                    </span>
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

export default function Page() {
    const [active, setActive] = useState<Workspace>("pipeline")
    const [search, setSearch] = useState("")
    const [file, setFile] = useState<File | null>(null)
    const [ktxFile, setKtxFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [busy, setBusy] = useState<Workspace | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking")

    const [models, setModels] = useState<ModelInfo[]>([])
    const [ktxPresets, setKtxPresets] = useState<KtxPreset[]>([])
    const [toktxFound, setToktxFound] = useState<boolean | null>(null)
    const [capabilities, setCapabilities] = useState<CapabilityInfo | null>(null)

    const [pipeline, setPipeline] = useState({
        method: "auto" as Method,
        model: DEFAULT_MODEL,
        lumaLow: 0.04,
        lumaHigh: 0.95,
        lumaUnpremultiply: true,
        lumaDenoise: 0,
        lumaGamma: 1,
        saturation: 1.15,
        contrast: 1,
        colorMode: "color" as ColorMode,
        filterSpeckle: 2,
        colorPrecision: 8,
        upscale: 1,
        flattenColor: "#000000",
    })

    const [clean, setClean] = useState({
        method: "auto" as Method,
        model: DEFAULT_MODEL,
        alphaMatting: true,
        fgThreshold: 240,
        bgThreshold: 10,
        erodeSize: 10,
        lumaLow: 0.04,
        lumaHigh: 0.95,
        lumaUnpremultiply: true,
        lumaDenoise: 0,
        lumaGamma: 1,
        saturation: 1,
        contrast: 1,
        brightness: 1,
        edgeSmooth: false,
        useBgColor: false,
        bgColor: "#ffffff",
    })

    const [svg, setSvg] = useState({
        colorMode: "color" as ColorMode,
        hierarchical: "stacked" as Hierarchical,
        pathMode: "spline" as PathMode,
        filterSpeckle: 2,
        colorPrecision: 8,
        layerDifference: 8,
        cornerThreshold: 60,
        lengthThreshold: 4,
        maxIterations: 10,
        spliceThreshold: 45,
        pathPrecision: 10,
        upscale: 1,
        flattenColor: "#000000",
    })

    const [ktxSingle, setKtxSingle] = useState({
        preset: DEFAULT_KTX_PRESET,
        autoAlign: true,
        autoPreset: false,
        validateQuality: false,
    })

    const [ktxBatch, setKtxBatch] = useState({
        folderPath: "",
        outputPath: "",
        preset: DEFAULT_KTX_PRESET,
        recursive: true,
        flatten: false,
        autoAlign: true,
        autoPreset: false,
        validateQuality: false,
        maxWorkers: 4,
    })

    const [batchPipeline, setBatchPipeline] = useState({
        inputPath: "",
        outputPath: "output",
        recursive: true,
        method: "auto" as Method,
        model: DEFAULT_MODEL,
        alphaMatting: true,
        fgThreshold: 240,
        bgThreshold: 10,
        erodeSize: 10,
        lumaLow: 0.04,
        lumaHigh: 0.95,
        lumaUnpremultiply: true,
        lumaDenoise: 0,
        lumaGamma: 1,
        saturation: 1,
        contrast: 1,
        brightness: 1,
        edgeSmooth: false,
        noSvg: false,
        noBgRemoval: false,
        colorMode: "color" as ColorMode,
        hierarchical: "stacked" as Hierarchical,
        pathMode: "spline" as PathMode,
        filterSpeckle: 2,
        colorPrecision: 8,
        layerDifference: 8,
        cornerThreshold: 60,
        lengthThreshold: 4,
        maxIterations: 10,
        spliceThreshold: 45,
        pathPrecision: 10,
        upscale: 1,
        flattenColor: "#000000",
    })

    const [ktxPatch, setKtxPatch] = useState({
        outputName: "",
        outputPath: "",
    })

    const [portfolioKtx, setPortfolioKtx] = useState({
        outputName: "",
        outputPath: "",
    })

    const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null)
    const [cleanResult, setCleanResult] = useState<CleanResult | null>(null)
    const [svgResult, setSvgResult] = useState<SvgResult | null>(null)
    const [ktxSingleResult, setKtxSingleResult] = useState<KtxSingleResult | null>(null)
    const [ktxBatchResult, setKtxBatchResult] = useState<KtxBatchResult | null>(null)
    const [batchPipelineResult, setBatchPipelineResult] = useState<BatchPipelineResult | null>(null)
    const [ktxPatchResult, setKtxPatchResult] = useState<KtxPatchResult | null>(null)
    const [portfolioKtxResult, setPortfolioKtxResult] = useState<PortfolioKtxResult | null>(null)

    useEffect(() => {
        if (!file) {
            setPreviewUrl(null)
            return
        }
        const url = URL.createObjectURL(file)
        setPreviewUrl(url)
        return () => URL.revokeObjectURL(url)
    }, [file])

    useEffect(() => {
        let cancelled = false

        async function loadApi() {
            try {
                const [healthRes, modelsRes, presetsRes, capabilitiesRes] = await Promise.all([
                    fetch("/api/health"),
                    fetch("/api/models"),
                    fetch("/api/ktx/presets"),
                    fetch("/api/capabilities"),
                ])
                if (!healthRes.ok || !modelsRes.ok || !presetsRes.ok || !capabilitiesRes.ok) {
                    throw new Error("API unavailable")
                }
                const modelsData = (await modelsRes.json()) as { models: ModelInfo[] }
                const presetsData = (await presetsRes.json()) as {
                    presets: KtxPreset[]
                    default_preset: string
                    toktx_found: boolean
                }
                const capabilitiesData = (await capabilitiesRes.json()) as CapabilityInfo
                if (cancelled) return
                setApiStatus("online")
                setModels(modelsData.models)
                setKtxPresets(presetsData.presets)
                setToktxFound(presetsData.toktx_found)
                setCapabilities(capabilitiesData)

                const defaultModel = modelsData.models.find((model) => model.is_default)?.key ?? DEFAULT_MODEL
                setPipeline((current) => ({ ...current, model: current.model || defaultModel }))
                setClean((current) => ({ ...current, model: current.model || defaultModel }))
                setBatchPipeline((current) => ({ ...current, model: current.model || defaultModel }))
                setKtxSingle((current) => ({ ...current, preset: current.preset || presetsData.default_preset }))
                setKtxBatch((current) => ({ ...current, preset: current.preset || presetsData.default_preset }))
            } catch {
                if (!cancelled) {
                    setApiStatus("offline")
                    setToktxFound(false)
                }
            }
        }

        loadApi()
        return () => {
            cancelled = true
        }
    }, [])

    const activeMeta = workspaces.find((workspace) => workspace.id === active) ?? workspaces[0]
    const filteredWorkspaces = useMemo(() => {
        const term = search.trim().toLowerCase()
        if (!term) return workspaces
        return workspaces.filter((workspace) =>
            [workspace.title, workspace.label, workspace.description].join(" ").toLowerCase().includes(term),
        )
    }, [search])

    const modelOptions = useMemo(
        () =>
            (models.length ? models : [{ key: DEFAULT_MODEL, label: "BiRefNet General", is_default: true }]).map(
                (model) => ({
                    value: model.key,
                    label: model.is_default ? `${model.key} *` : model.key,
                }),
            ),
        [models],
    )

    const ktxPresetOptions = useMemo(
        () =>
            (ktxPresets.length
                ? ktxPresets
                : [{ key: DEFAULT_KTX_PRESET, label: "ULTRA - UASTC q4 + zcmp22", is_default: true }]
            ).map((preset) => ({
                value: preset.key,
                label: preset.is_default ? `${preset.key} *` : preset.key,
            })),
        [ktxPresets],
    )

    function requireFile() {
        if (!file) {
            setError("Carregue uma imagem antes de executar este modulo.")
            return false
        }
        return true
    }

    async function runPipeline() {
        if (!requireFile() || !file) return
        setBusy("pipeline")
        setError(null)
        try {
            const fd = new FormData()
            fd.append("file", file)
            appendFields(fd, {
                method: pipeline.method,
                model: pipeline.model,
                luma_low: pipeline.lumaLow,
                luma_high: pipeline.lumaHigh,
                luma_unpremultiply: pipeline.lumaUnpremultiply,
                luma_denoise: pipeline.lumaDenoise,
                luma_gamma: pipeline.lumaGamma,
                saturation: pipeline.saturation,
                contrast: pipeline.contrast,
                color_mode: pipeline.colorMode,
                filter_speckle: pipeline.filterSpeckle,
                color_precision: pipeline.colorPrecision,
                upscale: pipeline.upscale,
                flatten_color: pipeline.flattenColor,
            })
            setPipelineResult(await postForm<PipelineResult>("/api/pipeline", fd))
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro inesperado no pipeline.")
        } finally {
            setBusy(null)
        }
    }

    async function runClean() {
        if (!requireFile() || !file) return
        setBusy("clean")
        setError(null)
        try {
            const fd = new FormData()
            fd.append("file", file)
            appendFields(fd, {
                method: clean.method,
                model: clean.model,
                alpha_matting: clean.alphaMatting,
                alpha_matting_foreground_threshold: clean.fgThreshold,
                alpha_matting_background_threshold: clean.bgThreshold,
                alpha_matting_erode_size: clean.erodeSize,
                luma_low: clean.lumaLow,
                luma_high: clean.lumaHigh,
                luma_unpremultiply: clean.lumaUnpremultiply,
                luma_denoise: clean.lumaDenoise,
                luma_gamma: clean.lumaGamma,
                saturation: clean.saturation,
                contrast: clean.contrast,
                brightness: clean.brightness,
                edge_smooth: clean.edgeSmooth,
                use_bg_color: clean.useBgColor,
                bg_color: clean.bgColor,
            })
            setCleanResult(await postForm<CleanResult>("/api/clean", fd))
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro inesperado ao remover fundo.")
        } finally {
            setBusy(null)
        }
    }

    async function runSvg() {
        if (!requireFile() || !file) return
        setBusy("svg")
        setError(null)
        try {
            const fd = new FormData()
            fd.append("file", file)
            appendFields(fd, {
                color_mode: svg.colorMode,
                hierarchical: svg.hierarchical,
                path_mode: svg.pathMode,
                filter_speckle: svg.filterSpeckle,
                color_precision: svg.colorPrecision,
                layer_difference: svg.layerDifference,
                corner_threshold: svg.cornerThreshold,
                length_threshold: svg.lengthThreshold,
                max_iterations: svg.maxIterations,
                splice_threshold: svg.spliceThreshold,
                path_precision: svg.pathPrecision,
                upscale: svg.upscale,
                flatten_color: svg.flattenColor,
            })
            setSvgResult(await postForm<SvgResult>("/api/svg", fd))
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro inesperado ao vetorizar.")
        } finally {
            setBusy(null)
        }
    }

    async function runKtxSingle() {
        if (!requireFile() || !file) return
        setBusy("ktx-single")
        setError(null)
        try {
            const fd = new FormData()
            fd.append("file", file)
            appendFields(fd, {
                preset: ktxSingle.preset,
                auto_align: ktxSingle.autoAlign,
                auto_preset: ktxSingle.autoPreset,
                validate_quality: ktxSingle.validateQuality,
            })
            const data = await postForm<KtxSingleResult>("/api/ktx/single", fd)
            setKtxSingleResult(data)
            if (!data.success) setError(data.summary)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro inesperado ao converter KTX.")
        } finally {
            setBusy(null)
        }
    }

    async function runKtxBatch() {
        setBusy("ktx-batch")
        setError(null)
        try {
            const fd = new FormData()
            appendFields(fd, {
                folder_path: ktxBatch.folderPath,
                output_path: ktxBatch.outputPath,
                preset: ktxBatch.preset,
                recursive: ktxBatch.recursive,
                flatten: ktxBatch.flatten,
                auto_align: ktxBatch.autoAlign,
                auto_preset: ktxBatch.autoPreset,
                validate_quality: ktxBatch.validateQuality,
                max_workers: ktxBatch.maxWorkers,
            })
            const data = await postForm<KtxBatchResult>("/api/ktx/batch", fd)
            setKtxBatchResult(data)
            if (!data.success) setError(data.summary)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro inesperado no batch KTX.")
        } finally {
            setBusy(null)
        }
    }

    async function runBatchPipeline() {
        setBusy("batch-pipeline")
        setError(null)
        try {
            const fd = new FormData()
            appendFields(fd, {
                input_path: batchPipeline.inputPath,
                output_dir: batchPipeline.outputPath,
                recursive: batchPipeline.recursive,
                method: batchPipeline.method,
                model: batchPipeline.model,
                alpha_matting: batchPipeline.alphaMatting,
                alpha_matting_foreground_threshold: batchPipeline.fgThreshold,
                alpha_matting_background_threshold: batchPipeline.bgThreshold,
                alpha_matting_erode_size: batchPipeline.erodeSize,
                luma_low: batchPipeline.lumaLow,
                luma_high: batchPipeline.lumaHigh,
                luma_unpremultiply: batchPipeline.lumaUnpremultiply,
                luma_denoise: batchPipeline.lumaDenoise,
                luma_gamma: batchPipeline.lumaGamma,
                saturation: batchPipeline.saturation,
                contrast: batchPipeline.contrast,
                brightness: batchPipeline.brightness,
                edge_smooth: batchPipeline.edgeSmooth,
                no_svg: batchPipeline.noSvg,
                no_bg_removal: batchPipeline.noBgRemoval,
                color_mode: batchPipeline.colorMode,
                hierarchical: batchPipeline.hierarchical,
                path_mode: batchPipeline.pathMode,
                filter_speckle: batchPipeline.filterSpeckle,
                color_precision: batchPipeline.colorPrecision,
                layer_difference: batchPipeline.layerDifference,
                corner_threshold: batchPipeline.cornerThreshold,
                length_threshold: batchPipeline.lengthThreshold,
                max_iterations: batchPipeline.maxIterations,
                splice_threshold: batchPipeline.spliceThreshold,
                path_precision: batchPipeline.pathPrecision,
                upscale: batchPipeline.upscale,
                flatten_color: batchPipeline.flattenColor,
            })
            const data = await postForm<BatchPipelineResult>("/api/batch/pipeline", fd)
            setBatchPipelineResult(data)
            if (!data.success) setError(data.summary)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro inesperado no batch pipeline.")
        } finally {
            setBusy(null)
        }
    }

    async function runKtxPatch() {
        if (!ktxFile) {
            setError("Carregue um arquivo .ktx/.ktx2 antes de aplicar o patch.")
            return
        }
        setBusy("ktx-orientation")
        setError(null)
        try {
            const fd = new FormData()
            fd.append("file", ktxFile)
            appendFields(fd, {
                output_name: ktxPatch.outputName,
                output_path: ktxPatch.outputPath,
            })
            const data = await postForm<KtxPatchResult>("/api/ktx/orientation", fd)
            setKtxPatchResult(data)
            if (!data.success) setError(data.summary)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro inesperado no patch KTX.")
        } finally {
            setBusy(null)
        }
    }

    async function runPortfolioKtx() {
        if (!requireFile() || !file) return
        setBusy("portfolio-ktx")
        setError(null)
        try {
            const fd = new FormData()
            fd.append("file", file)
            appendFields(fd, {
                output_name: portfolioKtx.outputName,
                output_path: portfolioKtx.outputPath,
            })
            const data = await postForm<PortfolioKtxResult>("/api/ktx/portfolio", fd)
            setPortfolioKtxResult(data)
            if (!data.success) setError(data.summary)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro inesperado no KTX do portfolio.")
        } finally {
            setBusy(null)
        }
    }

    const fileSize = file ? formatBytes(file.size) : "sem arquivo"
    const currentBusy = busy === active
    const ActiveIcon = activeMeta.icon

    return (
        <div className="app-page">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="app-grid-layer absolute inset-0" />
            </div>

            <div className="relative mx-auto flex min-h-screen max-w-[1540px] gap-4 px-3 py-4 sm:px-5 lg:px-6">
                <aside className="hidden w-[310px] shrink-0 lg:block">
                    <div className="sticky top-4 space-y-4">
                        <DashboardShell innerClassName="p-4">
                            <div className="flex items-center gap-3">
                                <span className="panel-icon size-11 rounded-2xl">
                                    <Sparkles className="size-5" />
                                </span>
                                <div className="min-w-0">
                                    <h1 className="font-jakarta text-lg font-extrabold uppercase leading-none tracking-tight">
                                        Cleanup Image
                                    </h1>
                                    <p className="app-faint mt-1 text-xs">Portfolio tools</p>
                                </div>
                            </div>

                            <div className="field-control mt-4 flex items-center gap-2 px-3">
                                <Search className="app-faint size-4" />
                                <input
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Buscar modulo..."
                                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                                />
                            </div>
                        </DashboardShell>

                        <DashboardShell innerClassName="p-3">
                            <div className="space-y-1">
                                {filteredWorkspaces.map((workspace) => {
                                    const Icon = workspace.icon
                                    const isActive = active === workspace.id
                                    return (
                                        <button
                                            key={workspace.id}
                                            type="button"
                                            onClick={() => {
                                                setActive(workspace.id)
                                                setError(null)
                                            }}
                                            className="sidebar-item flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors"
                                            data-active={isActive}
                                        >
                                            <span className="sidebar-icon size-9 shrink-0 rounded-xl">
                                                <Icon className={cn("size-4", isActive ? workspace.accent : "app-faint")} />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-jakarta text-sm font-extrabold uppercase leading-none tracking-tight">
                                                    {workspace.title}
                                                </span>
                                                <span className="app-faint mt-1 block truncate text-xs">{workspace.label}</span>
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </DashboardShell>

                        <DashboardShell innerClassName="p-4">
                            <div className="grid gap-2">
                                <div className="status-card flex items-center justify-between rounded-xl px-3 py-2">
                                    <span className="app-faint flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
                                        <Server className="size-3.5" />
                                        API
                                    </span>
                                    <span
                                        className="status-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]"
                                        data-tone={apiStatus === "online" ? "good" : apiStatus === "offline" ? "bad" : undefined}
                                    >
                                        {apiStatus}
                                    </span>
                                </div>
                                <div className="status-card flex items-center justify-between rounded-xl px-3 py-2">
                                    <span className="app-faint flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
                                        <Cpu className="size-3.5" />
                                        toktx
                                    </span>
                                    <span className="text-xs font-semibold">
                                        {toktxFound === null ? "checking" : toktxFound ? "ok" : "missing"}
                                    </span>
                                </div>
                                <div className="status-card flex items-center justify-between rounded-xl px-3 py-2">
                                    <span className="app-faint flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
                                        <PackageCheck className="size-3.5" />
                                        alktx2
                                    </span>
                                    <span className="text-xs font-semibold">
                                        {capabilities?.alktx2_found ? "ok" : "missing"}
                                    </span>
                                </div>
                            </div>
                        </DashboardShell>
                    </div>
                </aside>

                <main className="min-w-0 flex-1 space-y-4">
                    <motion.header {...cardEnter}>
                        <DashboardShell innerClassName="p-4 sm:p-5">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className="panel-icon size-11 shrink-0 rounded-2xl">
                                        <ActiveIcon className={cn("size-5", activeMeta.accent)} />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="app-faint text-[10px] font-bold uppercase tracking-[0.24em]">
                                            Workspace ativo
                                        </p>
                                        <h2 className="mt-1 font-jakarta text-2xl font-extrabold uppercase leading-none tracking-tight sm:text-3xl">
                                            {activeMeta.title}
                                        </h2>
                                        <p className="app-muted mt-2 max-w-3xl text-sm leading-5">{activeMeta.description}</p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="w-48 lg:hidden">
                                        <SelectField
                                            label="Modulo"
                                            value={active}
                                            options={workspaces.map((workspace) => ({
                                                value: workspace.id,
                                                label: workspace.title,
                                            }))}
                                            onChange={(workspace) => {
                                                setActive(workspace)
                                                setError(null)
                                            }}
                                        />
                                    </div>
                                    <span className="status-pill px-3 py-2 text-xs font-semibold">
                                        {fileSize}
                                    </span>
                                    <ThemeToggle />
                                </div>
                            </div>
                        </DashboardShell>
                    </motion.header>

                    {error ? (
                        <div className="app-alert rounded-xl px-4 py-3 text-sm">
                            <div className="flex gap-2">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                <span className="whitespace-pre-wrap">{error}</span>
                            </div>
                        </div>
                    ) : null}

                    {(["pipeline", "clean", "svg", "ktx-single", "portfolio-ktx"] as Workspace[]).includes(active) ? (
                        <motion.div {...cardEnter} className="grid gap-4 xl:grid-cols-[minmax(290px,0.72fr)_minmax(0,1.28fr)]">
                            <Panel title="Fonte" subtitle="O mesmo upload pode alimentar qualquer modulo." icon={ImagePlus}>
                                <Dropzone file={file} previewUrl={previewUrl} onChange={setFile} />
                            </Panel>

                            {active === "pipeline" ? (
                                <Panel title="Controles do pipeline" subtitle="Fluxo completo: alpha, raster limpo e SVG final." icon={SlidersHorizontal}>
                                    <div className="grid gap-4">
                                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                            <SelectField label="Metodo" value={pipeline.method} options={methodOptions} onChange={(method) => setPipeline((current) => ({ ...current, method }))} />
                                            <SelectField label="Modelo AI" value={pipeline.model} options={modelOptions} onChange={(model) => setPipeline((current) => ({ ...current, model }))} />
                                            <ColorField label="Fundo SVG" value={pipeline.flattenColor} onChange={(flattenColor) => setPipeline((current) => ({ ...current, flattenColor }))} />
                                        </div>
                                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                            <Slider label="Luma low" value={pipeline.lumaLow} min={0} max={0.5} step={0.01} onChange={(lumaLow) => setPipeline((current) => ({ ...current, lumaLow }))} />
                                            <Slider label="Luma high" value={pipeline.lumaHigh} min={0.5} max={1} step={0.01} onChange={(lumaHigh) => setPipeline((current) => ({ ...current, lumaHigh }))} />
                                            <Slider label="Gamma" value={pipeline.lumaGamma} min={0.3} max={3} step={0.1} onChange={(lumaGamma) => setPipeline((current) => ({ ...current, lumaGamma }))} />
                                            <Slider label="Denoise" value={pipeline.lumaDenoise} min={0} max={7} step={1} onChange={(lumaDenoise) => setPipeline((current) => ({ ...current, lumaDenoise }))} />
                                        </div>
                                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                            <Slider label="Saturacao" value={pipeline.saturation} min={0.5} max={2} step={0.05} onChange={(saturation) => setPipeline((current) => ({ ...current, saturation }))} />
                                            <Slider label="Contraste" value={pipeline.contrast} min={0.5} max={2} step={0.05} onChange={(contrast) => setPipeline((current) => ({ ...current, contrast }))} />
                                            <Slider label="Speckle" value={pipeline.filterSpeckle} min={0} max={20} step={1} onChange={(filterSpeckle) => setPipeline((current) => ({ ...current, filterSpeckle }))} />
                                            <Slider label="Precision" value={pipeline.colorPrecision} min={1} max={8} step={1} onChange={(colorPrecision) => setPipeline((current) => ({ ...current, colorPrecision }))} />
                                        </div>
                                        <div className="grid gap-3 md:grid-cols-3">
                                            <SelectField label="Modo SVG" value={pipeline.colorMode} options={colorModeOptions} onChange={(colorMode) => setPipeline((current) => ({ ...current, colorMode }))} />
                                            <Slider label="Upscale" value={pipeline.upscale} min={1} max={3} step={0.25} onChange={(upscale) => setPipeline((current) => ({ ...current, upscale }))} />
                                            <CheckboxRow checked={pipeline.lumaUnpremultiply} onChange={(lumaUnpremultiply) => setPipeline((current) => ({ ...current, lumaUnpremultiply }))} label="Unmult" helper="Preserva brilho em fundo escuro." />
                                        </div>
                                        <Button onClick={runPipeline} disabled={currentBusy} size="lg" className="w-full">
                                            {currentBusy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                                            Processar tudo
                                        </Button>
                                    </div>
                                </Panel>
                            ) : null}

                            {active === "clean" ? (
                                <Panel title="Controles de alpha" subtitle="AI, luma keying e acabamento do PNG." icon={Settings2}>
                                    <div className="grid gap-4">
                                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                            <SelectField label="Metodo" value={clean.method} options={methodOptions} onChange={(method) => setClean((current) => ({ ...current, method }))} />
                                            <SelectField label="Modelo AI" value={clean.model} options={modelOptions} onChange={(model) => setClean((current) => ({ ...current, model }))} />
                                            <ColorField label="Cor de fundo" value={clean.bgColor} onChange={(bgColor) => setClean((current) => ({ ...current, bgColor }))} />
                                        </div>
                                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                            <Slider label="Luma low" value={clean.lumaLow} min={0} max={0.5} step={0.01} onChange={(lumaLow) => setClean((current) => ({ ...current, lumaLow }))} />
                                            <Slider label="Luma high" value={clean.lumaHigh} min={0.5} max={1} step={0.01} onChange={(lumaHigh) => setClean((current) => ({ ...current, lumaHigh }))} />
                                            <Slider label="Gamma" value={clean.lumaGamma} min={0.3} max={3} step={0.1} onChange={(lumaGamma) => setClean((current) => ({ ...current, lumaGamma }))} />
                                            <Slider label="Denoise" value={clean.lumaDenoise} min={0} max={7} step={1} onChange={(lumaDenoise) => setClean((current) => ({ ...current, lumaDenoise }))} />
                                        </div>
                                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                            <Slider label="FG threshold" value={clean.fgThreshold} min={0} max={255} step={1} onChange={(fgThreshold) => setClean((current) => ({ ...current, fgThreshold }))} />
                                            <Slider label="BG threshold" value={clean.bgThreshold} min={0} max={255} step={1} onChange={(bgThreshold) => setClean((current) => ({ ...current, bgThreshold }))} />
                                            <Slider label="Erode" value={clean.erodeSize} min={0} max={50} step={1} onChange={(erodeSize) => setClean((current) => ({ ...current, erodeSize }))} />
                                            <Slider label="Saturacao" value={clean.saturation} min={0.5} max={2} step={0.05} onChange={(saturation) => setClean((current) => ({ ...current, saturation }))} />
                                        </div>
                                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                            <Slider label="Contraste" value={clean.contrast} min={0.5} max={2} step={0.05} onChange={(contrast) => setClean((current) => ({ ...current, contrast }))} />
                                            <Slider label="Brilho" value={clean.brightness} min={0.5} max={2} step={0.05} onChange={(brightness) => setClean((current) => ({ ...current, brightness }))} />
                                            <CheckboxRow checked={clean.lumaUnpremultiply} onChange={(lumaUnpremultiply) => setClean((current) => ({ ...current, lumaUnpremultiply }))} label="Unmult" />
                                            <CheckboxRow checked={clean.alphaMatting} onChange={(alphaMatting) => setClean((current) => ({ ...current, alphaMatting }))} label="Alpha matting" />
                                        </div>
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <CheckboxRow checked={clean.edgeSmooth} onChange={(edgeSmooth) => setClean((current) => ({ ...current, edgeSmooth }))} label="Suavizar borda" />
                                            <CheckboxRow checked={clean.useBgColor} onChange={(useBgColor) => setClean((current) => ({ ...current, useBgColor }))} label="Aplicar fundo solido" />
                                        </div>
                                        <Button onClick={runClean} disabled={currentBusy} size="lg" className="w-full">
                                            {currentBusy ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
                                            Remover fundo
                                        </Button>
                                    </div>
                                </Panel>
                            ) : null}

                            {active === "svg" ? (
                                <Panel title="Controles do vetor" subtitle="Parametros completos do vtracer e SVG transparente." icon={Layers}>
                                    <div className="grid gap-4">
                                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                            <SelectField label="Cor" value={svg.colorMode} options={colorModeOptions} onChange={(colorMode) => setSvg((current) => ({ ...current, colorMode }))} />
                                            <SelectField label="Hierarquia" value={svg.hierarchical} options={hierarchicalOptions} onChange={(hierarchical) => setSvg((current) => ({ ...current, hierarchical }))} />
                                            <SelectField label="Path" value={svg.pathMode} options={pathModeOptions} onChange={(pathMode) => setSvg((current) => ({ ...current, pathMode }))} />
                                            <ColorField label="Fundo" value={svg.flattenColor} onChange={(flattenColor) => setSvg((current) => ({ ...current, flattenColor }))} />
                                        </div>
                                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                            <Slider label="Upscale" value={svg.upscale} min={1} max={3} step={0.25} onChange={(upscale) => setSvg((current) => ({ ...current, upscale }))} />
                                            <Slider label="Speckle" value={svg.filterSpeckle} min={0} max={20} step={1} onChange={(filterSpeckle) => setSvg((current) => ({ ...current, filterSpeckle }))} />
                                            <Slider label="Color precision" value={svg.colorPrecision} min={1} max={8} step={1} onChange={(colorPrecision) => setSvg((current) => ({ ...current, colorPrecision }))} />
                                            <Slider label="Path precision" value={svg.pathPrecision} min={1} max={10} step={1} onChange={(pathPrecision) => setSvg((current) => ({ ...current, pathPrecision }))} />
                                        </div>
                                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                                            <Slider label="Layer diff" value={svg.layerDifference} min={0} max={256} step={1} onChange={(layerDifference) => setSvg((current) => ({ ...current, layerDifference }))} />
                                            <Slider label="Corner" value={svg.cornerThreshold} min={0} max={180} step={1} onChange={(cornerThreshold) => setSvg((current) => ({ ...current, cornerThreshold }))} />
                                            <Slider label="Length" value={svg.lengthThreshold} min={0} max={20} step={0.5} onChange={(lengthThreshold) => setSvg((current) => ({ ...current, lengthThreshold }))} />
                                            <Slider label="Splice" value={svg.spliceThreshold} min={0} max={180} step={1} onChange={(spliceThreshold) => setSvg((current) => ({ ...current, spliceThreshold }))} />
                                            <Slider label="Iterations" value={svg.maxIterations} min={1} max={20} step={1} onChange={(maxIterations) => setSvg((current) => ({ ...current, maxIterations }))} />
                                        </div>
                                        <Button onClick={runSvg} disabled={currentBusy} size="lg" className="w-full">
                                            {currentBusy ? <Loader2 className="size-4 animate-spin" /> : <FileCode2 className="size-4" />}
                                            Gerar SVG
                                        </Button>
                                    </div>
                                </Panel>
                            ) : null}

                            {active === "ktx-single" ? (
                                <Panel title="KTX single" subtitle="Upload unico com presets de qualidade maxima." icon={Box}>
                                    <div className="grid gap-4">
                                        <SelectField label="Preset" value={ktxSingle.preset} options={ktxPresetOptions} onChange={(preset) => setKtxSingle((current) => ({ ...current, preset }))} />
                                        <div className="grid gap-3 md:grid-cols-3">
                                            <CheckboxRow checked={ktxSingle.autoAlign} onChange={(autoAlign) => setKtxSingle((current) => ({ ...current, autoAlign }))} label="Auto-align" helper="Pad para multiplo de 4." />
                                            <CheckboxRow checked={ktxSingle.autoPreset} onChange={(autoPreset) => setKtxSingle((current) => ({ ...current, autoPreset }))} label="Auto-preset" helper="Alpha usa ultra_rgba." />
                                            <CheckboxRow checked={ktxSingle.validateQuality} onChange={(validateQuality) => setKtxSingle((current) => ({ ...current, validateQuality }))} label="Validar PSNR" helper="Requer ktx + skimage." />
                                        </div>
                                        {toktxFound === false ? (
                                            <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
                                                toktx nao encontrado no PATH. Instale KTX-Software para habilitar conversao.
                                            </div>
                                        ) : null}
                                        <Button onClick={runKtxSingle} disabled={currentBusy} size="lg" className="w-full">
                                            {currentBusy ? <Loader2 className="size-4 animate-spin" /> : <Box className="size-4" />}
                                            Converter para KTX
                                        </Button>
                                    </div>
                                </Panel>
                            ) : null}

                            {active === "portfolio-ktx" ? (
                                <Panel title="Portfolio KTX" subtitle="Canvas fixo 960x540, ETC1S q255 e orientation patch." icon={PackageCheck}>
                                    <div className="grid gap-4">
                                        <div className="grid gap-3 xl:grid-cols-2">
                                            <TextField label="Nome output" value={portfolioKtx.outputName} onChange={(outputName) => setPortfolioKtx((current) => ({ ...current, outputName }))} placeholder="liquid-launcher-1.ktx" />
                                            <TextField label="Salvar tambem em" value={portfolioKtx.outputPath} onChange={(outputPath) => setPortfolioKtx((current) => ({ ...current, outputPath }))} placeholder="C:/Users/zywl/WebstormProjects/portfolio/yzy/static/projects/images" />
                                        </div>
                                        {capabilities?.alktx2_found === false ? (
                                            <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
                                                alktx2 nao esta instalado neste venv. Rode: python -m pip install -r requirements.txt
                                            </div>
                                        ) : null}
                                        <div className="grid gap-3 md:grid-cols-3">
                                            <Metric label="Canvas" value="960 x 540" helper="portfolio 3D" />
                                            <Metric label="Codec" value="ETC1S" helper="q255 sRGB" />
                                            <Metric label="Patch" value="rd" helper="KTXorientation" />
                                        </div>
                                        <Button onClick={runPortfolioKtx} disabled={currentBusy} size="lg" className="w-full">
                                            {currentBusy ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
                                            Gerar KTX do portfolio
                                        </Button>
                                    </div>
                                </Panel>
                            ) : null}
                        </motion.div>
                    ) : active === "transcribe" ? (
                        <TranscribeWorkspace />
                    ) : active === "ktx-orientation" ? (
                        <motion.div {...cardEnter} className="grid gap-4 xl:grid-cols-[minmax(290px,0.72fr)_minmax(0,1.28fr)]">
                            <Panel title="Arquivo KTX" subtitle="Aceita .ktx ou .ktx2 e devolve o arquivo patchado." icon={Archive}>
                                <FileField file={ktxFile} onChange={setKtxFile} accept=".ktx,.ktx2,application/octet-stream" label="Escolher KTX" helper="KTX2 gerado por alktx2/toktx" />
                            </Panel>
                            <Panel title="Orientation patch" subtitle="Garante KTXorientation=rd para compatibilidade no three.js." icon={ShieldCheck}>
                                <div className="grid gap-4">
                                    <div className="grid gap-3 xl:grid-cols-2">
                                        <TextField label="Nome output" value={ktxPatch.outputName} onChange={(outputName) => setKtxPatch((current) => ({ ...current, outputName }))} placeholder="texture.ktx" />
                                        <TextField label="Salvar tambem em" value={ktxPatch.outputPath} onChange={(outputPath) => setKtxPatch((current) => ({ ...current, outputPath }))} placeholder="C:/Users/zywl/WebstormProjects/portfolio/yzy/static/projects/images" />
                                    </div>
                                    <Button onClick={runKtxPatch} disabled={currentBusy} size="lg" className="w-full">
                                        {currentBusy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                                        Aplicar patch
                                    </Button>
                                </div>
                            </Panel>
                        </motion.div>
                    ) : active === "batch-pipeline" ? (
                        <motion.div {...cardEnter}>
                            <Panel title="Batch Pipeline" subtitle="Mesmo poder do CLI pela web, usando caminhos locais absolutos." icon={FolderOpen}>
                                <div className="grid gap-4">
                                    <div className="grid gap-3 xl:grid-cols-2">
                                        <TextField label="Input path" value={batchPipeline.inputPath} onChange={(inputPath) => setBatchPipeline((current) => ({ ...current, inputPath }))} placeholder="C:/Users/zywl/WebstormProjects/cleanup-image/samples" />
                                        <TextField label="Output dir" value={batchPipeline.outputPath} onChange={(outputPath) => setBatchPipeline((current) => ({ ...current, outputPath }))} placeholder="C:/Users/zywl/WebstormProjects/cleanup-image/output" />
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                        <SelectField label="Metodo" value={batchPipeline.method} options={methodOptions} onChange={(method) => setBatchPipeline((current) => ({ ...current, method }))} />
                                        <SelectField label="Modelo AI" value={batchPipeline.model} options={modelOptions} onChange={(model) => setBatchPipeline((current) => ({ ...current, model }))} />
                                        <SelectField label="Modo SVG" value={batchPipeline.colorMode} options={colorModeOptions} onChange={(colorMode) => setBatchPipeline((current) => ({ ...current, colorMode }))} />
                                        <ColorField label="Fundo SVG" value={batchPipeline.flattenColor} onChange={(flattenColor) => setBatchPipeline((current) => ({ ...current, flattenColor }))} />
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                                        <Slider label="Luma low" value={batchPipeline.lumaLow} min={0} max={0.5} step={0.01} onChange={(lumaLow) => setBatchPipeline((current) => ({ ...current, lumaLow }))} />
                                        <Slider label="Luma high" value={batchPipeline.lumaHigh} min={0.5} max={1} step={0.01} onChange={(lumaHigh) => setBatchPipeline((current) => ({ ...current, lumaHigh }))} />
                                        <Slider label="Gamma" value={batchPipeline.lumaGamma} min={0.3} max={3} step={0.1} onChange={(lumaGamma) => setBatchPipeline((current) => ({ ...current, lumaGamma }))} />
                                        <Slider label="Denoise" value={batchPipeline.lumaDenoise} min={0} max={7} step={1} onChange={(lumaDenoise) => setBatchPipeline((current) => ({ ...current, lumaDenoise }))} />
                                        <Slider label="Upscale" value={batchPipeline.upscale} min={1} max={3} step={0.25} onChange={(upscale) => setBatchPipeline((current) => ({ ...current, upscale }))} />
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                                        <Slider label="Saturacao" value={batchPipeline.saturation} min={0.5} max={2} step={0.05} onChange={(saturation) => setBatchPipeline((current) => ({ ...current, saturation }))} />
                                        <Slider label="Contraste" value={batchPipeline.contrast} min={0.5} max={2} step={0.05} onChange={(contrast) => setBatchPipeline((current) => ({ ...current, contrast }))} />
                                        <Slider label="Brilho" value={batchPipeline.brightness} min={0.5} max={2} step={0.05} onChange={(brightness) => setBatchPipeline((current) => ({ ...current, brightness }))} />
                                        <Slider label="Speckle" value={batchPipeline.filterSpeckle} min={0} max={20} step={1} onChange={(filterSpeckle) => setBatchPipeline((current) => ({ ...current, filterSpeckle }))} />
                                        <Slider label="Precision" value={batchPipeline.colorPrecision} min={1} max={8} step={1} onChange={(colorPrecision) => setBatchPipeline((current) => ({ ...current, colorPrecision }))} />
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                        <CheckboxRow checked={batchPipeline.recursive} onChange={(recursive) => setBatchPipeline((current) => ({ ...current, recursive }))} label="Recursivo" />
                                        <CheckboxRow checked={batchPipeline.noSvg} onChange={(noSvg) => setBatchPipeline((current) => ({ ...current, noSvg }))} label="Sem SVG" helper="Gera apenas PNG limpo." />
                                        <CheckboxRow checked={batchPipeline.noBgRemoval} onChange={(noBgRemoval) => setBatchPipeline((current) => ({ ...current, noBgRemoval }))} label="Sem remover fundo" helper="Apenas vetoriza." />
                                        <CheckboxRow checked={batchPipeline.edgeSmooth} onChange={(edgeSmooth) => setBatchPipeline((current) => ({ ...current, edgeSmooth }))} label="Suavizar borda" />
                                    </div>
                                    <Button onClick={runBatchPipeline} disabled={currentBusy} size="lg" className="w-full">
                                        {currentBusy ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
                                        Processar pasta
                                    </Button>
                                </div>
                            </Panel>
                        </motion.div>
                    ) : active === "ktx-batch" ? (
                        <motion.div {...cardEnter}>
                            <Panel title="Batch KTX" subtitle="Use caminhos locais absolutos. O backend processa a pasta no Windows." icon={FolderSync}>
                                <div className="grid gap-4">
                                    <div className="grid gap-3 xl:grid-cols-2">
                                        <TextField label="Pasta input" value={ktxBatch.folderPath} onChange={(folderPath) => setKtxBatch((current) => ({ ...current, folderPath }))} placeholder="C:/Users/zywl/WebstormProjects/portfolio/yzy/static/..." />
                                        <TextField label="Pasta output" value={ktxBatch.outputPath} onChange={(outputPath) => setKtxBatch((current) => ({ ...current, outputPath }))} placeholder="C:/Users/zywl/WebstormProjects/cleanup-image/output_ktx" />
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                        <SelectField label="Preset" value={ktxBatch.preset} options={ktxPresetOptions} onChange={(preset) => setKtxBatch((current) => ({ ...current, preset }))} />
                                        <Slider label="Workers" value={ktxBatch.maxWorkers} min={1} max={16} step={1} onChange={(maxWorkers) => setKtxBatch((current) => ({ ...current, maxWorkers }))} />
                                        <CheckboxRow checked={ktxBatch.recursive} onChange={(recursive) => setKtxBatch((current) => ({ ...current, recursive }))} label="Recursivo" />
                                        <CheckboxRow checked={ktxBatch.flatten} onChange={(flatten) => setKtxBatch((current) => ({ ...current, flatten }))} label="Flatten output" />
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-3">
                                        <CheckboxRow checked={ktxBatch.autoAlign} onChange={(autoAlign) => setKtxBatch((current) => ({ ...current, autoAlign }))} label="Auto-align" />
                                        <CheckboxRow checked={ktxBatch.autoPreset} onChange={(autoPreset) => setKtxBatch((current) => ({ ...current, autoPreset }))} label="Auto-preset" />
                                        <CheckboxRow checked={ktxBatch.validateQuality} onChange={(validateQuality) => setKtxBatch((current) => ({ ...current, validateQuality }))} label="Validar PSNR" />
                                    </div>
                                    <Button onClick={runKtxBatch} disabled={currentBusy} size="lg" className="w-full">
                                        {currentBusy ? <Loader2 className="size-4 animate-spin" /> : <FolderSync className="size-4" />}
                                        Converter pasta
                                    </Button>
                                </div>
                            </Panel>
                        </motion.div>
                    ) : (
                        <motion.div {...cardEnter}>
                            <Panel title="Sistema" subtitle="Mapa vivo da API e ferramentas disponiveis no backend." icon={Server}>
                                <div className="grid gap-4">
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                        <Metric label="API" value={apiStatus} />
                                        <Metric label="Modelos" value={String(capabilities?.models_count ?? models.length)} helper={capabilities?.default_model ?? DEFAULT_MODEL} />
                                        <Metric label="toktx" value={toktxFound ? "ok" : "missing"} helper={capabilities?.default_ktx_preset ?? DEFAULT_KTX_PRESET} />
                                        <Metric label="alktx2" value={capabilities?.alktx2_found ? "ok" : "missing"} helper="portfolio KTX" />
                                    </div>
                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <div className="preview-card p-4">
                                            <h3 className="font-jakarta text-sm font-extrabold uppercase tracking-tight">Modulos</h3>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {(capabilities?.modules ?? []).map((module) => (
                                                    <span key={module} className="status-pill px-2.5 py-1 text-xs font-semibold">
                                                        {module}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="preview-card p-4">
                                            <h3 className="font-jakarta text-sm font-extrabold uppercase tracking-tight">Endpoints</h3>
                                            <div className="mt-3 grid gap-1.5">
                                                {(capabilities?.endpoints ?? []).map((endpoint) => (
                                                    <code key={endpoint} className="app-codeblock rounded-md px-2 py-1 text-xs">
                                                        {endpoint}
                                                    </code>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Panel>
                        </motion.div>
                    )}

                    {active === "transcribe" ? null : (
                    <motion.div {...cardEnter}>
                        <Panel title="Resultado" subtitle="Previews e downloads ficam aqui sem trocar de pagina." icon={Activity}>
                            {active === "pipeline" ? (
                                pipelineResult ? (
                                    <div className="space-y-4">
                                        <div className="grid gap-3 md:grid-cols-3">
                                            <Metric label="Tempo" value={`${(pipelineResult.elapsed_ms / 1000).toFixed(2)}s`} helper={pipelineResult.method_used} />
                                            <Metric label="Tamanho" value={`${pipelineResult.image_width} x ${pipelineResult.image_height}`} />
                                            <Metric label="Saidas" value="3" helper="PNG + 2 SVGs" />
                                        </div>
                                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                            <PreviewTile title="PNG transparente" subtitle="Fundo removido" src={pngData(pipelineResult.cleaned_png_b64)} downloadHref={pngData(pipelineResult.cleaned_png_b64)} downloadName="cleaned.png" transparent />
                                            <PreviewTile title="SVG com fundo" subtitle="Flatten visual" src={pngData(pipelineResult.svg_with_bg_preview_b64)} downloadHref={svgData(pipelineResult.svg_with_bg)} downloadName="cleaned.svg" />
                                            <PreviewTile title="SVG clean" subtitle="Transparente" src={pngData(pipelineResult.svg_clean_preview_b64)} downloadHref={svgData(pipelineResult.svg_clean)} downloadName="cleaned-clean.svg" transparent />
                                        </div>
                                    </div>
                                ) : (
                                    <EmptyState text="Execute o pipeline para gerar PNG transparente e SVGs." />
                                )
                            ) : null}

                            {active === "clean" ? (
                                cleanResult ? (
                                    <div className="space-y-4">
                                        <div className="grid gap-3 md:grid-cols-3">
                                            <Metric label="Tempo" value={`${(cleanResult.elapsed_ms / 1000).toFixed(2)}s`} helper={cleanResult.method_used} />
                                            <Metric label="Tamanho" value={`${cleanResult.image_width} x ${cleanResult.image_height}`} />
                                            <Metric label="Saida" value="PNG" helper="alpha preservado" />
                                        </div>
                                        <div className="max-w-xl">
                                            <PreviewTile title="PNG final" subtitle="Resultado da remocao" src={pngData(cleanResult.cleaned_png_b64)} downloadHref={pngData(cleanResult.cleaned_png_b64)} downloadName="cleaned.png" transparent={!clean.useBgColor} />
                                        </div>
                                    </div>
                                ) : (
                                    <EmptyState text="Remova o fundo para visualizar o PNG final." />
                                )
                            ) : null}

                            {active === "svg" ? (
                                svgResult ? (
                                    <div className="space-y-4">
                                        <div className="grid gap-3 md:grid-cols-3">
                                            <Metric label="Tempo" value={`${(svgResult.elapsed_ms / 1000).toFixed(2)}s`} />
                                            <Metric label="SVG bg" value={formatBytes(svgResult.svg_with_bg_bytes)} />
                                            <Metric label="SVG clean" value={formatBytes(svgResult.svg_clean_bytes)} />
                                        </div>
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <PreviewTile title="SVG com fundo" subtitle={`${svgResult.image_width} x ${svgResult.image_height}`} src={pngData(svgResult.svg_with_bg_preview_b64)} downloadHref={svgData(svgResult.svg_with_bg)} downloadName="vectorized.svg" />
                                            <PreviewTile title="SVG clean" subtitle="Transparente" src={pngData(svgResult.svg_clean_preview_b64)} downloadHref={svgData(svgResult.svg_clean)} downloadName="vectorized-clean.svg" transparent />
                                        </div>
                                    </div>
                                ) : (
                                    <EmptyState text="Gere um SVG para receber preview e arquivos baixaveis." />
                                )
                            ) : null}

                            {active === "ktx-single" ? (
                                ktxSingleResult ? (
                                    <div className="space-y-4">
                                        <div className="grid gap-3 md:grid-cols-3">
                                            <Metric label="Status" value={ktxSingleResult.success ? "OK" : "Falha"} />
                                            <Metric label="Entrada" value={formatBytes(ktxSingleResult.size_input)} />
                                            <Metric label="Saida" value={formatBytes(ktxSingleResult.size_output)} helper={ktxSingleResult.ratio ? `${ktxSingleResult.ratio.toFixed(1)}x` : undefined} />
                                        </div>
                                        <pre className="app-codeblock max-h-64 overflow-auto rounded-xl p-4 text-sm leading-6">
                                            {ktxSingleResult.summary}
                                        </pre>
                                        {ktxSingleResult.success && ktxSingleResult.ktx_b64 && ktxSingleResult.filename ? (
                                            <Button asChild variant="outline">
                                                <a href={ktxData(ktxSingleResult.ktx_b64)} download={ktxSingleResult.filename}>
                                                    <Download className="size-4" />
                                                    Baixar {ktxSingleResult.filename}
                                                </a>
                                            </Button>
                                        ) : null}
                                    </div>
                                ) : (
                                    <EmptyState text="Converta um upload para receber o arquivo .ktx." />
                                )
                            ) : null}

                            {active === "portfolio-ktx" ? (
                                portfolioKtxResult ? (
                                    <div className="space-y-4">
                                        <div className="grid gap-3 md:grid-cols-3">
                                            <Metric label="Status" value={portfolioKtxResult.success ? "OK" : "Falha"} />
                                            <Metric label="Canvas" value={`${portfolioKtxResult.target_width} x ${portfolioKtxResult.target_height}`} />
                                            <Metric label="Saida" value={formatBytes(portfolioKtxResult.size_output)} helper={portfolioKtxResult.saved_path ?? undefined} />
                                        </div>
                                        <pre className="app-codeblock max-h-64 overflow-auto rounded-xl p-4 text-sm leading-6">
                                            {portfolioKtxResult.summary}
                                        </pre>
                                        {portfolioKtxResult.success && portfolioKtxResult.ktx_b64 && portfolioKtxResult.filename ? (
                                            <Button asChild variant="outline">
                                                <a href={ktxData(portfolioKtxResult.ktx_b64)} download={portfolioKtxResult.filename}>
                                                    <Download className="size-4" />
                                                    Baixar {portfolioKtxResult.filename}
                                                </a>
                                            </Button>
                                        ) : null}
                                    </div>
                                ) : (
                                    <EmptyState text="Gere o KTX 960x540 do portfolio para receber download e resumo." />
                                )
                            ) : null}

                            {active === "ktx-orientation" ? (
                                ktxPatchResult ? (
                                    <div className="space-y-4">
                                        <div className="grid gap-3 md:grid-cols-3">
                                            <Metric label="Status" value={ktxPatchResult.success ? "OK" : "Falha"} />
                                            <Metric label="Entrada" value={formatBytes(ktxPatchResult.size_input)} />
                                            <Metric label="Saida" value={formatBytes(ktxPatchResult.size_output)} helper={ktxPatchResult.saved_path ?? undefined} />
                                        </div>
                                        <pre className="app-codeblock max-h-64 overflow-auto rounded-xl p-4 text-sm leading-6">
                                            {ktxPatchResult.summary}
                                        </pre>
                                        {ktxPatchResult.success && ktxPatchResult.ktx_b64 && ktxPatchResult.filename ? (
                                            <Button asChild variant="outline">
                                                <a href={ktxData(ktxPatchResult.ktx_b64)} download={ktxPatchResult.filename}>
                                                    <Download className="size-4" />
                                                    Baixar {ktxPatchResult.filename}
                                                </a>
                                            </Button>
                                        ) : null}
                                    </div>
                                ) : (
                                    <EmptyState text="Aplique o orientation patch para receber o KTX atualizado." />
                                )
                            ) : null}

                            {active === "batch-pipeline" ? (
                                batchPipelineResult ? (
                                    <div className="space-y-4">
                                        <div className="grid gap-3 md:grid-cols-4">
                                            <Metric label="Status" value={batchPipelineResult.success ? "OK" : "Falha"} />
                                            <Metric label="Total" value={String(batchPipelineResult.total)} />
                                            <Metric label="Sucesso" value={String(batchPipelineResult.success_count)} />
                                            <Metric label="Falhas" value={String(batchPipelineResult.failure_count)} helper={batchPipelineResult.output_dir ?? undefined} />
                                        </div>
                                        <pre className="app-codeblock max-h-64 overflow-auto rounded-xl p-4 text-sm leading-6">
                                            {batchPipelineResult.summary}
                                        </pre>
                                        <div className="grid gap-2">
                                            {batchPipelineResult.files.slice(0, 12).map((item) => (
                                                <div key={item.input_path} className="preview-card flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-semibold">{item.input_path}</div>
                                                        <div className="app-faint truncate text-xs">
                                                            {item.success ? `${item.outputs.length} output(s) - ${item.method_used ?? "ok"}` : item.error}
                                                        </div>
                                                    </div>
                                                    <span className="status-pill px-2 py-1 text-xs font-semibold" data-tone={item.success ? "good" : "bad"}>
                                                        {item.success ? "ok" : "falha"}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <EmptyState text="Rode o batch pipeline para ver o resumo de cada arquivo." />
                                )
                            ) : null}

                            {active === "ktx-batch" ? (
                                ktxBatchResult ? (
                                    <div className="space-y-4">
                                        <div className="grid gap-3 md:grid-cols-3">
                                            <Metric label="Status" value={ktxBatchResult.success ? "OK" : "Falha"} />
                                            <Metric label="Imagens" value={String(ktxBatchResult.input_count)} />
                                            <Metric label="Output" value={ktxBatchResult.output_dir ? "gravado" : "n/a"} helper={ktxBatchResult.output_dir ?? undefined} />
                                        </div>
                                        <pre className="app-codeblock max-h-[460px] overflow-auto rounded-xl p-4 text-sm leading-6">
                                            {ktxBatchResult.summary}
                                        </pre>
                                    </div>
                                ) : (
                                    <EmptyState text="Preencha as pastas e rode o batch para ver o resumo." />
                                )
                            ) : null}

                            {active === "system" ? (
                                capabilities ? (
                                    <div className="space-y-4">
                                        <div className="grid gap-3 md:grid-cols-3">
                                            <Metric label="Endpoints" value={String(capabilities.endpoints.length)} />
                                            <Metric label="Modulos" value={String(capabilities.modules.length)} />
                                            <Metric label="API" value={capabilities.status} />
                                        </div>
                                        <pre className="app-codeblock max-h-[360px] overflow-auto rounded-xl p-4 text-sm leading-6">
                                            {JSON.stringify(capabilities, null, 2)}
                                        </pre>
                                    </div>
                                ) : (
                                    <EmptyState text="Status ainda carregando ou API offline." />
                                )
                            ) : null}
                        </Panel>
                    </motion.div>
                    )}

                    <footer className="app-faint flex flex-wrap items-center justify-between gap-3 pb-4 text-xs">
                        <span>rembg - vtracer - resvg - FastAPI - Next.js</span>
                        <span className="inline-flex items-center gap-2">
                            <Gauge className="size-3.5" />
                            UI inspirada no portfolio, com light/dark real
                        </span>
                    </footer>
                </main>
            </div>
        </div>
    )
}
