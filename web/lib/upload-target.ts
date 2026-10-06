export const PROXY_UPLOAD_LIMIT = 1024 ** 3
export const DIRECT_UPLOAD_URL = "http://127.0.0.1:8000/api/transcribe"
export const PROXY_UPLOAD_URL = "/api/transcribe"

const DIRECT_HOSTS = new Set(["localhost", "127.0.0.1"])
const DASHBOARD_PORT = "5174"

export interface UploadLocation {
    hostname: string
    port: string
    protocol: string
}

export function isDirectUpload(location: UploadLocation): boolean {
    return location.protocol === "http:" && location.port === DASHBOARD_PORT && DIRECT_HOSTS.has(location.hostname)
}

export function uploadEndpoint(location: UploadLocation): string {
    return isDirectUpload(location) ? DIRECT_UPLOAD_URL : PROXY_UPLOAD_URL
}

export function exceedsProxyLimit(size: number, direct: boolean): boolean {
    return !direct && size > PROXY_UPLOAD_LIMIT
}
