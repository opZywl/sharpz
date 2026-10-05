"use client"

import { motion } from "framer-motion"
import { Activity, FolderSync, Loader2 } from "lucide-react"
import { useState } from "react"

import {
    CheckboxRow,
    EmptyState,
    Metric,
    Panel,
    SelectField,
    TextField,
    cardEnter,
} from "@/components/dashboard/primitives"
import { useDashboard } from "@/components/dashboard/DashboardProvider"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { DEFAULT_KTX_PRESET, KtxBatchResult } from "@/lib/dashboard-types"
import { appendFields, postForm } from "@/lib/dashboard-utils"
import { errorText } from "@/lib/i18n"
import { useI18n, useMessage } from "@/lib/i18n/provider"

export function KtxBatchTool() {
    const { defaultKtxPreset, ktxPresetOptions } = useDashboard()
    const { t, fmt, resolve } = useI18n()

    const [busy, setBusy] = useState(false)
    const [error, setError] = useMessage()
    const [result, setResult] = useState<KtxBatchResult | null>(null)

    const [ktxBatch, setKtxBatch] = useState({
        folderPath: "",
        outputPath: "",
        preset: defaultKtxPreset || DEFAULT_KTX_PRESET,
        recursive: true,
        flatten: false,
        autoAlign: true,
        autoPreset: false,
        validateQuality: false,
        maxWorkers: 4,
    })

    async function runKtxBatch() {
        setBusy(true)
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
            setResult(data)
            if (!data.success) setError(data.summary)
        } catch (err) {
            setError(errorText(err, (m) => m.ktxBatch.unexpected))
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

            <motion.div {...cardEnter}>
                <Panel title={t.ktxBatch.title} subtitle={t.ktxBatch.subtitle} icon={FolderSync}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 xl:grid-cols-2">
                            <TextField label={t.fields.inputFolder} value={ktxBatch.folderPath} onChange={(folderPath) => setKtxBatch((current) => ({ ...current, folderPath }))} placeholder={t.placeholders.imagesFolder} />
                            <TextField label={t.fields.outputFolder} value={ktxBatch.outputPath} onChange={(outputPath) => setKtxBatch((current) => ({ ...current, outputPath }))} placeholder={t.placeholders.ktxOutputFolder} />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <SelectField label={t.fields.preset} value={ktxBatch.preset} options={ktxPresetOptions} onChange={(preset) => setKtxBatch((current) => ({ ...current, preset }))} />
                            <Slider label={t.ktxBatch.workers} value={ktxBatch.maxWorkers} min={1} max={16} step={1} onChange={(maxWorkers) => setKtxBatch((current) => ({ ...current, maxWorkers }))} />
                            <CheckboxRow checked={ktxBatch.recursive} onChange={(recursive) => setKtxBatch((current) => ({ ...current, recursive }))} label={t.fields.recursive} />
                            <CheckboxRow checked={ktxBatch.flatten} onChange={(flatten) => setKtxBatch((current) => ({ ...current, flatten }))} label={t.ktxBatch.flatten} />
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                            <CheckboxRow checked={ktxBatch.autoAlign} onChange={(autoAlign) => setKtxBatch((current) => ({ ...current, autoAlign }))} label={t.fields.autoAlign} />
                            <CheckboxRow checked={ktxBatch.autoPreset} onChange={(autoPreset) => setKtxBatch((current) => ({ ...current, autoPreset }))} label={t.fields.autoPreset} />
                            <CheckboxRow checked={ktxBatch.validateQuality} onChange={(validateQuality) => setKtxBatch((current) => ({ ...current, validateQuality }))} label={t.fields.validatePsnr} />
                        </div>
                        <Button onClick={runKtxBatch} disabled={busy} size="lg" className="w-full">
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <FolderSync className="size-4" />}
                            {t.ktxBatch.run}
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
                                <Metric label={t.metrics.images} value={fmt.number(result.input_count)} />
                                <Metric label={t.metrics.output} value={result.output_dir ? t.ktxBatch.written : t.common.notAvailable} helper={result.output_dir ?? undefined} />
                            </div>
                            <pre className="app-codeblock max-h-[460px] overflow-auto rounded-xl p-4 text-sm leading-6">
                                {result.summary}
                            </pre>
                        </div>
                    ) : (
                        <EmptyState text={t.ktxBatch.empty} />
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
