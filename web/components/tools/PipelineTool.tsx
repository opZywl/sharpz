"use client"

import { motion } from "framer-motion"
import { Activity, AlertTriangle, ImagePlus, Loader2, Play, SlidersHorizontal } from "lucide-react"
import { useEffect, useState } from "react"

import {
    cardEnter,
    ColorField,
    CheckboxRow,
    EmptyState,
    Metric,
    Panel,
    PreviewTile,
    SelectField,
} from "@/components/dashboard/primitives"
import { useDashboard } from "@/components/dashboard/DashboardProvider"
import { ModelField } from "@/components/dashboard/ModelField"
import { Dropzone } from "@/components/dropzone"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
    ColorMode,
    colorModeOptions,
    Method,
    methodLabel,
    methodOptions,
    PipelineResult,
} from "@/lib/dashboard-types"
import { appendFields, imgData, pngData, postForm, svgData } from "@/lib/dashboard-utils"

type OutputFormat = "png" | "webp"

const outputFormatOptions: Array<{ value: OutputFormat; label: string }> = [
    { value: "png", label: "PNG" },
    { value: "webp", label: "WEBP" },
]

export function PipelineTool() {
    const { defaultModel } = useDashboard()

    const [file, setFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<PipelineResult | null>(null)

    const [pipeline, setPipeline] = useState({
        method: "auto" as Method,
        model: null as string | null,
        alphaMatting: true,
        outputFormat: "png" as OutputFormat,
        lumaLow: 0.04,
        lumaHigh: 0.95,
        lumaUnpremultiply: true,
        lumaDenoise: 0,
        lumaGamma: 1,
        saturation: 1.15,
        contrast: 1,
        colorMode: "color" as ColorMode,
        filterSpeckle: 2,
        colorPrecision: 8,
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

    async function runPipeline() {
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
                method: pipeline.method,
                model: pipeline.model ?? defaultModel,
                alpha_matting: pipeline.alphaMatting,
                output_format: pipeline.outputFormat,
                luma_low: pipeline.lumaLow,
                luma_high: pipeline.lumaHigh,
                luma_unpremultiply: pipeline.lumaUnpremultiply,
                luma_denoise: pipeline.lumaDenoise,
                luma_gamma: pipeline.lumaGamma,
                saturation: pipeline.saturation,
                contrast: pipeline.contrast,
                color_mode: pipeline.colorMode,
                filter_speckle: pipeline.filterSpeckle,
                color_precision: pipeline.colorPrecision,
                upscale: pipeline.upscale,
                flatten_color: pipeline.flattenColor,
            })
            setResult(await postForm<PipelineResult>("/api/pipeline", fd))
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro inesperado no pipeline.")
        } finally {
            setBusy(false)
        }
    }

    const cleanedName = pipeline.outputFormat === "webp" ? "cleaned.webp" : "cleaned.png"

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

            <motion.div {...cardEnter} className="grid gap-4 xl:grid-cols-[minmax(290px,0.72fr)_minmax(0,1.28fr)]">
                <Panel title="Fonte" subtitle="Aceita PNG, JPG, WEBP, BMP e TIFF." icon={ImagePlus}>
                    <Dropzone file={file} previewUrl={previewUrl} onChange={setFile} />
                </Panel>

                <Panel title="Controles do pipeline" subtitle="Fluxo completo: alpha, raster limpo e SVG final." icon={SlidersHorizontal}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <SelectField label="Método" value={pipeline.method} options={methodOptions} onChange={(method) => setPipeline((current) => ({ ...current, method }))} />
                            <ModelField value={pipeline.model ?? defaultModel} onChange={(model) => setPipeline((current) => ({ ...current, model }))} />
                            <SelectField label="Formato de saída" value={pipeline.outputFormat} options={outputFormatOptions} onChange={(outputFormat) => setPipeline((current) => ({ ...current, outputFormat }))} />
                            <ColorField label="Fundo SVG" value={pipeline.flattenColor} onChange={(flattenColor) => setPipeline((current) => ({ ...current, flattenColor }))} />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <Slider label="Luma mínimo" value={pipeline.lumaLow} min={0} max={0.5} step={0.01} onChange={(lumaLow) => setPipeline((current) => ({ ...current, lumaLow }))} />
                            <Slider label="Luma máximo" value={pipeline.lumaHigh} min={0.5} max={1} step={0.01} onChange={(lumaHigh) => setPipeline((current) => ({ ...current, lumaHigh }))} />
                            <Slider label="Gamma" value={pipeline.lumaGamma} min={0.3} max={3} step={0.1} onChange={(lumaGamma) => setPipeline((current) => ({ ...current, lumaGamma }))} />
                            <Slider label="Redução de ruído" value={pipeline.lumaDenoise} min={0} max={7} step={1} onChange={(lumaDenoise) => setPipeline((current) => ({ ...current, lumaDenoise }))} />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <Slider label="Saturação" value={pipeline.saturation} min={0.5} max={2} step={0.05} onChange={(saturation) => setPipeline((current) => ({ ...current, saturation }))} />
                            <Slider label="Contraste" value={pipeline.contrast} min={0.5} max={2} step={0.05} onChange={(contrast) => setPipeline((current) => ({ ...current, contrast }))} />
                            <Slider label="Remover manchas" value={pipeline.filterSpeckle} min={0} max={20} step={1} onChange={(filterSpeckle) => setPipeline((current) => ({ ...current, filterSpeckle }))} />
                            <Slider label="Precisão de cor" value={pipeline.colorPrecision} min={1} max={8} step={1} onChange={(colorPrecision) => setPipeline((current) => ({ ...current, colorPrecision }))} />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <SelectField label="Modo SVG" value={pipeline.colorMode} options={colorModeOptions} onChange={(colorMode) => setPipeline((current) => ({ ...current, colorMode }))} />
                            <Slider label="Ampliar antes" value={pipeline.upscale} min={1} max={3} step={0.25} onChange={(upscale) => setPipeline((current) => ({ ...current, upscale }))} />
                            <CheckboxRow checked={pipeline.lumaUnpremultiply} onChange={(lumaUnpremultiply) => setPipeline((current) => ({ ...current, lumaUnpremultiply }))} label="Unmult (brilho)" helper="Preserva brilho em fundo escuro." />
                            <CheckboxRow checked={pipeline.alphaMatting} onChange={(alphaMatting) => setPipeline((current) => ({ ...current, alphaMatting }))} label="Alpha matting" helper="Refina bordas na IA (mais lento)." />
                        </div>
                        <Button onClick={runPipeline} disabled={busy} size="lg" className="w-full">
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                            Processar tudo
                        </Button>
                    </div>
                </Panel>
            </motion.div>

            <motion.div {...cardEnter}>
                <Panel title="Resultado" subtitle="Previews e downloads ficam aqui sem trocar de página." icon={Activity}>
                    {result ? (
                        <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-3">
                                <Metric label="Tempo" value={`${(result.elapsed_ms / 1000).toFixed(2)}s`} helper={methodLabel(result.method_used)} />
                                <Metric label="Tamanho" value={`${result.image_width} x ${result.image_height}`} />
                                <Metric label="Saídas" value="3" helper="PNG + 2 SVGs" />
                            </div>
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                <PreviewTile title="Imagem transparente" subtitle="Fundo removido" src={imgData(result.cleaned_png_b64, pipeline.outputFormat)} downloadHref={imgData(result.cleaned_png_b64, pipeline.outputFormat)} downloadName={cleanedName} transparent />
                                <PreviewTile title="SVG com fundo" subtitle="Fundo aplicado" src={pngData(result.svg_with_bg_preview_b64)} downloadHref={svgData(result.svg_with_bg)} downloadName="cleaned.svg" />
                                <PreviewTile title="SVG transparente" subtitle="Sem fundo" src={pngData(result.svg_clean_preview_b64)} downloadHref={svgData(result.svg_clean)} downloadName="cleaned-clean.svg" transparent />
                            </div>
                        </div>
                    ) : (
                        <EmptyState text="Execute o pipeline para gerar PNG transparente e SVGs." />
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
