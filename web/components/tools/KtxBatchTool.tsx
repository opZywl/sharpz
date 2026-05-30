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

export function KtxBatchTool() {
    const { defaultKtxPreset, ktxPresetOptions } = useDashboard()

    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
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
            setError(err instanceof Error ? err.message : "Erro inesperado no batch KTX.")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-4">
            {error ? (
                <div className="app-alert rounded-xl px-4 py-3 text-sm">
                    <div className="flex gap-2">
                        <span className="whitespace-pre-wrap">{error}</span>
                    </div>
                </div>
            ) : null}

            <motion.div {...cardEnter}>
                <Panel title="Batch KTX" subtitle="Use caminhos locais absolutos. O backend processa a pasta no Windows." icon={FolderSync}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 xl:grid-cols-2">
                            <TextField label="Pasta input" value={ktxBatch.folderPath} onChange={(folderPath) => setKtxBatch((current) => ({ ...current, folderPath }))} placeholder="C:/Users/zywl/WebstormProjects/portfolio/yzy/static/..." />
                            <TextField label="Pasta output" value={ktxBatch.outputPath} onChange={(outputPath) => setKtxBatch((current) => ({ ...current, outputPath }))} placeholder="C:/caminho/para/saida-ktx" />
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
                        <Button onClick={runKtxBatch} disabled={busy} size="lg" className="w-full">
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <FolderSync className="size-4" />}
                            Converter pasta
                        </Button>
                    </div>
                </Panel>
            </motion.div>

            <motion.div {...cardEnter}>
                <Panel title="Resultado" subtitle="Previews e downloads ficam aqui sem trocar de pagina." icon={Activity}>
                    {result ? (
                        <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-3">
                                <Metric label="Status" value={result.success ? "OK" : "Falha"} />
                                <Metric label="Imagens" value={String(result.input_count)} />
                                <Metric label="Output" value={result.output_dir ? "gravado" : "n/a"} helper={result.output_dir ?? undefined} />
                            </div>
                            <pre className="app-codeblock max-h-[460px] overflow-auto rounded-xl p-4 text-sm leading-6">
                                {result.summary}
                            </pre>
                        </div>
                    ) : (
                        <EmptyState text="Preencha as pastas e rode o batch para ver o resumo." />
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
