"use client"

import { motion } from "framer-motion"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ResultCardProps {
    title: string
    subtitle?: string
    src: string
    downloadHref: string
    downloadName: string
    delay?: number
    transparent?: boolean
}

export function ResultCard({
    title,
    subtitle,
    src,
    downloadHref,
    downloadName,
    delay = 0,
    transparent,
}: ResultCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay }}
            className="flex flex-col overflow-hidden rounded-xl border bg-card"
        >
            <div className="flex items-center justify-between border-b px-4 py-2.5">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{title}</p>
                    {subtitle && (
                        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                    )}
                </div>
                <Button asChild size="sm" variant="outline">
                    <a href={downloadHref} download={downloadName}>
                        <Download className="size-3.5" />
                        Download
                    </a>
                </Button>
            </div>
            <div
                className={cn(
                    "relative flex aspect-square w-full items-center justify-center",
                    transparent && "checker",
                )}
            >
                <img
                    src={src}
                    alt={title}
                    className="absolute inset-0 h-full w-full object-contain p-2"
                />
            </div>
        </motion.div>
    )
}
