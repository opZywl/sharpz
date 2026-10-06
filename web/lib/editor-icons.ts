export type IconTag = "path" | "circle" | "polygon" | "polyline" | "rect" | "line"

export interface IconShape {
    tag: IconTag
    attrs: Record<string, string>
}

export const ICON_SHAPES: Record<string, IconShape[]> = {
    star: [{ tag: "polygon", attrs: { points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" } }],
    heart: [{ tag: "path", attrs: { d: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" } }],
    check: [{ tag: "polyline", attrs: { points: "20 6 9 17 4 12" } }],
    mail: [
        { tag: "rect", attrs: { width: "20", height: "16", x: "2", y: "4", rx: "2" } },
        { tag: "path", attrs: { d: "m22 7-10 5L2 7" } },
    ],
    phone: [{ tag: "path", attrs: { d: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" } }],
    pin: [
        { tag: "path", attrs: { d: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" } },
        { tag: "circle", attrs: { cx: "12", cy: "10", r: "3" } },
    ],
    globe: [
        { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } },
        { tag: "path", attrs: { d: "M2 12h20" } },
        { tag: "path", attrs: { d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" } },
    ],
    calendar: [
        { tag: "rect", attrs: { width: "18", height: "18", x: "3", y: "4", rx: "2" } },
        { tag: "path", attrs: { d: "M3 10h18M8 2v4M16 2v4" } },
    ],
    award: [
        { tag: "circle", attrs: { cx: "12", cy: "8", r: "6" } },
        { tag: "path", attrs: { d: "M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" } },
    ],
    code: [
        { tag: "polyline", attrs: { points: "16 18 22 12 16 6" } },
        { tag: "polyline", attrs: { points: "8 6 2 12 8 18" } },
    ],
    briefcase: [
        { tag: "rect", attrs: { width: "20", height: "14", x: "2", y: "7", rx: "2" } },
        { tag: "path", attrs: { d: "M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" } },
    ],
    user: [
        { tag: "circle", attrs: { cx: "12", cy: "8", r: "4" } },
        { tag: "path", attrs: { d: "M4 21c0-4 3.6-6 8-6s8 2 8 6" } },
    ],
    link: [
        { tag: "path", attrs: { d: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" } },
        { tag: "path", attrs: { d: "M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" } },
    ],
    arrow: [
        { tag: "line", attrs: { x1: "5", y1: "12", x2: "19", y2: "12" } },
        { tag: "polyline", attrs: { points: "12 5 19 12 12 19" } },
    ],
    sparkles: [{ tag: "path", attrs: { d: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" } }],
    github: [{ tag: "path", attrs: { d: "M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" } }],
}

export const ICON_NAMES = Object.keys(ICON_SHAPES)

const FALLBACK_ICON = "star"

export function iconName(name: unknown): string {
    return typeof name === "string" && Object.prototype.hasOwnProperty.call(ICON_SHAPES, name) ? name : FALLBACK_ICON
}

export function iconShapes(name: unknown): IconShape[] {
    return ICON_SHAPES[iconName(name)]
}

function escapeAttribute(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function iconSvgInner(name: unknown): string {
    return iconShapes(name)
        .map((shape) => {
            const attrs = Object.entries(shape.attrs)
                .map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`)
                .join("")
            return `<${shape.tag}${attrs}/>`
        })
        .join("")
}
