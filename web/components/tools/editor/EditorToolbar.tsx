"use client"

import {
    ChevronDown, Download, FileImage, FileText, FolderOpen, Image as ImageIcon, Loader2, Maximize2,
    Minimize2, Moon, Redo2, Save, Settings2, Shapes, Slash, Square, Sun, Type, Undo2, Upload, ZoomIn, ZoomOut,
} from "lucide-react"
import type { Dispatch, RefObject, SetStateAction } from "react"

import { IconSvg } from "@/components/tools/editor/IconSvg"
import { SIZES, SIZE_KEYS, type EditorMenu, type PageSize } from "@/components/tools/editor/editor-doc"
import { Button } from "@/components/ui/button"
import type { EditorElement } from "@/lib/editor-api"
import { ICON_NAMES } from "@/lib/editor-icons"
import { pick } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n/provider"

export function EditorToolbar({
    fileRef,
    imgRef,
    projRef,
    onImport,
    onImg,
    openProject,
    busy,
    addText,
    addIcon,
    addRect,
    addLine,
    menu,
    setMenu,
    undo,
    redo,
    setZoom,
    scale,
    elements,
    selected,
    page,
    setPage,
    snapshot,
    pageBg,
    setPageBg,
    bg,
    showBg,
    setShowBg,
    saveProject,
    full,
    setFull,
    exportAs,
}: {
    fileRef: RefObject<HTMLInputElement | null>
    imgRef: RefObject<HTMLInputElement | null>
    projRef: RefObject<HTMLInputElement | null>
    onImport: (file: File) => Promise<void>
    onImg: (file: File) => void
    openProject: (file: File) => void
    busy: boolean
    addText: () => void
    addIcon: (icon: string) => void
    addRect: () => void
    addLine: () => void
    menu: EditorMenu
    setMenu: Dispatch<SetStateAction<EditorMenu>>
    undo: () => void
    redo: () => void
    setZoom: Dispatch<SetStateAction<number>>
    scale: number
    elements: EditorElement[]
    selected: string[]
    page: { w: number; h: number }
    setPage: Dispatch<SetStateAction<{ w: number; h: number }>>
    snapshot: () => void
    pageBg: string
    setPageBg: Dispatch<SetStateAction<string>>
    bg: string | null
    showBg: boolean
    setShowBg: Dispatch<SetStateAction<boolean>>
    saveProject: () => void
    full: boolean
    setFull: Dispatch<SetStateAction<boolean>>
    exportAs: (kind: "pdf" | "png") => Promise<void>
}) {
    const { t, fmt } = useI18n()
    return (
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
    )
}
