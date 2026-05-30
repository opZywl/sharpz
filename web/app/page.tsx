"use client"

import { motion } from "framer-motion"
import {
    ChevronDown,
    ChevronRight,
    Cpu,
    Gauge,
    Home,
    PackageCheck,
    Search,
    Server,
    Sparkles,
} from "lucide-react"
import { useMemo, useState } from "react"

import { DashboardProvider, useDashboard } from "@/components/dashboard/DashboardProvider"
import { ModuleGrid } from "@/components/dashboard/ModuleGrid"
import { ModuleLanding } from "@/components/dashboard/ModuleLanding"
import { DashboardShell, cardEnter } from "@/components/dashboard/primitives"
import { ToolHost } from "@/components/dashboard/ToolHost"
import { ThemeToggle } from "@/components/theme-toggle"
import { MODULES, ModuleId, TOOLS, ToolId, findToolModule } from "@/lib/modules"
import { cn } from "@/lib/utils"

function Dashboard() {
    const { apiStatus, toktxFound, capabilities } = useDashboard()

    const [activeModule, setActiveModule] = useState<ModuleId | null>(null)
    const [activeTool, setActiveTool] = useState<ToolId | null>(null)
    const [search, setSearch] = useState("")
    const [expanded, setExpanded] = useState<Record<ModuleId, boolean>>({
        imagem: false,
        vetor: false,
        ktx: false,
        transcricao: false,
        sistema: false,
    })

    const searchResults = useMemo(() => {
        const term = search.trim().toLowerCase()
        if (!term) return null
        return Object.values(TOOLS).filter((tool) =>
            [tool.title, tool.label, tool.description].join(" ").toLowerCase().includes(term),
        )
    }, [search])

    function openTool(tool: ToolId) {
        setActiveTool(tool)
        setActiveModule(findToolModule(tool)?.id ?? null)
        setSearch("")
    }

    function openModule(module: ModuleId) {
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
    const navModules = MODULES.filter((module) => module.id !== "sistema")
    const systemModule = MODULES.find((module) => module.id === "sistema")

    return (
        <div className="app-page">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="app-grid-layer absolute inset-0" />
            </div>

            <div className="relative mx-auto flex min-h-screen max-w-[1540px] gap-4 px-3 py-4 sm:px-5 lg:px-6">
                <aside className="hidden w-[310px] shrink-0 lg:block">
                    <div className="sticky top-4 space-y-4">
                        <DashboardShell innerClassName="p-4">
                            <button type="button" onClick={goHome} className="flex w-full items-center gap-3 text-left">
                                <span className="panel-icon size-11 rounded-2xl">
                                    <Sparkles className="size-5" />
                                </span>
                                <div className="min-w-0">
                                    <h1 className="font-jakarta text-lg font-extrabold uppercase leading-none tracking-tight">
                                        Sharpz
                                    </h1>
                                    <p className="app-faint mt-1 text-xs">Painel de ferramentas</p>
                                </div>
                            </button>

                            <div className="field-control mt-4 flex items-center gap-2 px-3">
                                <Search className="app-faint size-4" />
                                <input
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Buscar ferramenta..."
                                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                                />
                            </div>
                        </DashboardShell>

                        <DashboardShell innerClassName="p-3">
                            {searchResults ? (
                                <div className="space-y-1">
                                    {searchResults.length === 0 ? (
                                        <p className="app-faint px-3 py-3 text-xs">Nenhuma ferramenta encontrada.</p>
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
                                                            {tool.title}
                                                        </span>
                                                        <span className="app-faint mt-1 block truncate text-xs">
                                                            {moduleMeta?.title}
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
                                                Inicio
                                            </span>
                                            <span className="app-faint mt-1 block truncate text-xs">Todos os modulos</span>
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
                                                            {module.title}
                                                        </span>
                                                        <span className="app-faint mt-1 block truncate text-xs">{module.label}</span>
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
                                                                        {tool.title}
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
                                                    {systemModule.title}
                                                </span>
                                                <span className="app-faint mt-1 block truncate text-xs">{systemModule.label}</span>
                                            </span>
                                        </button>
                                    ) : null}
                                </div>
                            )}
                        </DashboardShell>

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
                                        {apiStatus}
                                    </span>
                                </div>
                                <div className="status-card flex items-center justify-between rounded-xl px-3 py-2">
                                    <span className="app-faint flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
                                        <Cpu className="size-3.5" />
                                        toktx
                                    </span>
                                    <span className="text-xs font-semibold">
                                        {toktxFound === null ? "checking" : toktxFound ? "ok" : "missing"}
                                    </span>
                                </div>
                                <div className="status-card flex items-center justify-between rounded-xl px-3 py-2">
                                    <span className="app-faint flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
                                        <PackageCheck className="size-3.5" />
                                        alktx2
                                    </span>
                                    <span className="text-xs font-semibold">
                                        {capabilities?.alktx2_found ? "ok" : "missing"}
                                    </span>
                                </div>
                            </div>
                        </DashboardShell>
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
                                        Inicio
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
                                                {activeModuleMeta.title}
                                            </button>
                                        </>
                                    ) : null}
                                    {activeToolMeta ? (
                                        <>
                                            <ChevronRight className="app-faint size-3.5 shrink-0" />
                                            <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.16em] text-foreground">
                                                {activeToolMeta.title}
                                            </span>
                                        </>
                                    ) : null}
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <span
                                        className="status-pill px-3 py-2 text-xs font-semibold"
                                        data-tone={apiStatus === "online" ? "good" : apiStatus === "offline" ? "bad" : undefined}
                                    >
                                        API {apiStatus}
                                    </span>
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

                    <footer className="app-faint flex flex-wrap items-center justify-between gap-3 pb-4 text-xs">
                        <span>rembg - vtracer - resvg - FastAPI - Next.js</span>
                        <span className="inline-flex items-center gap-2">
                            <Gauge className="size-3.5" />
                            UI inspirada no portfolio, com light/dark real
                        </span>
                    </footer>
                </main>
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
