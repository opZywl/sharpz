import { LocalizedError, dictionaries, pick, type Message, type Messages } from "@/lib/i18n"
import type { TranscribeModel, TranscribeSegment } from "@/lib/transcribe-api"

export const MEDIA_EXTENSIONS = [
    "opus",
    "ogg",
    "oga",
    "m4a",
    "mp3",
    "wav",
    "webm",
    "mp4",
    "mkv",
    "mov",
    "aac",
    "flac",
    "wma",
    "amr",
    "3gp",
]

export const MEDIA_ACCEPT = ["audio/*", "video/*", ...MEDIA_EXTENSIONS.map((ext) => `.${ext}`)].join(",")

export const QUALITY_MODEL = "large-v3"
export const FAST_MODEL = "large-v3-turbo"

export const LANGUAGE_CODES = ["pt", "auto", "en", "es", "fr", "de", "it"] as const

export type LanguageCode = (typeof LANGUAGE_CODES)[number]

export function languageOptions(t: Messages): Array<{ value: string; label: string }> {
    return LANGUAGE_CODES.map((value) => ({ value, label: t.transcribe.languages[value] }))
}

export const FORMAT_OPTIONS = [
    { key: "txt", label: "TXT" },
    { key: "srt", label: "SRT" },
    { key: "vtt", label: "VTT" },
    { key: "json", label: "JSON" },
    { key: "lrc", label: "LRC" },
] as const

export type FormatKey = (typeof FORMAT_OPTIONS)[number]["key"]

export const MODEL_FALLBACK: TranscribeModel[] = [
    { key: "tiny", label: "Tiny", downloaded: false, is_default: false },
    { key: "base", label: "Base", downloaded: false, is_default: false },
    { key: "small", label: "Small", downloaded: false, is_default: false },
    { key: "medium", label: "Medium", downloaded: false, is_default: false },
    { key: "large-v2", label: "Large v2", downloaded: false, is_default: false },
    { key: "large-v3", label: "Large v3", downloaded: false, is_default: false },
    { key: "large-v3-turbo", label: "Large v3 Turbo", downloaded: false, is_default: false },
    { key: "distil-large-v3", label: "Distil Large v3", downloaded: false, is_default: false, english_only: true },
]

export function stageLabel(t: Messages, stage: string) {
    return pick(t.transcribe.stages, stage) ?? t.transcribe.processing
}

export function degradedLabels(t: Messages, keys: string[]) {
    return Array.from(new Set(keys.map((key) => pick(t.transcribe.degraded, key) ?? key)))
}

export function modelLabel(t: Messages, model: TranscribeModel) {
    const englishOnly = model.english_only ?? model.key.startsWith("distil")
    return `${model.label}${model.downloaded ? t.transcribe.downloadedSuffix : ""}${englishOnly ? t.transcribe.englishOnlySuffix : ""}`
}

export function formatClock(totalSeconds: number) {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00"
    const total = Math.floor(totalSeconds)
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const seconds = String(total % 60).padStart(2, "0")
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`
}

export function segmentsToText(segments: TranscribeSegment[]) {
    return segments
        .map((segment) => {
            const text = segment.text.trim()
            if (!text) return ""
            return segment.speaker ? `[${segment.speaker}] ${text}` : text
        })
        .filter(Boolean)
        .join("\n")
}

export function fileExtension(name: string) {
    const dot = name.lastIndexOf(".")
    return dot === -1 ? "" : name.slice(dot + 1).toLowerCase()
}

export function isMediaFile(file: File) {
    return file.type.startsWith("audio/") || file.type.startsWith("video/") || MEDIA_EXTENSIONS.includes(fileExtension(file.name))
}

export function pathTail(path: string) {
    return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

export function baseName(name: string, fallback: string) {
    const tail = pathTail(name)
    const dot = tail.lastIndexOf(".")
    const stem = dot > 0 ? tail.slice(0, dot) : tail
    const safe = Array.from(stem)
        .filter((char) => char.charCodeAt(0) >= 32)
        .join("")
        .replace(/[<>:"/\\|?*]+/g, "_")
        .trim()
    return safe || fallback
}

export function stripPathQuotes(value: string) {
    return value.replace(/^\s*["']+|["']+\s*$/g, "")
}

export function cleanLocalPath(value: string) {
    return stripPathQuotes(value).trim()
}

export function readStorage(key: string): string | null {
    try {
        return window.localStorage.getItem(key)
    } catch {
        return null
    }
}

export function writeStorage(key: string, value: string) {
    try {
        window.localStorage.setItem(key, value)
    } catch {
        return
    }
}

export function removeStorage(key: string) {
    try {
        window.localStorage.removeItem(key)
    } catch {
        return
    }
}

export function readStorageJson(key: string): unknown {
    const raw = readStorage(key)
    if (!raw) return null
    try {
        return JSON.parse(raw)
    } catch {
        return null
    }
}

export interface Store<T> {
    load: () => T | null
    save: (value: T) => void
}

export function stringStore(key: string): Store<string> {
    return {
        load: () => readStorage(key) || null,
        save: (value) => writeStorage(key, value),
    }
}

export function saveBlob(blob: Blob, name: string) {
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = href
    anchor.download = name
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(href), 4000)
}

export function saveText(text: string, name: string) {
    saveBlob(new Blob([text.endsWith("\n") ? text : `${text}\n`], { type: "text/plain;charset=utf-8" }), name)
}

export interface FriendlyError {
    message: Message
    detail: string | null
}

type HintKey = keyof Messages["errors"]["hints"]

const HINT_PATTERNS: Array<{ key: HintKey; pattern: string }> = [
    { key: "memory", pattern: "MemoryError|out of memory|bad_alloc|Unable to allocate|paging file|WinError 1455" },
    { key: "download", pattern: "yt[-_]dlp" },
    { key: "ffmpeg", pattern: "ffmpeg" },
    { key: "notFound", pattern: "No such file|FileNotFoundError" },
    { key: "network", pattern: "Failed to fetch|NetworkError|Load failed" },
]

const ERROR_HINTS = HINT_PATTERNS.map(({ key, pattern }) => {
    const localized = Object.values(dictionaries)
        .map((messages) => pick(messages.errors.serverPatterns, key))
        .filter((value): value is string => Boolean(value))
    return { key, test: new RegExp([pattern, ...localized].join("|"), "i") }
})

export function friendlyError(raw: unknown, fallback: Message): FriendlyError {
    const text = (raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "").trim()
    if (!text) return { message: fallback, detail: null }
    const hint = ERROR_HINTS.find((entry) => entry.test.test(text))
    if (hint) {
        const key = hint.key
        const sameAsHint = Object.values(dictionaries).some((messages) => messages.errors.hints[key] === text)
        return { message: (t) => t.errors.hints[key], detail: sameAsHint ? null : text }
    }
    const firstLine = text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? text
    if (firstLine === text && text.length <= 280) {
        return { message: raw instanceof LocalizedError ? raw.text : text, detail: null }
    }
    return { message: firstLine.length > 280 ? `${firstLine.slice(0, 280)}...` : firstLine, detail: text }
}
