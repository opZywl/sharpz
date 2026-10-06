"use client"

import {
    AlignCenter, AlignLeft, AlignRight, Bold, BringToFront, ChevronDown, Copy, Download,
    FileImage, FileText, FolderOpen, Image as ImageIcon, Italic, Loader2, Lock, Maximize2,
    Minimize2, Minus, Moon, Plus, Redo2, RotateCw, Save, SendToBack, Settings2, Shapes, Slash, Square,
    Sun, Trash2, Type, Underline, Undo2, Unlock, Upload, ZoomIn, ZoomOut,
} from "lucide-react"
import { createElement, useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { EditorElement, ElType, importDoc, renderHtml, renderPng } from "@/lib/editor-api"
import { GOOGLE_FONTS, buildEditorHtml, safePage } from "@/lib/editor-html"
import { ICON_NAMES, iconShapes, iconSvgInner } from "@/lib/editor-icons"
import { dictionaries, errorText, pick, type Messages } from "@/lib/i18n"
import { useI18n, useMessage } from "@/lib/i18n/provider"

type PageSize = "A4" | "Letter"

const SIZES: Record<PageSize, { w: number; h: number }> = {
    A4: { w: 595.276, h: 841.89 },
    Letter: { w: 612, h: 792 },
}
const SIZE_KEYS = Object.keys(SIZES) as PageSize[]
const SYSTEM_FONTS = ["Arial", "Georgia", "Times New Roman", "Courier New", "Verdana"]
const ALL_FONTS = [...GOOGLE_FONTS, ...SYSTEM_FONTS]
const LS_KEY = "sharpz-editor-doc-v1"

function IconSvg({ name, size }: { name: unknown; size: string }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            {iconShapes(name).map((shape, index) => createElement(shape.tag, { key: index, ...shape.attrs }))}
        </svg>
    )
}

function seedTexts(m: Messages): Record<string, string> {
    return { s1: "LUCAS LIMA", s2: m.editor.seedRole, s3: m.editor.seedHint }
}

function seed(m: Messages): EditorElement[] {
    const texts = seedTexts(m)
    return [
        { id: "s1", type: "text", text: texts.s1, x: 40, y: 50, w: 320, fontSize: 32, bold: true, italic: false, color: "#1b2740", align: "left", fontFamily: "Plus Jakarta Sans" },
        { id: "s2", type: "text", text: texts.s2, x: 40, y: 98, w: 320, fontSize: 11, bold: false, italic: false, color: "#5b6472", align: "left", fontFamily: "Inter" },
        { id: "s3", type: "text", text: texts.s3, x: 40, y: 138, w: 380, fontSize: 10, bold: false, italic: true, color: "#8b94a3", align: "left", fontFamily: "Inter" },
    ]
}

let _uid = 0
const uid = () => `el${Date.now().toString(36)}${(_uid++).toString(36)}`
const norm = (e: Partial<EditorElement> & { id: string }): EditorElement => ({
    type: "text", text: "", x: 0, y: 0, w: 120, fontSize: 12, bold: false, italic: false,
    color: "#1a2436", align: "left", fontFamily: "Inter", opacity: 1, rotation: 0, ...e,
})

export function EditorTool() {
    const { t, fmt, resolve } = useI18n()
    const [elements, setElements] = useState<EditorElement[]>(() => seed(t))
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
    const [error, setError] = useMessage()
    const [menu, setMenu] = useState<"" | "icon" | "shape" | "export" | "page">("")
    const [guide, setGuide] = useState<{ x?: number; y?: number }>({})
    const [ctx, setCtx] = useState<{ sx: number; sy: number } | null>(null)

    const wrapRef = useRef<HTMLDivElement | null>(null)
    const canvasRef = useRef<HTMLDivElement | null>(null)
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

    useEffect(() => {
        const id = "editor-google-fonts"
        if (document.getElementById(id)) return
        const l = document.createElement("link"); l.id = id; l.rel = "stylesheet"
        l.href = "https://fonts.googleapis.com/css2?" + GOOGLE_FONTS.map((f) => "family=" + f.replace(/ /g, "+") + ":ital,wght@0,400;0,700;1,400;1,700").join("&") + "&display=swap"
        document.head.appendChild(l)
    }, [])

    useEffect(() => {
        try {
            const raw = localStorage.getItem(LS_KEY)
            if (raw) {
                const d = JSON.parse(raw)
                if (Array.isArray(d.elements) && d.elements.length) {
                    setElements(d.elements.map(norm)); setPage(d.page || SIZES.A4); setPageBg(d.pageBg || "#ffffff")
                }
            }
        } catch { return }
    }, [])

    useEffect(() => {
        const target = seedTexts(t)
        const known = Object.values(dictionaries).map(seedTexts)
        setElements((current) => {
            let changed = false
            const next = current.map((el) => {
                const text = target[el.id]
                if (text === undefined || el.text === text || !known.some((texts) => texts[el.id] === el.text)) return el
                changed = true
                return { ...el, text }
            })
            return changed ? next : current
        })
    }, [t])

    useEffect(() => {
        const timer = setTimeout(() => {
            try { localStorage.setItem(LS_KEY, JSON.stringify({ page, pageBg, elements })) } catch { return }
        }, 600)
        return () => clearTimeout(timer)
    }, [elements, page, pageBg])

    useEffect(() => {
        const el = canvasRef.current
        if (!el) return
        const measure = () => {
            const cw = el.clientWidth, ch = el.clientHeight
            if (cw < 20 || ch < 20) return
            setFit(Math.min(1.8, Math.max(0.2, Math.min((cw - 36) / page.w, (ch - 36) / page.h))))
        }
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
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
    const addText = () => add({ type: "text", text: t.editor.newText, w: 220, fontSize: 16, color: pageBg === "#ffffff" ? "#1a2436" : "#f3f5f8" })
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
                for (const target of xs) { if (Math.abs(cx - target) < th) { dx += target - cx; g.x = target; break } }
                for (const target of ys) { if (Math.abs(cy - target) < th) { dy += target - cy; g.y = target; break } }
            }
            setGuide(g)
            setElements((c) => c.map((x) => (d.pos[x.id] ? { ...x, x: Math.round(d.pos[x.id].x + dx), y: Math.round(d.pos[x.id].y + dy) } : x)))
        }
        const up = () => { drag.current = null; setGuide({}); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up) }
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up)
    }

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
            setPage(d.page); setElements((d.elements.length ? d.elements : seed(t)).map(norm))
            setBg(d.bg); setShowBg(false); setPageBg(d.page_bg || "#ffffff"); setZoom(1); setSelected([])
        } catch (err) { setError(errorText(err, (m) => m.editor.importFailed)) } finally { setBusy(false) }
    }

    function buildHtml() {
        return buildEditorHtml({ elements, page, pageBg }, iconSvgInner)
    }

    async function exportAs(kind: "pdf" | "png") {
        setBusy(true); setError(null); setMenu("")
        try {
            const size = safePage(page)
            const blob = kind === "pdf" ? await renderHtml(buildHtml()) : await renderPng(buildHtml(), size.w, size.h)
            const url = URL.createObjectURL(blob); const a = document.createElement("a")
            a.href = url; a.download = `${t.editor.exportName}.${kind}`; a.click(); URL.revokeObjectURL(url)
        } catch (err) { setError(errorText(err, (m) => m.editor.exportFailed)) } finally { setBusy(false) }
    }

    function saveProject() {
        const blob = new Blob([JSON.stringify({ page, pageBg, elements }, null, 2)], { type: "application/json" })
        const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = t.editor.projectName; a.click(); URL.revokeObjectURL(url)
    }
    function openProject(file: File) {
        const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(String(r.result)); if (Array.isArray(d.elements)) { history.current = []; setPage(d.page || SIZES.A4); setPageBg(d.pageBg || "#ffffff"); setElements(d.elements.map(norm)); setSelected([]); setBg(null) } } catch { setError((m) => m.editor.invalidProject) } }; r.readAsText(file)
    }

    const Wpx = page.w * scale, Hpx = page.h * scale
    const textSel = selEls.filter((e) => !e.type || e.type === "text")
    const repText = textSel[0]
    const isText = textSel.length > 0
    const sizeRep = selEls.find((e) => e.type !== "rect" && e.type !== "image")

    return (
        <div className={full ? "fixed inset-0 z-[60] bg-background p-3" : ""}>
            <div className="flex flex-col gap-2" style={{ height: full ? "100%" : "80vh" }}>
                {error ? <div className="app-alert rounded-xl px-4 py-3 text-sm shrink-0"><span className="whitespace-pre-wrap">{resolve(error)}</span></div> : null}

                <div className="dashboard-shell shrink-0"><div className="dashboard-inner flex flex-wrap items-center gap-2 p-2">
                    <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.currentTarget.value = "" }} />
                    <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImg(f); e.currentTarget.value = "" }} />
                    <input ref={projRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) openProject(f); e.currentTarget.value = "" }} />
                    <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {t.editor.import}</Button>
                    <Button variant="outline" size="sm" onClick={addText}><Type className="size-4" /> {t.editor.text}</Button>
                    <div className="relative">
                        <Button variant="outline" size="sm" onClick={() => setMenu(menu === "icon" ? "" : "icon")}><Shapes className="size-4" /> {t.editor.icon}</Button>
                        {menu === "icon" ? <div className="pop grid grid-cols-5 gap-1 p-2" style={{ top: "calc(100% + 6px)", left: 0, width: 220 }}>{ICON_NAMES.map((n) => <button key={n} className="icon-btn" title={pick(t.editor.icons, n) ?? n} aria-label={pick(t.editor.icons, n) ?? n} onClick={() => addIcon(n)}><IconSvg name={n} size="16" /></button>)}</div> : null}
                    </div>
                    <div className="relative">
                        <Button variant="outline" size="sm" onClick={() => setMenu(menu === "shape" ? "" : "shape")}><Square className="size-4" /> {t.editor.shape}</Button>
                        {menu === "shape" ? <div className="pop flex gap-1 p-2" style={{ top: "calc(100% + 6px)", left: 0 }}><button className="icon-btn" title={t.editor.rectangle} onClick={addRect}><Square className="size-4" /></button><button className="icon-btn" title={t.editor.line} onClick={addLine}><Slash className="size-4" /></button></div> : null}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => imgRef.current?.click()}><ImageIcon className="size-4" /> {t.editor.image}</Button>
                    <div className="mx-1 h-5 w-px bg-foreground/15" />
                    <button className="icon-btn" title={t.editor.undo} onClick={undo}><Undo2 className="size-4" /></button>
                    <button className="icon-btn" title={t.editor.redo} onClick={redo}><Redo2 className="size-4" /></button>
                    <div className="mx-1 h-5 w-px bg-foreground/15" />
                    <button className="icon-btn" title={t.editor.zoomOut} onClick={() => setZoom((z) => Math.max(0.2, +(z - 0.2).toFixed(2)))}><ZoomOut className="size-4" /></button>
                    <button className="text-xs font-semibold tabular-nums" style={{ minWidth: 42 }} onClick={() => setZoom(1)} title={t.editor.zoomReset}>{fmt.percent(scale)}</button>
                    <button className="icon-btn" title={t.editor.zoomIn} onClick={() => setZoom((z) => Math.min(8, +(z + 0.2).toFixed(2)))}><ZoomIn className="size-4" /></button>
                    <div className="ml-auto flex items-center gap-1.5">
                        <span className="app-faint mr-1 hidden text-xs sm:inline">{t.editor.items(elements.length)}{selected.length ? t.editor.selected(selected.length) : ""}</span>
                        <div className="relative">
                            <Button variant="outline" size="sm" onClick={() => setMenu(menu === "page" ? "" : "page")}><Settings2 className="size-4" /> {t.editor.page}</Button>
                            {menu === "page" ? <div className="pop flex flex-col gap-2.5 p-3 text-xs" style={{ top: "calc(100% + 6px)", right: 0, width: 234 }}>
                                <label className="flex items-center justify-between gap-2">{t.editor.size} <select value={SIZE_KEYS.find((k) => SIZES[k].w === page.w) || "A4"} onChange={(e) => { snapshot(); setPage(SIZES[e.target.value as PageSize]) }} className="app-input h-8" style={{ width: 120 }}>{SIZE_KEYS.map((k) => <option key={k} value={k}>{t.editor.sizes[k]}</option>)}</select></label>
                                <label className="flex items-center justify-between gap-2">{t.fields.bgColor} <span className="flex items-center gap-1"><input type="color" value={pageBg} onChange={(e) => setPageBg(e.target.value)} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0" /><button className="icon-btn" title={t.editor.light} onClick={() => setPageBg("#ffffff")}><Sun className="size-3.5" /></button><button className="icon-btn" title={t.editor.dark} onClick={() => setPageBg("#070b0f")}><Moon className="size-3.5" /></button></span></label>
                                {bg ? <button className="select-option" onClick={() => setShowBg((s) => !s)}>{showBg ? t.editor.hideGuide : t.editor.showGuide}</button> : null}
                            </div> : null}
                        </div>
                        <button className="icon-btn" title={t.editor.saveProject} onClick={saveProject}><Save className="size-4" /></button>
                        <button className="icon-btn" title={t.editor.openProject} onClick={() => projRef.current?.click()}><FolderOpen className="size-4" /></button>
                        <button className="icon-btn" title={full ? t.editor.exitFullscreen : t.editor.fullscreen} onClick={() => setFull((f) => !f)}>{full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</button>
                        <div className="relative">
                            <Button size="sm" onClick={() => setMenu(menu === "export" ? "" : "export")} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} {t.common.download} <ChevronDown className="size-3" /></Button>
                            {menu === "export" ? <div className="pop flex flex-col gap-1 p-1.5" style={{ top: "calc(100% + 6px)", right: 0, width: 150 }}><button className="select-option" onClick={() => exportAs("pdf")}><FileText className="size-4" /> PDF</button><button className="select-option" onClick={() => exportAs("png")}><FileImage className="size-4" /> PNG</button></div> : null}
                        </div>
                    </div>
                </div></div>

                {selEls.length ? (
                    <div className="dashboard-shell shrink-0"><div className="dashboard-inner flex flex-wrap items-center gap-2 p-2.5">
                        {isText ? <select value={repText?.fontFamily || "Inter"} onChange={(e) => patchSel({ fontFamily: e.target.value })} className="app-input h-8 text-xs" style={{ minWidth: 150, fontFamily: `'${repText?.fontFamily}',sans-serif` }}>{ALL_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: `'${f}',sans-serif` }}>{f}</option>)}</select> : null}
                        {sizeRep ? (<>
                            <button className="icon-btn" title={t.editor.smaller} onClick={() => patchSel({ fontSize: Math.max(2, +(sizeRep.fontSize - 1).toFixed(1)) })}><Minus className="size-4" /></button>
                            <span className="min-w-[40px] text-center text-sm font-semibold">{fmt.number(Math.round(sizeRep.fontSize))}</span>
                            <button className="icon-btn" title={t.editor.larger} onClick={() => patchSel({ fontSize: +(sizeRep.fontSize + 1).toFixed(1) })}><Plus className="size-4" /></button>
                        </>) : null}
                        {isText ? (<>
                            <div className="mx-1 h-5 w-px bg-foreground/15" />
                            <button className="icon-btn" data-active={repText?.bold} onClick={() => patchSel({ bold: !repText?.bold })}><Bold className="size-4" /></button>
                            <button className="icon-btn" data-active={repText?.italic} onClick={() => patchSel({ italic: !repText?.italic })}><Italic className="size-4" /></button>
                            <button className="icon-btn" data-active={repText?.underline} onClick={() => patchSel({ underline: !repText?.underline })}><Underline className="size-4" /></button>
                            <button className="icon-btn" data-active={repText?.align === "left"} onClick={() => patchSel({ align: "left" })}><AlignLeft className="size-4" /></button>
                            <button className="icon-btn" data-active={repText?.align === "center"} onClick={() => patchSel({ align: "center" })}><AlignCenter className="size-4" /></button>
                            <button className="icon-btn" data-active={repText?.align === "right"} onClick={() => patchSel({ align: "right" })}><AlignRight className="size-4" /></button>
                        </>) : null}
                        <div className="mx-1 h-5 w-px bg-foreground/15" />
                        <label className="flex items-center gap-1.5"><span className="app-faint text-xs">{one && (one.type === "rect") ? t.editor.border : t.editor.color}</span><input type="color" value={(selEls[0].color) || "#000000"} onChange={(e) => patchSel({ color: e.target.value })} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0" /></label>
                        {one && one.type === "rect" ? <label className="flex items-center gap-1.5"><span className="app-faint text-xs">{t.editor.fill}</span><input type="color" value={one.fill || "#ffffff"} onChange={(e) => patchSel({ fill: e.target.value })} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0" /></label> : null}
                        <div className="mx-1 h-5 w-px bg-foreground/15" />
                        <label className="flex items-center gap-1.5" title={t.editor.opacity}><span className="app-faint text-xs">{t.editor.opacityShort}</span><input type="range" min={10} max={100} value={Math.round((selEls[0].opacity ?? 1) * 100)} onChange={(e) => patchSel({ opacity: +e.target.value / 100 })} className="w-16" /></label>
                        <label className="flex items-center gap-1.5" title={t.editor.rotation}><RotateCw className="size-3.5" /><input type="number" value={Math.round(selEls[0].rotation ?? 0)} onChange={(e) => patchSel({ rotation: +e.target.value })} className="app-input h-8 w-14 text-xs" /></label>
                        <div className="mx-1 h-5 w-px bg-foreground/15" />
                        <button className="icon-btn" title={t.editor.bringFront} onClick={() => zorder(true)}><BringToFront className="size-4" /></button>
                        <button className="icon-btn" title={t.editor.sendBack} onClick={() => zorder(false)}><SendToBack className="size-4" /></button>
                        {one ? <button className="icon-btn" data-active={one.locked} title={one.locked ? t.editor.unlock : t.editor.lock} onClick={toggleLock}>{one.locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}</button> : null}
                        <button className="icon-btn" title={t.editor.duplicateShortcut} onClick={dupSel}><Copy className="size-4" /></button>
                        <button className="icon-btn" title={t.editor.deleteShortcut} onClick={delSel}><Trash2 className="size-4" /></button>
                    </div></div>
                ) : null}

                <div className="dashboard-shell flex-1 min-h-0"><div ref={canvasRef} className="dashboard-inner flex h-full overflow-auto p-4">
                    <div ref={wrapRef}
                        onPointerDown={() => { setSelected([]); setEditing(null); setMenu(""); setCtx(null) }}
                        onContextMenu={(e) => e.preventDefault()}
                        style={{ position: "relative", flex: "0 0 auto", margin: "auto", width: Wpx, height: Hpx, backgroundColor: pageBg, boxShadow: "0 4px 24px rgba(0,0,0,.2)", borderRadius: 4, backgroundImage: bg && showBg ? `url(${bg})` : undefined, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }}
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
                            if (el.type === "icon") inner = <div onPointerDown={onpd} onContextMenu={onctx} style={{ ...common, width: el.fontSize * scale, height: el.fontSize * scale, color: el.color }}><IconSvg name={el.icon} size="100%" /></div>
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
                                        <div onPointerDown={(e) => onResize(e, el)} title={t.editor.resize}
                                            style={{ position: "absolute", left: (el.x + (el.type === "icon" ? el.fontSize : el.w)) * scale - 5, top: (el.y + (el.type === "icon" ? el.fontSize : el.type === "text" ? 0 : (el.h || 80))) * scale - 5, width: 11, height: 11, background: "#3b82f6", border: "2px solid #fff", borderRadius: 3, cursor: "nwse-resize", zIndex: 100 }} />
                                    ) : null}
                                </div>
                            )
                        })}

                        {ctx ? (
                            <div className="pop flex flex-col gap-1 p-1.5" style={{ left: ctx.sx, top: ctx.sy, width: 168, zIndex: 101 }} onPointerDown={(e) => e.stopPropagation()}>
                                <button className="select-option" onClick={() => { dupSel(); setCtx(null) }}><Copy className="size-4" /> {t.editor.duplicate}</button>
                                <button className="select-option" onClick={() => { zorder(true); setCtx(null) }}><BringToFront className="size-4" /> {t.editor.bringFront}</button>
                                <button className="select-option" onClick={() => { zorder(false); setCtx(null) }}><SendToBack className="size-4" /> {t.editor.sendBack}</button>
                                <button className="select-option" onClick={() => { toggleLock(); setCtx(null) }}><Lock className="size-4" /> {t.editor.toggleLock}</button>
                                <button className="select-option" onClick={() => { delSel(); setCtx(null) }}><Trash2 className="size-4" /> {t.editor.delete}</button>
                            </div>
                        ) : null}
                    </div>
                </div></div>

                {!full ? (
                    <p className="app-faint shrink-0 text-xs">
                        {t.editor.help.map((part) => (
                            <span key={part.bold}>
                                <b>{part.bold}</b>
                                {part.text}
                            </span>
                        ))}
                    </p>
                ) : null}
            </div>
        </div>
    )
}
