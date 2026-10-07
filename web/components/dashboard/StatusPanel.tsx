"use client"

import { Box, Cpu, Database, PackageCheck, Server } from "lucide-react"

import { useDashboard } from "@/components/dashboard/DashboardProvider"
import { DashboardShell } from "@/components/dashboard/primitives"
import { useI18n } from "@/lib/i18n/provider"

function StatusDot({ ok }: { ok: boolean }) {
    return <span className="status-dot" data-tone={ok ? "good" : "bad"} aria-hidden="true" />
}

export function StatusPanel() {
    const { apiStatus, toktxFound, capabilities } = useDashboard()
    const { t } = useI18n()
    const alktx2 = Boolean(capabilities?.alktx2_found)

    return (
        <div className="status-frame">
            <DashboardShell innerClassName="p-4">
                <div className="status-rows grid gap-2">
                    <div className="status-card flex items-center justify-between rounded-xl px-3 py-2">
                        <span className="status-label app-faint flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
                            <Server className="status-icon-default size-3.5" />
                            <Database className="status-icon-ruby size-3.5" />
                            API
                        </span>
                        <span
                            className="status-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]"
                            data-tone={apiStatus === "online" ? "good" : apiStatus === "offline" ? "bad" : undefined}
                        >
                            {t.status[apiStatus]}
                        </span>
                    </div>
                    <div className="status-card flex items-center justify-between rounded-xl px-3 py-2">
                        <span className="status-label app-faint flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
                            <Cpu className="status-icon-default size-3.5" />
                            <Box className="status-icon-ruby size-3.5" />
                            {t.modules.ktx.title}
                        </span>
                        <span className="status-value flex items-center gap-2 text-xs font-semibold">
                            {toktxFound === null ? t.status.checking : toktxFound ? t.status.ok : t.status.missing}
                            {toktxFound === null ? null : <StatusDot ok={toktxFound} />}
                        </span>
                    </div>
                    <div className="status-card flex items-center justify-between rounded-xl px-3 py-2">
                        <span className="status-label app-faint flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
                            <PackageCheck className="status-icon-default size-3.5" />
                            <Box className="status-icon-ruby size-3.5" />
                            {t.tools["portfolio-ktx"].title}
                        </span>
                        <span className="status-value flex items-center gap-2 text-xs font-semibold">
                            {alktx2 ? t.status.ok : t.status.missing}
                            <StatusDot ok={alktx2} />
                        </span>
                    </div>
                </div>
            </DashboardShell>
        </div>
    )
}
