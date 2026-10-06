export const WAVEFORM_LIMIT = 150 * 1024 * 1024

export function waveformAllowed(bytes: number | null | undefined): boolean {
    return typeof bytes === "number" && Number.isFinite(bytes) && bytes > 0 && bytes <= WAVEFORM_LIMIT
}

export function contentRangeTotal(header: string | null): number | null {
    const match = /^bytes\s+(?:\*|\d+-\d+)\/(\d+)$/i.exec((header ?? "").trim())
    return match ? Number(match[1]) : null
}

export function probedSize(response: { status: number; contentRange: string | null; contentLength: string | null }): number | null {
    if (response.status === 206) return contentRangeTotal(response.contentRange)
    if (response.status !== 200) return null
    const length = Number(response.contentLength ?? "")
    return response.contentLength && Number.isFinite(length) && length > 0 ? length : null
}

const NETWORK_NO_SOURCE = 3

export function mediaFailed(media: { error: unknown; networkState: number }): boolean {
    return Boolean(media.error) || media.networkState === NETWORK_NO_SOURCE
}
