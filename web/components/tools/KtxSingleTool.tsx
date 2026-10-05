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
import { appendFields, formatBytes, ktxData, postForm } from "@/lib/dashboard-utils"

export function KtxSingleTool() {
    const { ktxPresetOptions, toktxFound, defaultKtxPreset } = useDashboard()

    const [file, setFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
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
            setError("Carregue uma imagem antes de executar este módulo.")
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
            setError(err instanceof Error ? err.message : "Erro inesperado ao converter KTX.")
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

            <motion.div {...cardEnter} className="grid gap-4 xl:grid-cols-[minmax(290px,0.72fr)_minmax(0,1.28fr)]">
                <Panel title="Fonte" subtitle="Aceita PNG, JPG, WEBP, BMP e TIFF." icon={ImagePlus}>
                    <Dropzone file={file} previewUrl={previewUrl} onChange={setFile} />
                </Panel>

                <Panel title="Converter para KTX" subtitle="Uma imagem por vez, com presets de qualidade." icon={Box}>
                    <div className="grid gap-4">
                        <SelectField label="Preset" value={ktxSingle.preset} options={ktxPresetOptions} onChange={(preset) => setKtxSingle((current) => ({ ...current, preset }))} />
                        <div className="grid gap-3 md:grid-cols-3">
                            <CheckboxRow checked={ktxSingle.autoAlign} onChange={(autoAlign) => setKtxSingle((current) => ({ ...current, autoAlign }))} label="Auto-alinhar" helper="Completa até múltiplo de 4." />
                            <CheckboxRow checked={ktxSingle.autoPreset} onChange={(autoPreset) => setKtxSingle((current) => ({ ...current, autoPreset }))} label="Preset automático" helper="Alpha usa ultra_rgba." />
                            <CheckboxRow checked={ktxSingle.validateQuality} onChange={(validateQuality) => setKtxSingle((current) => ({ ...current, validateQuality }))} label="Validar PSNR" helper="Compara com o original (mais lento)." />
                        </div>
                        {toktxFound === false ? (
                            <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
                                KTX-Software não encontrado. Instale em Baixar pacotes para habilitar a conversão.
                            </div>
                        ) : null}
                        <Button onClick={runKtxSingle} disabled={busy} size="lg" className="w-full">
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <Box className="size-4" />}
                            Converter para KTX
                        </Button>
                    </div>
                </Panel>
            </motion.div>

            <motion.div {...cardEnter}>
                <Panel title="Resultado" subtitle="Previews e downloads ficam aqui sem trocar de página." icon={Activity}>
                    {result ? (
                        <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-3">
                                <Metric label="Status" value={result.success ? "OK" : "Falha"} />
                                <Metric label="Entrada" value={formatBytes(result.size_input)} />
                                <Metric label="Saida" value={formatBytes(result.size_output)} helper={result.ratio ? `${result.ratio.toFixed(1)}x` : undefined} />
                            </div>
                            <pre className="app-codeblock max-h-64 overflow-auto rounded-xl p-4 text-sm leading-6">
                                {result.summary}
                            </pre>
                            {result.success && result.ktx_b64 && result.filename ? (
                                <Button asChild variant="outline">
                                    <a href={ktxData(result.ktx_b64)} download={result.filename}>
                                        <Download className="size-4" />
                                        Baixar {result.filename}
                                    </a>
                                </Button>
                            ) : null}
                        </div>
                    ) : (
                        <EmptyState text="Converta um upload para receber o arquivo .ktx." />
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
