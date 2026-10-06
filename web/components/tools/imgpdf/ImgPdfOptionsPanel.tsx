"use client"

import { Loader2, Play, Settings2 } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"

import { CheckboxRow, Panel, SelectField, TextField } from "@/components/dashboard/primitives"
import {
    DEFAULT_VISION_BASE_URL,
    DEFAULT_VISION_MODEL,
    OCR_ENGINES,
    PAGE_MODES,
    type OcrEngine,
    type PageMode,
} from "@/components/tools/imgpdf/imgpdf-settings"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n/provider"

export function ImgPdfOptionsPanel({
    pageMode,
    setPageMode,
    ocrEngine,
    setOcrEngine,
    verify,
    setVerify,
    visionBaseUrl,
    setVisionBaseUrl,
    visionModel,
    setVisionModel,
    visionApiKey,
    setVisionApiKey,
    outputName,
    setOutputName,
    outputDir,
    setOutputDir,
    openFolderOpt,
    setOpenFolderOpt,
    tesseractOk,
    running,
    handleConvert,
}: {
    pageMode: PageMode
    setPageMode: Dispatch<SetStateAction<PageMode>>
    ocrEngine: OcrEngine
    setOcrEngine: Dispatch<SetStateAction<OcrEngine>>
    verify: boolean
    setVerify: Dispatch<SetStateAction<boolean>>
    visionBaseUrl: string
    setVisionBaseUrl: Dispatch<SetStateAction<string>>
    visionModel: string
    setVisionModel: Dispatch<SetStateAction<string>>
    visionApiKey: string
    setVisionApiKey: Dispatch<SetStateAction<string>>
    outputName: string
    setOutputName: Dispatch<SetStateAction<string>>
    outputDir: string
    setOutputDir: Dispatch<SetStateAction<string>>
    openFolderOpt: boolean
    setOpenFolderOpt: Dispatch<SetStateAction<boolean>>
    tesseractOk: boolean | null
    running: boolean
    handleConvert: () => Promise<void>
}) {
    const { t } = useI18n()
    return (
        <Panel title={t.imgpdf.optionsTitle} subtitle={t.imgpdf.optionsSubtitle} icon={Settings2}>
            <div className="grid gap-4">
                <div className="grid gap-3 md:grid-cols-2">
                    <SelectField
                        label={t.imgpdf.page}
                        value={pageMode}
                        options={PAGE_MODES.map((value) => ({ value, label: t.imgpdf.pages[value] }))}
                        onChange={setPageMode}
                    />
                    <SelectField
                        label={t.imgpdf.engine}
                        value={ocrEngine}
                        options={OCR_ENGINES.map((value) => ({ value, label: t.imgpdf.engines[value] }))}
                        onChange={setOcrEngine}
                    />
                </div>

                <CheckboxRow
                    checked={verify}
                    onChange={setVerify}
                    label={t.imgpdf.verify}
                    helper={t.imgpdf.verifyHelper}
                />

                {ocrEngine !== "tesseract" ? (
                    <div className="grid gap-3 rounded-xl border border-foreground/10 p-3">
                        <span className="field-label">{t.imgpdf.visionTitle}</span>
                        <div className="grid gap-3 md:grid-cols-2">
                            <TextField label={t.imgpdf.baseUrl} value={visionBaseUrl} onChange={setVisionBaseUrl} placeholder={DEFAULT_VISION_BASE_URL} />
                            <TextField label={t.fields.model} value={visionModel} onChange={setVisionModel} placeholder={DEFAULT_VISION_MODEL} />
                        </div>
                        <TextField label={t.fields.apiKeyOptional} value={visionApiKey} onChange={setVisionApiKey} placeholder="sk-..." type="password" />
                        <span className="app-faint text-xs">
                            {ocrEngine === "auto" ? t.imgpdf.autoHint : t.imgpdf.visionHint}
                            {tesseractOk === false ? t.imgpdf.tesseractHint : ""}
                        </span>
                    </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                    <TextField label={t.imgpdf.pdfName} value={outputName} onChange={setOutputName} placeholder={t.imgpdf.pdfNamePlaceholder} />
                    <TextField label={t.fields.outputFolderOptional} value={outputDir} onChange={setOutputDir} placeholder={t.placeholders.folder} />
                </div>
                <CheckboxRow checked={openFolderOpt} onChange={setOpenFolderOpt} label={t.imgpdf.openWhenDone} />

                <Button onClick={handleConvert} disabled={running} size="lg" className="w-full">
                    {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    {t.imgpdf.run}
                </Button>
            </div>
        </Panel>
    )
}
