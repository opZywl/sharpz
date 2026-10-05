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
import { errorText, pick } from "@/lib/i18n"
import { useI18n, useMessage } from "@/lib/i18n/provider"
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
type PageMode = "auto" | "a4"
type OcrEngine = "auto" | "vision" | "tesseract"

const VISION_BASE_URL_KEY = "cleanup-image.vision-base-url"
const VISION_MODEL_KEY = "cleanup-image.vision-model"
const VISION_API_KEY_KEY = "cleanup-image.vision-api-key"
const OUTPUT_DIR_KEY = "cleanup-image.imgpdf-output-dir"
const DEFAULT_VISION_BASE_URL = "http://localhost:11434/v1"
const DEFAULT_VISION_MODEL = "llama3.2-vision"

const PAGE_MODES: PageMode[] = ["auto", "a4"]
const OCR_ENGINES: OcrEngine[] = ["auto", "vision", "tesseract"]

const LOG_TONE: Record<string, string> = {
    ok: "text-emerald-600 dark:text-emerald-300",
    warn: "text-amber-600 dark:text-amber-300",
    info: "app-faint",
}

export function ImageToPdfTool() {
    const { lang, t, fmt, resolve } = useI18n()
    const [srcLang] = useState(lang)
    const [file, setFile] = useState<File | null>(null)
    const [localPath, setLocalPath] = useState("")
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)

    const [pageMode, setPageMode] = useState<PageMode>("auto")
    const [ocrEngine, setOcrEngine] = useState<OcrEngine>("auto")
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
    const [error, setError] = useMessage()
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
            return
        }
    }, [])

    useEffect(() => {
        try {
            window.localStorage.setItem(VISION_BASE_URL_KEY, visionBaseUrl)
            window.localStorage.setItem(VISION_MODEL_KEY, visionModel)
            window.localStorage.setItem(VISION_API_KEY_KEY, visionApiKey)
            window.localStorage.setItem(OUTPUT_DIR_KEY, outputDir)
        } catch {
            return
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
                    .catch(() => undefined)
            }
            return
        }
        if (event.type === "error") {
            if (typeof event.message === "string") setError(event.message)
            else if (event.reason === "disconnected") setError((m) => m.imgpdf.connectionLost)
            else setError((m) => m.imgpdf.convertError)
            setStatus("error")
            sourceRef.current?.close()
            sourceRef.current = null
        }
    }

    async function handleConvert() {
        if (!file && !localPath.trim()) {
            setError((m) => m.imgpdf.needSource)
            return
        }
        if (ocrEngine === "vision" && (!visionBaseUrl.trim() || !visionModel.trim())) {
            setError((m) => m.imgpdf.visionRequired)
            return
        }
        if (ocrEngine === "tesseract" && tesseractOk === false) {
            setError((m) => m.imgpdf.tesseractMissing)
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
            setError(errorText(err, (m) => m.imgpdf.startFailed))
            setStatus("error")
        }
    }

    async function handleOpenFolder() {
        if (!jobId) return
        setOpeningFolder(true)
        try {
            await openImgPdfFolder(jobId)
        } catch (err) {
            setError(errorText(err, (m) => m.imgpdf.openFolderFailed))
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
                        <span className="whitespace-pre-wrap">{resolve(error)}</span>
                    </div>
                </div>
            ) : null}

            <motion.div {...cardEnter} className="grid gap-4 xl:grid-cols-[minmax(290px,0.72fr)_minmax(0,1.28fr)]">
                <Panel title={t.imgpdf.imageTitle} subtitle={t.imgpdf.imageSubtitle} icon={FileText}>
                    <div className="grid gap-4">
                        <FileField
                            file={file}
                            onChange={setFile}
                            accept="image/*"
                            label={t.imgpdf.chooseImage}
                            helper="png, jpg, webp, bmp, tiff"
                        />
                        <TextField
                            label={t.imgpdf.localPath}
                            value={localPath}
                            onChange={setLocalPath}
                            placeholder={t.placeholders.imageFile}
                        />
                        {previewUrl ? (
                            <div className="preview-card overflow-hidden rounded-xl">
                                <img src={previewUrl} alt={t.imgpdf.sourceAlt} className="max-h-[320px] w-full object-contain p-3" />
                            </div>
                        ) : null}
                    </div>
                </Panel>

                <Panel title={t.imgpdf.optionsTitle} subtitle={t.imgpdf.optionsSubtitle} icon={Settings2}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 md:grid-cols-2">
                            <SelectField
                                label={t.imgpdf.page}
                                value={pageMode}
                                options={PAGE_MODES.map((value) => ({ value, label: t.imgpdf.pages[value] }))}
                                onChange={setPageMode}
                            />
                            <SelectField
                                label={t.imgpdf.engine}
                                value={ocrEngine}
                                options={OCR_ENGINES.map((value) => ({ value, label: t.imgpdf.engines[value] }))}
                                onChange={setOcrEngine}
                            />
                        </div>

                        <CheckboxRow
                            checked={verify}
                            onChange={setVerify}
                            label={t.imgpdf.verify}
                            helper={t.imgpdf.verifyHelper}
                        />

                        {ocrEngine !== "tesseract" ? (
                            <div className="grid gap-3 rounded-xl border border-foreground/10 p-3">
                                <span className="field-label">{t.imgpdf.visionTitle}</span>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <TextField label={t.imgpdf.baseUrl} value={visionBaseUrl} onChange={setVisionBaseUrl} placeholder={DEFAULT_VISION_BASE_URL} />
                                    <TextField label={t.fields.model} value={visionModel} onChange={setVisionModel} placeholder={DEFAULT_VISION_MODEL} />
                                </div>
                                <TextField label={t.fields.apiKeyOptional} value={visionApiKey} onChange={setVisionApiKey} placeholder="sk-..." type="password" />
                                <span className="app-faint text-xs">
                                    {ocrEngine === "auto" ? t.imgpdf.autoHint : t.imgpdf.visionHint}
                                    {tesseractOk === false ? t.imgpdf.tesseractHint : ""}
                                </span>
                            </div>
                        ) : null}

                        <div className="grid gap-3 md:grid-cols-2">
                            <TextField label={t.imgpdf.pdfName} value={outputName} onChange={setOutputName} placeholder={t.imgpdf.pdfNamePlaceholder} />
                            <TextField label={t.fields.outputFolderOptional} value={outputDir} onChange={setOutputDir} placeholder={t.placeholders.folder} />
                        </div>
                        <CheckboxRow checked={openFolderOpt} onChange={setOpenFolderOpt} label={t.imgpdf.openWhenDone} />

                        <Button onClick={handleConvert} disabled={running} size="lg" className="w-full">
                            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                            {t.imgpdf.run}
                        </Button>
                    </div>
                </Panel>
            </motion.div>

            <motion.div {...cardEnter}>
                <Panel title={t.imgpdf.progressTitle} subtitle={t.imgpdf.progressSubtitle} icon={Terminal}>
                    {status === "idle" ? (
                        <EmptyState text={t.imgpdf.empty} />
                    ) : (
                        <div className="space-y-4">
                            <div className="grid gap-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="app-faint font-semibold uppercase tracking-[0.16em]">
                                        {pick(t.imgpdf.stages, stage) || stage || t.imgpdf.processing}
                                    </span>
                                    <span className="font-jakarta font-extrabold">{fmt.percent(pct)}</span>
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
                                        <span className="app-muted">{t.imgpdf.starting}</span>
                                    </div>
                                )}
                            </div>

                            {degraded.length ? (
                                <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
                                    {t.imgpdf.degraded(degraded.map((item) => pick(t.imgpdf.degradedNames, item) ?? item).join(", "))}
                                </div>
                            ) : null}

                            {status === "done" && manifest ? (
                                <>
                                    <div className="grid gap-3 md:grid-cols-4">
                                        <Metric label={t.imgpdf.engineMetric} value={pick(t.imgpdf.engineNames, manifest.engine) ?? manifest.engine} />
                                        <Metric label={t.imgpdf.blocks} value={fmt.number(manifest.blocks)} />
                                        <Metric label={t.imgpdf.chars} value={fmt.number(report ? report.chars : 0)} helper={report ? t.imgpdf.hyphens(report.hyphens) : undefined} />
                                        <Metric
                                            label={t.imgpdf.layer}
                                            value={report?.clean ? t.imgpdf.clean : t.imgpdf.glitchy}
                                            helper={report ? t.imgpdf.pageSize(report.page_pt?.map((v) => fmt.number(v)).join(" x ") ?? "") : undefined}
                                        />
                                    </div>

                                    {report && report.glitch_total === 0 ? (
                                        <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
                                            <CheckCircle2 className="size-4 shrink-0" />
                                            {t.imgpdf.layerChecked}
                                        </div>
                                    ) : null}

                                    {jobId ? (
                                        <div className="preview-card overflow-hidden rounded-xl">
                                            <img src={imgPdfPreviewUrl(jobId, srcLang)} alt={t.imgpdf.pdfAlt} className="max-h-[520px] w-full object-contain p-3" />
                                        </div>
                                    ) : null}

                                    <div className="flex flex-wrap items-center gap-2">
                                        {jobId ? (
                                            <Button asChild>
                                                <a href={imgPdfDownloadUrl(jobId, lang)} download={manifest.pdf_name}>
                                                    <Download className="size-4" />
                                                    {t.imgpdf.downloadPdf}
                                                </a>
                                            </Button>
                                        ) : null}
                                        <Button type="button" variant="outline" onClick={handleOpenFolder} disabled={openingFolder}>
                                            {openingFolder ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
                                            {t.common.openFolder}
                                        </Button>
                                        {elapsed != null ? (
                                            <span className="app-faint text-xs">{fmt.seconds(elapsed, 1)}</span>
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
