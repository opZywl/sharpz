"use client"

import { motion } from "framer-motion"
import { Activity, Server } from "lucide-react"

import { EmptyState, Metric, Panel, cardEnter } from "@/components/dashboard/primitives"
import { useDashboard } from "@/components/dashboard/DashboardProvider"
import { DEFAULT_KTX_PRESET, DEFAULT_MODEL } from "@/lib/dashboard-types"
import { useI18n } from "@/lib/i18n/provider"

export function SystemTool() {
    const { apiStatus, models, capabilities, toktxFound } = useDashboard()
    const { t, fmt } = useI18n()

    return (
        <div className="space-y-4">
            <motion.div {...cardEnter}>
                <Panel title={t.tools.system.title} subtitle={t.system.subtitle} icon={Server}>
                    <div className="grid gap-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <Metric label="API" value={t.status[apiStatus]} />
                            <Metric label={t.system.models} value={fmt.number(capabilities?.models_count ?? models.length)} helper={capabilities?.default_model ?? DEFAULT_MODEL} />
                            <Metric label="toktx" value={toktxFound ? t.status.ok : t.status.missing} helper={capabilities?.default_ktx_preset ?? DEFAULT_KTX_PRESET} />
                            <Metric label="alktx2" value={capabilities?.alktx2_found ? t.status.ok : t.status.missing} helper={t.system.portfolioHelper} />
                        </div>
                        <div className="grid gap-4 xl:grid-cols-2">
                            <div className="preview-card p-4">
                                <h3 className="font-jakarta text-sm font-extrabold uppercase tracking-tight">{t.system.modules}</h3>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {(capabilities?.modules ?? []).map((module) => (
                                        <span key={module} className="status-pill px-2.5 py-1 text-xs font-semibold">
                                            {module}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="preview-card p-4">
                                <h3 className="font-jakarta text-sm font-extrabold uppercase tracking-tight">{t.system.endpoints}</h3>
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
                <Panel title={t.common.result} subtitle={t.common.resultSubtitle} icon={Activity}>
                    {capabilities ? (
                        <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-3">
                                <Metric label={t.system.endpoints} value={fmt.number(capabilities.endpoints.length)} />
                                <Metric label={t.system.modules} value={fmt.number(capabilities.modules.length)} />
                                <Metric label="API" value={capabilities.status} />
                            </div>
                            <pre className="app-codeblock max-h-[360px] overflow-auto rounded-xl p-4 text-sm leading-6">
                                {JSON.stringify(capabilities, null, 2)}
                            </pre>
                        </div>
                    ) : (
                        <EmptyState text={t.system.empty} />
                    )}
                </Panel>
            </motion.div>
        </div>
    )
}
