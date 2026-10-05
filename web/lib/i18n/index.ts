import { getActiveLang, type Lang } from "@/lib/i18n/config"
import { en } from "@/lib/i18n/en"
import { ptBR, type Messages } from "@/lib/i18n/pt-BR"

export * from "@/lib/i18n/config"
export * from "@/lib/i18n/format"
export type { Messages } from "@/lib/i18n/pt-BR"

export const dictionaries: Record<Lang, Messages> = {
    en,
    "pt-BR": ptBR,
}

export function getMessages(lang: Lang = getActiveLang()): Messages {
    return dictionaries[lang]
}

export type Message = string | ((t: Messages) => string)

export function resolveMessage(message: Message, t: Messages): string {
    return typeof message === "function" ? message(t) : message
}

export class LocalizedError extends Error {
    readonly text: Message

    constructor(text: Message) {
        super(resolveMessage(text, getMessages()))
        this.name = "LocalizedError"
        this.text = text
    }
}

export function errorText(error: unknown, fallback: Message): Message {
    if (error instanceof LocalizedError) return error.text
    if (error instanceof Error && error.message.trim()) return error.message
    return fallback
}

export function pick<T extends Record<string, string>>(map: T, key: string | null | undefined): string | undefined {
    return key && Object.prototype.hasOwnProperty.call(map, key) ? map[key as keyof T] : undefined
}
