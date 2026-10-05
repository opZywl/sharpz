"use client"

import { motion } from "framer-motion"
import { Activity, Archive, Download, Loader2, ShieldCheck } from "lucide-react"
import { useState } from "react"

import {
    EmptyState,
    FileField,
    Metric,
    Panel,
    TextField,
    cardEnter,
} from "@/components/dashboard/primitives"
import { Button } from "@/components/ui/button"
import { KtxPatchResult } from "@/lib/dashboard-types"
import { appendFields, formatBytes, ktxData, postForm } from "@/lib/dashboard-utils"

export function KtxOrientationTool() {
    const [ktxFile, setKtxFile] = useState<File | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<KtxPatchResult | null>(null)

    const [ktxPatch, setKtxPatch] = useState({
        outputName: "",
        outputPath: "",
    })

    async function runKtxPatch() {
        if (!ktxFile) {
            setError("Carregue um arquivo .ktx/.ktx2 antes de aplicar o patch.")
            return
        }
        setBusy(true)
        setError(null)
        try {
            const fd = new FormData()
            fd.append("file", ktxFile)
            appendFields(fd, {
                output_name: ktxPatch.outputName,
                output_path: ktxPatch.outputPath,
            })
            const data = await postForm<KtxPatchResult>("/api/ktx/orientation", fd)
            setResult(data)
            if (!data.success) setError(data.summary)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro inesperado no patch KTX.")
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
                <Panel title="Arquivo KTX" subtitle="Aceita .ktx ou .ktx2 e devolve o arquivo patchado." icon={Archive}>
                    <FileField file={ktxFile} onChange={setKtxFile} accept=".ktx,.ktx2,application/octet-stream" label="Escolher KTX" helper="Textura .ktx ou .ktx2" />
                </Panel>
                <Panel title="Orientation patch" subtitle="Garante a orientação correta da textura na cena 3D." icon={ShieldCheck}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 xl:grid-cols-2">
                            <TextField label="Nome output" value={ktxPatch.outputName} onChange={(outputName) => setKtxPatch((current) => ({ ...current, outputName }))} placeholder="texture.ktx" />
                            <TextField label="Salvar tambem em" value={ktxPatch.outputPath} onChange={(outputPath) => setKtxPatch((current) => ({ ...current, outputPath }))} placeholder="C:/Users/zywl/WebstormProjects/portfolio/yzy/static/projects/images" />
                        </div>
                        <Button onClick={runKtxPatch} disabled={busy} size="lg" className="w-full">
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                            Aplicar patch
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
                                <Metric label="Entrada" value={formatBytes(result.size_input)} />
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
                        <EmptyState text="Aplique o orientation patch para receber o KTX atualizado." />
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
