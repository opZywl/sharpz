"use client"

import { motion } from "framer-motion"
import { Activity, Download, ImagePlus, Loader2, PackageCheck } from "lucide-react"
import { useEffect, useState } from "react"

import {
    EmptyState,
    Metric,
    Panel,
    TextField,
    cardEnter,
} from "@/components/dashboard/primitives"
import { useDashboard } from "@/components/dashboard/DashboardProvider"
import { Dropzone } from "@/components/dropzone"
import { Button } from "@/components/ui/button"
import { PortfolioKtxResult } from "@/lib/dashboard-types"
import { appendFields, formatBytes, ktxData, postForm } from "@/lib/dashboard-utils"

export function PortfolioKtxTool() {
    const { capabilities } = useDashboard()

    const [file, setFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<PortfolioKtxResult | null>(null)

    const [portfolioKtx, setPortfolioKtx] = useState({
        outputName: "",
        outputPath: "",
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

    async function runPortfolioKtx() {
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
                output_name: portfolioKtx.outputName,
                output_path: portfolioKtx.outputPath,
            })
            const data = await postForm<PortfolioKtxResult>("/api/ktx/portfolio", fd)
            setResult(data)
            if (!data.success) setError(data.summary)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro inesperado no KTX do portfolio.")
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

                <Panel title="Portfolio KTX" subtitle="Tela fixa 960x540, ETC1S q255 e orientação corrigida." icon={PackageCheck}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 xl:grid-cols-2">
                            <TextField label="Nome output" value={portfolioKtx.outputName} onChange={(outputName) => setPortfolioKtx((current) => ({ ...current, outputName }))} placeholder="textura.ktx" />
                            <TextField label="Salvar tambem em" value={portfolioKtx.outputPath} onChange={(outputPath) => setPortfolioKtx((current) => ({ ...current, outputPath }))} placeholder="C:/caminho/para/pasta" />
                        </div>
                        {capabilities?.alktx2_found === false ? (
                            <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
                                O conversor do Portfolio KTX não está instalado. Rode o sharpz.cmd e escolha Instalar.
                            </div>
                        ) : null}
                        <div className="grid gap-3 md:grid-cols-3">
                            <Metric label="Tela" value="960 x 540" helper="portfolio 3D" />
                            <Metric label="Codec" value="ETC1S" helper="q255 sRGB" />
                            <Metric label="Orientação" value="Corrigida" helper="pronta para cena 3D" />
                        </div>
                        <Button onClick={runPortfolioKtx} disabled={busy} size="lg" className="w-full">
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
                            Gerar KTX do portfolio
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
                                <Metric label="Tela" value={`${result.target_width} x ${result.target_height}`} />
                                <Metric label="Saida" value={formatBytes(result.size_output)} helper={result.saved_path ?? undefined} />
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
                        <EmptyState text="Gere o KTX 960x540 do portfolio para receber download e resumo." />
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
