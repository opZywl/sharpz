"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

interface ThemeContextType {
    theme: "light" | "dark"
    toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({
    theme: "dark",
    toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<"light" | "dark">("dark")

    useEffect(() => {
        try {
            const stored = localStorage.getItem("theme")
            if (stored === "light" || stored === "dark") {
                setTheme(stored)
                return
            }
            setTheme("dark")
        } catch {
            setTheme("dark")
        }
    }, [])

    useEffect(() => {
        const root = document.documentElement
        const themeClass = theme === "dark" ? "light" : "dark"
        root.classList.remove("light", "dark")
        root.classList.add(themeClass)
        root.setAttribute("data-theme", theme)
        root.style.colorScheme = theme
        try {
            localStorage.setItem("theme", theme)
        } catch {
            /* ignore */
        }
    }, [theme])

    const value = useMemo(
        () => ({
            theme,
            toggleTheme: () => setTheme((prev) => (prev === "dark" ? "light" : "dark")),
        }),
        [theme],
    )

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
    return useContext(ThemeContext)
}
