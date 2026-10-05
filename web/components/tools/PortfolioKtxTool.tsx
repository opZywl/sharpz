"use client"

import { motion } from "framer-motion"
import { Activity, Download, ImagePlus, Loader2, PackageCheck } from "lucide-react"
import { useEffect, useState } from "react"

import {
    EmptyState,
    Metric,
    Panel,
    TextField,
    cardEnter,
} from "@/components/dashboard/primitives"
import { useDashboard } from "@/components/dashboard/DashboardProvider"
import { Dropzone } from "@/components/dropzone"
import { Button } from "@/components/ui/button"
import { PortfolioKtxResult } from "@/lib/dashboard-types"
import { appendFields, ktxData, postForm } from "@/lib/dashboard-utils"
import { errorText } from "@/lib/i18n"
import { useI18n, useMessage } from "@/lib/i18n/provider"

export function PortfolioKtxTool() {
    const { capabilities } = useDashboard()
    const { t, fmt, resolve } = useI18n()

    const [file, setFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useMessage()
    const [result, setResult] = useState<PortfolioKtxResult | null>(null)

    const [portfolioKtx, setPortfolioKtx] = useState({
        outputName: "",
        outputPath: "",
    })

    useEffect(() => {
        if (!file) {
            setPreviewUrl(null)
            return
        }
        const url = URL.createObjectURL(file)
        setPreviewUrl(url)
        return () => URL.revokeObjectURL(url)
    }, [file])

    async function runPortfolioKtx() {
        if (!file) {
            setError((m) => m.common.needImage)
            return
        }
        setBusy(true)
        setError(null)
        try {
            const fd = new FormData()
            fd.append("file", file)
            appendFields(fd, {
                output_name: portfolioKtx.outputName,
                output_path: portfolioKtx.outputPath,
            })
            const data = await postForm<PortfolioKtxResult>("/api/ktx/portfolio", fd)
            setResult(data)
            if (!data.success) setError(data.summary)
        } catch (err) {
            setError(errorText(err, (m) => m.portfolio.unexpected))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-4">
            {error ? (
                <div className="app-alert rounded-xl px-4 py-3 text-sm">
                    <div className="flex gap-2">
                        <span className="whitespace-pre-wrap">{resolve(error)}</span>
                    </div>
                </div>
            ) : null}

            <motion.div {...cardEnter} className="grid gap-4 xl:grid-cols-[minmax(290px,0.72fr)_minmax(0,1.28fr)]">
                <Panel title={t.common.source} subtitle={t.common.sourceSubtitle} icon={ImagePlus}>
                    <Dropzone file={file} previewUrl={previewUrl} onChange={setFile} />
                </Panel>

                <Panel title={t.portfolio.title} subtitle={t.portfolio.subtitle} icon={PackageCheck}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 xl:grid-cols-2">
                            <TextField label={t.fields.fileName} value={portfolioKtx.outputName} onChange={(outputName) => setPortfolioKtx((current) => ({ ...current, outputName }))} placeholder={t.placeholders.textureFile} />
                            <TextField label={t.fields.alsoSaveTo} value={portfolioKtx.outputPath} onChange={(outputPath) => setPortfolioKtx((current) => ({ ...current, outputPath }))} placeholder={t.placeholders.folder} />
                        </div>
                        {capabilities?.alktx2_found === false ? (
                            <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
                                {t.portfolio.missing}
                            </div>
                        ) : null}
                        <div className="grid gap-3 md:grid-cols-3">
                            <Metric label={t.portfolio.canvas} value="960 x 540" helper={t.portfolio.canvasHelper} />
                            <Metric label={t.portfolio.codec} value="ETC1S" helper="q255 sRGB" />
                            <Metric label={t.portfolio.orientation} value={t.portfolio.fixed} helper={t.portfolio.ready3d} />
                        </div>
                        <Button onClick={runPortfolioKtx} disabled={busy} size="lg" className="w-full">
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
                            {t.portfolio.run}
                        </Button>
                    </div>
                </Panel>
            </motion.div>

            <motion.div {...cardEnter}>
                <Panel title={t.common.result} subtitle={t.common.resultSubtitle} icon={Activity}>
                    {result ? (
                        <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-3">
                                <Metric label={t.metrics.status} value={result.success ? t.status.okTitle : t.status.failed} />
                                <Metric label={t.portfolio.canvas} value={`${result.target_width} x ${result.target_height}`} />
                                <Metric label={t.metrics.output} value={fmt.bytes(result.size_output)} helper={result.saved_path ?? undefined} />
                            </div>
                            <pre className="app-codeblock max-h-64 overflow-auto rounded-xl p-4 text-sm leading-6">
                                {result.summary}
                            </pre>
                            {result.success && result.ktx_b64 && result.filename ? (
                                <Button asChild variant="outline">
                                    <a href={ktxData(result.ktx_b64)} download={result.filename}>
                                        <Download className="size-4" />
                                        {t.common.downloadName(result.filename)}
                                    </a>
                                </Button>
                            ) : null}
                        </div>
                    ) : (
                        <EmptyState text={t.portfolio.empty} />
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
