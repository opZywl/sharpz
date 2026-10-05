"use client"

import { LANGS, type Lang } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n/provider"

const SHORT_LABELS: Record<Lang, string> = {
    en: "EN",
    "pt-BR": "PT-BR",
}

export function LanguageToggle() {
    const { lang, setLang, t } = useI18n()
    const names: Record<Lang, string> = { en: t.language.names.en, "pt-BR": t.language.names.ptBR }

    return (
        <div role="group" aria-label={t.language.label} className="lang-switch inline-flex h-9 items-center gap-0.5 rounded-full p-1">
            {LANGS.map((option) => {
                const active = option === lang
                return (
                    <button
                        key={option}
                        type="button"
                        lang={option}
                        aria-pressed={active}
                        title={names[option]}
                        data-active={active}
                        onClick={() => setLang(option)}
                        className="lang-switch-option inline-flex h-7 items-center rounded-full px-3 text-[11px] font-bold tracking-[0.12em]"
                    >
                        {SHORT_LABELS[option]}
                    </button>
                )
            })}
        </div>
    )
}
