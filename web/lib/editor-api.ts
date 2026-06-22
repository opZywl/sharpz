export interface EditorElement {
    id: string
    type?: "text" | "icon"
    text: string
    icon?: string
    x: number
    y: number
    w: number
    h?: number
    fontSize: number
    bold: boolean
    italic: boolean
    color: string
    align: "left" | "center" | "right"
    fontFamily?: string
}

export interface EditorPage {
    w: number
    h: number
}

export interface EditorDoc {
    page: EditorPage
    elements: EditorElement[]
    bg: string | null
}

const BASE = "/api/editor"

export async function importDoc(file: File, renderBg = false): Promise<EditorDoc> {
    const fd = new FormData()
    fd.append("file", file)
    fd.append("render_bg", String(renderBg))
    const res = await fetch(`${BASE}/import`, { method: "POST", body: fd })
    if (!res.ok) {
        throw new Error((await res.text()) || `HTTP ${res.status}`)
    }
    return (await res.json()) as EditorDoc
}

export async function exportPdf(doc: {
    page: EditorPage
    theme: "light" | "dark"
    elements: EditorElement[]
}): Promise<Blob> {
    const res = await fetch(`${BASE}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(doc),
    })
    if (!res.ok) {
        throw new Error((await res.text()) || `HTTP ${res.status}`)
    }
    return await res.blob()
}

export async function renderHtml(html: string): Promise<Blob> {
    const res = await fetch(`${BASE}/render-html`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
    })
    if (!res.ok) {
        throw new Error((await res.text()) || `HTTP ${res.status}`)
    }
    return await res.blob()
}
