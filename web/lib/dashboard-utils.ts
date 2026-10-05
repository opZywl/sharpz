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

function errorDetail(text: string): unknown {
    try {
        return JSON.parse(text)?.detail
    } catch {
        return undefined
    }
}

export async function responseError(response: Response): Promise<Error> {
    const text = (await response.text().catch(() => "")).trim()
    const detail = errorDetail(text)
    if (typeof detail === "string" && detail.trim()) return new Error(detail.trim())
    if (Array.isArray(detail) && detail.length) {
        const fields = detail
            .map((item) => (Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null))
            .filter((field): field is string => typeof field === "string")
        return new Error(
            fields.length ? `Preencha os campos obrigatórios: ${fields.join(", ")}.` : "Dados inválidos no formulário.",
        )
    }
    if (response.status >= 500) {
        return new Error(
            `O servidor não respondeu (HTTP ${response.status}). Ele pode estar desligado ou ter demorado demais; confira se o Sharpz está rodando e tente de novo.`,
        )
    }
    return new Error(text || `Erro HTTP ${response.status}.`)
}

export async function postForm<T>(url: string, fd: FormData): Promise<T> {
    let response: Response
    try {
        response = await fetch(url, { method: "POST", body: fd })
    } catch {
        throw new Error("Não consegui falar com o servidor do Sharpz. Confira se ele está rodando e tente de novo.")
    }
    if (!response.ok) throw await responseError(response)
    return (await response.json()) as T
}

export function formatBytes(bytes: number) {
    if (!bytes) return "0 KB"
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
