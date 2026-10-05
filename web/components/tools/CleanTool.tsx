"use client"

import { motion } from "framer-motion"
import { Activity, ImagePlus, Loader2, Scissors, Settings2 } from "lucide-react"
import { useEffect, useState } from "react"

import {
    CheckboxRow,
    ColorField,
    EmptyState,
    Metric,
    Panel,
    PreviewTile,
    SelectField,
    cardEnter,
} from "@/components/dashboard/primitives"
import { useDashboard } from "@/components/dashboard/DashboardProvider"
import { ModelField } from "@/components/dashboard/ModelField"
import { Dropzone } from "@/components/dropzone"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { CleanResult, Method, methodLabel, methodOptions } from "@/lib/dashboard-types"
import { appendFields, imgData, postForm } from "@/lib/dashboard-utils"
import { errorText } from "@/lib/i18n"
import { useI18n, useMessage } from "@/lib/i18n/provider"

type OutputFormat = "png" | "webp"

const outputFormatOptions: Array<{ value: OutputFormat; label: string }> = [
    { value: "png", label: "PNG" },
    { value: "webp", label: "WEBP" },
]

export function CleanTool() {
    const { defaultModel } = useDashboard()
    const { t, fmt, resolve } = useI18n()

    const [file, setFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useMessage()
    const [cleanResult, setCleanResult] = useState<CleanResult | null>(null)

    const [clean, setClean] = useState({
        method: "auto" as Method,
        model: null as string | null,
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
        useBgColor: false,
        bgColor: "#ffffff",
        outputFormat: "png" as OutputFormat,
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

    async function runClean() {
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
                method: clean.method,
                model: clean.model ?? defaultModel,
                alpha_matting: clean.alphaMatting,
                alpha_matting_foreground_threshold: clean.fgThreshold,
                alpha_matting_background_threshold: clean.bgThreshold,
                alpha_matting_erode_size: clean.erodeSize,
                luma_low: clean.lumaLow,
                luma_high: clean.lumaHigh,
                luma_unpremultiply: clean.lumaUnpremultiply,
                luma_denoise: clean.lumaDenoise,
                luma_gamma: clean.lumaGamma,
                saturation: clean.saturation,
                contrast: clean.contrast,
                brightness: clean.brightness,
                edge_smooth: clean.edgeSmooth,
                use_bg_color: clean.useBgColor,
                bg_color: clean.bgColor,
                output_format: clean.outputFormat,
            })
            setCleanResult(await postForm<CleanResult>("/api/clean", fd))
        } catch (err) {
            setError(errorText(err, (m) => m.clean.unexpected))
        } finally {
            setBusy(false)
        }
    }

    const fileSize = file ? fmt.bytes(file.size) : t.common.noFile

    return (
        <div className="space-y-4">
            {error ? (
                <div className="app-alert rounded-xl px-4 py-3 text-sm">
                    <span className="whitespace-pre-wrap">{resolve(error)}</span>
                </div>
            ) : null}

            <motion.div {...cardEnter} className="grid gap-4 xl:grid-cols-[minmax(290px,0.72fr)_minmax(0,1.28fr)]">
                <Panel title={t.common.source} subtitle={t.common.sourceSubtitle} icon={ImagePlus}>
                    <Dropzone file={file} previewUrl={previewUrl} onChange={setFile} />
                    <p className="app-faint mt-3 text-xs">{fileSize}</p>
                </Panel>

                <Panel title={t.clean.controls} subtitle={t.clean.controlsSubtitle} icon={Settings2}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            <SelectField label={t.fields.method} value={clean.method} options={methodOptions(t)} onChange={(method) => setClean((current) => ({ ...current, method }))} />
                            <ModelField value={clean.model ?? defaultModel} onChange={(model) => setClean((current) => ({ ...current, model }))} />
                            <ColorField label={t.fields.bgColor} value={clean.bgColor} onChange={(bgColor) => setClean((current) => ({ ...current, bgColor }))} />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                            <SelectField label={t.fields.outputFormat} value={clean.outputFormat} options={outputFormatOptions} onChange={(outputFormat) => setClean((current) => ({ ...current, outputFormat }))} />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <Slider label={t.fields.lumaLow} value={clean.lumaLow} min={0} max={0.5} step={0.01} onChange={(lumaLow) => setClean((current) => ({ ...current, lumaLow }))} />
                            <Slider label={t.fields.lumaHigh} value={clean.lumaHigh} min={0.5} max={1} step={0.01} onChange={(lumaHigh) => setClean((current) => ({ ...current, lumaHigh }))} />
                            <Slider label={t.fields.gamma} value={clean.lumaGamma} min={0.3} max={3} step={0.1} onChange={(lumaGamma) => setClean((current) => ({ ...current, lumaGamma }))} />
                            <Slider label={t.fields.denoise} value={clean.lumaDenoise} min={0} max={7} step={1} onChange={(lumaDenoise) => setClean((current) => ({ ...current, lumaDenoise }))} />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <Slider label={t.fields.fgThreshold} value={clean.fgThreshold} min={0} max={255} step={1} onChange={(fgThreshold) => setClean((current) => ({ ...current, fgThreshold }))} />
                            <Slider label={t.fields.bgThreshold} value={clean.bgThreshold} min={0} max={255} step={1} onChange={(bgThreshold) => setClean((current) => ({ ...current, bgThreshold }))} />
                            <Slider label={t.fields.erode} value={clean.erodeSize} min={0} max={50} step={1} onChange={(erodeSize) => setClean((current) => ({ ...current, erodeSize }))} />
                            <Slider label={t.fields.saturation} value={clean.saturation} min={0.5} max={2} step={0.05} onChange={(saturation) => setClean((current) => ({ ...current, saturation }))} />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <Slider label={t.fields.contrast} value={clean.contrast} min={0.5} max={2} step={0.05} onChange={(contrast) => setClean((current) => ({ ...current, contrast }))} />
                            <Slider label={t.fields.brightness} value={clean.brightness} min={0.5} max={2} step={0.05} onChange={(brightness) => setClean((current) => ({ ...current, brightness }))} />
                            <CheckboxRow checked={clean.lumaUnpremultiply} onChange={(lumaUnpremultiply) => setClean((current) => ({ ...current, lumaUnpremultiply }))} label={t.fields.unmult} />
                            <CheckboxRow checked={clean.alphaMatting} onChange={(alphaMatting) => setClean((current) => ({ ...current, alphaMatting }))} label={t.fields.alphaMatting} helper={t.fields.alphaMattingHelper} />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                            <CheckboxRow checked={clean.edgeSmooth} onChange={(edgeSmooth) => setClean((current) => ({ ...current, edgeSmooth }))} label={t.fields.edgeSmooth} />
                            <CheckboxRow checked={clean.useBgColor} onChange={(useBgColor) => setClean((current) => ({ ...current, useBgColor }))} label={t.fields.solidBg} />
                        </div>
                        <Button onClick={runClean} disabled={busy} size="lg" className="w-full">
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
                            {t.clean.run}
                        </Button>
                    </div>
                </Panel>
            </motion.div>

            <motion.div {...cardEnter}>
                <Panel title={t.common.result} subtitle={t.common.resultSubtitle} icon={Activity}>
                    {cleanResult ? (
                        <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-3">
                                <Metric label={t.metrics.time} value={fmt.seconds(cleanResult.elapsed_ms / 1000)} helper={methodLabel(t, cleanResult.method_used)} />
                                <Metric label={t.metrics.size} value={`${cleanResult.image_width} x ${cleanResult.image_height}`} />
                                <Metric label={t.metrics.output} value={clean.outputFormat.toUpperCase()} helper={t.clean.transparencyKept} />
                            </div>
                            <div className="max-w-xl">
                                <PreviewTile title={t.clean.resultTile(clean.outputFormat.toUpperCase())} subtitle={t.common.bgRemoved} src={imgData(cleanResult.cleaned_png_b64, clean.outputFormat)} downloadHref={imgData(cleanResult.cleaned_png_b64, clean.outputFormat)} downloadName={`cleaned.${clean.outputFormat}`} transparent={!clean.useBgColor} />
                            </div>
                        </div>
                    ) : (
                        <EmptyState text={t.clean.empty} />
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
