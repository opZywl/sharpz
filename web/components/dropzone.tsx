"use client"

import { motion } from "framer-motion"
import { ImagePlus, Upload, X } from "lucide-react"
import { useCallback, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface DropzoneProps {
    file: File | null
    previewUrl: string | null
    onChange: (file: File | null) => void
}

export function Dropzone({ file, previewUrl, onChange }: DropzoneProps) {
    const [isDragging, setIsDragging] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const handleFiles = useCallback(
        (files: FileList | null) => {
            if (!files || files.length === 0) return
            const nextFile = files[0]
            if (!nextFile.type.startsWith("image/")) return
            onChange(nextFile)
        },
        [onChange],
    )

    return (
        <div
            onDragOver={(event) => {
                event.preventDefault()
                setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
                event.preventDefault()
                setIsDragging(false)
                handleFiles(event.dataTransfer.files)
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
                "group relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-dark-4/80 bg-neutral-800/20 transition-all",
                isDragging
                    ? "border-zinc-200/60 bg-white/[0.07]"
                    : "hover:border-zinc-200/35 hover:bg-white/[0.04]",
                previewUrl && "checker border-solid",
            )}
        >
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handleFiles(event.target.files)}
            />

            {previewUrl ? (
                <>
                    <motion.img
                        key={previewUrl}
                        src={previewUrl}
                        alt="Preview"
                        className="absolute inset-0 size-full object-contain"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    />
                    <Button
                        size="icon"
                        variant="secondary"
                        onClick={(event) => {
                            event.stopPropagation()
                            onChange(null)
                        }}
                        className="absolute right-3 top-3 z-10 size-8 shadow-md"
                        aria-label="Remover arquivo"
                    >
                        <X className="size-4" />
                    </Button>
                    {file ? (
                        <div className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-1.5rem)] truncate rounded-md bg-black/70 px-2 py-1 text-xs text-zinc-100 backdrop-blur">
                            {file.name} - {(file.size / 1024).toFixed(0)} KB
                        </div>
                    ) : null}
                </>
            ) : (
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                    <div className="rounded-full border border-dark-4 bg-neutral-800/35 p-3 transition-transform group-hover:scale-105">
                        <ImagePlus className="size-6 text-zinc-400" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-zinc-100">Solte uma imagem aqui</p>
                        <p className="mt-1 text-xs text-zinc-500">ou clique para escolher - PNG, JPG, WebP</p>
                    </div>
                    <Button variant="outline" size="sm" type="button" className="pointer-events-none border-dark-4 bg-transparent text-zinc-100">
                        <Upload className="size-3.5" />
                        Escolher arquivo
                    </Button>
                </div>
            )}
        </div>
    )
}
