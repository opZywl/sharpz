"use client"

import { CheckboxRow, TextField } from "@/components/dashboard/primitives"
import { usePersistentState } from "@/components/transcribe/transcribe-hooks"
import { readStorage, writeStorage, type Store } from "@/components/transcribe/transcribe-utils"
import { appendFields } from "@/lib/dashboard-utils"
import { useI18n } from "@/lib/i18n/provider"

export interface CompleteSettings {
    enabled: boolean
    frameInterval: string
    sceneThreshold: string
    genDocs: boolean
    visionBaseUrl: string
    visionModel: string
    visionApiKey: string
    outputDir: string
    outputName: string
    makeZip: boolean
    openFolder: boolean
}

const DEFAULT_VISION_BASE_URL = "http://localhost:11434/v1"
const DEFAULT_VISION_MODEL = "llama3.2-vision"

const DEFAULT_COMPLETE: CompleteSettings = {
    enabled: false,
    frameInterval: "3",
    sceneThreshold: "0.30",
    genDocs: true,
    visionBaseUrl: DEFAULT_VISION_BASE_URL,
    visionModel: DEFAULT_VISION_MODEL,
    visionApiKey: "",
    outputDir: "",
    outputName: "",
    makeZip: true,
    openFolder: true,
}

const STORED_FIELDS = {
    visionBaseUrl: "cleanup-image.vision-base-url",
    visionModel: "cleanup-image.vision-model",
    visionApiKey: "cleanup-image.vision-api-key",
    outputDir: "cleanup-image.complete-output-dir",
} as const

const storedFields = Object.keys(STORED_FIELDS) as Array<keyof typeof STORED_FIELDS>

const completeStore: Store<CompleteSettings> = {
    load: () => {
        const saved = { ...DEFAULT_COMPLETE }
        storedFields.forEach((field) => {
            const value = readStorage(STORED_FIELDS[field])
            if (value) saved[field] = value
        })
        return saved
    },
    save: (value) => {
        storedFields.forEach((field) => writeStorage(STORED_FIELDS[field], value[field]))
    },
}

export function useCompleteSettings() {
    return usePersistentState(DEFAULT_COMPLETE, completeStore)
}

export function appendCompleteFields(form: FormData, settings: CompleteSettings) {
    if (!settings.enabled) return
    appendFields(form, {
        mode: "complete",
        frame_interval: settings.frameInterval.trim() || "3",
        scene_threshold: settings.sceneThreshold.trim() || "0.30",
        gen_docs: settings.genDocs,
        make_zip: settings.makeZip,
        open_folder: settings.openFolder,
    })
    if (settings.genDocs) {
        appendFields(form, { vision_base_url: settings.visionBaseUrl.trim(), vision_model: settings.visionModel.trim() })
        if (settings.visionApiKey.trim()) form.append("vision_api_key", settings.visionApiKey.trim())
    }
    if (settings.outputDir.trim()) form.append("output_dir", settings.outputDir.trim())
    if (settings.outputName.trim()) form.append("output_name", settings.outputName.trim())
}

export function CompleteModeFields({
    settings,
    onChange,
}: {
    settings: CompleteSettings
    onChange: (patch: Partial<CompleteSettings>) => void
}) {
    const { t } = useI18n()
    return (
        <div className="grid gap-3 rounded-xl border border-foreground/10 p-3">
            <CheckboxRow
                checked={settings.enabled}
                onChange={(enabled) => onChange({ enabled })}
                label={t.completeFields.title}
                helper={t.completeFields.helper}
            />
            {settings.enabled ? (
                <div className="grid gap-3">
                    <div className="grid gap-3 md:grid-cols-2">
                        <TextField
                            label={t.completeFields.frameInterval}
                            value={settings.frameInterval}
                            onChange={(frameInterval) => onChange({ frameInterval })}
                            placeholder="3"
                            type="number"
                        />
                        <TextField
                            label={t.completeFields.sceneThreshold}
                            value={settings.sceneThreshold}
                            onChange={(sceneThreshold) => onChange({ sceneThreshold })}
                            placeholder="0.30"
                            type="number"
                        />
                    </div>
                    <CheckboxRow
                        checked={settings.genDocs}
                        onChange={(genDocs) => onChange({ genDocs })}
                        label={t.completeFields.genDocs}
                        helper={t.completeFields.genDocsHelper}
                    />
                    {settings.genDocs ? (
                        <div className="grid gap-3">
                            <div className="grid gap-3 md:grid-cols-2">
                                <TextField
                                    label={t.completeFields.visionUrl}
                                    value={settings.visionBaseUrl}
                                    onChange={(visionBaseUrl) => onChange({ visionBaseUrl })}
                                    placeholder={DEFAULT_VISION_BASE_URL}
                                />
                                <TextField
                                    label={t.completeFields.visionModel}
                                    value={settings.visionModel}
                                    onChange={(visionModel) => onChange({ visionModel })}
                                    placeholder={DEFAULT_VISION_MODEL}
                                />
                            </div>
                            <TextField
                                label={t.completeFields.visionKey}
                                value={settings.visionApiKey}
                                onChange={(visionApiKey) => onChange({ visionApiKey })}
                                placeholder="sk-..."
                                type="password"
                            />
                        </div>
                    ) : null}
                    <div className="grid gap-3 md:grid-cols-2">
                        <TextField
                            label={t.completeFields.folderName}
                            value={settings.outputName}
                            onChange={(outputName) => onChange({ outputName })}
                            placeholder={t.completeFields.folderNamePlaceholder}
                        />
                        <TextField
                            label={t.fields.outputFolderOptional}
                            value={settings.outputDir}
                            onChange={(outputDir) => onChange({ outputDir })}
                            placeholder={t.placeholders.folderWindows}
                        />
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                        <CheckboxRow checked={settings.makeZip} onChange={(makeZip) => onChange({ makeZip })} label={t.completeFields.zip} />
                        <CheckboxRow
                            checked={settings.openFolder}
                            onChange={(openFolder) => onChange({ openFolder })}
                            label={t.completeFields.openFolder}
                        />
                    </div>
                </div>
            ) : null}
        </div>
    )
}
