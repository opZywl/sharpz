import { LocalizedError, langHeaders } from "@/lib/i18n"

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

export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    Object.entries(langHeaders()).forEach(([name, value]) => headers.set(name, value))
    return fetch(input, { ...init, headers })
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
        return new LocalizedError((t) =>
            fields.length ? t.errors.requiredFields(fields.join(", ")) : t.errors.invalidForm,
        )
    }
    if (response.status >= 500) {
        const status = response.status
        return new LocalizedError((t) => t.errors.serverDown(status))
    }
    if (text) return new Error(text)
    const status = response.status
    return new LocalizedError((t) => t.errors.http(status))
}

export async function postForm<T>(url: string, fd: FormData): Promise<T> {
    let response: Response
    try {
        response = await apiFetch(url, { method: "POST", body: fd })
    } catch {
        throw new LocalizedError((t) => t.errors.network)
    }
    if (!response.ok) throw await responseError(response)
    return (await response.json()) as T
}
