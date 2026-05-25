"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps {
    value: number
    onChange: (value: number) => void
    min?: number
    max?: number
    step?: number
    label?: string
    className?: string
    disabled?: boolean
}

export function Slider({
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    label,
    className,
    disabled,
}: SliderProps) {
    return (
        <div className={cn("flex flex-col gap-2", className)}>
            {label && (
                <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground/80">{label}</label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                        {Number.isInteger(step) ? value : value.toFixed(2)}
                    </span>
                </div>
            )}
            <input
                type="range"
                className="win11-slider w-full"
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(Number(e.target.value))}
            />
        </div>
    )
}
