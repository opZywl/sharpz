import type { DropzoneSource } from "@/components/transcribe/media-dropzone"
import { pathTail } from "@/components/transcribe/transcribe-utils"
import { busyKeys } from "@/lib/busy-message"
import type { Message, Messages } from "@/lib/i18n"

export type SourceKind = "file" | "path" | "url"
export type Source = { kind: "file"; file: File } | { kind: "path"; path: string } | { kind: "url"; url: string }

export interface FormMessage {
    tone: "error" | "info"
    text: Message
    ready?: Message
}

export function busyMessage(kind: SourceKind): FormMessage {
    const keys = busyKeys(kind)
    return { tone: "info", text: (t) => t.transcribe[keys.busy], ready: (t) => t.transcribe[keys.ready] }
}

export function sourceName(source: Source, fallback: string) {
    if (source.kind === "file") return source.file.name
    if (source.kind === "path") return pathTail(source.path)
    return fallback
}

export function sourceKey(source: Source | null) {
    if (!source) return ""
    if (source.kind === "file") return `file:${source.file.name}:${source.file.size}:${source.file.lastModified}`
    return source.kind === "path" ? `path:${source.path}` : `url:${source.url}`
}

export function describeSource(source: Source | null, t: Messages, formatBytes: (bytes: number) => string): DropzoneSource | null {
    if (!source) return null
    if (source.kind === "file") return { kind: "file", title: source.file.name, subtitle: formatBytes(source.file.size) }
    if (source.kind === "path") return { kind: "path", title: pathTail(source.path), subtitle: t.transcribe.pathSource(source.path) }
    return { kind: "url", title: source.url, subtitle: t.transcribe.urlSource }
}

export function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false
    return (
        target.isContentEditable ||
        Boolean(
            target.closest(
                "textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=file]):not([type=range]):not([type=color])",
            ),
        )
    )
}
