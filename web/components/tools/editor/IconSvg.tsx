"use client"

import { createElement } from "react"

import { iconShapes } from "@/lib/editor-icons"

export function IconSvg({ name, size }: { name: unknown; size: string }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            {iconShapes(name).map((shape, index) => createElement(shape.tag, { key: index, ...shape.attrs }))}
        </svg>
    )
}
