"use client"

import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"

import { DashboardShell, Panel, cardEnter } from "@/components/dashboard/primitives"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n/provider"
import { Module, ToolId } from "@/lib/modules"
import { cn } from "@/lib/utils"

export function ModuleLanding({
    module,
    onPickTool,
}: {
    module: Module
    onPickTool: (tool: ToolId) => void
}) {
    const { t } = useI18n()
    const ModuleIcon = module.icon
    const moduleText = t.modules[module.id]
    return (
        <motion.div {...cardEnter} className="space-y-4">
            <DashboardShell innerClassName="p-5 sm:p-6">
                <div className="flex min-w-0 items-start gap-4">
                    <span className="panel-icon size-12 shrink-0 rounded-2xl">
                        <ModuleIcon className={cn("size-6", module.accent)} />
                    </span>
                    <div className="min-w-0">
                        <p className="app-faint text-[10px] font-bold uppercase tracking-[0.24em]">{t.moduleLanding.eyebrow}</p>
                        <h2 className="mt-1 font-jakarta text-2xl font-extrabold uppercase leading-none tracking-tight sm:text-3xl">
                            {moduleText.title}
                        </h2>
                        <p className="app-muted mt-2 max-w-3xl text-sm leading-5">{moduleText.description}</p>
                    </div>
                </div>
            </DashboardShell>

            <Panel title={t.moduleLanding.tools} subtitle={t.moduleLanding.pick} icon={module.icon}>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {module.tools.map((tool) => {
                        const ToolIcon = tool.icon
                        const toolText = t.tools[tool.id]
                        return (
                            <div key={tool.id} className="preview-card flex flex-col gap-4 p-4">
                                <div className="flex items-start gap-3">
                                    <span className="panel-icon size-10 shrink-0 rounded-xl">
                                        <ToolIcon className={cn("size-5", tool.accent)} />
                                    </span>
                                    <div className="min-w-0">
                                        <div className="truncate font-jakarta text-sm font-extrabold uppercase leading-none tracking-tight">
                                            {toolText.title}
                                        </div>
                                        <div className="app-faint mt-1 truncate text-xs">{toolText.label}</div>
                                    </div>
                                </div>
                                <p className="app-muted text-sm leading-5">{toolText.description}</p>
                                <Button onClick={() => onPickTool(tool.id)} variant="outline" className="mt-auto w-full">
                                    {t.common.open}
                                    <ArrowRight className="size-4" />
                                </Button>
                            </div>
                        )
                    })}
                </div>
            </Panel>
        </motion.div>
    )
}
