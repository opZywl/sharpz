"use client"

import { useDashboard } from "@/components/dashboard/DashboardProvider"
import { SelectField } from "@/components/dashboard/primitives"
import { useI18n } from "@/lib/i18n/provider"
import { cn } from "@/lib/utils"

export function ModelField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const { models, modelOptions } = useDashboard()
    const { t } = useI18n()
    const model = models.find((item) => item.key === value)
    const hint = model
        ? [
              model.is_default ? t.model.isDefault : null,
              model.detail,
              model.downloaded === false ? t.model.downloadFirst : null,
          ]
              .filter(Boolean)
              .join(" ")
        : ""

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <SelectField label={t.fields.aiModel} value={value} options={modelOptions} onChange={onChange} />
            {hint ? (
                <p className={cn("text-xs leading-5", model?.heavy ? "text-amber-600 dark:text-amber-300" : "app-faint")}>
                    {hint}
                </p>
            ) : null}
        </div>
    )
}
