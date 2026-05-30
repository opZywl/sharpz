"use client"

import { Archive, Check, ChevronDown, Download, ImagePlus, type LucideIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { formatBytes } from "@/lib/dashboard-utils"
import { cn } from "@/lib/utils"

export const cardEnter = {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const },
}

export function DashboardShell({
    children,
    className,
    innerClassName,
}: {
    children: React.ReactNode
    className?: string
    innerClassName?: string
}) {
    return (
        <div
            className={cn(
                "dashboard-shell",
                className,
            )}
        >
            <div
                className={cn(
                    "dashboard-inner",
                    innerClassName,
                )}
            >
                <div className="dashboard-dot-layer" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
                <div className="relative z-10">{children}</div>
            </div>
        </div>
    )
}

export function Panel({
    title,
    subtitle,
    icon: Icon,
    children,
    className,
}: {
    title: string
    subtitle?: string
    icon?: LucideIcon
    children: React.ReactNode
    className?: string
}) {
    return (
        <DashboardShell className={className} innerClassName="p-4 sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        {Icon ? (
                            <span className="panel-icon size-8 shrink-0 rounded-lg">
                                <Icon className="size-4" />
                            </span>
                        ) : null}
                        <h2 className="font-jakarta text-lg font-extrabold uppercase leading-none tracking-tight">
                            {title}
                        </h2>
                    </div>
                    {subtitle ? <p className="app-muted mt-2 text-sm leading-5">{subtitle}</p> : null}
                </div>
            </div>
            {children}
        </DashboardShell>
    )
}

export function SelectField<T extends string>({
    label,
    value,
    options,
    onChange,
    className,
}: {
    label: string
    value: T
    options: Array<{ value: T; label: string }>
    onChange: (value: T) => void
    className?: string
}) {
    const [open, setOpen] = useState(false)
    const current = options.find((option) => option.value === value) ?? options[0]

    return (
        <div
            className={cn("relative flex min-w-0 flex-col gap-2", className)}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setOpen(false)
                }
            }}
        >
            <span className="field-label">{label}</span>
            <button
                type="button"
                className="field-control flex w-full min-w-0 items-center justify-between gap-3 px-3 text-left text-xs font-bold uppercase tracking-[0.12em]"
                onClick={() => setOpen((next) => !next)}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className="min-w-0 truncate">{current?.label ?? value}</span>
                <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
            </button>
            {open ? (
                <div className="select-menu" role="listbox">
                    {options.map((option) => {
                        const selected = option.value === value
                        return (
                            <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                data-active={selected}
                                className="select-option"
                                onClick={() => {
                                    onChange(option.value)
                                    setOpen(false)
                                }}
                            >
                                <span className="min-w-0 truncate">{option.label}</span>
                                {selected ? <Check className="size-3.5 shrink-0" /> : null}
                            </button>
                        )
                    })}
                </div>
            ) : null}
        </div>
    )
}

export function TextField({
    label,
    value,
    onChange,
    placeholder,
    type = "text",
}: {
    label: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
    type?: string
}) {
    return (
        <label className="flex min-w-0 flex-col gap-2">
            <span className="field-label">{label}</span>
            <input
                type={type}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                className="app-input text-sm"
            />
        </label>
    )
}

export function CheckboxRow({
    checked,
    onChange,
    label,
    helper,
}: {
    checked: boolean
    onChange: (checked: boolean) => void
    label: string
    helper?: string
}) {
    return (
        <label className="checkbox-row flex cursor-pointer items-center gap-3 transition-colors">
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                className="size-4 rounded accent-foreground"
            />
            <span className="min-w-0">
                <span className="block text-sm font-semibold">{label}</span>
                {helper ? <span className="app-faint block text-xs">{helper}</span> : null}
            </span>
        </label>
    )
}

export function ColorField({
    label,
    value,
    onChange,
}: {
    label: string
    value: string
    onChange: (value: string) => void
}) {
    return (
        <label className="flex min-w-0 flex-col gap-2">
            <span className="field-label">{label}</span>
            <span className="field-control flex items-center gap-3 px-3">
                <input
                    type="color"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className="h-7 w-11 cursor-pointer rounded-md border-0 bg-transparent p-0"
                />
                <code className="text-xs font-semibold uppercase tracking-[0.12em]">{value}</code>
            </span>
        </label>
    )
}

export function Metric({
    label,
    value,
    helper,
}: {
    label: string
    value: string
    helper?: string
}) {
    return (
        <div className="metric-tile">
            <div className="app-faint text-[10px] font-semibold uppercase tracking-[0.2em]">{label}</div>
            <div className="mt-1 font-jakarta text-xl font-extrabold leading-none">{value}</div>
            {helper ? <div className="app-faint mt-1 truncate text-xs">{helper}</div> : null}
        </div>
    )
}

export function PreviewTile({
    title,
    subtitle,
    src,
    downloadHref,
    downloadName,
    transparent,
}: {
    title: string
    subtitle?: string
    src: string
    downloadHref: string
    downloadName: string
    transparent?: boolean
}) {
    return (
        <div className="preview-card">
            <div className="preview-head flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{title}</div>
                    {subtitle ? <div className="app-faint truncate text-xs">{subtitle}</div> : null}
                </div>
                <Button asChild size="sm" variant="outline">
                    <a href={downloadHref} download={downloadName}>
                        <Download className="size-3.5" />
                        Baixar
                    </a>
                </Button>
            </div>
            <div className={cn("preview-body relative flex aspect-square items-center justify-center", transparent && "checker")}>
                <img src={src} alt={title} className="absolute inset-0 size-full object-contain p-3" />
            </div>
        </div>
    )
}

export function EmptyState({ text }: { text: string }) {
    return (
        <div className="empty-state px-4 py-10 text-center">
            <ImagePlus className="app-faint mx-auto size-8" />
            <p className="app-muted mt-3 text-sm">{text}</p>
        </div>
    )
}

export function FileField({
    file,
    onChange,
    accept,
    label,
    helper,
}: {
    file: File | null
    onChange: (file: File | null) => void
    accept: string
    label: string
    helper: string
}) {
    return (
        <div className="dropzone-shell rounded-xl p-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg px-4 py-8 text-center">
                <input
                    type="file"
                    accept={accept}
                    className="hidden"
                    onChange={(event) => onChange(event.target.files?.[0] ?? null)}
                />
                <span className="dropzone-icon grid size-12 place-items-center rounded-full">
                    <Archive className="size-5" />
                </span>
                <span>
                    <span className="block text-sm font-semibold">{file?.name ?? label}</span>
                    <span className="app-faint mt-1 block text-xs">
                        {file ? formatBytes(file.size) : helper}
                    </span>
                </span>
            </label>
            {file ? (
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => onChange(null)}>
                    Limpar arquivo
                </Button>
            ) : null}
        </div>
    )
}
