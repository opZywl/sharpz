"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

import { DEFAULT_THEME, THEME_CLASSES, nextTheme, parseStoredTheme, themeAttributes } from "@/lib/theme"
import type { Theme } from "@/lib/theme"

interface ThemeContextType {
    theme: Theme
    toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({
    theme: DEFAULT_THEME,
    toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>(DEFAULT_THEME)
    const [ready, setReady] = useState(false)

    useEffect(() => {
        try {
            setTheme(parseStoredTheme(localStorage.getItem("theme")))
        } catch {
            setTheme(DEFAULT_THEME)
        }
        setReady(true)
    }, [])

    useEffect(() => {
        if (!ready) return
        const root = document.documentElement
        const attributes = themeAttributes(theme)
        root.classList.remove(...THEME_CLASSES)
        root.classList.add(...attributes.classes)
        root.setAttribute("data-theme", attributes.dataTheme)
        root.style.colorScheme = attributes.colorScheme
        try {
            localStorage.setItem("theme", theme)
        } catch {}
    }, [theme, ready])

    const value = useMemo(
        () => ({
            theme,
            toggleTheme: () => setTheme((previous) => nextTheme(previous)),
        }),
        [theme],
    )

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
    return useContext(ThemeContext)
}
