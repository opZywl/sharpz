"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n/provider"

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme()
    const { t } = useI18n()
    return (
        <Button
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            aria-label={t.theme.toggle}
            title={t.theme.toggle}
            className="theme-icon-button rounded-full"
        >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
    )
}
