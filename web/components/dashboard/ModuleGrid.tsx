"use client"

import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"

import { DashboardShell, cardEnter } from "@/components/dashboard/primitives"
import { useI18n } from "@/lib/i18n/provider"
import { MODULES, ModuleId } from "@/lib/modules"
import { cn } from "@/lib/utils"

export function ModuleGrid({ onPickModule }: { onPickModule: (module: ModuleId) => void }) {
    const { t } = useI18n()
    return (
        <motion.div {...cardEnter} className="space-y-4">
            <DashboardShell innerClassName="p-5 sm:p-6">
                <p className="app-faint text-[10px] font-bold uppercase tracking-[0.24em]">{t.nav.home}</p>
                <h2 className="mt-1 font-jakarta text-2xl font-extrabold uppercase leading-none tracking-tight sm:text-3xl">
                    {t.home.title}
                </h2>
                <p className="app-muted mt-2 max-w-3xl text-sm leading-5">
                    {t.home.intro}
                    <span className="font-semibold"> {t.modules.packages.title}</span>.
                </p>
            </DashboardShell>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {MODULES.map((module) => {
                    const ModuleIcon = module.icon
                    const moduleText = t.modules[module.id]
                    const showTools = module.tools.length > 1
                    return (
                        <button
                            key={module.id}
                            type="button"
                            onClick={() => onPickModule(module.id)}
                            className="text-left"
                        >
                            <DashboardShell innerClassName="flex h-full flex-col gap-4 p-5">
                                <div className="flex items-start gap-3">
                                    <span className="panel-icon size-11 shrink-0 rounded-2xl">
                                        <ModuleIcon className={cn("size-5", module.accent)} />
                                    </span>
                                    <div className="min-w-0">
                                        <div className="truncate font-jakarta text-base font-extrabold uppercase leading-none tracking-tight">
                                            {moduleText.title}
                                        </div>
                                        <div className="app-faint mt-1 truncate text-xs">{moduleText.label}</div>
                                    </div>
                                </div>
                                <p className="app-muted text-sm leading-5">{moduleText.description}</p>
                                {showTools ? (
                                    <div className="mt-auto flex flex-wrap gap-2">
                                        {module.tools.map((tool) => (
                                            <span key={tool.id} className="status-pill px-2.5 py-1 text-xs font-semibold">
                                                {t.tools[tool.id].title}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                                <span
                                    className={cn(
                                        "app-faint inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.16em]",
                                        !showTools && "mt-auto",
                                    )}
                                >
                                    {t.common.open}
                                    <ArrowRight className="size-3.5" />
                                </span>
                            </DashboardShell>
                        </button>
                    )
                })}
            </div>
        </motion.div>
    )
}
