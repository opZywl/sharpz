"use client"

import { FileText } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"

import { FileField, Panel, TextField } from "@/components/dashboard/primitives"
import { useI18n } from "@/lib/i18n/provider"

export function ImgPdfSourcePanel({
    file,
    setFile,
    localPath,
    setLocalPath,
    previewUrl,
}: {
    file: File | null
    setFile: Dispatch<SetStateAction<File | null>>
    localPath: string
    setLocalPath: Dispatch<SetStateAction<string>>
    previewUrl: string | null
}) {
    const { t } = useI18n()
    return (
        <Panel title={t.imgpdf.imageTitle} subtitle={t.imgpdf.imageSubtitle} icon={FileText}>
            <div className="grid gap-4">
                <FileField
                    file={file}
                    onChange={setFile}
                    accept="image/*"
                    label={t.imgpdf.chooseImage}
                    helper="png, jpg, webp, bmp, tiff"
                />
                <TextField
                    label={t.imgpdf.localPath}
                    value={localPath}
                    onChange={setLocalPath}
                    placeholder={t.placeholders.imageFile}
                />
                {previewUrl ? (
                    <div className="preview-card overflow-hidden rounded-xl">
                        <img src={previewUrl} alt={t.imgpdf.sourceAlt} className="max-h-[320px] w-full object-contain p-3" />
                    </div>
                ) : null}
            </div>
        </Panel>
    )
}
