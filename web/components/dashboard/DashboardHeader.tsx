"use client"

import { motion } from "framer-motion"
import { ChevronRight, Home } from "lucide-react"

import type { useDashboard } from "@/components/dashboard/DashboardProvider"
import { DashboardShell, cardEnter } from "@/components/dashboard/primitives"
import { LanguageToggle } from "@/components/language-toggle"
import { ThemeToggle } from "@/components/theme-toggle"
import { useI18n } from "@/lib/i18n/provider"
import type { Module, ModuleId, Tool } from "@/lib/modules"
import { cn } from "@/lib/utils"

export function DashboardHeader({
    apiStatus,
    goHome,
    activeModuleMeta,
    activeToolMeta,
    openModule,
}: {
    apiStatus: ReturnType<typeof useDashboard>["apiStatus"]
    goHome: () => void
    activeModuleMeta: Module | null
    activeToolMeta: Tool | null
    openModule: (module: ModuleId) => void
}) {
    const { t } = useI18n()
    return (
        <motion.header {...cardEnter}>
            <DashboardShell innerClassName="p-4 sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                        <button
                            type="button"
                            onClick={goHome}
                            className="app-muted inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.16em] transition-colors hover:text-foreground"
                        >
                            <Home className="size-3.5" />
                            {t.nav.home}
                        </button>
                        {activeModuleMeta ? (
                            <>
                                <ChevronRight className="app-faint size-3.5 shrink-0" />
                                <button
                                    type="button"
                                    onClick={() => openModule(activeModuleMeta.id)}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.16em] transition-colors",
                                        activeToolMeta ? "app-muted hover:text-foreground" : "text-foreground",
                                    )}
                                >
                                    {t.modules[activeModuleMeta.id].title}
                                </button>
                            </>
                        ) : null}
                        {activeToolMeta ? (
                            <>
                                <ChevronRight className="app-faint size-3.5 shrink-0" />
                                <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.16em] text-foreground">
                                    {t.tools[activeToolMeta.id].title}
                                </span>
                            </>
                        ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className="status-pill px-3 py-2 text-xs font-semibold"
                            data-tone={apiStatus === "online" ? "good" : apiStatus === "offline" ? "bad" : undefined}
                        >
                            API {t.status[apiStatus]}
                        </span>
                        <LanguageToggle />
                        <ThemeToggle />
                    </div>
                </div>
            </DashboardShell>
        </motion.header>
    )
}
