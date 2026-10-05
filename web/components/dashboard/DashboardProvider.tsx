"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

import {
    CapabilityInfo,
    DEFAULT_KTX_PRESET,
    DEFAULT_MODEL,
    KtxPreset,
    ModelInfo,
} from "@/lib/dashboard-types"

type ApiStatus = "checking" | "online" | "offline"

interface DashboardContextValue {
    apiStatus: ApiStatus
    models: ModelInfo[]
    ktxPresets: KtxPreset[]
    toktxFound: boolean | null
    capabilities: CapabilityInfo | null
    defaultModel: string
    defaultKtxPreset: string
    modelOptions: Array<{ value: string; label: string }>
    ktxPresetOptions: Array<{ value: string; label: string }>
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

export function DashboardProvider({ children }: { children: React.ReactNode }) {
    const [apiStatus, setApiStatus] = useState<ApiStatus>("checking")
    const [models, setModels] = useState<ModelInfo[]>([])
    const [ktxPresets, setKtxPresets] = useState<KtxPreset[]>([])
    const [toktxFound, setToktxFound] = useState<boolean | null>(null)
    const [capabilities, setCapabilities] = useState<CapabilityInfo | null>(null)
    const [defaultModel, setDefaultModel] = useState<string>(DEFAULT_MODEL)
    const [defaultKtxPreset, setDefaultKtxPreset] = useState<string>(DEFAULT_KTX_PRESET)

    useEffect(() => {
        let cancelled = false

        async function loadApi() {
            try {
                const [healthRes, modelsRes, presetsRes, capabilitiesRes] = await Promise.all([
                    fetch("/api/health"),
                    fetch("/api/models"),
                    fetch("/api/ktx/presets"),
                    fetch("/api/capabilities"),
                ])
                if (!healthRes.ok || !modelsRes.ok || !presetsRes.ok || !capabilitiesRes.ok) {
                    throw new Error("API unavailable")
                }
                const modelsData = (await modelsRes.json()) as { models: ModelInfo[] }
                const presetsData = (await presetsRes.json()) as {
                    presets: KtxPreset[]
                    default_preset: string
                    toktx_found: boolean
                }
                const capabilitiesData = (await capabilitiesRes.json()) as CapabilityInfo
                if (cancelled) return
                setApiStatus("online")
                setModels(modelsData.models)
                setKtxPresets(presetsData.presets)
                setToktxFound(presetsData.toktx_found)
                setCapabilities(capabilitiesData)
                setDefaultModel(modelsData.models.find((model) => model.is_default)?.key ?? DEFAULT_MODEL)
                setDefaultKtxPreset(presetsData.default_preset || DEFAULT_KTX_PRESET)
            } catch {
                if (!cancelled) {
                    setApiStatus("offline")
                    setToktxFound(false)
                }
            }
        }

        loadApi()
        return () => {
            cancelled = true
        }
    }, [])

    const modelOptions = useMemo(
        () =>
            (models.length ? models : [{ key: DEFAULT_MODEL, label: "ISNet (rápido)", is_default: true }]).map(
                (model) => ({
                    value: model.key,
                    label: model.is_default ? `${model.label} *` : model.label,
                }),
            ),
        [models],
    )

    const ktxPresetOptions = useMemo(
        () =>
            (ktxPresets.length
                ? ktxPresets
                : [{ key: DEFAULT_KTX_PRESET, label: "ULTRA - UASTC q4 + zcmp22", is_default: true }]
            ).map((preset) => ({
                value: preset.key,
                label: preset.is_default ? `${preset.key} *` : preset.key,
            })),
        [ktxPresets],
    )

    const value = useMemo<DashboardContextValue>(
        () => ({
            apiStatus,
            models,
            ktxPresets,
            toktxFound,
            capabilities,
            defaultModel,
            defaultKtxPreset,
            modelOptions,
            ktxPresetOptions,
        }),
        [
            apiStatus,
            models,
            ktxPresets,
            toktxFound,
            capabilities,
            defaultModel,
            defaultKtxPreset,
            modelOptions,
            ktxPresetOptions,
        ],
    )

    return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard() {
    const context = useContext(DashboardContext)
    if (!context) {
        throw new Error("useDashboard deve ser usado dentro de DashboardProvider")
    }
    return context
}
