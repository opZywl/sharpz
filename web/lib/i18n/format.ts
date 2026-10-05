import type { Lang } from "@/lib/i18n/config"

const numberFormats = new Map<string, Intl.NumberFormat>()
const languageNames = new Map<Lang, Intl.DisplayNames | null>()

function numberFormat(lang: Lang, options: Intl.NumberFormatOptions = {}) {
    const key = `${lang}|${JSON.stringify(options)}`
    let format = numberFormats.get(key)
    if (!format) {
        format = new Intl.NumberFormat(lang, options)
        numberFormats.set(key, format)
    }
    return format
}

function fixed(digits: number): Intl.NumberFormatOptions {
    return { minimumFractionDigits: digits, maximumFractionDigits: digits }
}

export function formatNumber(lang: Lang, value: number, digits?: number) {
    return numberFormat(lang, digits === undefined ? {} : fixed(digits)).format(value)
}

export function formatBytes(lang: Lang, bytes: number) {
    const unit = (name: string, digits: number) =>
        numberFormat(lang, { style: "unit", unit: name, unitDisplay: "short", ...fixed(digits) })
    if (!bytes) return unit("kilobyte", 0).format(0)
    if (bytes < 1024 * 1024) return unit("kilobyte", 1).format(bytes / 1024)
    return unit("megabyte", 2).format(bytes / 1024 / 1024)
}

export function formatSeconds(lang: Lang, seconds: number, digits = 2) {
    return numberFormat(lang, { style: "unit", unit: "second", unitDisplay: "narrow", ...fixed(digits) }).format(seconds)
}

export function formatPercent(lang: Lang, fraction: number) {
    return numberFormat(lang, { style: "percent", maximumFractionDigits: 0 }).format(fraction)
}

export function formatRatio(lang: Lang, ratio: number) {
    return `${formatNumber(lang, ratio, 1)}x`
}

export function formatLanguageName(lang: Lang, code: string | null | undefined) {
    if (!code) return null
    if (!languageNames.has(lang)) {
        try {
            languageNames.set(lang, new Intl.DisplayNames([lang], { type: "language" }))
        } catch {
            languageNames.set(lang, null)
        }
    }
    try {
        const name = languageNames.get(lang)?.of(code)
        if (name && name.toLowerCase() !== code.toLowerCase()) return name.charAt(0).toUpperCase() + name.slice(1)
    } catch {
        return code
    }
    return code
}

export interface Formatters {
    number: (value: number, digits?: number) => string
    bytes: (bytes: number) => string
    seconds: (seconds: number, digits?: number) => string
    percent: (fraction: number) => string
    ratio: (ratio: number) => string
    languageName: (code: string | null | undefined) => string | null
}

export function createFormatters(lang: Lang): Formatters {
    return {
        number: (value, digits) => formatNumber(lang, value, digits),
        bytes: (bytes) => formatBytes(lang, bytes),
        seconds: (seconds, digits) => formatSeconds(lang, seconds, digits),
        percent: (fraction) => formatPercent(lang, fraction),
        ratio: (ratio) => formatRatio(lang, ratio),
        languageName: (code) => formatLanguageName(lang, code),
    }
}
