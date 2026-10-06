import { test } from "node:test"
import assert from "node:assert/strict"

import { ICON_NAMES, iconName, iconShapes, iconSvgInner } from "../lib/editor-icons.ts"

const LEGACY = {
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 5L2 7"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    briefcase: '<rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    arrow: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
    github: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
}

test("the icon list keeps the same names in the same order", () => {
    assert.deepEqual(ICON_NAMES, Object.keys(LEGACY))
})

test("every icon renders exactly the markup it had before", () => {
    for (const [name, markup] of Object.entries(LEGACY)) {
        assert.equal(iconSvgInner(name), markup, name)
    }
})

test("unknown, inherited and hostile names fall back to the star", () => {
    for (const name of ["__proto__", "constructor", "toString", "hasOwnProperty", undefined, null, 3, "", "<img src=x onerror=alert(1)>"]) {
        assert.equal(iconName(name), "star", String(name))
        assert.equal(iconSvgInner(name), LEGACY.star, String(name))
        assert.deepEqual(iconShapes(name), iconShapes("star"), String(name))
    }
})

test("known names are kept", () => {
    assert.equal(iconName("github"), "github")
    assert.equal(iconShapes("mail").length, 2)
    assert.equal(iconShapes("mail")[0].tag, "rect")
})

test("shapes only use plain SVG tags and attribute names", () => {
    const tags = new Set(["path", "circle", "polygon", "polyline", "rect", "line"])
    for (const name of ICON_NAMES) {
        for (const shape of iconShapes(name)) {
            assert.ok(tags.has(shape.tag), `${name}: ${shape.tag}`)
            for (const attr of Object.keys(shape.attrs)) assert.match(attr, /^[a-z][a-z0-9]*$/, `${name}: ${attr}`)
        }
    }
})
