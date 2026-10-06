export type PasteIntent = "file" | "url" | "reject-file" | "ignore"
export type DragKind = "files" | "link"

export interface PasteInput {
    editableTarget: boolean
    hasMediaFile: boolean
    hasFile: boolean
    text: string
}

export function httpUrl(text: string): string | null {
    const value = text.trim()
    if (!value || /\s/.test(value)) return null
    let parsed: URL
    try {
        parsed = new URL(value)
    } catch {
        return null
    }
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : null
}

export function pasteIntent(input: PasteInput): PasteIntent {
    if (input.editableTarget && input.text.trim()) return "ignore"
    if (input.hasMediaFile) return "file"
    if (input.editableTarget) return "ignore"
    if (httpUrl(input.text)) return "url"
    return input.hasFile ? "reject-file" : "ignore"
}

export function dragKind(types: readonly string[], fromPage: boolean): DragKind | null {
    if (fromPage) return null
    if (types.includes("Files")) return "files"
    return types.includes("text/uri-list") ? "link" : null
}

export function droppedUrl(uriList: string, text: string): string | null {
    const first = uriList
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith("#"))
    return httpUrl(first ?? "") ?? httpUrl(text)
}
