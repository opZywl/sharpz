"use client"

import { Gem, Moon, Sun } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n/provider"
import { nextTheme } from "@/lib/theme"

const ICONS = { light: Moon, dark: Gem, ruby: Sun } as const

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme()
    const { t } = useI18n()
    const next = nextTheme(theme)
    const Icon = ICONS[theme]
    const label = next === "light" ? t.theme.toLight : next === "dark" ? t.theme.toDark : t.theme.toRuby
    return (
        <Button
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            aria-label={label}
            title={label}
            className="theme-icon-button rounded-full"
        >
            <Icon className="size-4" />
        </Button>
    )
}
