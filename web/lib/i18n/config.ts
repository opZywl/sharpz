export type Lang = "en" | "pt-BR"

export const LANGS: readonly Lang[] = ["en", "pt-BR"]
export const DEFAULT_LANG: Lang = "pt-BR"
export const LANG_STORAGE_KEY = "sharpz.lang"
export const LANG_ATTRIBUTE = "data-lang"
export const LANG_PENDING_ATTRIBUTE = "data-lang-pending"

export function isLang(value: unknown): value is Lang {
    return value === "en" || value === "pt-BR"
}

export function pickLang(stored: string | null | undefined, browser: string | null | undefined): Lang {
    if (isLang(stored)) return stored
    return (browser ?? "").toLowerCase().startsWith("pt") ? "pt-BR" : "en"
}

let activeLang: Lang = DEFAULT_LANG

export function getActiveLang(): Lang {
    return activeLang
}

export function setActiveLang(lang: Lang) {
    activeLang = lang
}

export function langHeaders(lang: Lang = activeLang): Record<string, string> {
    return { "Accept-Language": lang }
}

export function withLang(url: string, lang: Lang = activeLang): string {
    return `${url}${url.includes("?") ? "&" : "?"}lang=${encodeURIComponent(lang)}`
}
