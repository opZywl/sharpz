"use client"

import { useMemo, useState } from "react"

import { DashboardHeader } from "@/components/dashboard/DashboardHeader"
import { DashboardProvider, useDashboard } from "@/components/dashboard/DashboardProvider"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { ModuleGrid } from "@/components/dashboard/ModuleGrid"
import { ModuleLanding } from "@/components/dashboard/ModuleLanding"
import { StatusPanel } from "@/components/dashboard/StatusPanel"
import { ToolHost } from "@/components/dashboard/ToolHost"
import { useI18n } from "@/lib/i18n/provider"
import { MODULES, ModuleId, TOOLS, ToolId, findToolModule } from "@/lib/modules"

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

    return (
        <div className="app-page">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="app-grid-layer absolute inset-0" />
            </div>

            <div className="relative mx-auto flex min-h-screen max-w-[1540px] gap-4 px-3 py-4 sm:px-5 lg:px-6 min-[1700px]:max-w-[1866px]">
                <DashboardSidebar
                    goHome={goHome}
                    search={search}
                    setSearch={setSearch}
                    searchResults={searchResults}
                    activeModule={activeModule}
                    activeTool={activeTool}
                    expanded={expanded}
                    toggleModule={toggleModule}
                    openModule={openModule}
                    openTool={openTool}
                />

                <main className="min-w-0 flex-1 space-y-4">
                    <DashboardHeader
                        apiStatus={apiStatus}
                        goHome={goHome}
                        activeModuleMeta={activeModuleMeta}
                        activeToolMeta={activeToolMeta}
                        openModule={openModule}
                    />

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
