"use client"

import { motion } from "framer-motion"
import {
    CheckCircle2,
    Download,
    FileText,
    FolderOpen,
    Loader2,
    Play,
    Settings2,
    Terminal,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
    CheckboxRow,
    EmptyState,
    FileField,
    Metric,
    Panel,
    SelectField,
    TextField,
    cardEnter,
} from "@/components/dashboard/primitives"
import { cn } from "@/lib/utils"
import {
    getImgPdfCapabilities,
    getImgPdfJob,
    imgPdfDownloadUrl,
    imgPdfPreviewUrl,
    openImgPdfFolder,
    openImgPdfStream,
    startImageToPdf,
    type ImgPdfEvent,
    type ImgPdfLog,
    type ImgPdfManifest,
} from "@/lib/imgpdf-api"

type Status = "idle" | "running" | "done" | "error"

const VISION_BASE_URL_KEY = "cleanup-image.vision-base-url"
const VISION_MODEL_KEY = "cleanup-image.vision-model"
const VISION_API_KEY_KEY = "cleanup-image.vision-api-key"
const OUTPUT_DIR_KEY = "cleanup-image.imgpdf-output-dir"
const DEFAULT_VISION_BASE_URL = "http://localhost:11434/v1"
const DEFAULT_VISION_MODEL = "llama3.2-vision"

const pageOptions = [
    { value: "auto", label: "Automatico (proporcao da imagem)" },
    { value: "a4", label: "A4" },
] as const

const engineOptions = [
    { value: "auto", label: "Auto (Vision -> Tesseract)" },
    { value: "vision", label: "Somente Vision LLM" },
    { value: "tesseract", label: "Somente Tesseract (local)" },
] as const

const STAGE_LABELS: Record<string, string> = {
    queued: "na fila",
    start: "iniciando",
    carregar: "carregando imagem",
    layout: "analisando layout",
    transcrever: "transcrevendo (lendo a imagem)",
    verificar: "verificacao adversarial",
    montar: "montando camada de texto",
    "construir-pdf": "construindo PDF",
    conferir: "conferindo o PDF",
    entregar: "entregando",
    done: "concluido",
    error: "erro",
}

const ENGINE_LABELS: Record<string, string> = {
    vision: "IA de visão",
    tesseract: "Tesseract",
    nenhum: "Nenhum",
}

const DEGRADED_LABELS: Record<string, string> = {
    vision: "IA de visão falhou",
    "vision-vazio": "IA de visão não leu texto",
    "tesseract-vazio": "Tesseract não leu texto",
    "sem-ocr": "sem leitura de texto",
}

const LOG_TONE: Record<string, string> = {
    ok: "text-emerald-600 dark:text-emerald-300",
    warn: "text-amber-600 dark:text-amber-300",
    info: "app-faint",
}

export function ImageToPdfTool() {
    const [file, setFile] = useState<File | null>(null)
    const [localPath, setLocalPath] = useState("")
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)

    const [pageMode, setPageMode] = useState<"auto" | "a4">("auto")
    const [ocrEngine, setOcrEngine] = useState<"auto" | "vision" | "tesseract">("auto")
    const [verify, setVerify] = useState(true)
    const [visionBaseUrl, setVisionBaseUrl] = useState(DEFAULT_VISION_BASE_URL)
    const [visionModel, setVisionModel] = useState(DEFAULT_VISION_MODEL)
    const [visionApiKey, setVisionApiKey] = useState("")
    const [outputDir, setOutputDir] = useState("")
    const [outputName, setOutputName] = useState("")
    const [openFolderOpt, setOpenFolderOpt] = useState(false)
    const [tesseractOk, setTesseractOk] = useState<boolean | null>(null)

    const [status, setStatus] = useState<Status>("idle")
    const [pct, setPct] = useState(0)
    const [stage, setStage] = useState("")
    const [logs, setLogs] = useState<ImgPdfLog[]>([])
    const [manifest, setManifest] = useState<ImgPdfManifest | null>(null)
    const [degraded, setDegraded] = useState<string[]>([])
    const [elapsed, setElapsed] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [jobId, setJobId] = useState<string | null>(null)
    const [openingFolder, setOpeningFolder] = useState(false)

    const sourceRef = useRef<EventSource | null>(null)
    const logEndRef = useRef<HTMLDivElement | null>(null)
    const jobIdRef = useRef<string | null>(null)

    useEffect(() => {
        getImgPdfCapabilities()
            .then((cap) => setTesseractOk(cap.tesseract))
            .catch(() => setTesseractOk(null))
    }, [])

    useEffect(() => {
        try {
            const b = window.localStorage.getItem(VISION_BASE_URL_KEY)
            const m = window.localStorage.getItem(VISION_MODEL_KEY)
            const k = window.localStorage.getItem(VISION_API_KEY_KEY)
            const d = window.localStorage.getItem(OUTPUT_DIR_KEY)
            if (b) setVisionBaseUrl(b)
            if (m) setVisionModel(m)
            if (k) setVisionApiKey(k)
            if (d) setOutputDir(d)
        } catch {
            // ignora indisponibilidade de localStorage
        }
    }, [])

    useEffect(() => {
        try {
            window.localStorage.setItem(VISION_BASE_URL_KEY, visionBaseUrl)
            window.localStorage.setItem(VISION_MODEL_KEY, visionModel)
            window.localStorage.setItem(VISION_API_KEY_KEY, visionApiKey)
            window.localStorage.setItem(OUTPUT_DIR_KEY, outputDir)
        } catch {
            // ignora indisponibilidade de localStorage
        }
    }, [visionBaseUrl, visionModel, visionApiKey, outputDir])

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
        return () => {
            sourceRef.current?.close()
        }
    }, [])

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }, [logs.length])

    function handleEvent(event: ImgPdfEvent) {
        if (event.type === "log") {
            setLogs((current) => [
                ...current,
                { level: (event.level as ImgPdfLog["level"]) || "info", message: String(event.message ?? "") },
            ])
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
        if (event.type === "done") {
            setPct(1)
            setStage("done")
            setStatus("done")
            if (typeof event.elapsed === "number") setElapsed(event.elapsed)
            if (Array.isArray(event.degraded)) setDegraded(event.degraded as string[])
            if (event.manifest && typeof event.manifest === "object") {
                setManifest(event.manifest as ImgPdfManifest)
            }
            sourceRef.current?.close()
            sourceRef.current = null
            const jid = jobIdRef.current
            if (jid) {
                getImgPdfJob(jid)
                    .then((job) => {
                        setLogs(job.logs)
                        setManifest(job.manifest)
                        setDegraded(job.degraded)
                        if (typeof job.elapsed === "number") setElapsed(job.elapsed)
                    })
                    .catch(() => {
                        // mantem o que veio pelo stream
                    })
            }
            return
        }
        if (event.type === "error") {
            setError(typeof event.message === "string" ? event.message : "Erro durante a conversao.")
            setStatus("error")
            sourceRef.current?.close()
            sourceRef.current = null
        }
    }

    async function handleConvert() {
        if (!file && !localPath.trim()) {
            setError("Carregue uma imagem ou informe um caminho local.")
            return
        }
        if (ocrEngine === "vision" && (!visionBaseUrl.trim() || !visionModel.trim())) {
            setError("Motor 'Somente Vision' exige base URL e modelo do Vision LLM.")
            return
        }
        if (ocrEngine === "tesseract" && tesseractOk === false) {
            setError("Tesseract nao esta instalado. Instale em 'Baixar pacotes' ou use Vision/Auto.")
            return
        }

        sourceRef.current?.close()
        sourceRef.current = null
        setStatus("running")
        setPct(0)
        setStage("queued")
        setLogs([])
        setManifest(null)
        setDegraded([])
        setElapsed(null)
        setError(null)

        try {
            const form = new FormData()
            if (file) form.append("file", file)
            if (localPath.trim()) form.append("local_path", localPath.trim())
            form.append("page_mode", pageMode)
            form.append("ocr_engine", ocrEngine)
            form.append("verify", String(verify))
            if (ocrEngine !== "tesseract") {
                form.append("vision_base_url", visionBaseUrl.trim())
                form.append("vision_model", visionModel.trim())
                if (visionApiKey.trim()) form.append("vision_api_key", visionApiKey.trim())
            }
            if (outputDir.trim()) form.append("output_dir", outputDir.trim())
            if (outputName.trim()) form.append("output_name", outputName.trim())
            form.append("open_folder", String(openFolderOpt))

            const { job_id } = await startImageToPdf(form)
            jobIdRef.current = job_id
            setJobId(job_id)
            sourceRef.current = openImgPdfStream(job_id, handleEvent)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro inesperado ao iniciar a conversao.")
            setStatus("error")
        }
    }

    async function handleOpenFolder() {
        if (!jobId) return
        setOpeningFolder(true)
        try {
            await openImgPdfFolder(jobId)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Nao foi possivel abrir a pasta.")
        } finally {
            setOpeningFolder(false)
        }
    }

    const running = status === "running"
    const report = manifest?.report

    return (
        <div className="space-y-4">
            {error ? (
                <div className="app-alert rounded-xl px-4 py-3 text-sm">
                    <div className="flex gap-2">
                        <FileText className="mt-0.5 size-4 shrink-0" />
                        <span className="whitespace-pre-wrap">{error}</span>
                    </div>
                </div>
            ) : null}

            <motion.div {...cardEnter} className="grid gap-4 xl:grid-cols-[minmax(290px,0.72fr)_minmax(0,1.28fr)]">
                <Panel title="Imagem" subtitle="Envie a imagem com texto ou aponte um caminho local." icon={FileText}>
                    <div className="grid gap-4">
                        <FileField
                            file={file}
                            onChange={setFile}
                            accept="image/*"
                            label="Escolher imagem"
                            helper="png, jpg, webp, bmp, tiff"
                        />
                        <TextField
                            label="Caminho local (alternativo)"
                            value={localPath}
                            onChange={setLocalPath}
                            placeholder="C:/caminho/para/imagem.png"
                        />
                        {previewUrl ? (
                            <div className="preview-card overflow-hidden rounded-xl">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={previewUrl} alt="origem" className="max-h-[320px] w-full object-contain p-3" />
                            </div>
                        ) : null}
                    </div>
                </Panel>

                <Panel title="Opcoes" subtitle="Pagina, motor de leitura, verificacao e saida." icon={Settings2}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 md:grid-cols-2">
                            <SelectField
                                label="Pagina"
                                value={pageMode}
                                options={pageOptions.map((o) => ({ value: o.value, label: o.label }))}
                                onChange={(v) => setPageMode(v as "auto" | "a4")}
                            />
                            <SelectField
                                label="Motor de leitura"
                                value={ocrEngine}
                                options={engineOptions.map((o) => ({ value: o.value, label: o.label }))}
                                onChange={(v) => setOcrEngine(v as "auto" | "vision" | "tesseract")}
                            />
                        </div>

                        <CheckboxRow
                            checked={verify}
                            onChange={setVerify}
                            label="Verificacao rigorosa (2a leitura + cruzamento)"
                            helper="Re-le as regioes e corrige divergencias antes de gerar. Mais lento, porem mais preciso."
                        />

                        {ocrEngine !== "tesseract" ? (
                            <div className="grid gap-3 rounded-xl border border-foreground/10 p-3">
                                <span className="field-label">Vision LLM (OpenAI-compativel)</span>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <TextField label="Base URL" value={visionBaseUrl} onChange={setVisionBaseUrl} placeholder={DEFAULT_VISION_BASE_URL} />
                                    <TextField label="Modelo" value={visionModel} onChange={setVisionModel} placeholder={DEFAULT_VISION_MODEL} />
                                </div>
                                <TextField label="API key (opcional)" value={visionApiKey} onChange={setVisionApiKey} placeholder="sk-..." type="password" />
                                <span className="app-faint text-xs">
                                    {ocrEngine === "auto"
                                        ? "Sem Vision configurado, cai pro Tesseract local automaticamente."
                                        : "Obrigatorio no modo 'Somente Vision'."}
                                    {tesseractOk === false ? " Tesseract nao detectado (instale em Baixar pacotes)." : ""}
                                </span>
                            </div>
                        ) : null}

                        <div className="grid gap-3 md:grid-cols-2">
                            <TextField label="Nome do PDF (opcional)" value={outputName} onChange={setOutputName} placeholder="auto (nome da imagem)" />
                            <TextField label="Pasta de saida (opcional)" value={outputDir} onChange={setOutputDir} placeholder="C:/caminho/para/pasta" />
                        </div>
                        <CheckboxRow checked={openFolderOpt} onChange={setOpenFolderOpt} label="Abrir pasta ao terminar" />

                        <Button onClick={handleConvert} disabled={running} size="lg" className="w-full">
                            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                            Converter para PDF
                        </Button>
                    </div>
                </Panel>
            </motion.div>

            <motion.div {...cardEnter}>
                <Panel title="Conversao" subtitle="Passo a passo ao vivo, conferencia e download do PDF." icon={Terminal}>
                    {status === "idle" ? (
                        <EmptyState text="Configure as opcoes e clique em Converter para PDF." />
                    ) : (
                        <div className="space-y-4">
                            <div className="grid gap-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="app-faint font-semibold uppercase tracking-[0.16em]">
                                        {STAGE_LABELS[stage] || stage || "processando"}
                                    </span>
                                    <span className="font-jakarta font-extrabold">{Math.round(pct * 100)}%</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
                                    <div
                                        className="h-full rounded-full bg-foreground/70 transition-all"
                                        style={{ width: `${Math.min(100, Math.max(0, pct * 100))}%` }}
                                    />
                                </div>
                            </div>

                            <div className="preview-card max-h-[360px] overflow-auto p-3 font-mono text-xs leading-5">
                                {logs.length ? (
                                    <div className="grid gap-0.5">
                                        {logs.map((entry, index) => (
                                            <div key={index} className={cn("flex gap-2", LOG_TONE[entry.level] || "app-faint")}>
                                                <span className="select-none opacity-50">{entry.level === "ok" ? ">>" : "·"}</span>
                                                <span className="whitespace-pre-wrap break-words">{entry.message}</span>
                                            </div>
                                        ))}
                                        <div ref={logEndRef} />
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center gap-2 px-4 py-10 text-center">
                                        <Loader2 className="size-4 animate-spin" />
                                        <span className="app-muted">Iniciando o pipeline...</span>
                                    </div>
                                )}
                            </div>

                            {degraded.length ? (
                                <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
                                    Etapas com falha: {degraded.map((item) => DEGRADED_LABELS[item] ?? item).join(", ")}. O PDF foi gerado idêntico à imagem mesmo assim.
                                </div>
                            ) : null}

                            {status === "done" && manifest ? (
                                <>
                                    <div className="grid gap-3 md:grid-cols-4">
                                        <Metric label="Motor" value={ENGINE_LABELS[manifest.engine] ?? manifest.engine} />
                                        <Metric label="Blocos" value={String(manifest.blocks)} />
                                        <Metric label="Caracteres" value={report ? String(report.chars) : "0"} helper={report ? `${report.hyphens} hifens` : undefined} />
                                        <Metric
                                            label="Camada"
                                            value={report?.clean ? "limpa" : "com caracteres estranhos"}
                                            helper={report ? `página ${report.page_pt?.join(" x ")} pt` : undefined}
                                        />
                                    </div>

                                    {report && report.glitch_total === 0 ? (
                                        <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
                                            <CheckCircle2 className="size-4 shrink-0" />
                                            Camada de texto conferida: 0 NBSP / hifen-suave / parentese ornamental.
                                        </div>
                                    ) : null}

                                    {jobId ? (
                                        <div className="preview-card overflow-hidden rounded-xl">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={imgPdfPreviewUrl(jobId)} alt="PDF gerado" className="max-h-[520px] w-full object-contain p-3" />
                                        </div>
                                    ) : null}

                                    <div className="flex flex-wrap items-center gap-2">
                                        {jobId ? (
                                            <Button asChild>
                                                <a href={imgPdfDownloadUrl(jobId)} download={manifest.pdf_name}>
                                                    <Download className="size-4" />
                                                    Baixar PDF
                                                </a>
                                            </Button>
                                        ) : null}
                                        <Button type="button" variant="outline" onClick={handleOpenFolder} disabled={openingFolder}>
                                            {openingFolder ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
                                            Abrir pasta
                                        </Button>
                                        {elapsed != null ? (
                                            <span className="app-faint text-xs">{elapsed.toFixed(1)}s</span>
                                        ) : null}
                                    </div>
                                </>
                            ) : null}
                        </div>
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
