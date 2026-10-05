"use client"

import { motion } from "framer-motion"
import { Activity, Archive, Download, Loader2, ShieldCheck } from "lucide-react"
import { useState } from "react"

import {
    EmptyState,
    FileField,
    Metric,
    Panel,
    TextField,
    cardEnter,
} from "@/components/dashboard/primitives"
import { Button } from "@/components/ui/button"
import { KtxPatchResult } from "@/lib/dashboard-types"
import { appendFields, ktxData, postForm } from "@/lib/dashboard-utils"
import { errorText } from "@/lib/i18n"
import { useI18n, useMessage } from "@/lib/i18n/provider"

export function KtxOrientationTool() {
    const { t, fmt, resolve } = useI18n()
    const [ktxFile, setKtxFile] = useState<File | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useMessage()
    const [result, setResult] = useState<KtxPatchResult | null>(null)

    const [ktxPatch, setKtxPatch] = useState({
        outputName: "",
        outputPath: "",
    })

    async function runKtxPatch() {
        if (!ktxFile) {
            setError((m) => m.ktxOrientation.needFile)
            return
        }
        setBusy(true)
        setError(null)
        try {
            const fd = new FormData()
            fd.append("file", ktxFile)
            appendFields(fd, {
                output_name: ktxPatch.outputName,
                output_path: ktxPatch.outputPath,
            })
            const data = await postForm<KtxPatchResult>("/api/ktx/orientation", fd)
            setResult(data)
            if (!data.success) setError(data.summary)
        } catch (err) {
            setError(errorText(err, (m) => m.ktxOrientation.unexpected))
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
                <Panel title={t.ktxOrientation.fileTitle} subtitle={t.ktxOrientation.fileSubtitle} icon={Archive}>
                    <FileField file={ktxFile} onChange={setKtxFile} accept=".ktx,.ktx2,application/octet-stream" label={t.ktxOrientation.choose} helper={t.ktxOrientation.chooseHelper} />
                </Panel>
                <Panel title={t.ktxOrientation.title} subtitle={t.ktxOrientation.subtitle} icon={ShieldCheck}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 xl:grid-cols-2">
                            <TextField label={t.fields.fileName} value={ktxPatch.outputName} onChange={(outputName) => setKtxPatch((current) => ({ ...current, outputName }))} placeholder={t.placeholders.textureFile} />
                            <TextField label={t.fields.alsoSaveTo} value={ktxPatch.outputPath} onChange={(outputPath) => setKtxPatch((current) => ({ ...current, outputPath }))} placeholder={t.placeholders.folder} />
                        </div>
                        <Button onClick={runKtxPatch} disabled={busy} size="lg" className="w-full">
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                            {t.ktxOrientation.run}
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
                                <Metric label={t.metrics.input} value={fmt.bytes(result.size_input)} />
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
                        <EmptyState text={t.ktxOrientation.empty} />
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
