import { apiFetch, responseError } from "@/lib/dashboard-utils"

export type ElType = "text" | "icon" | "rect" | "line" | "image"

export interface EditorElement {
    id: string
    type?: ElType
    text: string
    icon?: string
    src?: string
    x: number
    y: number
    w: number
    h?: number
    fontSize: number
    bold: boolean
    italic: boolean
    underline?: boolean
    color: string
    fill?: string
    align: "left" | "center" | "right"
    fontFamily?: string
    lineHeight?: number
    opacity?: number
    rotation?: number
    locked?: boolean
}

export interface EditorPage {
    w: number
    h: number
}

export interface EditorDoc {
    page: EditorPage
    elements: EditorElement[]
    bg: string | null
    page_bg?: string
}

const BASE = "/api/editor"

export async function importDoc(file: File, renderBg = false): Promise<EditorDoc> {
    const fd = new FormData()
    fd.append("file", file)
    fd.append("render_bg", String(renderBg))
    const res = await apiFetch(`${BASE}/import`, { method: "POST", body: fd })
    if (!res.ok) throw await responseError(res)
    return (await res.json()) as EditorDoc
}

export async function exportPdf(doc: {
    page: EditorPage
    theme: "light" | "dark"
    elements: EditorElement[]
}): Promise<Blob> {
    const res = await apiFetch(`${BASE}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(doc),
    })
    if (!res.ok) throw await responseError(res)
    return await res.blob()
}

export async function renderHtml(html: string): Promise<Blob> {
    const res = await apiFetch(`${BASE}/render-html`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
    })
    if (!res.ok) throw await responseError(res)
    return await res.blob()
}

export async function renderPng(html: string, w: number, h: number): Promise<Blob> {
    const res = await apiFetch(`${BASE}/render-png`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, w, h, scale: 2 }),
    })
    if (!res.ok) throw await responseError(res)
    return await res.blob()
}
