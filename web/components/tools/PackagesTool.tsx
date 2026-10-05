"use client"

import { motion } from "framer-motion"
import {
    AlertTriangle,
    CheckCircle2,
    Download,
    HardDriveDownload,
    Loader2,
    RefreshCw,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { EmptyState, Metric, Panel, cardEnter } from "@/components/dashboard/primitives"
import { Button } from "@/components/ui/button"
import { responseError } from "@/lib/dashboard-utils"

type PackageCategory = "essencial" | "transcricao" | "ktx" | "opcional"

interface PackageInfo {
    id: string
    name: string
    description: string
    category: PackageCategory
    optional: boolean
    size_hint: string
    installed: boolean
    detail: string
    installable: boolean
    manual_hint: string
    unlocks: string[]
}

interface JobOutcome {
    status: "done" | "error"
    returncode: number
}

const categoryOrder: Array<{ key: PackageCategory; title: string }> = [
    { key: "essencial", title: "Essenciais" },
    { key: "transcricao", title: "Transcricao" },
    { key: "ktx", title: "Texturas KTX" },
    { key: "opcional", title: "Opcionais" },
]

export function PackagesTool() {
    const [packages, setPackages] = useState<PackageInfo[]>([])
    const [loaded, setLoaded] = useState(false)
    const [apiOffline, setApiOffline] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [installingId, setInstallingId] = useState<string | null>(null)
    const [busyAll, setBusyAll] = useState(false)
    const [log, setLog] = useState<string[]>([])
    const [outcome, setOutcome] = useState<JobOutcome | null>(null)

    const logRef = useRef<HTMLPreElement | null>(null)
    const cancelledRef = useRef(false)

    const jobRunning = installingId !== null

    async function loadPackages() {
        try {
            const response = await fetch("/api/packages")
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const data = (await response.json()) as { packages: PackageInfo[] }
            setPackages(data.packages)
            setApiOffline(false)
        } catch {
            setApiOffline(true)
        } finally {
            setLoaded(true)
        }
    }

    useEffect(() => {
        void loadPackages()
        return () => {
            cancelledRef.current = true
        }
    }, [])

    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight
        }
    }, [log])

    function runInstall(id: string): Promise<JobOutcome> {
        return new Promise((resolve) => {
            setInstallingId(id)
            setOutcome(null)
            void (async () => {
                try {
                    const response = await fetch(`/api/packages/${id}/install`, { method: "POST" })
                    if (!response.ok) throw await responseError(response)
                    const { job_id } = (await response.json()) as { job_id: string }

                    const source = new EventSource(`/api/packages/jobs/${job_id}/stream`)

                    const finish = async (result: JobOutcome) => {
                        source.close()
                        await loadPackages()
                        setOutcome(result)
                        setInstallingId(null)
                        resolve(result)
                    }

                    source.onmessage = (event) => {
                        try {
                            const payload = JSON.parse(event.data) as
                                | { type: "log"; line: string }
                                | { type: "done"; status: "done" | "error"; returncode: number }
                                | { type: "error"; message: string }
                            if (payload.type === "log") {
                                setLog((current) => [...current, payload.line])
                            } else if (payload.type === "done") {
                                void finish({ status: payload.status, returncode: payload.returncode })
                            } else if (payload.type === "error") {
                                setLog((current) => [...current, payload.message])
                                void finish({ status: "error", returncode: 1 })
                            }
                        } catch {
                            setLog((current) => [...current, event.data])
                        }
                    }

                    source.onerror = () => {
                        void finish({ status: "error", returncode: 1 })
                    }
                } catch (err) {
                    setError(err instanceof Error ? err.message : "Erro ao iniciar instalacao.")
                    setInstallingId(null)
                    resolve({ status: "error", returncode: 1 })
                }
            })()
        })
    }

    async function installOne(id: string) {
        setError(null)
        setLog([])
        await runInstall(id)
    }

    async function installAllMissing() {
        setError(null)
        setBusyAll(true)
        setLog([])
        const pending = packages.filter((item) => !item.installed && item.installable)
        for (const item of pending) {
            if (cancelledRef.current) break
            setLog((current) => [...current, `>>> ${item.name}`])
            await runInstall(item.id)
        }
        setBusyAll(false)
    }

    const total = packages.length
    const installedCount = packages.filter((item) => item.installed).length
    const missingCount = total - installedCount
    const hasMissingInstallable = packages.some((item) => !item.installed && item.installable)

    if (loaded && apiOffline) {
        return (
            <div className="space-y-4">
                <motion.div {...cardEnter}>
                    <Panel title="Baixar pacotes" subtitle="Instale o que o Sharpz precisa para funcionar." icon={HardDriveDownload}>
                        <EmptyState text="API offline — rode o sharpz.cmd" />
                    </Panel>
                </motion.div>
            </div>
        )
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
                <Panel title="Baixar pacotes" subtitle="Instale o que o Sharpz precisa sem sair do painel." icon={HardDriveDownload}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 md:grid-cols-3">
                            <Metric label="Total" value={String(total)} />
                            <Metric label="Instalados" value={String(installedCount)} />
                            <Metric label="Faltando" value={String(missingCount)} />
                        </div>
                        <Button
                            onClick={installAllMissing}
                            disabled={jobRunning || busyAll || !hasMissingInstallable}
                            size="lg"
                            className="w-full"
                        >
                            {busyAll ? <Loader2 className="size-4 animate-spin" /> : <HardDriveDownload className="size-4" />}
                            Instalar tudo que falta
                        </Button>
                    </div>
                </Panel>
            </motion.div>

            {categoryOrder.map(({ key, title }) => {
                const group = packages.filter((item) => item.category === key)
                if (group.length === 0) return null
                return (
                    <motion.div key={key} {...cardEnter}>
                        <Panel title={title}>
                            <div className="grid gap-2">
                                {group.map((item) => {
                                    const isInstalling = installingId === item.id
                                    return (
                                        <div key={item.id} className="preview-card flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
                                            <div className="min-w-0 space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-bold">{item.name}</span>
                                                    <span className="status-pill px-2 py-1 text-xs font-semibold" data-tone={item.installed ? "good" : "bad"}>
                                                        {item.installed ? "instalado" : "faltando"}
                                                    </span>
                                                    {item.size_hint ? (
                                                        <span className="app-faint text-xs">{item.size_hint}</span>
                                                    ) : null}
                                                </div>
                                                <p className="app-faint text-xs">{item.description}</p>
                                                {item.detail ? <p className="app-muted text-xs">{item.detail}</p> : null}
                                                {item.unlocks.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {item.unlocks.map((unlock) => (
                                                            <span key={unlock} className="status-pill px-2 py-0.5 text-[10px] font-semibold">
                                                                {unlock}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                            <div className="shrink-0">
                                                {item.installable ? (
                                                    <Button
                                                        onClick={() => installOne(item.id)}
                                                        disabled={jobRunning || busyAll}
                                                        size="sm"
                                                        variant={item.installed ? "outline" : "default"}
                                                    >
                                                        {isInstalling ? (
                                                            <Loader2 className="size-3.5 animate-spin" />
                                                        ) : item.installed ? (
                                                            <RefreshCw className="size-3.5" />
                                                        ) : (
                                                            <Download className="size-3.5" />
                                                        )}
                                                        {item.installed ? "Reinstalar" : "Instalar"}
                                                    </Button>
                                                ) : (
                                                    <span className="app-faint block max-w-[16rem] text-xs">{item.manual_hint}</span>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </Panel>
                    </motion.div>
                )
            })}

            <motion.div {...cardEnter}>
                <Panel title="Log de instalacao" subtitle="Saida ao vivo do processo de instalacao." icon={HardDriveDownload}>
                    {installingId || log.length > 0 ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                {installingId ? (
                                    <span className="flex items-center gap-2 font-semibold">
                                        <Loader2 className="size-4 animate-spin" />
                                        Instalando {packages.find((item) => item.id === installingId)?.name ?? installingId}
                                    </span>
                                ) : outcome ? (
                                    <span className="flex items-center gap-2 font-semibold" data-tone={outcome.status === "done" ? "good" : "bad"}>
                                        {outcome.status === "done" ? (
                                            <CheckCircle2 className="size-4" />
                                        ) : (
                                            <AlertTriangle className="size-4" />
                                        )}
                                        {outcome.status === "done" ? "Concluido" : `Erro (codigo ${outcome.returncode})`}
                                    </span>
                                ) : null}
                            </div>
                            <pre ref={logRef} className="app-codeblock max-h-[360px] overflow-auto rounded-xl p-4 text-sm leading-6">
                                {log.join("\n")}
                            </pre>
                        </div>
                    ) : (
                        <EmptyState text="Inicie uma instalacao para acompanhar a saida aqui." />
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
