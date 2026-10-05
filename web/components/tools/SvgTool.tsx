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
import { appendFields, pngData, postForm, svgData } from "@/lib/dashboard-utils"
import { errorText } from "@/lib/i18n"
import { useI18n, useMessage } from "@/lib/i18n/provider"

export function SvgTool() {
    const { t, fmt, resolve } = useI18n()
    const [file, setFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useMessage()
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
            setError((m) => m.common.needImage)
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
            setError(errorText(err, (m) => m.svg.unexpected))
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

                <Panel title={t.svg.controls} subtitle={t.svg.controlsSubtitle} icon={Layers}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <SelectField label={t.fields.color} value={svg.colorMode} options={colorModeOptions(t)} onChange={(colorMode) => setSvg((current) => ({ ...current, colorMode }))} />
                            <SelectField label={t.fields.hierarchy} value={svg.hierarchical} options={hierarchicalOptions(t)} onChange={(hierarchical) => setSvg((current) => ({ ...current, hierarchical }))} />
                            <SelectField label={t.fields.path} value={svg.pathMode} options={pathModeOptions(t)} onChange={(pathMode) => setSvg((current) => ({ ...current, pathMode }))} />
                            <ColorField label={t.fields.background} value={svg.flattenColor} onChange={(flattenColor) => setSvg((current) => ({ ...current, flattenColor }))} />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <Slider label={t.fields.upscale} value={svg.upscale} min={1} max={3} step={0.25} onChange={(upscale) => setSvg((current) => ({ ...current, upscale }))} />
                            <Slider label={t.fields.filterSpeckle} value={svg.filterSpeckle} min={0} max={20} step={1} onChange={(filterSpeckle) => setSvg((current) => ({ ...current, filterSpeckle }))} />
                            <Slider label={t.fields.colorPrecision} value={svg.colorPrecision} min={1} max={8} step={1} onChange={(colorPrecision) => setSvg((current) => ({ ...current, colorPrecision }))} />
                            <Slider label={t.fields.pathPrecision} value={svg.pathPrecision} min={1} max={10} step={1} onChange={(pathPrecision) => setSvg((current) => ({ ...current, pathPrecision }))} />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                            <Slider label={t.fields.layerDifference} value={svg.layerDifference} min={0} max={256} step={1} onChange={(layerDifference) => setSvg((current) => ({ ...current, layerDifference }))} />
                            <Slider label={t.fields.corners} value={svg.cornerThreshold} min={0} max={180} step={1} onChange={(cornerThreshold) => setSvg((current) => ({ ...current, cornerThreshold }))} />
                            <Slider label={t.fields.minLength} value={svg.lengthThreshold} min={0} max={20} step={0.5} onChange={(lengthThreshold) => setSvg((current) => ({ ...current, lengthThreshold }))} />
                            <Slider label={t.fields.splice} value={svg.spliceThreshold} min={0} max={180} step={1} onChange={(spliceThreshold) => setSvg((current) => ({ ...current, spliceThreshold }))} />
                            <Slider label={t.fields.iterations} value={svg.maxIterations} min={1} max={20} step={1} onChange={(maxIterations) => setSvg((current) => ({ ...current, maxIterations }))} />
                        </div>
                        <Button onClick={runSvg} disabled={busy} size="lg" className="w-full">
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <FileCode2 className="size-4" />}
                            {t.svg.run}
                        </Button>
                    </div>
                </Panel>
            </motion.div>

            <motion.div {...cardEnter}>
                <Panel title={t.common.result} subtitle={t.common.resultSubtitle} icon={Activity}>
                    {result ? (
                        <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-3">
                                <Metric label={t.metrics.time} value={fmt.seconds(result.elapsed_ms / 1000)} />
                                <Metric label={t.common.svgWithBg} value={fmt.bytes(result.svg_with_bg_bytes)} />
                                <Metric label={t.common.svgTransparent} value={fmt.bytes(result.svg_clean_bytes)} />
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <PreviewTile title={t.common.svgWithBg} subtitle={`${result.image_width} x ${result.image_height}`} src={pngData(result.svg_with_bg_preview_b64)} downloadHref={svgData(result.svg_with_bg)} downloadName="vectorized.svg" />
                                <PreviewTile title={t.svg.svgClean} subtitle={t.common.transparent} src={pngData(result.svg_clean_preview_b64)} downloadHref={svgData(result.svg_clean)} downloadName="vectorized-clean.svg" transparent />
                            </div>
                        </div>
                    ) : (
                        <EmptyState text={t.svg.empty} />
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
