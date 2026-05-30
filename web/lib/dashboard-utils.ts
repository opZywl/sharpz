export function pngData(base64: string) {
    return `data:image/png;base64,${base64}`
}

export function imgData(base64: string, format: string = "png") {
    return `data:image/${format};base64,${base64}`
}

export function svgData(svg: string) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function ktxData(base64: string) {
    return `data:application/octet-stream;base64,${base64}`
}

export function appendFields(fd: FormData, fields: Record<string, string | number | boolean>) {
    Object.entries(fields).forEach(([key, value]) => fd.append(key, String(value)))
}

export async function postForm<T>(url: string, fd: FormData): Promise<T> {
    const response = await fetch(url, { method: "POST", body: fd })
    if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `HTTP ${response.status}`)
    }
    return (await response.json()) as T
}

export function formatBytes(bytes: number) {
    if (!bytes) return "0 KB"
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
