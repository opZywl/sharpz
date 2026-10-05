"use client"

import { motion } from "framer-motion"
import { Loader2, Sparkles } from "lucide-react"
import { useState } from "react"

import { Panel, TextField, cardEnter } from "@/components/dashboard/primitives"
import { CopyButton, SaveTextButton } from "@/components/transcribe/transcribe-actions"
import { usePersistentState } from "@/components/transcribe/transcribe-hooks"
import { friendlyError, stringStore } from "@/components/transcribe/transcribe-utils"
import { Button } from "@/components/ui/button"
import { summarize } from "@/lib/transcribe-api"

const DEFAULT_LLM_BASE_URL = "http://localhost:11434/v1"
const DEFAULT_LLM_MODEL = "llama3.1"
const baseUrlStore = stringStore("cleanup-image.llm-base-url")
const modelStore = stringStore("cleanup-image.llm-model")
const apiKeyStore = stringStore("cleanup-image.llm-api-key")

export function SummaryPanel({ jobId, language, fileBase }: { jobId: string; language?: string; fileBase: string }) {
    const [baseUrl, setBaseUrl] = usePersistentState(DEFAULT_LLM_BASE_URL, baseUrlStore)
    const [model, setModel] = usePersistentState(DEFAULT_LLM_MODEL, modelStore)
    const [apiKey, setApiKey] = usePersistentState("", apiKeyStore)
    const [summary, setSummary] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleSummarize() {
        setLoading(true)
        setError(null)
        setSummary("")
        try {
            const result = await summarize(jobId, {
                base_url: baseUrl.trim() || DEFAULT_LLM_BASE_URL,
                model: model.trim() || DEFAULT_LLM_MODEL,
                api_key: apiKey.trim() || undefined,
                language,
            })
            setSummary(result.summary ?? "")
        } catch (err) {
            setError(friendlyError(err, "Não consegui gerar o resumo.").message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <motion.div {...cardEnter}>
            <Panel title="Resumo (LLM)" subtitle="Resume a transcrição com uma IA compatível com OpenAI (Ollama e outras)." icon={Sparkles}>
                <div className="grid gap-4">
                    <div className="grid gap-3 md:grid-cols-2">
                        <TextField label="Endereço da API (base URL)" value={baseUrl} onChange={setBaseUrl} placeholder={DEFAULT_LLM_BASE_URL} />
                        <TextField label="Modelo" value={model} onChange={setModel} placeholder={DEFAULT_LLM_MODEL} />
                    </div>
                    <TextField label="Chave da API (opcional)" value={apiKey} onChange={setApiKey} placeholder="sk-..." type="password" />

                    <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={handleSummarize} disabled={loading}>
                            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                            {loading ? "Resumindo..." : "Resumir"}
                        </Button>
                        {summary ? (
                            <>
                                <CopyButton text={summary} label="Copiar resumo" />
                                <SaveTextButton text={summary} fileName={`${fileBase}-resumo.txt`} label="Baixar resumo" />
                            </>
                        ) : null}
                    </div>

                    {error ? (
                        <div className="app-alert flex gap-2 rounded-xl px-4 py-3 text-sm">
                            <Sparkles className="mt-0.5 size-4 shrink-0" />
                            <span className="whitespace-pre-wrap">{error}</span>
                        </div>
                    ) : null}

                    {summary ? (
                        <div className="preview-card max-h-[420px] overflow-auto p-4">
                            <pre className="whitespace-pre-wrap font-sans text-sm leading-6">{summary}</pre>
                        </div>
                    ) : null}
                </div>
            </Panel>
        </motion.div>
    )
}
