"use client"

import { motion } from "framer-motion"
import { Activity, Box, Download, ImagePlus, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import {
    CheckboxRow,
    EmptyState,
    Metric,
    Panel,
    SelectField,
    cardEnter,
} from "@/components/dashboard/primitives"
import { useDashboard } from "@/components/dashboard/DashboardProvider"
import { Dropzone } from "@/components/dropzone"
import { Button } from "@/components/ui/button"
import { KtxSingleResult } from "@/lib/dashboard-types"
import { appendFields, ktxData, postForm } from "@/lib/dashboard-utils"
import { errorText } from "@/lib/i18n"
import { useI18n, useMessage } from "@/lib/i18n/provider"

export function KtxSingleTool() {
    const { ktxPresetOptions, toktxFound, defaultKtxPreset } = useDashboard()
    const { t, fmt, resolve } = useI18n()

    const [file, setFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useMessage()
    const [result, setResult] = useState<KtxSingleResult | null>(null)

    const [ktxSingle, setKtxSingle] = useState({
        preset: defaultKtxPreset,
        autoAlign: true,
        autoPreset: false,
        validateQuality: false,
    })

    useEffect(() => {
        setKtxSingle((current) => ({ ...current, preset: current.preset || defaultKtxPreset }))
    }, [defaultKtxPreset])

    useEffect(() => {
        if (!file) {
            setPreviewUrl(null)
            return
        }
        const url = URL.createObjectURL(file)
        setPreviewUrl(url)
        return () => URL.revokeObjectURL(url)
    }, [file])

    async function runKtxSingle() {
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
                preset: ktxSingle.preset,
                auto_align: ktxSingle.autoAlign,
                auto_preset: ktxSingle.autoPreset,
                validate_quality: ktxSingle.validateQuality,
            })
            const data = await postForm<KtxSingleResult>("/api/ktx/single", fd)
            setResult(data)
            if (!data.success) setError(data.summary)
        } catch (err) {
            setError(errorText(err, (m) => m.ktxSingle.unexpected))
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

                <Panel title={t.ktxSingle.title} subtitle={t.ktxSingle.subtitle} icon={Box}>
                    <div className="grid gap-4">
                        <SelectField label={t.fields.preset} value={ktxSingle.preset} options={ktxPresetOptions} onChange={(preset) => setKtxSingle((current) => ({ ...current, preset }))} />
                        <div className="grid gap-3 md:grid-cols-3">
                            <CheckboxRow checked={ktxSingle.autoAlign} onChange={(autoAlign) => setKtxSingle((current) => ({ ...current, autoAlign }))} label={t.fields.autoAlign} helper={t.fields.autoAlignHelper} />
                            <CheckboxRow checked={ktxSingle.autoPreset} onChange={(autoPreset) => setKtxSingle((current) => ({ ...current, autoPreset }))} label={t.fields.autoPreset} helper={t.fields.autoPresetHelper} />
                            <CheckboxRow checked={ktxSingle.validateQuality} onChange={(validateQuality) => setKtxSingle((current) => ({ ...current, validateQuality }))} label={t.fields.validatePsnr} helper={t.fields.validatePsnrHelper} />
                        </div>
                        {toktxFound === false ? (
                            <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
                                {t.ktxSingle.missing}
                            </div>
                        ) : null}
                        <Button onClick={runKtxSingle} disabled={busy} size="lg" className="w-full">
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <Box className="size-4" />}
                            {t.ktxSingle.run}
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
                                <Metric label={t.metrics.output} value={fmt.bytes(result.size_output)} helper={result.ratio ? fmt.ratio(result.ratio) : undefined} />
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
                        <EmptyState text={t.ktxSingle.empty} />
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
