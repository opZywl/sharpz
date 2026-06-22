"use client"

import {
    AlignCenter, AlignLeft, AlignRight, Bold, Copy, Download, Italic,
    Loader2, Minus, Moon, Plus, Redo2, Shapes, Sun, Trash2, Type, Undo2, Upload,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { EditorElement, importDoc, renderHtml } from "@/lib/editor-api"

type Theme = "light" | "dark"

const A4 = { w: 595.276, h: 841.89 }

const GOOGLE_FONTS = [
    "Inter", "Plus Jakarta Sans", "Roboto", "Poppins", "Montserrat", "Lato",
    "Raleway", "Oswald", "Merriweather", "Playfair Display", "Work Sans",
    "Manrope", "Nunito", "Source Sans 3",
]
const SYSTEM_FONTS = ["Arial", "Georgia", "Times New Roman", "Courier New", "Verdana"]
const ALL_FONTS = [...GOOGLE_FONTS, ...SYSTEM_FONTS]

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
    { id: "s3", type: "text", text: "Importe um PDF, ou clique 2x pra editar e arraste pra mover.", x: 40, y: 138, w: 360, fontSize: 10, bold: false, italic: true, color: "#8b94a3", align: "left", fontFamily: "Inter" },
]

let _uid = 0
const uid = () => `el${Date.now().toString(36)}${(_uid++).toString(36)}`
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const isGoogle = (f?: string) => GOOGLE_FONTS.includes(f || "")

export function EditorTool() {
    const [elements, setElements] = useState<EditorElement[]>(SEED)
    const [page, setPage] = useState({ w: A4.w, h: A4.h })
    const [theme, setTheme] = useState<Theme>("light")
    const [bg, setBg] = useState<string | null>(null)
    const [showBg, setShowBg] = useState(true)
    const [selected, setSelected] = useState<string | null>(null)
    const [editing, setEditing] = useState<string | null>(null)
    const [scale, setScale] = useState(0.8)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [iconMenu, setIconMenu] = useState(false)

    const wrapRef = useRef<HTMLDivElement | null>(null)
    const drag = useRef<{ id: string; px: number; py: number; ex: number; ey: number; moved: boolean } | null>(null)
    const fileRef = useRef<HTMLInputElement | null>(null)
    const clip = useRef<EditorElement | null>(null)
    const history = useRef<EditorElement[][]>([])
    const future = useRef<EditorElement[][]>([])
    const elesRef = useRef<EditorElement[]>(elements)
    elesRef.current = elements

    // carrega as fontes do Google no editor
    useEffect(() => {
        const id = "editor-google-fonts"
        if (document.getElementById(id)) return
        const link = document.createElement("link")
        link.id = id
        link.rel = "stylesheet"
        link.href = "https://fonts.googleapis.com/css2?" +
            GOOGLE_FONTS.map((f) => "family=" + f.replace(/ /g, "+") + ":ital,wght@0,400;0,700;1,400;1,700").join("&") +
            "&display=swap"
        document.head.appendChild(link)
    }, [])

    useEffect(() => {
        function measure() {
            const w = wrapRef.current?.clientWidth ?? 700
            setScale(Math.min(1.3, Math.max(0.4, (w - 24) / page.w)))
        }
        measure()
        window.addEventListener("resize", measure)
        return () => window.removeEventListener("resize", measure)
    }, [page.w])

    const sel = elements.find((e) => e.id === selected) ?? null

    const snapshot = useCallback(() => {
        history.current.push(elesRef.current.map((e) => ({ ...e })))
        if (history.current.length > 40) history.current.shift()
        future.current = []
    }, [])

    const patch = useCallback((id: string, p: Partial<EditorElement>) => {
        setElements((cur) => cur.map((e) => (e.id === id ? { ...e, ...p } : e)))
    }, [])

    function undo() {
        const prev = history.current.pop()
        if (!prev) return
        future.current.push(elesRef.current.map((e) => ({ ...e })))
        setElements(prev)
    }
    function redo() {
        const nxt = future.current.pop()
        if (!nxt) return
        history.current.push(elesRef.current.map((e) => ({ ...e })))
        setElements(nxt)
    }

    function onPointerDown(e: React.PointerEvent, id: string) {
        if (editing === id) return
        e.preventDefault()
        setSelected(id)
        const el = elesRef.current.find((x) => x.id === id)
        if (!el) return
        drag.current = { id, px: e.clientX, py: e.clientY, ex: el.x, ey: el.y, moved: false }
        const move = (ev: PointerEvent) => {
            const d = drag.current
            if (!d) return
            if (!d.moved) { snapshot(); d.moved = true }
            patch(d.id, {
                x: Math.round(d.ex + (ev.clientX - d.px) / scale),
                y: Math.round(d.ey + (ev.clientY - d.py) / scale),
            })
        }
        const up = () => {
            drag.current = null
            window.removeEventListener("pointermove", move)
            window.removeEventListener("pointerup", up)
        }
        window.addEventListener("pointermove", move)
        window.addEventListener("pointerup", up)
    }

    function addText() {
        snapshot()
        const id = uid()
        setElements((c) => [...c, { id, type: "text", text: "Novo texto", x: 60, y: 60, w: 220, fontSize: 14, bold: false, italic: false, color: theme === "dark" ? "#f3f5f8" : "#1a2436", align: "left", fontFamily: "Inter" }])
        setSelected(id)
    }
    function addIcon(name: string) {
        snapshot()
        const id = uid()
        setElements((c) => [...c, { id, type: "icon", icon: name, text: "", x: 70, y: 70, w: 28, fontSize: 28, bold: false, italic: false, color: theme === "dark" ? "#e8edf6" : "#1b2740", align: "left" }])
        setSelected(id)
        setIconMenu(false)
    }
    function dup(el: EditorElement | null) {
        if (!el) return
        snapshot()
        const id = uid()
        setElements((c) => [...c, { ...el, id, x: el.x + 14, y: el.y + 14 }])
        setSelected(id)
    }
    function del(id: string | null) {
        if (!id) return
        snapshot()
        setElements((c) => c.filter((e) => e.id !== id))
        setSelected(null)
    }

    // atalhos de teclado
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const tag = (e.target as HTMLElement)?.tagName
            if (editing || tag === "INPUT" || tag === "TEXTAREA") {
                if (e.key === "Escape") { (e.target as HTMLElement)?.blur?.(); setEditing(null) }
                return
            }
            const mod = e.ctrlKey || e.metaKey
            if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) { redo() } else { undo() } return }
            if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return }
            if (mod && e.key.toLowerCase() === "c") { if (sel) clip.current = { ...sel }; return }
            if (mod && e.key.toLowerCase() === "v") {
                if (clip.current) { snapshot(); const id = uid(); const n = { ...clip.current, id, x: clip.current.x + 16, y: clip.current.y + 16 }; setElements((c) => [...c, n]); setSelected(id) }
                return
            }
            if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); dup(sel); return }
            if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); del(sel.id); return }
            if (e.key === "Escape") { setSelected(null); return }
            if (sel && e.key.startsWith("Arrow")) {
                e.preventDefault()
                const step = e.shiftKey ? 10 : 1
                const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0
                const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0
                patch(sel.id, { x: sel.x + dx, y: sel.y + dy })
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [editing, sel, patch, snapshot])

    async function onImport(file: File) {
        setBusy(true); setError(null)
        try {
            const doc = await importDoc(file, true)
            history.current = []; future.current = []
            setPage(doc.page)
            setElements((doc.elements.length ? doc.elements : SEED).map((e) => ({ ...e, type: e.type || "text", fontFamily: e.fontFamily || "Inter" })))
            setBg(doc.bg); setShowBg(Boolean(doc.bg)); setSelected(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Falha ao importar.")
        } finally { setBusy(false) }
    }

    function buildHtml() {
        const used = Array.from(new Set(elements.map((e) => e.fontFamily).filter(isGoogle)))
        const link = used.length
            ? `<link href="https://fonts.googleapis.com/css2?${used.map((f) => "family=" + (f as string).replace(/ /g, "+") + ":ital,wght@0,400;0,700;1,400;1,700").join("&")}&display=swap" rel="stylesheet">`
            : ""
        const canvasBg = theme === "dark" ? "#070b0f" : "#ffffff"
        const body = elements.map((el) => {
            const base = `position:absolute;left:${el.x}pt;top:${el.y}pt;`
            if (el.type === "icon") {
                return `<div style="${base}width:${el.fontSize}pt;height:${el.fontSize}pt;color:${el.color}"><svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[el.icon || "star"]}</svg></div>`
            }
            return `<div style="${base}width:${el.w}pt;font-size:${el.fontSize}pt;font-weight:${el.bold ? 700 : 400};font-style:${el.italic ? "italic" : "normal"};color:${el.color};text-align:${el.align};font-family:'${el.fontFamily || "Inter"}',Arial,sans-serif;line-height:1.2;white-space:pre-wrap;word-break:break-word">${esc(el.text)}</div>`
        }).join("")
        return `<!doctype html><html><head><meta charset="utf-8">${link}<style>@page{size:A4;margin:0}*{margin:0;padding:0;box-sizing:border-box}html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{position:relative;width:${page.w}pt;height:${page.h}pt;background:${canvasBg};overflow:hidden}</style></head><body><div class="page">${body}</div></body></html>`
    }

    async function onExport() {
        setBusy(true); setError(null)
        try {
            const blob = await renderHtml(buildHtml())
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url; a.download = "documento-editado.pdf"; a.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Falha ao exportar.")
        } finally { setBusy(false) }
    }

    const canvasBg = theme === "dark" ? "#070b0f" : "#ffffff"

    return (
        <div className="space-y-3">
            {error ? <div className="app-alert rounded-xl px-4 py-3 text-sm"><span className="whitespace-pre-wrap">{error}</span></div> : null}

            <div className="dashboard-shell"><div className="dashboard-inner flex flex-wrap items-center gap-2 p-3">
                <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.currentTarget.value = "" }} />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Importar
                </Button>
                <Button variant="outline" size="sm" onClick={addText}><Type className="size-4" /> Texto</Button>
                <div className="relative">
                    <Button variant="outline" size="sm" onClick={() => setIconMenu((v) => !v)}><Shapes className="size-4" /> Ícone</Button>
                    {iconMenu ? (
                        <div className="select-menu absolute z-30 mt-1 grid grid-cols-5 gap-1 p-2" style={{ width: 210 }}>
                            {Object.keys(ICONS).map((name) => (
                                <button key={name} type="button" className="icon-btn" title={name} onClick={() => addIcon(name)}
                                    dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>` }} />
                            ))}
                        </div>
                    ) : null}
                </div>
                <div className="mx-1 h-5 w-px bg-foreground/15" />
                <button className="icon-btn" title="Desfazer (Ctrl+Z)" onClick={undo}><Undo2 className="size-4" /></button>
                <button className="icon-btn" title="Refazer (Ctrl+Shift+Z)" onClick={redo}><Redo2 className="size-4" /></button>
                <Button variant="outline" size="sm" onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}>
                    {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />} {theme === "light" ? "Escuro" : "Claro"}
                </Button>
                {bg ? <Button variant="outline" size="sm" onClick={() => setShowBg((s) => !s)}>{showBg ? "Ocultar fundo" : "Mostrar fundo"}</Button> : null}
                <div className="ml-auto flex items-center gap-2">
                    <span className="app-faint text-xs">A4 • {elements.length} itens</span>
                    <Button size="sm" onClick={onExport} disabled={busy}>
                        {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Baixar PDF
                    </Button>
                </div>
            </div></div>

            {sel ? (
                <div className="dashboard-shell"><div className="dashboard-inner flex flex-wrap items-center gap-2 p-2.5">
                    {sel.type !== "icon" ? (
                        <select value={sel.fontFamily || "Inter"} onChange={(e) => { snapshot(); patch(sel.id, { fontFamily: e.target.value }) }}
                            className="app-input h-8 text-xs" style={{ minWidth: 150, fontFamily: `'${sel.fontFamily}',sans-serif` }}>
                            {ALL_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: `'${f}',sans-serif` }}>{f}</option>)}
                        </select>
                    ) : null}
                    <button className="icon-btn" title="Menor" onClick={() => { snapshot(); patch(sel.id, { fontSize: Math.max(4, +(sel.fontSize - 1).toFixed(1)) }) }}><Minus className="size-4" /></button>
                    <span className="min-w-[40px] text-center text-sm font-semibold">{Math.round(sel.fontSize)}</span>
                    <button className="icon-btn" title="Maior" onClick={() => { snapshot(); patch(sel.id, { fontSize: +(sel.fontSize + 1).toFixed(1) }) }}><Plus className="size-4" /></button>
                    {sel.type !== "icon" ? (<>
                        <div className="mx-1 h-5 w-px bg-foreground/15" />
                        <button className="icon-btn" data-active={sel.bold} onClick={() => { snapshot(); patch(sel.id, { bold: !sel.bold }) }}><Bold className="size-4" /></button>
                        <button className="icon-btn" data-active={sel.italic} onClick={() => { snapshot(); patch(sel.id, { italic: !sel.italic }) }}><Italic className="size-4" /></button>
                        <div className="mx-1 h-5 w-px bg-foreground/15" />
                        <button className="icon-btn" data-active={sel.align === "left"} onClick={() => { snapshot(); patch(sel.id, { align: "left" }) }}><AlignLeft className="size-4" /></button>
                        <button className="icon-btn" data-active={sel.align === "center"} onClick={() => { snapshot(); patch(sel.id, { align: "center" }) }}><AlignCenter className="size-4" /></button>
                        <button className="icon-btn" data-active={sel.align === "right"} onClick={() => { snapshot(); patch(sel.id, { align: "right" }) }}><AlignRight className="size-4" /></button>
                    </>) : null}
                    <div className="mx-1 h-5 w-px bg-foreground/15" />
                    <label className="flex items-center gap-1.5"><span className="app-faint text-xs">Cor</span>
                        <input type="color" value={sel.color} onChange={(e) => patch(sel.id, { color: e.target.value })} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0" /></label>
                    <div className="mx-1 h-5 w-px bg-foreground/15" />
                    <button className="icon-btn" title="Duplicar (Ctrl+D)" onClick={() => dup(sel)}><Copy className="size-4" /></button>
                    <button className="icon-btn" title="Apagar (Del)" onClick={() => del(sel.id)}><Trash2 className="size-4" /></button>
                </div></div>
            ) : null}

            <div ref={wrapRef} className="dashboard-shell"><div className="dashboard-inner flex justify-center overflow-auto p-3" style={{ maxHeight: "72vh" }}>
                <div
                    onPointerDown={() => { setSelected(null); setEditing(null); setIconMenu(false) }}
                    style={{
                        position: "relative", flex: "0 0 auto",
                        width: page.w * scale, height: page.h * scale,
                        background: canvasBg, boxShadow: "0 4px 24px rgba(0,0,0,.18)", borderRadius: 4,
                        backgroundImage: bg && showBg ? `url(${bg})` : undefined,
                        backgroundSize: "100% 100%", backgroundRepeat: "no-repeat",
                    }}
                >
                    {elements.map((el) => {
                        const isSel = el.id === selected
                        const isEd = el.id === editing && el.type !== "icon"
                        const common: React.CSSProperties = {
                            position: "absolute", left: el.x * scale, top: el.y * scale,
                            cursor: isEd ? "text" : "move",
                            outline: isSel ? "1.5px solid #3b82f6" : "1px solid transparent",
                            outlineOffset: 2, borderRadius: 2,
                        }
                        if (el.type === "icon") {
                            return (
                                <div key={el.id}
                                    onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, el.id) }}
                                    style={{ ...common, width: el.fontSize * scale, height: el.fontSize * scale, color: el.color }}
                                    dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[el.icon || "star"]}</svg>` }}
                                />
                            )
                        }
                        return (
                            <div key={el.id}
                                onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, el.id) }}
                                onDoubleClick={(e) => { e.stopPropagation(); snapshot(); setEditing(el.id); setSelected(el.id) }}
                                contentEditable={isEd} suppressContentEditableWarning
                                onBlur={(e) => { patch(el.id, { text: e.currentTarget.textContent ?? "" }); setEditing(null) }}
                                style={{
                                    ...common, width: el.w * scale, fontSize: el.fontSize * scale,
                                    fontWeight: el.bold ? 700 : 400, fontStyle: el.italic ? "italic" : "normal",
                                    color: el.color, textAlign: el.align, lineHeight: 1.2,
                                    fontFamily: `'${el.fontFamily || "Inter"}','Inter',Arial,sans-serif`,
                                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                                    userSelect: isEd ? "text" : "none",
                                }}
                            >
                                {el.text}
                            </div>
                        )
                    })}
                </div>
            </div></div>

            <p className="app-faint text-xs">
                <b>Importe</b> um PDF (cada texto vira caixa) • clique = selecionar • <b>2 cliques</b> = editar • arraste = mover •
                setas = mover 1pt (Shift = 10) • <b>Ctrl+C/V</b> copiar/colar • <b>Ctrl+D</b> duplicar • <b>Del</b> apagar • <b>Ctrl+Z</b> desfazer.
                Escolha qualquer <b>fonte</b>, adicione <b>ícones</b>, e <b>Baixar PDF</b> exporta exatamente como na tela.
            </p>
        </div>
    )
}
