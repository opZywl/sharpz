"use client"

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

import {
    DEFAULT_LANG,
    LANG_ATTRIBUTE,
    LANG_PENDING_ATTRIBUTE,
    LANG_STORAGE_KEY,
    createFormatters,
    dictionaries,
    isLang,
    pickLang,
    resolveMessage,
    setActiveLang,
    type Formatters,
    type Lang,
    type Message,
    type Messages,
} from "@/lib/i18n"

interface I18nContextValue {
    lang: Lang
    setLang: (lang: Lang) => void
    t: Messages
    fmt: Formatters
    resolve: (message: Message) => string
    ready: boolean
}

function contextValue(lang: Lang, setLang: (lang: Lang) => void, ready: boolean): I18nContextValue {
    const t = dictionaries[lang]
    return { lang, setLang, t, fmt: createFormatters(lang), resolve: (message) => resolveMessage(message, t), ready }
}

const I18nContext = createContext<I18nContextValue>(contextValue(DEFAULT_LANG, () => undefined, false))

function initialLang(): Lang {
    const marked = document.documentElement.getAttribute(LANG_ATTRIBUTE)
    if (isLang(marked)) return marked
    let stored: string | null = null
    try {
        stored = window.localStorage.getItem(LANG_STORAGE_KEY)
    } catch {
        stored = null
    }
    return pickLang(stored, window.navigator.language)
}

export function I18nProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<Lang>(DEFAULT_LANG)
    const [ready, setReady] = useState(false)
    setActiveLang(lang)

    useLayoutEffect(() => {
        const initial = initialLang()
        setActiveLang(initial)
        setLangState(initial)
        setReady(true)
    }, [])

    useLayoutEffect(() => {
        if (!ready) return
        const root = document.documentElement
        root.lang = lang
        root.setAttribute(LANG_ATTRIBUTE, lang)
        root.removeAttribute(LANG_PENDING_ATTRIBUTE)
    }, [lang, ready])

    const setLang = useCallback((next: Lang) => {
        setActiveLang(next)
        setLangState(next)
        try {
            window.localStorage.setItem(LANG_STORAGE_KEY, next)
        } catch {
            return
        }
    }, [])

    const value = useMemo(() => contextValue(lang, setLang, ready), [lang, setLang, ready])

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
    return useContext(I18nContext)
}

export function useMessage() {
    const [state, setState] = useState<{ message: Message } | null>(null)
    const setMessage = useCallback(
        (message: Message | null) => setState(message === null ? null : { message }),
        [],
    )
    return [state?.message ?? null, setMessage] as const
}
