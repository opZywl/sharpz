"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { EditorCanvas } from "@/components/tools/editor/EditorCanvas"
import { EditorFormatBar } from "@/components/tools/editor/EditorFormatBar"
import { EditorToolbar } from "@/components/tools/editor/EditorToolbar"
import { LS_KEY, SIZES, norm, seed, seedTexts, uid, type EditorMenu } from "@/components/tools/editor/editor-doc"
import { EditorElement, ElType, importDoc, renderHtml, renderPng } from "@/lib/editor-api"
import { GOOGLE_FONTS, buildEditorHtml, safePage } from "@/lib/editor-html"
import { iconSvgInner } from "@/lib/editor-icons"
import { dictionaries, errorText } from "@/lib/i18n"
import { useI18n, useMessage } from "@/lib/i18n/provider"

export function EditorTool() {
    const { t, resolve } = useI18n()
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
    const [menu, setMenu] = useState<EditorMenu>("")
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

                <EditorToolbar
                    fileRef={fileRef}
                    imgRef={imgRef}
                    projRef={projRef}
                    onImport={onImport}
                    onImg={onImg}
                    openProject={openProject}
                    busy={busy}
                    addText={addText}
                    addIcon={addIcon}
                    addRect={addRect}
                    addLine={addLine}
                    menu={menu}
                    setMenu={setMenu}
                    undo={undo}
                    redo={redo}
                    setZoom={setZoom}
                    scale={scale}
                    elements={elements}
                    selected={selected}
                    page={page}
                    setPage={setPage}
                    snapshot={snapshot}
                    pageBg={pageBg}
                    setPageBg={setPageBg}
                    bg={bg}
                    showBg={showBg}
                    setShowBg={setShowBg}
                    saveProject={saveProject}
                    full={full}
                    setFull={setFull}
                    exportAs={exportAs}
                />

                {selEls.length ? (
                    <EditorFormatBar
                        selEls={selEls}
                        one={one}
                        isText={isText}
                        repText={repText}
                        sizeRep={sizeRep}
                        patchSel={patchSel}
                        zorder={zorder}
                        toggleLock={toggleLock}
                        dupSel={dupSel}
                        delSel={delSel}
                    />
                ) : null}

                <EditorCanvas
                    canvasRef={canvasRef}
                    wrapRef={wrapRef}
                    setSelected={setSelected}
                    setEditing={setEditing}
                    setMenu={setMenu}
                    ctx={ctx}
                    setCtx={setCtx}
                    pageBg={pageBg}
                    bg={bg}
                    showBg={showBg}
                    Wpx={Wpx}
                    Hpx={Hpx}
                    scale={scale}
                    guide={guide}
                    elements={elements}
                    selected={selected}
                    editing={editing}
                    onDown={onDown}
                    onResize={onResize}
                    snapshot={snapshot}
                    patch={patch}
                    dupSel={dupSel}
                    zorder={zorder}
                    toggleLock={toggleLock}
                    delSel={delSel}
                />

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
