"use client"

import { cn } from "@/lib/utils"

interface SegmentedOption<T extends string> {
    value: T
    label: string
}

interface SegmentedProps<T extends string> {
    value: T
    onChange: (value: T) => void
    options: SegmentedOption<T>[]
    className?: string
}

export function Segmented<T extends string>({
    value,
    onChange,
    options,
    className,
}: SegmentedProps<T>) {
    return (
        <div
            role="tablist"
            className={cn(
                "inline-flex w-fit gap-1 rounded-lg border bg-secondary/50 p-1",
                className,
            )}
        >
            {options.map((opt) => {
                const selected = opt.value === value
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => onChange(opt.value)}
                        className={cn(
                            "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                            selected
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {opt.label}
                    </button>
                )
            })}
        </div>
    )
}
