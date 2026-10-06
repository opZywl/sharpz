export const GOOGLE_FONTS = ["Inter", "Plus Jakarta Sans", "Roboto", "Poppins", "Montserrat", "Lato", "Raleway", "Oswald", "Merriweather", "Playfair Display", "Work Sans", "Manrope", "Nunito", "Source Sans 3"]

export interface EditorHtmlInput {
    elements: unknown
    page: unknown
    pageBg: unknown
}

type Fields = Record<string, unknown>

const COLOR_HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const COLOR_FUNCTION = /^(?:rgba?|hsla?)\((?:[\d\s.,%/+-]|deg)*\)$/i
const COLOR_NAME = /^[a-zA-Z]{1,32}$/
const FONT_FAMILY = /^[A-Za-z0-9 -]{1,64}$/
const IMAGE_SRC = /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]*={0,2}$/i
const ALIGNS = ["left", "center", "right", "justify"]
const LIMIT = 100000
const PAGE = { w: 595.276, h: 841.89 }
const PAGE_LIMIT = 14400
const FONT_AXES = ":ital,wght@0,400;0,700;1,400;1,700"

function isFields(value: unknown): value is Fields {
    return value !== null && typeof value === "object" && !Array.isArray(value)
}

function own(fields: Fields, key: string): unknown {
    return Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : undefined
}

function num(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.min(LIMIT, Math.max(-LIMIT, value)) : fallback
}

function escText(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escAttr(value: string): string {
    return escText(value).replace(/"/g, "&quot;")
}

export function safeColor(value: unknown, fallback: string): string {
    if (typeof value !== "string") return fallback
    return COLOR_HEX.test(value) || COLOR_FUNCTION.test(value) || COLOR_NAME.test(value) ? value : fallback
}

export function safeFontFamily(value: unknown): string {
    return typeof value === "string" && FONT_FAMILY.test(value) ? value : "Inter"
}

export function safeAlign(value: unknown): string {
    return typeof value === "string" && ALIGNS.includes(value) ? value : "left"
}

export function safeImageSrc(value: unknown): string | null {
    return typeof value === "string" && IMAGE_SRC.test(value) ? value : null
}

export function safePage(value: unknown): { w: number; h: number } {
    const page = isFields(value) ? value : {}
    return {
        w: Math.min(PAGE_LIMIT, Math.max(1, num(own(page, "w"), PAGE.w))),
        h: Math.min(PAGE_LIMIT, Math.max(1, num(own(page, "h"), PAGE.h))),
    }
}

function fontLink(families: string[]): string {
    const used = Array.from(new Set(families.filter((f) => GOOGLE_FONTS.includes(f))))
    if (!used.length) return ""
    return `<link href="https://fonts.googleapis.com/css2?${used.map((f) => "family=" + encodeURIComponent(f).replace(/%20/g, "+") + FONT_AXES).join("&")}&display=swap" rel="stylesheet">`
}

function renderElement(el: Fields, iconSvgInner: (name: unknown) => string): string {
    const type = own(el, "type")
    const color = safeColor(own(el, "color"), "#1a2436")
    const rotation = num(own(el, "rotation"), 0)
    const opacity = Math.min(1, Math.max(0, num(own(el, "opacity"), 1)))
    const x = num(own(el, "x"), 0)
    const y = num(own(el, "y"), 0)
    const w = num(own(el, "w"), 120)
    const fontSize = num(own(el, "fontSize"), 12)
    const rot = rotation ? `transform:rotate(${rotation}deg);transform-origin:center;` : ""
    const op = opacity < 1 ? `opacity:${opacity};` : ""
    const base = `position:absolute;left:${x}pt;top:${y}pt;${rot}${op}`
    if (type === "icon") return `<div style="${escAttr(`${base}width:${fontSize}pt;height:${fontSize}pt;color:${color}`)}"><svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvgInner(own(el, "icon"))}</svg></div>`
    if (type === "rect") return `<div style="${escAttr(`${base}width:${w}pt;height:${num(own(el, "h"), 80)}pt;background:${safeColor(own(el, "fill") || "transparent", "transparent")};border:1pt solid ${color};border-radius:4pt`)}"></div>`
    if (type === "line") return `<div style="${escAttr(`${base}width:${w}pt;height:${Math.max(1, num(own(el, "h"), 2) || 2)}pt;background:${color}`)}"></div>`
    if (type === "image") {
        const src = safeImageSrc(own(el, "src"))
        if (src === null) return ""
        return `<img src="${escAttr(src)}" style="${escAttr(`${base}width:${w}pt;height:${num(own(el, "h"), 80)}pt;object-fit:contain`)}"/>`
    }
    const text = own(el, "text")
    const style = `${base}width:${w}pt;font-size:${fontSize}pt;font-weight:${own(el, "bold") ? 700 : 400};font-style:${own(el, "italic") ? "italic" : "normal"};text-decoration:${own(el, "underline") ? "underline" : "none"};color:${color};text-align:${safeAlign(own(el, "align"))};font-family:'${safeFontFamily(own(el, "fontFamily"))}',Arial,sans-serif;line-height:${num(own(el, "lineHeight"), 1.2) || 1.2};white-space:pre-wrap;word-break:break-word`
    return `<div style="${escAttr(style)}">${escText(typeof text === "string" ? text : "")}</div>`
}

export function buildEditorHtml(doc: EditorHtmlInput, iconSvgInner: (name: unknown) => string): string {
    const elements = Array.isArray(doc.elements) ? doc.elements.filter(isFields) : []
    const { w: pw, h: ph } = safePage(doc.page)
    const pageBg = safeColor(doc.pageBg, "#ffffff")
    const link = fontLink(elements.map((el) => own(el, "fontFamily")).filter((f): f is string => typeof f === "string"))
    const body = elements.map((el) => renderElement(el, iconSvgInner)).join("")
    return `<!doctype html><html><head><meta charset="utf-8">${link}<style>@page{size:${pw}pt ${ph}pt;margin:0}*{margin:0;padding:0;box-sizing:border-box}html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{position:relative;width:${pw}pt;height:${ph}pt;background:${pageBg};overflow:hidden}</style></head><body><div class="page">${body}</div></body></html>`
}
