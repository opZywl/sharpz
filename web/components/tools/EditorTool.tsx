"use client"

import {
    AlignCenter, AlignLeft, AlignRight, Bold, BringToFront, ChevronDown, Copy, Download,
    FileImage, FileText, FolderOpen, Image as ImageIcon, Italic, Loader2, Lock, Maximize2,
    Minimize2, Minus, Moon, Plus, Redo2, RotateCw, Save, SendToBack, Shapes, Slash, Square,
    Sun, Trash2, Type, Underline, Undo2, Unlock, Upload, ZoomIn, ZoomOut,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { EditorElement, ElType, importDoc, renderHtml, renderPng } from "@/lib/editor-api"

const SIZES: Record<string, { w: number; h: number }> = {
    A4: { w: 595.276, h: 841.89 },
    Carta: { w: 612, h: 792 },
}
const GOOGLE_FONTS = ["Inter", "Plus Jakarta Sans", "Roboto", "Poppins", "Montserrat", "Lato", "Raleway", "Oswald", "Merriweather", "Playfair Display", "Work Sans", "Manrope", "Nunito", "Source Sans 3"]
const SYSTEM_FONTS = ["Arial", "Georgia", "Times New Roman", "Courier New", "Verdana"]
const ALL_FONTS = [...GOOGLE_FONTS, ...SYSTEM_FONTS]
const LS_KEY = "sharpz-editor-doc-v1"

const ICONS: Record<string, string> = {
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

const SEED: EditorElement[] = [
    { id: "s1", type: "text", text: "LUCAS LIMA", x: 40, y: 50, w: 320, fontSize: 32, bold: true, italic: false, color: "#1b2740", align: "left", fontFamily: "Plus Jakarta Sans" },
    { id: "s2", type: "text", text: "Desenvolvedor Full Stack | Software Engineer", x: 40, y: 98, w: 320, fontSize: 11, bold: false, italic: false, color: "#5b6472", align: "left", fontFamily: "Inter" },
    { id: "s3", type: "text", text: "Importe um PDF, ou adicione texto/forma/imagem e arraste.", x: 40, y: 138, w: 380, fontSize: 10, bold: false, italic: true, color: "#8b94a3", align: "left", fontFamily: "Inter" },
]

let _uid = 0
const uid = () => `el${Date.now().toString(36)}${(_uid++).toString(36)}`
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const isGoogle = (f?: string) => GOOGLE_FONTS.includes(f || "")
const norm = (e: Partial<EditorElement> & { id: string }): EditorElement => ({
    type: "text", text: "", x: 0, y: 0, w: 120, fontSize: 12, bold: false, italic: false,
    color: "#1a2436", align: "left", fontFamily: "Inter", opacity: 1, rotation: 0, ...e,
})

export function EditorTool() {
    const [elements, setElements] = useState<EditorElement[]>(SEED)
    const [page, setPage] = useState(SIZES.A4)
    const [pageBg, setPageBg] = useState("#ffffff")
    const [bg, setBg] = useState<string | null>(null)
    const [showBg, setShowBg] = useState(true)
    const [selected, setSelected] = useState<string[]>([])
    const [editing, setEditing] = useState<string | null>(null)
    const [fit, setFit] = useState(0.8)
    const [zoom, setZoom] = useState(1)
    const [full, setFull] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [menu, setMenu] = useState<"" | "icon" | "shape" | "export">("")
    const [guide, setGuide] = useState<{ x?: number; y?: number }>({})
    const [ctx, setCtx] = useState<{ sx: number; sy: number } | null>(null)

    const wrapRef = useRef<HTMLDivElement | null>(null)
    const drag = useRef<{ ids: string[]; px: number; py: number; pos: Record<string, { x: number; y: number }>; moved: boolean } | null>(null)
    const rez = useRef<{ id: string; px: number; py: number; w: number; h: number; fs: number } | null>(null)
    const clip = useRef<EditorElement[]>([])
    const history = useRef<EditorElement[][]>([])
    const future = useRef<EditorElement[][]>([])
    const eref = useRef<EditorElement[]>(elements); eref.current = elements
    const sref = useRef<string[]>(selected); sref.current = selected
    const fileRef = useRef<HTMLInputElement | null>(null)
    const imgRef = useRef<HTMLInputElement | null>(null)
    const projRef = useRef<HTMLInputElement | null>(null)

    const scale = fit * zoom

    // fontes google
    useEffect(() => {
        const id = "editor-google-fonts"
        if (document.getElementById(id)) return
        const l = document.createElement("link"); l.id = id; l.rel = "stylesheet"
        l.href = "https://fonts.googleapis.com/css2?" + GOOGLE_FONTS.map((f) => "family=" + f.replace(/ /g, "+") + ":ital,wght@0,400;0,700;1,400;1,700").join("&") + "&display=swap"
        document.head.appendChild(l)
    }, [])

    // carregar autosave
    useEffect(() => {
        try {
            const raw = localStorage.getItem(LS_KEY)
            if (raw) {
                const d = JSON.parse(raw)
                if (Array.isArray(d.elements) && d.elements.length) {
                    setElements(d.elements.map(norm)); setPage(d.page || SIZES.A4); setPageBg(d.pageBg || "#ffffff")
                }
            }
        } catch { /* ignora */ }
    }, [])

    // autosave
    useEffect(() => {
        const t = setTimeout(() => {
            try { localStorage.setItem(LS_KEY, JSON.stringify({ page, pageBg, elements })) } catch { /* ignora */ }
        }, 600)
        return () => clearTimeout(t)
    }, [elements, page, pageBg])

    useEffect(() => {
        function measure() {
            const w = wrapRef.current?.clientWidth ?? 700
            const targetH = (full ? 0.82 : 0.64) * window.innerHeight
            setFit(Math.min(1.4, Math.max(0.25, Math.min((w - 24) / page.w, targetH / page.h))))
        }
        measure(); window.addEventListener("resize", measure)
        return () => window.removeEventListener("resize", measure)
    }, [page.w, page.h, full])

    const selEls = elements.filter((e) => selected.includes(e.id))
    const one = selEls.length === 1 ? selEls[0] : null

    const snapshot = useCallback(() => {
        history.current.push(eref.current.map((e) => ({ ...e })))
        if (history.current.length > 60) history.current.shift()
        future.current = []
    }, [])
    const patch = useCallback((id: string, p: Partial<EditorElement>) => setElements((c) => c.map((e) => (e.id === id ? { ...e, ...p } : e))), [])
    const patchSel = useCallback((p: Partial<EditorElement>) => { snapshot(); setElements((c) => c.map((e) => (sref.current.includes(e.id) ? { ...e, ...p } : e))) }, [snapshot])

    function undo() { const p = history.current.pop(); if (!p) return; future.current.push(eref.current.map((e) => ({ ...e }))); setElements(p) }
    function redo() { const n = future.current.pop(); if (!n) return; history.current.push(eref.current.map((e) => ({ ...e }))); setElements(n) }

    function add(el: Partial<EditorElement> & { type: ElType }) {
        snapshot(); const id = uid()
        const base: EditorElement = norm({ id, x: 70, y: 70, w: 160, h: 80, fontSize: 16, color: "#1b2740", ...el })
        setElements((c) => [...c, base]); setSelected([id]); setMenu("")
    }
    const addText = () => add({ type: "text", text: "Novo texto", w: 220, fontSize: 16, color: pageBg === "#ffffff" ? "#1a2436" : "#f3f5f8" })
    const addIcon = (icon: string) => add({ type: "icon", icon, w: 30, h: 30, fontSize: 30, color: pageBg === "#ffffff" ? "#1b2740" : "#e8edf6" })
    const addRect = () => add({ type: "rect", w: 160, h: 90, fill: "#e7ebf3", color: "#cfd6e4" })
    const addLine = () => add({ type: "line", w: 200, h: 2, color: "#cfd6e4", fontSize: 2 })

    function onImg(file: File) {
        const r = new FileReader()
        r.onload = () => { const src = String(r.result); const im = new window.Image(); im.onload = () => { const w = 180; add({ type: "image", src, w, h: Math.round(w * im.height / im.width) }) }; im.src = src }
        r.readAsDataURL(file)
    }

    function dupSel() { if (!selEls.length) return; snapshot(); const map: Record<string, string> = {}; const copies = selEls.map((e) => { const id = uid(); map[e.id] = id; return { ...e, id, x: e.x + 14, y: e.y + 14 } }); setElements((c) => [...c, ...copies]); setSelected(copies.map((c) => c.id)) }
    function delSel() { if (!selEls.length) return; snapshot(); const ids = new Set(selected); setElements((c) => c.filter((e) => !ids.has(e.id))); setSelected([]) }
    function zorder(front: boolean) { if (!selEls.length) return; snapshot(); const ids = new Set(selected); setElements((c) => { const keep = c.filter((e) => !ids.has(e.id)); const move = c.filter((e) => ids.has(e.id)); return front ? [...keep, ...move] : [...move, ...keep] }) }
    function toggleLock() { if (!one) return; patch(one.id, { locked: !one.locked }) }

    // arrastar (com snapping no single)
    function onDown(e: React.PointerEvent, id: string) {
        if (editing === id) return
        e.stopPropagation()
        const el = eref.current.find((x) => x.id === id)
        if (!el || el.locked) { setSelected([id]); return }
        let sel = sref.current
        if (e.shiftKey) sel = sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]
        else if (!sel.includes(id)) sel = [id]
        setSelected(sel)
        const ids = sel.includes(id) ? sel : [id]
        const pos: Record<string, { x: number; y: number }> = {}
        eref.current.forEach((x) => { if (ids.includes(x.id)) pos[x.id] = { x: x.x, y: x.y } })
        drag.current = { ids, px: e.clientX, py: e.clientY, pos, moved: false }
        const move = (ev: PointerEvent) => {
            const d = drag.current; if (!d) return
            if (!d.moved) { snapshot(); d.moved = true }
            let dx = (ev.clientX - d.px) / scale, dy = (ev.clientY - d.py) / scale
            const g: { x?: number; y?: number } = {}
            if (d.ids.length === 1) {
                const me = eref.current.find((x) => x.id === d.ids[0])!
                const nx = d.pos[d.ids[0]].x + dx, ny = d.pos[d.ids[0]].y + dy
                const cx = nx + (me.w || 0) / 2, cy = ny + (me.h || me.fontSize) / 2
                const th = 6 / scale
                const xs: number[] = [0, page.w / 2, page.w]
                const ys: number[] = [0, page.h / 2, page.h]
                eref.current.forEach((o) => { if (o.id !== me.id) { xs.push(o.x, o.x + (o.w || 0) / 2, o.x + (o.w || 0)); ys.push(o.y, o.y + (o.h || o.fontSize) / 2, o.y + (o.h || o.fontSize)) } })
                for (const t of xs) { if (Math.abs(cx - t) < th) { dx += t - cx; g.x = t; break } }
                for (const t of ys) { if (Math.abs(cy - t) < th) { dy += t - cy; g.y = t; break } }
            }
            setGuide(g)
            setElements((c) => c.map((x) => (d.pos[x.id] ? { ...x, x: Math.round(d.pos[x.id].x + dx), y: Math.round(d.pos[x.id].y + dy) } : x)))
        }
        const up = () => { drag.current = null; setGuide({}); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up) }
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up)
    }

    // redimensionar
    function onResize(e: React.PointerEvent, el: EditorElement) {
        e.stopPropagation(); e.preventDefault()
        snapshot()
        rez.current = { id: el.id, px: e.clientX, py: e.clientY, w: el.w, h: el.h || el.fontSize, fs: el.fontSize }
        const move = (ev: PointerEvent) => {
            const r = rez.current; if (!r) return
            const dx = (ev.clientX - r.px) / scale, dy = (ev.clientY - r.py) / scale
            if (el.type === "icon") { const s = Math.max(8, Math.round(r.w + dx)); patch(el.id, { w: s, h: s, fontSize: s }) }
            else if (el.type === "text") patch(el.id, { w: Math.max(24, Math.round(r.w + dx)) })
            else if (el.type === "line") patch(el.id, { w: Math.max(8, Math.round(r.w + dx)) })
            else patch(el.id, { w: Math.max(12, Math.round(r.w + dx)), h: Math.max(12, Math.round(r.h + dy)) })
        }
        const up = () => { rez.current = null; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up) }
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up)
    }

    // teclado
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const tag = (e.target as HTMLElement)?.tagName
            if (editing || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") { if (e.key === "Escape") { (e.target as HTMLElement)?.blur?.(); setEditing(null) } return }
            const mod = e.ctrlKey || e.metaKey
            const cur = eref.current.filter((x) => sref.current.includes(x.id))
            if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) { redo() } else { undo() } return }
            if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return }
            if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); setSelected(eref.current.map((x) => x.id)); return }
            if (mod && e.key.toLowerCase() === "c") { clip.current = cur.map((x) => ({ ...x })); return }
            if (mod && e.key.toLowerCase() === "v") { if (clip.current.length) { snapshot(); const cps = clip.current.map((x) => ({ ...x, id: uid(), x: x.x + 16, y: x.y + 16 })); setElements((c) => [...c, ...cps]); setSelected(cps.map((c) => c.id)) } return }
            if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); dupSel(); return }
            if ((e.key === "Delete" || e.key === "Backspace") && cur.length) { e.preventDefault(); delSel(); return }
            if (e.key === "Escape") { setSelected([]); setCtx(null); return }
            if (cur.length && e.key.startsWith("Arrow")) {
                e.preventDefault(); const s = e.shiftKey ? 10 : 1
                const dx = e.key === "ArrowLeft" ? -s : e.key === "ArrowRight" ? s : 0
                const dy = e.key === "ArrowUp" ? -s : e.key === "ArrowDown" ? s : 0
                const ids = new Set(sref.current); setElements((c) => c.map((x) => (ids.has(x.id) ? { ...x, x: x.x + dx, y: x.y + dy } : x)))
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [editing, snapshot])

    async function onImport(file: File) {
        setBusy(true); setError(null)
        try {
            const d = await importDoc(file, true)
            history.current = []; future.current = []
            setPage(d.page); setElements((d.elements.length ? d.elements : SEED).map(norm))
            setBg(d.bg); setShowBg(false); setPageBg(d.page_bg || "#ffffff"); setZoom(1); setSelected([])
        } catch (err) { setError(err instanceof Error ? err.message : "Falha ao importar.") } finally { setBusy(false) }
    }

    function buildHtml() {
        const used = Array.from(new Set(elements.map((e) => e.fontFamily).filter(isGoogle)))
        const link = used.length ? `<link href="https://fonts.googleapis.com/css2?${used.map((f) => "family=" + (f as string).replace(/ /g, "+") + ":ital,wght@0,400;0,700;1,400;1,700").join("&")}&display=swap" rel="stylesheet">` : ""
        const body = elements.map((el) => {
            const rot = el.rotation ? `transform:rotate(${el.rotation}deg);transform-origin:center;` : ""
            const op = el.opacity != null && el.opacity < 1 ? `opacity:${el.opacity};` : ""
            const base = `position:absolute;left:${el.x}pt;top:${el.y}pt;${rot}${op}`
            if (el.type === "icon") return `<div style="${base}width:${el.fontSize}pt;height:${el.fontSize}pt;color:${el.color}"><svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[el.icon || "star"]}</svg></div>`
            if (el.type === "rect") return `<div style="${base}width:${el.w}pt;height:${el.h}pt;background:${el.fill || "transparent"};border:1pt solid ${el.color};border-radius:4pt"></div>`
            if (el.type === "line") return `<div style="${base}width:${el.w}pt;height:${Math.max(1, el.h || 2)}pt;background:${el.color}"></div>`
            if (el.type === "image") return `<img src="${el.src}" style="${base}width:${el.w}pt;height:${el.h}pt;object-fit:contain"/>`
            return `<div style="${base}width:${el.w}pt;font-size:${el.fontSize}pt;font-weight:${el.bold ? 700 : 400};font-style:${el.italic ? "italic" : "normal"};text-decoration:${el.underline ? "underline" : "none"};color:${el.color};text-align:${el.align};font-family:'${el.fontFamily || "Inter"}',Arial,sans-serif;line-height:${el.lineHeight || 1.2};white-space:pre-wrap;word-break:break-word">${esc(el.text)}</div>`
        }).join("")
        return `<!doctype html><html><head><meta charset="utf-8">${link}<style>@page{size:${page.w}pt ${page.h}pt;margin:0}*{margin:0;padding:0;box-sizing:border-box}html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{position:relative;width:${page.w}pt;height:${page.h}pt;background:${pageBg};overflow:hidden}</style></head><body><div class="page">${body}</div></body></html>`
    }

    async function exportAs(kind: "pdf" | "png") {
        setBusy(true); setError(null); setMenu("")
        try {
            const blob = kind === "pdf" ? await renderHtml(buildHtml()) : await renderPng(buildHtml(), page.w, page.h)
            const url = URL.createObjectURL(blob); const a = document.createElement("a")
            a.href = url; a.download = `documento-editado.${kind}`; a.click(); URL.revokeObjectURL(url)
        } catch (err) { setError(err instanceof Error ? err.message : "Falha ao exportar.") } finally { setBusy(false) }
    }

    function saveProject() {
        const blob = new Blob([JSON.stringify({ page, pageBg, elements }, null, 2)], { type: "application/json" })
        const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "projeto-editor.json"; a.click(); URL.revokeObjectURL(url)
    }
    function openProject(file: File) {
        const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(String(r.result)); if (Array.isArray(d.elements)) { history.current = []; setPage(d.page || SIZES.A4); setPageBg(d.pageBg || "#ffffff"); setElements(d.elements.map(norm)); setSelected([]); setBg(null) } } catch { setError("Projeto invalido.") } }; r.readAsText(file)
    }

    const Wpx = page.w * scale, Hpx = page.h * scale
    const isText = one && (!one.type || one.type === "text")

    return (
        <div className={full ? "fixed inset-0 z-50 overflow-auto bg-background p-3" : "space-y-3"} style={full ? {} : undefined}>
            <div className={full ? "space-y-3" : "space-y-3"}>
                {error ? <div className="app-alert rounded-xl px-4 py-3 text-sm"><span className="whitespace-pre-wrap">{error}</span></div> : null}

                {/* barra principal */}
                <div className="dashboard-shell"><div className="dashboard-inner flex flex-wrap items-center gap-2 p-3">
                    <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.currentTarget.value = "" }} />
                    <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImg(f); e.currentTarget.value = "" }} />
                    <input ref={projRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) openProject(f); e.currentTarget.value = "" }} />
                    <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Importar</Button>
                    <Button variant="outline" size="sm" onClick={addText}><Type className="size-4" /> Texto</Button>
                    <div className="relative">
                        <Button variant="outline" size="sm" onClick={() => setMenu(menu === "icon" ? "" : "icon")}><Shapes className="size-4" /> Ícone</Button>
                        {menu === "icon" ? <div className="pop grid grid-cols-5 gap-1 p-2" style={{ top: "calc(100% + 6px)", left: 0, width: 220 }}>{Object.keys(ICONS).map((n) => <button key={n} className="icon-btn" title={n} onClick={() => addIcon(n)} dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>` }} />)}</div> : null}
                    </div>
                    <div className="relative">
                        <Button variant="outline" size="sm" onClick={() => setMenu(menu === "shape" ? "" : "shape")}><Square className="size-4" /> Forma</Button>
                        {menu === "shape" ? <div className="pop flex gap-1 p-2" style={{ top: "calc(100% + 6px)", left: 0 }}><button className="icon-btn" title="Retângulo" onClick={addRect}><Square className="size-4" /></button><button className="icon-btn" title="Linha" onClick={addLine}><Slash className="size-4" /></button></div> : null}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => imgRef.current?.click()}><ImageIcon className="size-4" /> Imagem</Button>
                    <div className="mx-1 h-5 w-px bg-foreground/15" />
                    <button className="icon-btn" title="Desfazer (Ctrl+Z)" onClick={undo}><Undo2 className="size-4" /></button>
                    <button className="icon-btn" title="Refazer (Ctrl+Shift+Z)" onClick={redo}><Redo2 className="size-4" /></button>
                    <div className="mx-1 h-5 w-px bg-foreground/15" />
                    <button className="icon-btn" title="Diminuir zoom" onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)))}><ZoomOut className="size-4" /></button>
                    <button className="text-xs font-semibold tabular-nums" style={{ minWidth: 42 }} onClick={() => setZoom(1)} title="Resetar zoom">{Math.round(scale * 100)}%</button>
                    <button className="icon-btn" title="Aumentar zoom" onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}><ZoomIn className="size-4" /></button>
                    <div className="ml-auto flex items-center gap-2">
                        <button className="icon-btn" title="Salvar projeto (.json)" onClick={saveProject}><Save className="size-4" /></button>
                        <button className="icon-btn" title="Abrir projeto (.json)" onClick={() => projRef.current?.click()}><FolderOpen className="size-4" /></button>
                        <button className="icon-btn" title={full ? "Sair da tela cheia" : "Tela cheia"} onClick={() => setFull((f) => !f)}>{full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</button>
                        <div className="relative">
                            <Button size="sm" onClick={() => setMenu(menu === "export" ? "" : "export")} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Baixar <ChevronDown className="size-3" /></Button>
                            {menu === "export" ? <div className="pop flex flex-col gap-1 p-1.5" style={{ top: "calc(100% + 6px)", right: 0, width: 150 }}><button className="select-option" onClick={() => exportAs("pdf")}><FileText className="size-4" /> PDF</button><button className="select-option" onClick={() => exportAs("png")}><FileImage className="size-4" /> PNG</button></div> : null}
                        </div>
                    </div>
                </div></div>

                {/* barra de pagina */}
                <div className="dashboard-shell"><div className="dashboard-inner flex flex-wrap items-center gap-3 p-2.5 text-xs">
                    <span className="app-faint font-semibold uppercase tracking-[0.14em]">Página</span>
                    <select value={Object.keys(SIZES).find((k) => SIZES[k].w === page.w) || "A4"} onChange={(e) => { snapshot(); setPage(SIZES[e.target.value]) }} className="app-input h-8">{Object.keys(SIZES).map((k) => <option key={k} value={k}>{k}</option>)}</select>
                    <label className="flex items-center gap-1.5">Fundo <input type="color" value={pageBg} onChange={(e) => setPageBg(e.target.value)} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0" /></label>
                    <button className="icon-btn" title="Claro" onClick={() => setPageBg("#ffffff")}><Sun className="size-4" /></button>
                    <button className="icon-btn" title="Escuro" onClick={() => setPageBg("#070b0f")}><Moon className="size-4" /></button>
                    {bg ? <Button variant="outline" size="sm" onClick={() => setShowBg((s) => !s)}>{showBg ? "Ocultar fundo importado" : "Mostrar fundo importado"}</Button> : null}
                    <span className="app-faint ml-auto">{elements.length} itens • {selected.length} selecionado(s)</span>
                </div></div>

                {/* toolbar do elemento */}
                {selEls.length ? (
                    <div className="dashboard-shell"><div className="dashboard-inner flex flex-wrap items-center gap-2 p-2.5">
                        {isText ? <select value={one!.fontFamily || "Inter"} onChange={(e) => patchSel({ fontFamily: e.target.value })} className="app-input h-8 text-xs" style={{ minWidth: 150, fontFamily: `'${one!.fontFamily}',sans-serif` }}>{ALL_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: `'${f}',sans-serif` }}>{f}</option>)}</select> : null}
                        {one && one.type !== "rect" && one.type !== "image" ? (<>
                            <button className="icon-btn" title="Menor" onClick={() => patchSel({ fontSize: Math.max(2, +((one!.fontSize) - 1).toFixed(1)) })}><Minus className="size-4" /></button>
                            <span className="min-w-[40px] text-center text-sm font-semibold">{Math.round(one!.fontSize)}</span>
                            <button className="icon-btn" title="Maior" onClick={() => patchSel({ fontSize: +((one!.fontSize) + 1).toFixed(1) })}><Plus className="size-4" /></button>
                        </>) : null}
                        {isText ? (<>
                            <div className="mx-1 h-5 w-px bg-foreground/15" />
                            <button className="icon-btn" data-active={one!.bold} onClick={() => patchSel({ bold: !one!.bold })}><Bold className="size-4" /></button>
                            <button className="icon-btn" data-active={one!.italic} onClick={() => patchSel({ italic: !one!.italic })}><Italic className="size-4" /></button>
                            <button className="icon-btn" data-active={one!.underline} onClick={() => patchSel({ underline: !one!.underline })}><Underline className="size-4" /></button>
                            <button className="icon-btn" data-active={one!.align === "left"} onClick={() => patchSel({ align: "left" })}><AlignLeft className="size-4" /></button>
                            <button className="icon-btn" data-active={one!.align === "center"} onClick={() => patchSel({ align: "center" })}><AlignCenter className="size-4" /></button>
                            <button className="icon-btn" data-active={one!.align === "right"} onClick={() => patchSel({ align: "right" })}><AlignRight className="size-4" /></button>
                        </>) : null}
                        <div className="mx-1 h-5 w-px bg-foreground/15" />
                        <label className="flex items-center gap-1.5"><span className="app-faint text-xs">{one && (one.type === "rect") ? "Borda" : "Cor"}</span><input type="color" value={(selEls[0].color) || "#000000"} onChange={(e) => patchSel({ color: e.target.value })} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0" /></label>
                        {one && one.type === "rect" ? <label className="flex items-center gap-1.5"><span className="app-faint text-xs">Preenche</span><input type="color" value={one.fill || "#ffffff"} onChange={(e) => patchSel({ fill: e.target.value })} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0" /></label> : null}
                        <div className="mx-1 h-5 w-px bg-foreground/15" />
                        <label className="flex items-center gap-1.5" title="Opacidade"><span className="app-faint text-xs">Opac</span><input type="range" min={10} max={100} value={Math.round((selEls[0].opacity ?? 1) * 100)} onChange={(e) => patchSel({ opacity: +e.target.value / 100 })} className="w-16" /></label>
                        <label className="flex items-center gap-1.5" title="Rotação"><RotateCw className="size-3.5" /><input type="number" value={Math.round(selEls[0].rotation ?? 0)} onChange={(e) => patchSel({ rotation: +e.target.value })} className="app-input h-8 w-14 text-xs" /></label>
                        <div className="mx-1 h-5 w-px bg-foreground/15" />
                        <button className="icon-btn" title="Trazer p/ frente" onClick={() => zorder(true)}><BringToFront className="size-4" /></button>
                        <button className="icon-btn" title="Enviar p/ trás" onClick={() => zorder(false)}><SendToBack className="size-4" /></button>
                        {one ? <button className="icon-btn" data-active={one.locked} title={one.locked ? "Destravar" : "Travar"} onClick={toggleLock}>{one.locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}</button> : null}
                        <button className="icon-btn" title="Duplicar (Ctrl+D)" onClick={dupSel}><Copy className="size-4" /></button>
                        <button className="icon-btn" title="Apagar (Del)" onClick={delSel}><Trash2 className="size-4" /></button>
                    </div></div>
                ) : null}

                {/* canvas */}
                <div ref={wrapRef} className="dashboard-shell"><div className="dashboard-inner flex justify-center overflow-auto p-3" style={{ maxHeight: full ? "82vh" : "70vh" }}>
                    <div
                        onPointerDown={() => { setSelected([]); setEditing(null); setMenu(""); setCtx(null) }}
                        onContextMenu={(e) => e.preventDefault()}
                        style={{ position: "relative", flex: "0 0 auto", width: Wpx, height: Hpx, background: pageBg, boxShadow: "0 4px 24px rgba(0,0,0,.2)", borderRadius: 4, backgroundImage: bg && showBg ? `url(${bg})` : undefined, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }}
                    >
                        {guide.x != null ? <div style={{ position: "absolute", left: guide.x * scale, top: 0, width: 1, height: Hpx, background: "#ec4899", zIndex: 99 }} /> : null}
                        {guide.y != null ? <div style={{ position: "absolute", top: guide.y * scale, left: 0, height: 1, width: Wpx, background: "#ec4899", zIndex: 99 }} /> : null}

                        {elements.map((el) => {
                            const isSel = selected.includes(el.id)
                            const isEd = editing === el.id && (!el.type || el.type === "text")
                            const common: React.CSSProperties = {
                                position: "absolute", left: el.x * scale, top: el.y * scale,
                                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined, transformOrigin: "center",
                                opacity: el.opacity ?? 1, cursor: el.locked ? "default" : isEd ? "text" : "move",
                                outline: isSel ? "1.5px solid #3b82f6" : undefined, outlineOffset: 2, borderRadius: 2,
                            }
                            const onpd = (e: React.PointerEvent) => onDown(e, el.id)
                            const onctx = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); if (!isSel) setSelected([el.id]); const host = wrapRef.current!.getBoundingClientRect(); setCtx({ sx: e.clientX - host.left, sy: e.clientY - host.top }) }
                            let inner
                            if (el.type === "icon") inner = <div onPointerDown={onpd} onContextMenu={onctx} style={{ ...common, width: el.fontSize * scale, height: el.fontSize * scale, color: el.color }} dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[el.icon || "star"]}</svg>` }} />
                            else if (el.type === "rect") inner = <div onPointerDown={onpd} onContextMenu={onctx} style={{ ...common, width: el.w * scale, height: (el.h || 80) * scale, background: el.fill || "transparent", border: `${Math.max(1, scale)}px solid ${el.color}`, borderRadius: 4 * scale }} />
                            else if (el.type === "line") inner = <div onPointerDown={onpd} onContextMenu={onctx} style={{ ...common, width: el.w * scale, height: Math.max(1, (el.h || 2) * scale), background: el.color }} />
                            else if (el.type === "image") inner = <img onPointerDown={onpd} onContextMenu={onctx} src={el.src} alt="" style={{ ...common, width: el.w * scale, height: (el.h || 80) * scale, objectFit: "contain" }} />
                            else inner = (
                                <div onPointerDown={onpd} onContextMenu={onctx} onDoubleClick={(e) => { e.stopPropagation(); if (!el.locked) { snapshot(); setEditing(el.id); setSelected([el.id]) } }}
                                    contentEditable={isEd} suppressContentEditableWarning onBlur={(e) => { patch(el.id, { text: e.currentTarget.textContent ?? "" }); setEditing(null) }}
                                    style={{ ...common, width: el.w * scale, fontSize: el.fontSize * scale, fontWeight: el.bold ? 700 : 400, fontStyle: el.italic ? "italic" : "normal", textDecoration: el.underline ? "underline" : "none", color: el.color, textAlign: el.align, lineHeight: el.lineHeight || 1.2, fontFamily: `'${el.fontFamily || "Inter"}','Inter',Arial,sans-serif`, whiteSpace: "pre-wrap", wordBreak: "break-word", userSelect: isEd ? "text" : "none" }}
                                >{el.text}</div>
                            )
                            return (
                                <div key={el.id}>
                                    {inner}
                                    {isSel && selected.length === 1 && !el.locked && !isEd ? (
                                        <div onPointerDown={(e) => onResize(e, el)} title="Redimensionar"
                                            style={{ position: "absolute", left: (el.x + (el.type === "icon" ? el.fontSize : el.w)) * scale - 5, top: (el.y + (el.type === "icon" ? el.fontSize : el.type === "text" ? 0 : (el.h || 80))) * scale - 5, width: 11, height: 11, background: "#3b82f6", border: "2px solid #fff", borderRadius: 3, cursor: "nwse-resize", zIndex: 100 }} />
                                    ) : null}
                                </div>
                            )
                        })}

                        {ctx ? (
                            <div className="pop flex flex-col gap-1 p-1.5" style={{ left: ctx.sx, top: ctx.sy, width: 168, zIndex: 101 }} onPointerDown={(e) => e.stopPropagation()}>
                                <button className="select-option" onClick={() => { dupSel(); setCtx(null) }}><Copy className="size-4" /> Duplicar</button>
                                <button className="select-option" onClick={() => { zorder(true); setCtx(null) }}><BringToFront className="size-4" /> Trazer p/ frente</button>
                                <button className="select-option" onClick={() => { zorder(false); setCtx(null) }}><SendToBack className="size-4" /> Enviar p/ trás</button>
                                <button className="select-option" onClick={() => { toggleLock(); setCtx(null) }}><Lock className="size-4" /> Travar/Destravar</button>
                                <button className="select-option" onClick={() => { delSel(); setCtx(null) }}><Trash2 className="size-4" /> Apagar</button>
                            </div>
                        ) : null}
                    </div>
                </div></div>

                <p className="app-faint text-xs">
                    <b>Importar</b> PDF • <b>Texto/Ícone/Forma/Imagem</b> • arraste (com guias de alinhamento) • <b>2 cliques</b> edita texto • alça azul redimensiona •
                    <b> Shift+clique</b> multi-seleção • <b>Ctrl+C/V/D</b>, <b>Del</b>, <b>setas</b>, <b>Ctrl+Z/Y</b>, <b>Ctrl+A</b> • botão direito = menu •
                    qualquer <b>fonte</b>, opacidade, rotação, camadas, lock • <b>Tela cheia</b>, zoom, salvar/abrir projeto, autosave • <b>Baixar</b> PDF/PNG.
                </p>
            </div>
        </div>
    )
}
