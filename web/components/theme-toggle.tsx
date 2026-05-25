"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme()
    return (
        <Button
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="rounded-full"
        >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
    )
}
