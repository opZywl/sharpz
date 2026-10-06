import { test } from "node:test"
import assert from "node:assert/strict"

import { GOOGLE_FONTS, buildEditorHtml, safeColor, safeImageSrc, safePage } from "../lib/editor-html.ts"
import { iconSvgInner } from "../lib/editor-icons.ts"

const A4 = { w: 595.276, h: 841.89 }
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

function legacyBuildHtml(elements, page, pageBg) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const isGoogle = (f) => GOOGLE_FONTS.includes(f || "")
    const used = Array.from(new Set(elements.map((e) => e.fontFamily).filter(isGoogle)))
    const link = used.length ? `<link href="https://fonts.googleapis.com/css2?${used.map((f) => "family=" + f.replace(/ /g, "+") + ":ital,wght@0,400;0,700;1,400;1,700").join("&")}&display=swap" rel="stylesheet">` : ""
    const body = elements.map((el) => {
        const rot = el.rotation ? `transform:rotate(${el.rotation}deg);transform-origin:center;` : ""
        const op = el.opacity != null && el.opacity < 1 ? `opacity:${el.opacity};` : ""
        const base = `position:absolute;left:${el.x}pt;top:${el.y}pt;${rot}${op}`
        if (el.type === "icon") return `<div style="${base}width:${el.fontSize}pt;height:${el.fontSize}pt;color:${el.color}"><svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvgInner(el.icon)}</svg></div>`
        if (el.type === "rect") return `<div style="${base}width:${el.w}pt;height:${el.h}pt;background:${el.fill || "transparent"};border:1pt solid ${el.color};border-radius:4pt"></div>`
        if (el.type === "line") return `<div style="${base}width:${el.w}pt;height:${Math.max(1, el.h || 2)}pt;background:${el.color}"></div>`
        if (el.type === "image") return `<img src="${el.src}" style="${base}width:${el.w}pt;height:${el.h}pt;object-fit:contain"/>`
        return `<div style="${base}width:${el.w}pt;font-size:${el.fontSize}pt;font-weight:${el.bold ? 700 : 400};font-style:${el.italic ? "italic" : "normal"};text-decoration:${el.underline ? "underline" : "none"};color:${el.color};text-align:${el.align};font-family:'${el.fontFamily || "Inter"}',Arial,sans-serif;line-height:${el.lineHeight || 1.2};white-space:pre-wrap;word-break:break-word">${esc(el.text)}</div>`
    }).join("")
    return `<!doctype html><html><head><meta charset="utf-8">${link}<style>@page{size:${page.w}pt ${page.h}pt;margin:0}*{margin:0;padding:0;box-sizing:border-box}html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{position:relative;width:${page.w}pt;height:${page.h}pt;background:${pageBg};overflow:hidden}</style></head><body><div class="page">${body}</div></body></html>`
}

const norm = (e) => ({
    type: "text", text: "", x: 0, y: 0, w: 120, fontSize: 12, bold: false, italic: false,
    color: "#1a2436", align: "left", fontFamily: "Inter", opacity: 1, rotation: 0, ...e,
})

const TYPICAL = [
    { id: "s1", type: "text", text: "LUCAS LIMA", x: 40, y: 50, w: 320, fontSize: 32, bold: true, italic: false, color: "#1b2740", align: "left", fontFamily: "Plus Jakarta Sans" },
    { id: "s2", type: "text", text: "Dev & designer <contato@lucas-lima.dev>", x: 40, y: 98, w: 320, fontSize: 11, bold: false, italic: false, color: "#5b6472", align: "left", fontFamily: "Inter" },
    { id: "s3", type: "text", text: "Linha 1\nLinha 2 \"aspas\" 'simples'", x: 40.5, y: 138.25, w: 380, fontSize: 10.5, bold: false, italic: true, underline: true, color: "#8b94a3", align: "center", fontFamily: "Source Sans 3", lineHeight: 1.5, rotation: 12, opacity: 0.6 },
    { id: "s4", type: "text", text: "Times", x: 10, y: 10, w: 200, fontSize: 14, bold: false, italic: false, color: "rgb(10, 20, 30)", align: "right", fontFamily: "Times New Roman" },
    { id: "s5", type: "text", text: "Justified", x: 10, y: 30, w: 200, fontSize: 14, bold: false, italic: false, color: "red", align: "justify", fontFamily: "Roboto", rotation: -45 },
    { id: "i1", type: "icon", icon: "mail", x: 70, y: 70, w: 30, h: 30, fontSize: 30, color: "#1b2740" },
    { id: "i2", type: "icon", icon: "github", x: 120, y: 70, w: 24, h: 24, fontSize: 24, color: "#e8edf6", opacity: 0.4 },
    { id: "r1", type: "rect", x: 70, y: 200, w: 160, h: 90, fill: "#e7ebf3", color: "#cfd6e4" },
    { id: "r2", type: "rect", x: 70, y: 300, w: 160, h: 90, color: "rgba(0,0,0,0.5)" },
    { id: "r3", type: "rect", x: 70, y: 400, w: 160, h: 90, fill: "transparent", color: "hsl(120, 50%, 50%)" },
    { id: "l1", type: "line", x: 70, y: 500, w: 200, h: 2, color: "#cfd6e4", fontSize: 2 },
    { id: "l2", type: "line", x: 70, y: 510, w: 200, color: "#abc", fontSize: 2 },
    { id: "m1", type: "image", src: PNG, x: 300, y: 300, w: 180, h: 120 },
    { id: "m2", type: "image", src: "data:image/jpeg;base64,/9j/4AAQSkZJRg==", x: 300, y: 450, w: 180, h: 90.5 },
].map(norm)

test("typical documents render byte-identical to the previous builder", () => {
    for (const [page, pageBg] of [[A4, "#ffffff"], [{ w: 612, h: 792 }, "#0b1220"], [{ w: 595.3, h: 841.9 }, "#fafafa"]]) {
        const expected = legacyBuildHtml(TYPICAL, page, pageBg)
        assert.equal(buildEditorHtml({ elements: TYPICAL, page, pageBg }, iconSvgInner), expected)
    }
})

test("a document without Google fonts has no font link, as before", () => {
    const els = [norm({ id: "a", text: "x", fontFamily: "Arial" }), norm({ id: "b", type: "rect", h: 10, fontFamily: "Georgia" })]
    const html = buildEditorHtml({ elements: els, page: A4, pageBg: "#ffffff" }, iconSvgInner)
    assert.equal(html, legacyBuildHtml(els, A4, "#ffffff"))
    assert.ok(!html.includes("<link"))
})

test("the seed fixture matches a literal snapshot", () => {
    const els = [norm({ id: "s1", text: "LUCAS LIMA", x: 40, y: 50, w: 320, fontSize: 32, bold: true, color: "#1b2740", fontFamily: "Plus Jakarta Sans" })]
    const html = buildEditorHtml({ elements: els, page: A4, pageBg: "#ffffff" }, iconSvgInner)
    assert.equal(html, '<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet"><style>@page{size:595.276pt 841.89pt;margin:0}*{margin:0;padding:0;box-sizing:border-box}html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{position:relative;width:595.276pt;height:841.89pt;background:#ffffff;overflow:hidden}</style></head><body><div class="page"><div style="position:absolute;left:40pt;top:50pt;width:320pt;font-size:32pt;font-weight:700;font-style:normal;text-decoration:none;color:#1b2740;text-align:left;font-family:\'Plus Jakarta Sans\',Arial,sans-serif;line-height:1.2;white-space:pre-wrap;word-break:break-word">LUCAS LIMA</div></div></body></html>')
})

test("safe CSS colors are kept and anything else falls back", () => {
    for (const ok of ["#abc", "#abcd", "#aabbcc", "#AABBCCDD", "rgb(1, 2, 3)", "rgba(0,0,0,0.5)", "rgb(10% 20% 30% / 0.5)", "hsl(120, 50%, 50%)", "hsla(120deg 50% 50% / 50%)", "red", "rebeccapurple", "transparent"]) {
        assert.equal(safeColor(ok, "#000"), ok)
    }
    for (const bad of ["red\"><script>", "</style><script>", "x;}body{display:none", "javascript:alert(1)", "url(x)", "#abcde", "#ggg", "rgb(1,2,3);color:red", "rgb(expression(1))", "", " red", 5, null, undefined, {}, ["red"]]) {
        assert.equal(safeColor(bad, "#000"), "#000")
    }
})

const ALLOWED_TAGS = new Set(["!doctype", "html", "head", "meta", "link", "style", "body", "div", "svg", "img", "path", "circle", "polygon", "polyline", "rect", "line"])
const ALLOWED_ATTRS = new Set(["html", "charset", "href", "rel", "class", "style", "src", "viewbox", "width", "height", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "points", "d", "cx", "cy", "r", "x", "y", "rx", "x1", "y1", "x2", "y2"])
const ALLOWED_PROPS = new Set(["position", "left", "top", "transform", "transform-origin", "opacity", "width", "height", "color", "background", "border", "border-radius", "object-fit", "font-size", "font-weight", "font-style", "text-decoration", "text-align", "font-family", "line-height", "white-space", "word-break"])

function scanTags(html) {
    const tags = []
    let i = 0
    while (i < html.length) {
        const lt = html.indexOf("<", i)
        if (lt < 0) break
        let j = lt + 1
        const closing = html[j] === "/"
        if (closing) j++
        const nameMatch = /^[!a-zA-Z][a-zA-Z0-9-]*/.exec(html.slice(j))
        assert.ok(nameMatch, `bad tag at ${lt}: ${html.slice(lt, lt + 40)}`)
        const name = nameMatch[0].toLowerCase()
        assert.ok(ALLOWED_TAGS.has(name), `unexpected tag <${name}>`)
        j += nameMatch[0].length
        const attrs = {}
        for (;;) {
            const rest = html.slice(j)
            const end = /^\s*\/?>/.exec(rest)
            if (end) { j += end[0].length; break }
            const attr = /^\s+([a-zA-Z-]+)(?:="([^"]*)")?/.exec(rest)
            assert.ok(attr, `bad attribute in <${name}> at ${j}: ${rest.slice(0, 40)}`)
            const key = attr[1].toLowerCase()
            assert.ok(ALLOWED_ATTRS.has(key), `unexpected attribute ${key}`)
            attrs[key] = attr[2] ?? ""
            j += attr[0].length
        }
        tags.push({ name, closing, attrs })
        if (name === "style" && !closing) {
            const close = html.indexOf("</style>", j)
            const css = html.slice(j, close)
            assert.ok(!css.includes("<"), "markup inside the style element")
            assert.equal((css.match(/\{/g) || []).length, 4)
            assert.equal((css.match(/\}/g) || []).length, 4)
            i = close
            continue
        }
        i = j
    }
    return tags
}

function assertSafe(html) {
    assert.ok(!/<script/i.test(html), "script tag present")
    assert.equal(html.split("</style>").length, 2)
    const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"))
    assert.ok(!/NaN|Infinity|undefined|(?<![#\w.])\d+(?:\.\d+)?[eE][+-]?\d/.test(css), `bad number in css: ${css}`)
    const tags = scanTags(html)
    for (const tag of tags) {
        for (const value of Object.values(tag.attrs)) {
            assert.ok(!/javascript:|data:text/i.test(value), `unsafe url in ${value}`)
        }
        if (tag.attrs.style !== undefined) {
            assert.ok(!/NaN|Infinity|undefined|(?<![#\w.])\d+(?:\.\d+)?[eE][+-]?\d/.test(tag.attrs.style.replace(/'[^']*'/g, "''")), `bad number in ${tag.attrs.style}`)
            assert.ok(!/[{}<>"]/.test(tag.attrs.style), `style breaks out: ${tag.attrs.style}`)
            for (const decl of tag.attrs.style.split(";")) {
                const prop = decl.split(":")[0]
                assert.ok(ALLOWED_PROPS.has(prop), `unexpected css property ${prop} in ${tag.attrs.style}`)
            }
        }
        if (tag.name === "img") assert.match(tag.attrs.src, /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]*={0,2}$/i)
        if (tag.name === "link") assert.match(tag.attrs.href, /^https:\/\/fonts\.googleapis\.com\/css2\?(family=[A-Za-z0-9+]+:ital,wght@0,400;0,700;1,400;1,700&)+display=swap$/)
    }
    return tags
}

const PAYLOADS = [
    "red\"><script>alert(1)</script>",
    "</style><script>alert(1)</script>",
    "x;}body{display:none",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pg==",
    "data:image/png;base64,AAAA\"><script>alert(1)</script>",
    "'),url(https://evil.example/x",
    "Inter',x);}body{background:url(https://evil.example)",
    "Inter&family=Evil",
    "__proto__",
    "constructor",
    "1e400",
    "10pt;color:red",
]

const NUMBERS = [NaN, Infinity, -Infinity, 1e308, -1e308, "10;}</style><script>", "12", null, {}, [], true]

function render(elements, extra = {}) {
    return buildEditorHtml({ elements, page: A4, pageBg: "#ffffff", ...extra }, iconSvgInner)
}

test("injection through every string field never escapes its context", () => {
    const fields = ["color", "fill", "fontFamily", "align", "src", "icon", "type", "text"]
    for (const type of ["text", "icon", "rect", "line", "image"]) {
        for (const field of fields) {
            for (const payload of PAYLOADS) {
                const el = norm({ id: "x", type, text: "ok", h: 40, src: PNG, fill: "#eee", [field]: payload })
                assertSafe(render([el]))
            }
        }
    }
    for (const payload of PAYLOADS) {
        assertSafe(render([norm({ id: "a", text: "a" })], { pageBg: payload }))
    }
})

test("non-finite, huge and non-numeric numbers are replaced by the editor defaults", () => {
    const fields = ["x", "y", "w", "h", "fontSize", "rotation", "opacity", "lineHeight"]
    for (const type of ["text", "icon", "rect", "line", "image"]) {
        for (const field of fields) {
            for (const value of NUMBERS) {
                const el = norm({ id: "x", type, text: "ok", h: 40, src: PNG, fill: "#eee", [field]: value })
                assertSafe(render([el]))
            }
        }
    }
    for (const value of NUMBERS) {
        assertSafe(render([norm({ id: "a", text: "a" })], { page: { w: value, h: value } }))
        assertSafe(render([norm({ id: "a", text: "a" })], { page: value }))
    }
    const html = render([norm({ id: "a", text: "a", x: NaN, y: Infinity, w: "9;}", fontSize: null, lineHeight: NaN, rotation: NaN, opacity: NaN })], { page: { w: NaN, h: "1}" } })
    assert.ok(html.includes("left:0pt;top:0pt;width:120pt;font-size:12pt;"))
    assert.ok(html.includes("line-height:1.2;"))
    assert.ok(!html.includes("transform"))
    assert.ok(!html.includes("opacity"))
    assert.ok(html.includes("@page{size:595.276pt 841.89pt;margin:0}"))
    const rect = render([norm({ id: "r", type: "rect", h: NaN }), norm({ id: "m", type: "image", src: PNG, h: undefined })])
    assert.equal((rect.match(/height:80pt/g) || []).length, 2)
})

test("unsafe values fall back to safe defaults and legitimate ones stay", () => {
    const html = render([norm({ id: "a", text: "a", color: "red\"><script>", align: "center;}x", fontFamily: "Inter',x" })])
    assert.ok(html.includes("color:#1a2436;"))
    assert.ok(html.includes("text-align:left;"))
    assert.ok(html.includes("font-family:'Inter',Arial,sans-serif;"))
    const page = render([], { pageBg: "</style><script>" })
    assert.ok(page.includes("background:#ffffff;overflow:hidden"))
    const rect = render([norm({ id: "r", type: "rect", h: 10, fill: "x;}body{display:none" })])
    assert.ok(rect.includes("background:transparent;"))
    const kept = render([norm({ id: "a", text: "a", color: "rgba(1,2,3,0.5)", align: "justify", fontFamily: "Comic Sans 2" })])
    assert.ok(kept.includes("color:rgba(1,2,3,0.5);text-align:justify;font-family:'Comic Sans 2',Arial,sans-serif;"))
    assert.ok(!kept.includes("<link"))
})

test("images with anything but a base64 image data url render nothing", () => {
    for (const src of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "data:text/html;base64,PHNjcmlwdD4=", "data:image/svg+xml,<svg onload=alert(1)>", "data:image/png;base64,AA AA", "http://evil.example/x.png", "https://evil.example/x.png", "file:///C:/Windows/win.ini", `${PNG}"onerror="alert(1)`, "", undefined, 5]) {
        const html = render([norm({ id: "m", type: "image", src, h: 10 })])
        assert.ok(!html.includes("<img"), String(src))
        assertSafe(html)
    }
    for (const src of [PNG, "data:image/jpg;base64,AAAA", "data:image/webp;base64,AAAA", "data:image/gif;base64,R0lGODlh", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/bmp;base64,Qk0=", "data:image/avif;base64,AAAA", "data:image/x-icon;base64,AAAA", "data:image/vnd.microsoft.icon;base64,AAAA"]) {
        assert.ok(render([norm({ id: "m", type: "image", src, h: 10 })]).includes(`<img src="${src}"`))
    }
})

test("only the allowed Google fonts reach the font link", () => {
    const els = ["Roboto", "Inter&family=Evil", "Comic Sans", "Source Sans 3", "__proto__", "constructor", "Roboto"].map((fontFamily, i) => norm({ id: String(i), text: "a", fontFamily }))
    const html = render(els)
    assertSafe(html)
    assert.ok(html.includes('<link href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400;0,700;1,400;1,700&family=Source+Sans+3:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">'))
    assert.ok(!html.includes("Evil"))
    assert.ok(html.includes("font-family:'Comic Sans',Arial,sans-serif;"))
})

test("prototype keys and malformed elements do not leak into the html", () => {
    const parsed = JSON.parse('{"elements":[{"__proto__":{"color":"red\\"><script>alert(1)</script>","src":"javascript:alert(1)"},"id":"p","type":"text","text":"hi"},{"id":"q","type":"__proto__","text":"t"},{"id":"c","type":"icon","icon":"constructor","constructor":"x"},null,5,"str",[]]}')
    const html = render(parsed.elements)
    assertSafe(html)
    assert.ok(html.includes(">hi</div>"))
    assert.ok(html.includes(">t</div>"))
    assert.ok(!render("not an array").includes("<div style"))
    assertSafe(render(undefined))
})

test("text stays escaped exactly as before", () => {
    const html = render([norm({ id: "t", text: "</div><script>alert(1)</script>&amp;" })])
    assertSafe(html)
    assert.ok(html.includes(">&lt;/div&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;amp;</div>"))
    assertSafe(render([norm({ id: "t", text: 5 }), norm({ id: "u", text: { a: 1 } })]))
})

test("the png window gets the same checked page size as the html", () => {
    assert.deepEqual(safePage(A4), A4)
    assert.deepEqual(safePage({ w: 612, h: 792 }), { w: 612, h: 792 })
    for (const page of [{ w: "1e7", h: "1e7" }, { w: NaN, h: Infinity }, null, "A4", [], {}]) {
        assert.deepEqual(safePage(page), A4)
    }
    assert.deepEqual(safePage({ w: 1e7, h: -5 }), { w: 14400, h: 1 })
    const html = render([], { page: { w: 1e7, h: -5 } })
    assert.ok(html.includes("@page{size:14400pt 1pt;margin:0}"))
    assert.ok(html.includes(".page{position:relative;width:14400pt;height:1pt;"))
})

test("safeImageSrc keeps base64 image data and refuses everything else", () => {
    assert.equal(safeImageSrc(PNG), PNG)
    assert.equal(safeImageSrc("data:image/svg+xml;base64,PHN2Zy8+"), "data:image/svg+xml;base64,PHN2Zy8+")
    for (const bad of [
        "javascript:alert(1)",
        "data:text/html;base64,PHNjcmlwdD4=",
        "data:image/png,raw",
        "https://example.com/a.png",
        "file:///C:/x.png",
        PNG + '" onerror="alert(1)',
        "",
        null,
        42,
    ]) {
        assert.equal(safeImageSrc(bad), null, String(bad))
    }
})
