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
                "dropzone-shell group relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl transition-all",
                previewUrl && "checker border-solid",
            )}
            data-dragging={isDragging}
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
                    <div className="dropzone-icon rounded-full p-3 transition-transform group-hover:scale-105">
                        <ImagePlus className="size-6" />
                    </div>
                    <div>
                        <p className="text-sm font-medium">Solte uma imagem aqui</p>
                        <p className="app-faint mt-1 text-xs">ou clique para escolher - PNG, JPG, WebP</p>
                    </div>
                    <Button variant="outline" size="sm" type="button" className="pointer-events-none">
                        <Upload className="size-3.5" />
                        Escolher arquivo
                    </Button>
                </div>
            )}
        </div>
    )
}
