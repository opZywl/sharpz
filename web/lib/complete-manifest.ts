export interface CompleteManifest {
    slug: string
    title: string
    out_dir: string
    dest_dir: string | null
    zip: string | null
    frames: number
    images: string[]
    captions: Record<string, string | null>
    contact_sheets: string[]
    docs: string[]
    transcripts: string[]
    docs_generated: boolean
    degraded: string[]
}

function text(value: unknown): string {
    return typeof value === "string" ? value : ""
}

function optionalText(value: unknown): string | null {
    return typeof value === "string" ? value : null
}

function texts(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function captions(value: unknown): Record<string, string | null> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {}
    return Object.fromEntries(
        Object.entries(value).filter(
            (entry): entry is [string, string | null] => typeof entry[1] === "string" || entry[1] === null,
        ),
    )
}

export function normalizeCompleteManifest(raw: unknown): CompleteManifest | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
    const value = raw as Record<string, unknown>
    return {
        slug: text(value.slug),
        title: text(value.title),
        out_dir: text(value.out_dir),
        dest_dir: optionalText(value.dest_dir),
        zip: optionalText(value.zip),
        frames: typeof value.frames === "number" && Number.isFinite(value.frames) ? value.frames : 0,
        images: texts(value.images),
        captions: captions(value.captions),
        contact_sheets: texts(value.contact_sheets),
        docs: texts(value.docs),
        transcripts: texts(value.transcripts),
        docs_generated: value.docs_generated === true,
        degraded: texts(value.degraded),
    }
}
