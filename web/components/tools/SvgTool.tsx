"use client"

import { motion } from "framer-motion"
import { Activity, FileCode2, ImagePlus, Layers, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import {
    ColorField,
    EmptyState,
    Metric,
    Panel,
    PreviewTile,
    SelectField,
    cardEnter,
} from "@/components/dashboard/primitives"
import { Dropzone } from "@/components/dropzone"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
    ColorMode,
    Hierarchical,
    PathMode,
    SvgResult,
    colorModeOptions,
    hierarchicalOptions,
    pathModeOptions,
} from "@/lib/dashboard-types"
import { appendFields, formatBytes, pngData, postForm, svgData } from "@/lib/dashboard-utils"

export function SvgTool() {
    const [file, setFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<SvgResult | null>(null)

    const [svg, setSvg] = useState({
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
        if (!file) {
            setPreviewUrl(null)
            return
        }
        const url = URL.createObjectURL(file)
        setPreviewUrl(url)
        return () => URL.revokeObjectURL(url)
    }, [file])

    async function runSvg() {
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
                color_mode: svg.colorMode,
                hierarchical: svg.hierarchical,
                path_mode: svg.pathMode,
                filter_speckle: svg.filterSpeckle,
                color_precision: svg.colorPrecision,
                layer_difference: svg.layerDifference,
                corner_threshold: svg.cornerThreshold,
                length_threshold: svg.lengthThreshold,
                max_iterations: svg.maxIterations,
                splice_threshold: svg.spliceThreshold,
                path_precision: svg.pathPrecision,
                upscale: svg.upscale,
                flatten_color: svg.flattenColor,
            })
            setResult(await postForm<SvgResult>("/api/svg", fd))
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro inesperado ao vetorizar.")
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

                <Panel title="Controles do vetor" subtitle="Parâmetros completos da vetorização e SVG transparente." icon={Layers}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <SelectField label="Cor" value={svg.colorMode} options={colorModeOptions} onChange={(colorMode) => setSvg((current) => ({ ...current, colorMode }))} />
                            <SelectField label="Hierarquia" value={svg.hierarchical} options={hierarchicalOptions} onChange={(hierarchical) => setSvg((current) => ({ ...current, hierarchical }))} />
                            <SelectField label="Traçado" value={svg.pathMode} options={pathModeOptions} onChange={(pathMode) => setSvg((current) => ({ ...current, pathMode }))} />
                            <ColorField label="Fundo" value={svg.flattenColor} onChange={(flattenColor) => setSvg((current) => ({ ...current, flattenColor }))} />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <Slider label="Ampliar antes" value={svg.upscale} min={1} max={3} step={0.25} onChange={(upscale) => setSvg((current) => ({ ...current, upscale }))} />
                            <Slider label="Remover manchas" value={svg.filterSpeckle} min={0} max={20} step={1} onChange={(filterSpeckle) => setSvg((current) => ({ ...current, filterSpeckle }))} />
                            <Slider label="Precisão de cor" value={svg.colorPrecision} min={1} max={8} step={1} onChange={(colorPrecision) => setSvg((current) => ({ ...current, colorPrecision }))} />
                            <Slider label="Precisão do traçado" value={svg.pathPrecision} min={1} max={10} step={1} onChange={(pathPrecision) => setSvg((current) => ({ ...current, pathPrecision }))} />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                            <Slider label="Diferença entre camadas" value={svg.layerDifference} min={0} max={256} step={1} onChange={(layerDifference) => setSvg((current) => ({ ...current, layerDifference }))} />
                            <Slider label="Cantos" value={svg.cornerThreshold} min={0} max={180} step={1} onChange={(cornerThreshold) => setSvg((current) => ({ ...current, cornerThreshold }))} />
                            <Slider label="Comprimento mínimo" value={svg.lengthThreshold} min={0} max={20} step={0.5} onChange={(lengthThreshold) => setSvg((current) => ({ ...current, lengthThreshold }))} />
                            <Slider label="Emenda" value={svg.spliceThreshold} min={0} max={180} step={1} onChange={(spliceThreshold) => setSvg((current) => ({ ...current, spliceThreshold }))} />
                            <Slider label="Iterações" value={svg.maxIterations} min={1} max={20} step={1} onChange={(maxIterations) => setSvg((current) => ({ ...current, maxIterations }))} />
                        </div>
                        <Button onClick={runSvg} disabled={busy} size="lg" className="w-full">
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <FileCode2 className="size-4" />}
                            Gerar SVG
                        </Button>
                    </div>
                </Panel>
            </motion.div>

            <motion.div {...cardEnter}>
                <Panel title="Resultado" subtitle="Previews e downloads ficam aqui sem trocar de página." icon={Activity}>
                    {result ? (
                        <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-3">
                                <Metric label="Tempo" value={`${(result.elapsed_ms / 1000).toFixed(2)}s`} />
                                <Metric label="SVG com fundo" value={formatBytes(result.svg_with_bg_bytes)} />
                                <Metric label="SVG transparente" value={formatBytes(result.svg_clean_bytes)} />
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <PreviewTile title="SVG com fundo" subtitle={`${result.image_width} x ${result.image_height}`} src={pngData(result.svg_with_bg_preview_b64)} downloadHref={svgData(result.svg_with_bg)} downloadName="vectorized.svg" />
                                <PreviewTile title="SVG clean" subtitle="Transparente" src={pngData(result.svg_clean_preview_b64)} downloadHref={svgData(result.svg_clean)} downloadName="vectorized-clean.svg" transparent />
                            </div>
                        </div>
                    ) : (
                        <EmptyState text="Gere um SVG para receber preview e arquivos baixáveis." />
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
