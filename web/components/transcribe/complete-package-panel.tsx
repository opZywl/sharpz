"use client"

import { motion } from "framer-motion"
import { Archive, FileText, FolderOpen, Images, Loader2, Wand2 } from "lucide-react"
import { useEffect, useState } from "react"

import { EmptyState, Panel, cardEnter } from "@/components/dashboard/primitives"
import { friendlyError } from "@/components/transcribe/transcribe-utils"
import { Button } from "@/components/ui/button"
import { useI18n, useMessage } from "@/lib/i18n/provider"
import {
    completeFileUrl,
    completeZipUrl,
    getComplete,
    openCompleteFolder,
    type CompleteManifest,
} from "@/lib/transcribe-api"

export function CompletePackagePanel({ jobId, initial }: { jobId: string; initial: CompleteManifest | null }) {
    const { lang, t, resolve } = useI18n()
    const [srcLang] = useState(lang)
    const [manifest, setManifest] = useState<CompleteManifest | null>(initial)
    const [loading, setLoading] = useState(!initial)
    const [opening, setOpening] = useState(false)
    const [folderError, setFolderError] = useMessage()

    useEffect(() => {
        if (initial) setManifest(initial)
    }, [initial])

    useEffect(() => {
        if (manifest) return
        let cancelled = false
        setLoading(true)
        getComplete(jobId)
            .then((data) => {
                if (!cancelled) setManifest(data)
            })
            .catch(() => undefined)
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [jobId, manifest])

    async function handleOpenFolder() {
        setOpening(true)
        setFolderError(null)
        try {
            await openCompleteFolder(jobId)
        } catch (err) {
            setFolderError(friendlyError(err, (m) => m.complete.openFailed).message)
        } finally {
            setOpening(false)
        }
    }

    return (
        <motion.div {...cardEnter}>
            <Panel title={t.complete.title} subtitle={t.complete.subtitle} icon={Wand2}>
                {loading && !manifest ? (
                    <div className="flex items-center justify-center gap-2 px-4 py-10 text-center">
                        <Loader2 className="size-4 animate-spin" />
                        <span className="app-muted text-sm">{t.complete.loading}</span>
                    </div>
                ) : manifest ? (
                    <div className="grid gap-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="font-jakarta text-base font-extrabold leading-tight">{manifest.title || manifest.slug}</div>
                                <div className="app-faint truncate text-xs">{manifest.dest_dir || manifest.out_dir}</div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button type="button" variant="outline" onClick={handleOpenFolder} disabled={opening}>
                                    {opening ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
                                    {t.common.openFolder}
                                </Button>
                                {manifest.zip ? (
                                    <Button asChild variant="outline">
                                        <a href={completeZipUrl(jobId, lang)}>
                                            <Archive className="size-4" />
                                            {t.complete.downloadZip}
                                        </a>
                                    </Button>
                                ) : null}
                            </div>
                        </div>

                        {folderError ? (
                            <div className="app-alert rounded-xl px-4 py-3 text-sm">{resolve(folderError)}</div>
                        ) : null}

                        {!manifest.docs_generated ? (
                            <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
                                {t.complete.noDocs}
                            </div>
                        ) : null}

                        {manifest.docs.length ? (
                            <div className="flex flex-wrap items-center gap-2">
                                {manifest.docs.map((doc) => (
                                    <Button key={doc} asChild variant="outline">
                                        <a href={completeFileUrl(jobId, doc, lang)} target="_blank" rel="noreferrer">
                                            <FileText className="size-4" />
                                            {doc}
                                        </a>
                                    </Button>
                                ))}
                            </div>
                        ) : null}

                        <div className="grid gap-2">
                            <span className="field-label flex items-center gap-2">
                                <Images className="size-3.5" />
                                {t.complete.images(manifest.images.length)}
                            </span>
                            {manifest.images.length ? (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                    {manifest.images.map((image) => {
                                        const name = image.split("/").pop() ?? image
                                        const caption = manifest.captions?.[name]
                                        return (
                                            <a
                                                key={image}
                                                href={completeFileUrl(jobId, image, lang)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="group preview-card overflow-hidden rounded-lg"
                                            >
                                                <img
                                                    src={completeFileUrl(jobId, image, srcLang)}
                                                    alt={caption ?? name}
                                                    className="aspect-video w-full object-cover"
                                                    loading="lazy"
                                                />
                                                <div className="px-2 py-1.5">
                                                    <div className="truncate text-[11px] font-semibold">{name}</div>
                                                    {caption ? <div className="app-faint line-clamp-2 text-[11px] leading-4">{caption}</div> : null}
                                                </div>
                                            </a>
                                        )
                                    })}
                                </div>
                            ) : (
                                <EmptyState text={t.complete.noImages} />
                            )}
                        </div>
                    </div>
                ) : (
                    <EmptyState text={t.complete.unavailable} />
                )}
            </Panel>
        </motion.div>
    )
}
