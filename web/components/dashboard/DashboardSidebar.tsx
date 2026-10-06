"use client"

import { ChevronDown, ChevronRight, Home, Search, Server } from "lucide-react"
import Image from "next/image"
import type { Dispatch, SetStateAction } from "react"

import { StatusPanel } from "@/components/dashboard/StatusPanel"
import { DashboardShell } from "@/components/dashboard/primitives"
import { useI18n } from "@/lib/i18n/provider"
import { MODULES, findToolModule, type ModuleId, type Tool, type ToolId } from "@/lib/modules"
import { cn } from "@/lib/utils"

export function DashboardSidebar({
    goHome,
    search,
    setSearch,
    searchResults,
    activeModule,
    activeTool,
    expanded,
    toggleModule,
    openModule,
    openTool,
}: {
    goHome: () => void
    search: string
    setSearch: Dispatch<SetStateAction<string>>
    searchResults: Tool[] | null
    activeModule: ModuleId | null
    activeTool: ToolId | null
    expanded: Record<ModuleId, boolean>
    toggleModule: (module: ModuleId) => void
    openModule: (module: ModuleId) => void
    openTool: (tool: ToolId) => void
}) {
    const { t } = useI18n()
    const navModules = MODULES.filter((module) => module.id !== "system")
    const systemModule = MODULES.find((module) => module.id === "system")

    return (
        <aside className="hidden w-[310px] shrink-0 lg:block">
            <div className="sticky top-4 space-y-4">
                <DashboardShell innerClassName="p-4">
                    <button type="button" onClick={goHome} className="flex w-full items-center gap-3 text-left">
                        <span className="panel-icon size-11 rounded-2xl">
                            <Image src="/brand/sharpz-logo.svg" alt="" width={30} height={30} priority unoptimized />
                        </span>
                        <div className="min-w-0">
                            <h1 className="font-jakarta text-lg font-extrabold uppercase leading-none tracking-tight">
                                Sharpz
                            </h1>
                            <p className="app-faint mt-1 text-xs">{t.nav.subtitle}</p>
                        </div>
                    </button>

                    <div className="field-control mt-4 flex items-center gap-2 px-3">
                        <Search className="app-faint size-4" />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={t.nav.search}
                            aria-label={t.nav.search}
                            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        />
                    </div>
                </DashboardShell>

                <DashboardShell innerClassName="p-3">
                    {searchResults ? (
                        <div className="space-y-1">
                            {searchResults.length === 0 ? (
                                <p className="app-faint px-3 py-3 text-xs">{t.nav.noResults}</p>
                            ) : (
                                searchResults.map((tool) => {
                                    const Icon = tool.icon
                                    const moduleMeta = findToolModule(tool.id)
                                    const isActive = activeTool === tool.id
                                    return (
                                        <button
                                            key={tool.id}
                                            type="button"
                                            onClick={() => openTool(tool.id)}
                                            className="sidebar-item flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors"
                                            data-active={isActive}
                                        >
                                            <span className="sidebar-icon size-9 shrink-0 rounded-xl">
                                                <Icon className={cn("size-4", isActive ? tool.accent : "app-faint")} />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-jakarta text-sm font-extrabold uppercase leading-none tracking-tight">
                                                    {t.tools[tool.id].title}
                                                </span>
                                                <span className="app-faint mt-1 block truncate text-xs">
                                                    {moduleMeta ? t.modules[moduleMeta.id].title : null}
                                                </span>
                                            </span>
                                        </button>
                                    )
                                })
                            )}
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <button
                                type="button"
                                onClick={goHome}
                                className="sidebar-item flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors"
                                data-active={activeModule === null && activeTool === null}
                            >
                                <span className="sidebar-icon size-9 shrink-0 rounded-xl">
                                    <Home className="app-faint size-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-jakarta text-sm font-extrabold uppercase leading-none tracking-tight">
                                        {t.nav.home}
                                    </span>
                                    <span className="app-faint mt-1 block truncate text-xs">{t.nav.allModules}</span>
                                </span>
                            </button>

                            {navModules.map((module) => {
                                const Icon = module.icon
                                const isOpen = expanded[module.id]
                                const isActiveModule = activeModule === module.id
                                return (
                                    <div key={module.id}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                toggleModule(module.id)
                                                openModule(module.id)
                                            }}
                                            className="sidebar-item flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors"
                                            data-active={isActiveModule && activeTool === null}
                                        >
                                            <span className="sidebar-icon size-9 shrink-0 rounded-xl">
                                                <Icon className={cn("size-4", isActiveModule ? module.accent : "app-faint")} />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-jakarta text-sm font-extrabold uppercase leading-none tracking-tight">
                                                    {t.modules[module.id].title}
                                                </span>
                                                <span className="app-faint mt-1 block truncate text-xs">{t.modules[module.id].label}</span>
                                            </span>
                                            {isOpen ? (
                                                <ChevronDown className="app-faint size-4 shrink-0" />
                                            ) : (
                                                <ChevronRight className="app-faint size-4 shrink-0" />
                                            )}
                                        </button>
                                        {isOpen ? (
                                            <div className="mb-1 ml-5 space-y-1 border-l border-foreground/10 pl-2">
                                                {module.tools.map((tool) => {
                                                    const ToolIcon = tool.icon
                                                    const isActive = activeTool === tool.id
                                                    return (
                                                        <button
                                                            key={tool.id}
                                                            type="button"
                                                            onClick={() => openTool(tool.id)}
                                                            className="sidebar-item flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors"
                                                            data-active={isActive}
                                                        >
                                                            <ToolIcon className={cn("size-3.5 shrink-0", isActive ? tool.accent : "app-faint")} />
                                                            <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                                                                {t.tools[tool.id].title}
                                                            </span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        ) : null}
                                    </div>
                                )
                            })}

                            {systemModule ? (
                                <button
                                    type="button"
                                    onClick={() => openTool("system")}
                                    className="sidebar-item flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors"
                                    data-active={activeTool === "system"}
                                >
                                    <span className="sidebar-icon size-9 shrink-0 rounded-xl">
                                        <Server className={cn("size-4", activeTool === "system" ? systemModule.accent : "app-faint")} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-jakarta text-sm font-extrabold uppercase leading-none tracking-tight">
                                            {t.modules[systemModule.id].title}
                                        </span>
                                        <span className="app-faint mt-1 block truncate text-xs">{t.modules[systemModule.id].label}</span>
                                    </span>
                                </button>
                            ) : null}
                        </div>
                    )}
                </DashboardShell>

                <div className="min-[1700px]:hidden">
                    <StatusPanel />
                </div>
            </div>
        </aside>
    )
}
