import {
    FORMAT_OPTIONS,
    LANGUAGE_CODES,
    MODEL_FALLBACK,
    readStorageJson,
    stringStore,
    writeStorage,
    type FormatKey,
    type Store,
} from "@/components/transcribe/transcribe-utils"

export interface TranscribeOptions {
    language: string
    model: string
    diarize: boolean
    wordTimestamps: boolean
    vad: boolean
    translate: boolean
    formats: Record<FormatKey, boolean>
    autoStart: boolean
    moreOpen: boolean
}

export type Mode = "fast" | "quality" | "custom"

export const AUTO_MODEL = "auto"
const KNOWN_MODELS = new Set([AUTO_MODEL, ...MODEL_FALLBACK.map((entry) => entry.key)])

export const DEFAULT_OPTIONS: TranscribeOptions = {
    language: "pt",
    model: AUTO_MODEL,
    diarize: false,
    wordTimestamps: false,
    vad: true,
    translate: false,
    formats: { txt: true, srt: true, vtt: false, json: false, lrc: false },
    autoStart: true,
    moreOpen: false,
}

function pickBoolean(value: unknown, fallback: boolean) {
    return typeof value === "boolean" ? value : fallback
}

function sanitizeOptions(raw: unknown): TranscribeOptions | null {
    if (!raw || typeof raw !== "object") return null
    const value = raw as Record<string, unknown>
    const savedFormats = value.formats && typeof value.formats === "object" ? (value.formats as Record<string, unknown>) : {}
    const formats = Object.fromEntries(
        FORMAT_OPTIONS.map(({ key }) => [key, key === "txt" || pickBoolean(savedFormats[key], DEFAULT_OPTIONS.formats[key])]),
    ) as Record<FormatKey, boolean>
    const language = typeof value.language === "string" ? value.language : ""
    const model = typeof value.model === "string" ? value.model : ""
    return {
        language: LANGUAGE_CODES.some((code) => code === language) ? language : DEFAULT_OPTIONS.language,
        model: KNOWN_MODELS.has(model) ? model : DEFAULT_OPTIONS.model,
        diarize: pickBoolean(value.diarize, DEFAULT_OPTIONS.diarize),
        wordTimestamps: pickBoolean(value.wordTimestamps, DEFAULT_OPTIONS.wordTimestamps),
        vad: pickBoolean(value.vad, DEFAULT_OPTIONS.vad),
        translate: pickBoolean(value.translate, DEFAULT_OPTIONS.translate),
        formats,
        autoStart: pickBoolean(value.autoStart, DEFAULT_OPTIONS.autoStart),
        moreOpen: pickBoolean(value.moreOpen, DEFAULT_OPTIONS.moreOpen),
    }
}

export const optionsStore: Store<TranscribeOptions> = {
    load: () => sanitizeOptions(readStorageJson("sharpz.transcribe.options.v1")),
    save: (value) => writeStorage("sharpz.transcribe.options.v1", JSON.stringify(value)),
}

export const hfTokenStore = stringStore("cleanup-image.hf-token")
