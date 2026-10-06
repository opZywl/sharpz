"use client"

import { CheckCircle2, Download, FolderOpen, Loader2, Terminal } from "lucide-react"
import type { RefObject } from "react"

import { EmptyState, Metric, Panel } from "@/components/dashboard/primitives"
import type { Status } from "@/components/tools/imgpdf/imgpdf-settings"
import { Button } from "@/components/ui/button"
import { pick, type Lang } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n/provider"
import {
    imgPdfDownloadUrl,
    imgPdfPreviewUrl,
    type ImgPdfLog,
    type ImgPdfManifest,
    type ImgPdfReport,
} from "@/lib/imgpdf-api"
import { cn } from "@/lib/utils"

const LOG_TONE: Record<string, string> = {
    ok: "text-emerald-600 dark:text-emerald-300",
    warn: "text-amber-600 dark:text-amber-300",
    info: "app-faint",
}

export function ImgPdfProgressPanel({
    status,
    stage,
    pct,
    logs,
    logEndRef,
    degraded,
    manifest,
    report,
    jobId,
    srcLang,
    openingFolder,
    handleOpenFolder,
    elapsed,
}: {
    status: Status
    stage: string
    pct: number
    logs: ImgPdfLog[]
    logEndRef: RefObject<HTMLDivElement | null>
    degraded: string[]
    manifest: ImgPdfManifest | null
    report: ImgPdfReport | undefined
    jobId: string | null
    srcLang: Lang
    openingFolder: boolean
    handleOpenFolder: () => Promise<void>
    elapsed: number | null
}) {
    const { lang, t, fmt } = useI18n()
    return (
        <Panel title={t.imgpdf.progressTitle} subtitle={t.imgpdf.progressSubtitle} icon={Terminal}>
            {status === "idle" ? (
                <EmptyState text={t.imgpdf.empty} />
            ) : (
                <div className="space-y-4">
                    <div className="grid gap-2">
                        <div className="flex items-center justify-between text-xs">
                            <span className="app-faint font-semibold uppercase tracking-[0.16em]">
                                {pick(t.imgpdf.stages, stage) || stage || t.imgpdf.processing}
                            </span>
                            <span className="font-jakarta font-extrabold">{fmt.percent(pct)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
                            <div
                                className="h-full rounded-full bg-foreground/70 transition-all"
                                style={{ width: `${Math.min(100, Math.max(0, pct * 100))}%` }}
                            />
                        </div>
                    </div>

                    <div className="preview-card max-h-[360px] overflow-auto p-3 font-mono text-xs leading-5">
                        {logs.length ? (
                            <div className="grid gap-0.5">
                                {logs.map((entry, index) => (
                                    <div key={index} className={cn("flex gap-2", LOG_TONE[entry.level] || "app-faint")}>
                                        <span className="select-none opacity-50">{entry.level === "ok" ? ">>" : "·"}</span>
                                        <span className="whitespace-pre-wrap break-words">{entry.message}</span>
                                    </div>
                                ))}
                                <div ref={logEndRef} />
                            </div>
                        ) : (
                            <div className="flex items-center justify-center gap-2 px-4 py-10 text-center">
                                <Loader2 className="size-4 animate-spin" />
                                <span className="app-muted">{t.imgpdf.starting}</span>
                            </div>
                        )}
                    </div>

                    {degraded.length ? (
                        <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
                            {t.imgpdf.degraded(degraded.map((item) => pick(t.imgpdf.degradedNames, item) ?? item).join(", "))}
                        </div>
                    ) : null}

                    {status === "done" && manifest ? (
                        <>
                            <div className="grid gap-3 md:grid-cols-4">
                                <Metric label={t.imgpdf.engineMetric} value={pick(t.imgpdf.engineNames, manifest.engine) ?? manifest.engine} />
                                <Metric label={t.imgpdf.blocks} value={fmt.number(manifest.blocks)} />
                                <Metric label={t.imgpdf.chars} value={fmt.number(report ? report.chars : 0)} helper={report ? t.imgpdf.hyphens(report.hyphens) : undefined} />
                                <Metric
                                    label={t.imgpdf.layer}
                                    value={report?.clean ? t.imgpdf.clean : t.imgpdf.glitchy}
                                    helper={report ? t.imgpdf.pageSize(report.page_pt?.map((v) => fmt.number(v)).join(" x ") ?? "") : undefined}
                                />
                            </div>

                            {report && report.glitch_total === 0 ? (
                                <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
                                    <CheckCircle2 className="size-4 shrink-0" />
                                    {t.imgpdf.layerChecked}
                                </div>
                            ) : null}

                            {jobId ? (
                                <div className="preview-card overflow-hidden rounded-xl">
                                    <img src={imgPdfPreviewUrl(jobId, srcLang)} alt={t.imgpdf.pdfAlt} className="max-h-[520px] w-full object-contain p-3" />
                                </div>
                            ) : null}

                            <div className="flex flex-wrap items-center gap-2">
                                {jobId ? (
                                    <Button asChild>
                                        <a href={imgPdfDownloadUrl(jobId, lang)} download={manifest.pdf_name}>
                                            <Download className="size-4" />
                                            {t.imgpdf.downloadPdf}
                                        </a>
                                    </Button>
                                ) : null}
                                <Button type="button" variant="outline" onClick={handleOpenFolder} disabled={openingFolder}>
                                    {openingFolder ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
                                    {t.common.openFolder}
                                </Button>
                                {elapsed != null ? (
                                    <span className="app-faint text-xs">{fmt.seconds(elapsed, 1)}</span>
                                ) : null}
                            </div>
                        </>
                    ) : null}
                </div>
            )}
        </Panel>
    )
}
