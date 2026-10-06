"use client"

import { Cpu, PackageCheck, Server } from "lucide-react"

import { useDashboard } from "@/components/dashboard/DashboardProvider"
import { DashboardShell } from "@/components/dashboard/primitives"
import { useI18n } from "@/lib/i18n/provider"

export function StatusPanel() {
    const { apiStatus, toktxFound, capabilities } = useDashboard()
    const { t } = useI18n()

    return (
        <DashboardShell innerClassName="p-4">
            <div className="grid gap-2">
                <div className="status-card flex items-center justify-between rounded-xl px-3 py-2">
                    <span className="app-faint flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
                        <Server className="size-3.5" />
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
                    <span className="app-faint flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
                        <Cpu className="size-3.5" />
                        {t.modules.ktx.title}
                    </span>
                    <span className="text-xs font-semibold">
                        {toktxFound === null ? t.status.checking : toktxFound ? t.status.ok : t.status.missing}
                    </span>
                </div>
                <div className="status-card flex items-center justify-between rounded-xl px-3 py-2">
                    <span className="app-faint flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
                        <PackageCheck className="size-3.5" />
                        {t.tools["portfolio-ktx"].title}
                    </span>
                    <span className="text-xs font-semibold">
                        {capabilities?.alktx2_found ? t.status.ok : t.status.missing}
                    </span>
                </div>
            </div>
        </DashboardShell>
    )
}
