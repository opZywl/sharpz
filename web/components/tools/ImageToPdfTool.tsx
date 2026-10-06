"use client"

import { motion } from "framer-motion"
import { FileText } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { cardEnter } from "@/components/dashboard/primitives"
import { ImgPdfOptionsPanel } from "@/components/tools/imgpdf/ImgPdfOptionsPanel"
import { ImgPdfProgressPanel } from "@/components/tools/imgpdf/ImgPdfProgressPanel"
import { ImgPdfSourcePanel } from "@/components/tools/imgpdf/ImgPdfSourcePanel"
import {
    DEFAULT_VISION_BASE_URL,
    DEFAULT_VISION_MODEL,
    OUTPUT_DIR_KEY,
    VISION_API_KEY_KEY,
    VISION_BASE_URL_KEY,
    VISION_MODEL_KEY,
    type OcrEngine,
    type PageMode,
    type Status,
} from "@/components/tools/imgpdf/imgpdf-settings"
import { errorText } from "@/lib/i18n"
import { useI18n, useMessage } from "@/lib/i18n/provider"
import {
    getImgPdfCapabilities,
    getImgPdfJob,
    openImgPdfFolder,
    openImgPdfStream,
    startImageToPdf,
    type ImgPdfEvent,
    type ImgPdfLog,
    type ImgPdfManifest,
} from "@/lib/imgpdf-api"

export function ImageToPdfTool() {
    const { lang, resolve } = useI18n()
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
                <ImgPdfSourcePanel
                    file={file}
                    setFile={setFile}
                    localPath={localPath}
                    setLocalPath={setLocalPath}
                    previewUrl={previewUrl}
                />

                <ImgPdfOptionsPanel
                    pageMode={pageMode}
                    setPageMode={setPageMode}
                    ocrEngine={ocrEngine}
                    setOcrEngine={setOcrEngine}
                    verify={verify}
                    setVerify={setVerify}
                    visionBaseUrl={visionBaseUrl}
                    setVisionBaseUrl={setVisionBaseUrl}
                    visionModel={visionModel}
                    setVisionModel={setVisionModel}
                    visionApiKey={visionApiKey}
                    setVisionApiKey={setVisionApiKey}
                    outputName={outputName}
                    setOutputName={setOutputName}
                    outputDir={outputDir}
                    setOutputDir={setOutputDir}
                    openFolderOpt={openFolderOpt}
                    setOpenFolderOpt={setOpenFolderOpt}
                    tesseractOk={tesseractOk}
                    running={running}
                    handleConvert={handleConvert}
                />
            </motion.div>

            <motion.div {...cardEnter}>
                <ImgPdfProgressPanel
                    status={status}
                    stage={stage}
                    pct={pct}
                    logs={logs}
                    logEndRef={logEndRef}
                    degraded={degraded}
                    manifest={manifest}
                    report={report}
                    jobId={jobId}
                    srcLang={srcLang}
                    openingFolder={openingFolder}
                    handleOpenFolder={handleOpenFolder}
                    elapsed={elapsed}
                />
            </motion.div>
        </div>
    )
}
