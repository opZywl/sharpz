"use client"

import { useEffect, useState } from "react"

import { isEditableTarget } from "@/components/transcribe/transcribe-source"
import { isMediaFile } from "@/components/transcribe/transcribe-utils"
import { dragKind, droppedUrl, httpUrl, pasteIntent } from "@/lib/paste-intent"

export function useDocumentMediaDrop(
    acceptFileRef: { current: (picked: File, count?: number) => void },
    acceptUrlRef: { current: (link: string) => void },
) {
    const [dragging, setDragging] = useState(false)

    useEffect(() => {
        let depth = 0
        let fromPage = false
        const kindOf = (event: DragEvent) => dragKind(Array.from(event.dataTransfer?.types ?? []), fromPage)
        const onDragStart = () => {
            fromPage = true
        }
        const onDragEnd = () => {
            fromPage = false
        }
        const onDragEnter = (event: DragEvent) => {
            if (!kindOf(event)) return
            depth += 1
            setDragging(true)
        }
        const onDragOver = (event: DragEvent) => {
            if (!kindOf(event)) return
            event.preventDefault()
            if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
        }
        const onDragLeave = (event: DragEvent) => {
            if (!kindOf(event)) return
            depth = Math.max(0, depth - 1)
            if (depth === 0) setDragging(false)
        }
        const onDrop = (event: DragEvent) => {
            const kind = kindOf(event)
            if (!kind) return
            depth = 0
            setDragging(false)
            if (kind === "link") {
                if (isEditableTarget(event.target)) return
                event.preventDefault()
                const link = droppedUrl(event.dataTransfer?.getData("text/uri-list") ?? "", event.dataTransfer?.getData("text/plain") ?? "")
                if (link) acceptUrlRef.current(link)
                return
            }
            event.preventDefault()
            const dropped = Array.from(event.dataTransfer?.files ?? [])
            if (dropped[0]) acceptFileRef.current(dropped[0], dropped.length)
        }
        const onPaste = (event: ClipboardEvent) => {
            const pasted = Array.from(event.clipboardData?.files ?? [])
            const text = event.clipboardData?.getData("text/plain") ?? ""
            const intent = pasteIntent({
                editableTarget: isEditableTarget(event.target),
                hasMediaFile: Boolean(pasted[0] && isMediaFile(pasted[0])),
                hasFile: pasted.length > 0,
                text,
            })
            const link = httpUrl(text)
            if (intent === "file" || intent === "reject-file") {
                if (intent === "file") event.preventDefault()
                acceptFileRef.current(pasted[0], pasted.length)
            } else if (intent === "url" && link) {
                event.preventDefault()
                acceptUrlRef.current(link)
            }
        }
        document.addEventListener("dragstart", onDragStart)
        document.addEventListener("dragend", onDragEnd)
        document.addEventListener("dragenter", onDragEnter)
        document.addEventListener("dragover", onDragOver)
        document.addEventListener("dragleave", onDragLeave)
        document.addEventListener("drop", onDrop)
        document.addEventListener("paste", onPaste)
        return () => {
            document.removeEventListener("dragstart", onDragStart)
            document.removeEventListener("dragend", onDragEnd)
            document.removeEventListener("dragenter", onDragEnter)
            document.removeEventListener("dragover", onDragOver)
            document.removeEventListener("dragleave", onDragLeave)
            document.removeEventListener("drop", onDrop)
            document.removeEventListener("paste", onPaste)
        }
    }, [acceptFileRef, acceptUrlRef])

    return dragging
}
