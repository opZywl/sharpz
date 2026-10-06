"use client"

import { BringToFront, Copy, Lock, SendToBack, Trash2 } from "lucide-react"
import type { Dispatch, RefObject, SetStateAction } from "react"

import { IconSvg } from "@/components/tools/editor/IconSvg"
import type { EditorMenu } from "@/components/tools/editor/editor-doc"
import type { EditorElement } from "@/lib/editor-api"
import { safeImageSrc } from "@/lib/editor-html"
import { useI18n } from "@/lib/i18n/provider"

export function EditorCanvas({
    canvasRef,
    wrapRef,
    setSelected,
    setEditing,
    setMenu,
    ctx,
    setCtx,
    pageBg,
    bg,
    showBg,
    Wpx,
    Hpx,
    scale,
    guide,
    elements,
    selected,
    editing,
    onDown,
    onResize,
    snapshot,
    patch,
    dupSel,
    zorder,
    toggleLock,
    delSel,
}: {
    canvasRef: RefObject<HTMLDivElement | null>
    wrapRef: RefObject<HTMLDivElement | null>
    setSelected: Dispatch<SetStateAction<string[]>>
    setEditing: Dispatch<SetStateAction<string | null>>
    setMenu: Dispatch<SetStateAction<EditorMenu>>
    ctx: { sx: number; sy: number } | null
    setCtx: Dispatch<SetStateAction<{ sx: number; sy: number } | null>>
    pageBg: string
    bg: string | null
    showBg: boolean
    Wpx: number
    Hpx: number
    scale: number
    guide: { x?: number; y?: number }
    elements: EditorElement[]
    selected: string[]
    editing: string | null
    onDown: (e: React.PointerEvent, id: string) => void
    onResize: (e: React.PointerEvent, el: EditorElement) => void
    snapshot: () => void
    patch: (id: string, p: Partial<EditorElement>) => void
    dupSel: () => void
    zorder: (front: boolean) => void
    toggleLock: () => void
    delSel: () => void
}) {
    const { t } = useI18n()
    return (
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
                    else if (el.type === "image") inner = <img onPointerDown={onpd} onContextMenu={onctx} src={safeImageSrc(el.src) ?? undefined} alt="" style={{ ...common, width: el.w * scale, height: (el.h || 80) * scale, objectFit: "contain" }} />
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
    )
}
