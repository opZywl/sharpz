"use client"

import { motion } from "framer-motion"
import {
    ChevronDown,
    ChevronRight,
    Cpu,
    Home,
    PackageCheck,
    Search,
    Server,
} from "lucide-react"
import Image from "next/image"
import { useMemo, useState } from "react"

import { DashboardProvider, useDashboard } from "@/components/dashboard/DashboardProvider"
import { ModuleGrid } from "@/components/dashboard/ModuleGrid"
import { ModuleLanding } from "@/components/dashboard/ModuleLanding"
import { DashboardShell, cardEnter } from "@/components/dashboard/primitives"
import { ToolHost } from "@/components/dashboard/ToolHost"
import { LanguageToggle } from "@/components/language-toggle"
import { ThemeToggle } from "@/components/theme-toggle"
import { useI18n } from "@/lib/i18n/provider"
import { MODULES, ModuleId, TOOLS, ToolId, findToolModule } from "@/lib/modules"
import { cn } from "@/lib/utils"

function StatusPanel() {
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

function Dashboard() {
    const { apiStatus } = useDashboard()
    const { t } = useI18n()

    const [activeModule, setActiveModule] = useState<ModuleId | null>(null)
    const [activeTool, setActiveTool] = useState<ToolId | null>(null)
    const [search, setSearch] = useState("")
    const [expanded, setExpanded] = useState<Record<ModuleId, boolean>>({
        image: false,
        vector: false,
        ktx: false,
        transcription: false,
        document: false,
        packages: false,
        system: false,
    })

    const searchResults = useMemo(() => {
        const term = search.trim().toLowerCase()
        if (!term) return null
        return Object.values(TOOLS).filter((tool) => {
            const text = t.tools[tool.id]
            return [text.title, text.label, text.description].join(" ").toLowerCase().includes(term)
        })
    }, [search, t])

    function openTool(tool: ToolId) {
        setActiveTool(tool)
        setActiveModule(findToolModule(tool)?.id ?? null)
        setSearch("")
    }

    function openModule(module: ModuleId) {
        const moduleMeta = MODULES.find((item) => item.id === module)
        if (moduleMeta?.tools.length === 1) {
            openTool(moduleMeta.tools[0].id)
            return
        }
        setActiveModule(module)
        setActiveTool(null)
    }

    function goHome() {
        setActiveModule(null)
        setActiveTool(null)
    }

    function toggleModule(module: ModuleId) {
        setExpanded((current) => ({ ...current, [module]: !current[module] }))
    }

    const activeToolMeta = activeTool ? TOOLS[activeTool] : null
    const activeModuleMeta = activeModule ? MODULES.find((module) => module.id === activeModule) ?? null : null
    const navModules = MODULES.filter((module) => module.id !== "system")
    const systemModule = MODULES.find((module) => module.id === "system")

    return (
        <div className="app-page">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="app-grid-layer absolute inset-0" />
            </div>

            <div className="relative mx-auto flex min-h-screen max-w-[1540px] gap-4 px-3 py-4 sm:px-5 lg:px-6 min-[1700px]:max-w-[1866px]">
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

                <main className="min-w-0 flex-1 space-y-4">
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

                    {activeTool ? (
                        <ToolHost tool={activeTool} />
                    ) : activeModuleMeta ? (
                        <ModuleLanding module={activeModuleMeta} onPickTool={openTool} />
                    ) : (
                        <ModuleGrid onPickModule={openModule} />
                    )}
                </main>

                <aside className="hidden w-[310px] shrink-0 min-[1700px]:block">
                    <div className="sticky top-4">
                        <StatusPanel />
                    </div>
                </aside>
            </div>
        </div>
    )
}

export default function Page() {
    return (
        <DashboardProvider>
            <Dashboard />
        </DashboardProvider>
    )
}
