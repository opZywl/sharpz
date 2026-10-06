"use client"

import {
    AlignCenter, AlignLeft, AlignRight, Bold, BringToFront, Copy, Italic, Lock, Minus, Plus, RotateCw,
    SendToBack, Trash2, Underline, Unlock,
} from "lucide-react"

import { ALL_FONTS } from "@/components/tools/editor/editor-doc"
import type { EditorElement } from "@/lib/editor-api"
import { useI18n } from "@/lib/i18n/provider"

export function EditorFormatBar({
    selEls,
    one,
    isText,
    repText,
    sizeRep,
    patchSel,
    zorder,
    toggleLock,
    dupSel,
    delSel,
}: {
    selEls: EditorElement[]
    one: EditorElement | null
    isText: boolean
    repText: EditorElement | undefined
    sizeRep: EditorElement | undefined
    patchSel: (p: Partial<EditorElement>) => void
    zorder: (front: boolean) => void
    toggleLock: () => void
    dupSel: () => void
    delSel: () => void
}) {
    const { t, fmt } = useI18n()
    return (
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
    )
}
