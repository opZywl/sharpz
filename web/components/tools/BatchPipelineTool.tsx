"use client"

import { motion } from "framer-motion"
import { Activity, AlertTriangle, FolderOpen, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import {
    cardEnter,
    ColorField,
    CheckboxRow,
    EmptyState,
    Metric,
    Panel,
    SelectField,
    TextField,
} from "@/components/dashboard/primitives"
import { useDashboard } from "@/components/dashboard/DashboardProvider"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
    BatchPipelineResult,
    ColorMode,
    colorModeOptions,
    DEFAULT_MODEL,
    Hierarchical,
    Method,
    methodOptions,
    PathMode,
} from "@/lib/dashboard-types"
import { appendFields, postForm } from "@/lib/dashboard-utils"

export function BatchPipelineTool() {
    const { modelOptions, defaultModel } = useDashboard()

    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<BatchPipelineResult | null>(null)

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

    useEffect(() => {
        setBatchPipeline((current) => ({ ...current, model: current.model || defaultModel }))
    }, [defaultModel])

    async function runBatchPipeline() {
        setBusy(true)
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
            setResult(data)
            if (!data.success) setError(data.summary)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro inesperado no batch pipeline.")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-4">
            {error ? (
                <div className="app-alert rounded-xl px-4 py-3 text-sm">
                    <div className="flex gap-2">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <span className="whitespace-pre-wrap">{error}</span>
                    </div>
                </div>
            ) : null}

            <motion.div {...cardEnter}>
                <Panel title="Batch Pipeline" subtitle="Mesmo poder do CLI pela web, usando caminhos locais absolutos." icon={FolderOpen}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 xl:grid-cols-2">
                            <TextField label="Input path" value={batchPipeline.inputPath} onChange={(inputPath) => setBatchPipeline((current) => ({ ...current, inputPath }))} placeholder="C:/caminho/para/imagens" />
                            <TextField label="Output dir" value={batchPipeline.outputPath} onChange={(outputPath) => setBatchPipeline((current) => ({ ...current, outputPath }))} placeholder="C:/caminho/para/saida" />
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
                        <Button onClick={runBatchPipeline} disabled={busy} size="lg" className="w-full">
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
                            Processar pasta
                        </Button>
                    </div>
                </Panel>
            </motion.div>

            <motion.div {...cardEnter}>
                <Panel title="Resultado" subtitle="Previews e downloads ficam aqui sem trocar de pagina." icon={Activity}>
                    {result ? (
                        <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-4">
                                <Metric label="Status" value={result.success ? "OK" : "Falha"} />
                                <Metric label="Total" value={String(result.total)} />
                                <Metric label="Sucesso" value={String(result.success_count)} />
                                <Metric label="Falhas" value={String(result.failure_count)} helper={result.output_dir ?? undefined} />
                            </div>
                            <pre className="app-codeblock max-h-64 overflow-auto rounded-xl p-4 text-sm leading-6">
                                {result.summary}
                            </pre>
                            <div className="grid gap-2">
                                {result.files.slice(0, 12).map((item) => (
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
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
