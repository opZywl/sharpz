"use client"

import { motion } from "framer-motion"
import { Activity, Server } from "lucide-react"

import { EmptyState, Metric, Panel, cardEnter } from "@/components/dashboard/primitives"
import { useDashboard } from "@/components/dashboard/DashboardProvider"
import { DEFAULT_KTX_PRESET, DEFAULT_MODEL } from "@/lib/dashboard-types"

export function SystemTool() {
    const { apiStatus, models, capabilities, toktxFound } = useDashboard()

    return (
        <div className="space-y-4">
            <motion.div {...cardEnter}>
                <Panel title="Sistema" subtitle="Mapa vivo da API e ferramentas disponiveis no backend." icon={Server}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <Metric label="API" value={apiStatus} />
                            <Metric label="Modelos" value={String(capabilities?.models_count ?? models.length)} helper={capabilities?.default_model ?? DEFAULT_MODEL} />
                            <Metric label="toktx" value={toktxFound ? "ok" : "missing"} helper={capabilities?.default_ktx_preset ?? DEFAULT_KTX_PRESET} />
                            <Metric label="alktx2" value={capabilities?.alktx2_found ? "ok" : "missing"} helper="portfolio KTX" />
                        </div>
                        <div className="grid gap-4 xl:grid-cols-2">
                            <div className="preview-card p-4">
                                <h3 className="font-jakarta text-sm font-extrabold uppercase tracking-tight">Modulos</h3>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {(capabilities?.modules ?? []).map((module) => (
                                        <span key={module} className="status-pill px-2.5 py-1 text-xs font-semibold">
                                            {module}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="preview-card p-4">
                                <h3 className="font-jakarta text-sm font-extrabold uppercase tracking-tight">Endpoints</h3>
                                <div className="mt-3 grid gap-1.5">
                                    {(capabilities?.endpoints ?? []).map((endpoint) => (
                                        <code key={endpoint} className="app-codeblock rounded-md px-2 py-1 text-xs">
                                            {endpoint}
                                        </code>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </Panel>
            </motion.div>

            <motion.div {...cardEnter}>
                <Panel title="Resultado" subtitle="Previews e downloads ficam aqui sem trocar de pagina." icon={Activity}>
                    {capabilities ? (
                        <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-3">
                                <Metric label="Endpoints" value={String(capabilities.endpoints.length)} />
                                <Metric label="Modulos" value={String(capabilities.modules.length)} />
                                <Metric label="API" value={capabilities.status} />
                            </div>
                            <pre className="app-codeblock max-h-[360px] overflow-auto rounded-xl p-4 text-sm leading-6">
                                {JSON.stringify(capabilities, null, 2)}
                            </pre>
                        </div>
                    ) : (
                        <EmptyState text="Status ainda carregando ou API offline." />
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
