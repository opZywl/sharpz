import type { EditorElement } from "@/lib/editor-api"
import { GOOGLE_FONTS } from "@/lib/editor-html"
import type { Messages } from "@/lib/i18n"

export type PageSize = "A4" | "Letter"
export type EditorMenu = "" | "icon" | "shape" | "export" | "page"

export const SIZES: Record<PageSize, { w: number; h: number }> = {
    A4: { w: 595.276, h: 841.89 },
    Letter: { w: 612, h: 792 },
}
export const SIZE_KEYS = Object.keys(SIZES) as PageSize[]
const SYSTEM_FONTS = ["Arial", "Georgia", "Times New Roman", "Courier New", "Verdana"]
export const ALL_FONTS = [...GOOGLE_FONTS, ...SYSTEM_FONTS]
export const LS_KEY = "sharpz-editor-doc-v1"

export function seedTexts(m: Messages): Record<string, string> {
    return { s1: "LUCAS LIMA", s2: m.editor.seedRole, s3: m.editor.seedHint }
}

export function seed(m: Messages): EditorElement[] {
    const texts = seedTexts(m)
    return [
        { id: "s1", type: "text", text: texts.s1, x: 40, y: 50, w: 320, fontSize: 32, bold: true, italic: false, color: "#1b2740", align: "left", fontFamily: "Plus Jakarta Sans" },
        { id: "s2", type: "text", text: texts.s2, x: 40, y: 98, w: 320, fontSize: 11, bold: false, italic: false, color: "#5b6472", align: "left", fontFamily: "Inter" },
        { id: "s3", type: "text", text: texts.s3, x: 40, y: 138, w: 380, fontSize: 10, bold: false, italic: true, color: "#8b94a3", align: "left", fontFamily: "Inter" },
    ]
}

let _uid = 0
export const uid = () => `el${Date.now().toString(36)}${(_uid++).toString(36)}`
export const norm = (e: Partial<EditorElement> & { id: string }): EditorElement => ({
    type: "text", text: "", x: 0, y: 0, w: 120, fontSize: 12, bold: false, italic: false,
    color: "#1a2436", align: "left", fontFamily: "Inter", opacity: 1, rotation: 0, ...e,
})
