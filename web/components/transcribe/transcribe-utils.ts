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

export const MEDIA_HINT = "Áudio do WhatsApp (.ogg, .opus), mp3, m4a, wav, mp4, mkv, mov, webm e outros"

export const QUALITY_MODEL = "large-v3"
export const FAST_MODEL = "large-v3-turbo"

export const LANGUAGE_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "pt", label: "Português" },
    { value: "auto", label: "Detectar automaticamente" },
    { value: "en", label: "Inglês" },
    { value: "es", label: "Espanhol" },
    { value: "fr", label: "Francês" },
    { value: "de", label: "Alemão" },
    { value: "it", label: "Italiano" },
]

export const FORMAT_OPTIONS = [
    { key: "txt", label: "TXT", helper: "Texto corrido. Sempre gerado." },
    { key: "srt", label: "SRT", helper: "Legenda para vídeo." },
    { key: "vtt", label: "VTT", helper: "Legenda para web." },
    { key: "json", label: "JSON", helper: "Trechos com tempos." },
    { key: "lrc", label: "LRC", helper: "Letra com tempo." },
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

const STAGE_LABELS: Record<string, string> = {
    uploading: "Enviando",
    start: "Preparando",
    queued: "Na fila",
    download: "Baixando o áudio do link",
    download_model: "Baixando o modelo (só na primeira vez)",
    load_model: "Carregando o modelo",
    transcribe: "Transcrevendo",
    align: "Ajustando o tempo das palavras",
    diarize: "Separando quem fala",
    write: "Salvando os arquivos",
    audio: "Extraindo o áudio do vídeo",
    frames: "Capturando quadros do vídeo",
    contact: "Montando a folha de contato",
    cenas: "Escolhendo as melhores cenas",
    transcricao: "Juntando a transcrição ao pacote",
    docs: "Escrevendo os documentos com IA",
    entrega: "Montando a pasta final",
    complete: "Finalizando o pacote",
    done: "Pronto",
    error: "Erro",
    canceled: "Cancelado",
}

const DEGRADED_LABELS: Record<string, string> = {
    align: "tempo por palavra",
    word_timestamps: "tempo por palavra",
    diarize: "separar quem fala",
    frames: "quadros do vídeo",
    contact: "folha de contato",
    cenas: "escolha de cenas",
    docs: "documentos com IA",
    complete: "pacote Complete",
}

export function stageLabel(stage: string) {
    return STAGE_LABELS[stage] ?? "Processando"
}

export function degradedLabels(keys: string[]) {
    return Array.from(new Set(keys.map((key) => DEGRADED_LABELS[key] ?? key)))
}

export function modelLabel(model: TranscribeModel) {
    const englishOnly = model.english_only ?? model.key.startsWith("distil")
    return `${model.label}${model.downloaded ? " (baixado)" : ""}${englishOnly ? " (só inglês)" : ""}`
}

let languageNames: Intl.DisplayNames | null | undefined

export function languageName(code: string | null | undefined) {
    if (!code) return null
    if (languageNames === undefined) {
        try {
            languageNames = new Intl.DisplayNames(["pt-BR"], { type: "language" })
        } catch {
            languageNames = null
        }
    }
    try {
        const name = languageNames?.of(code)
        if (name && name.toLowerCase() !== code.toLowerCase()) return name.charAt(0).toUpperCase() + name.slice(1)
    } catch {
        return code
    }
    return code
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

export function baseName(name: string) {
    const tail = pathTail(name)
    const dot = tail.lastIndexOf(".")
    const stem = dot > 0 ? tail.slice(0, dot) : tail
    const safe = Array.from(stem)
        .filter((char) => char.charCodeAt(0) >= 32)
        .join("")
        .replace(/[<>:"/\\|?*]+/g, "_")
        .trim()
    return safe || "transcricao"
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
    message: string
    detail: string | null
}

const ERROR_HINTS: Array<{ test: RegExp; message: string }> = [
    {
        test: /MemoryError|out of memory|bad_alloc|Unable to allocate|mem[oó]ria|paging file|pagina[cç][aã]o|WinError 1455/i,
        message: "Faltou memória no computador para transcrever. Feche programas pesados e tente de novo no modo Rápido.",
    },
    {
        test: /yt[-_]dlp|baixar o [aá]udio da URL/i,
        message: "Não consegui baixar o áudio desse link. Confira se ele abre no navegador e se o vídeo é público.",
    },
    {
        test: /ffmpeg/i,
        message: "O ffmpeg não está disponível, e ele é necessário para ler o áudio. Rode o sharpz.cmd e escolha Instalar.",
    },
    {
        test: /Caminho local n[aã]o encontrado|Arquivo n[aã]o encontrado|No such file|FileNotFoundError/i,
        message: "Não encontrei o arquivo. Confira o caminho e tente de novo.",
    },
    {
        test: /Failed to fetch|NetworkError|Load failed/i,
        message: "Sem resposta do servidor do Sharpz. Confira se ele está rodando e tente de novo.",
    },
]

export function friendlyError(raw: unknown, fallback: string): FriendlyError {
    const text = (raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "").trim()
    if (!text) return { message: fallback, detail: null }
    const hint = ERROR_HINTS.find((entry) => entry.test.test(text))
    if (hint) return { message: hint.message, detail: text === hint.message ? null : text }
    const firstLine = text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? text
    if (firstLine === text && text.length <= 280) return { message: text, detail: null }
    return { message: firstLine.length > 280 ? `${firstLine.slice(0, 280)}...` : firstLine, detail: text }
}
