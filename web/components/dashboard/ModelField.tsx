"use client"

import { useDashboard } from "@/components/dashboard/DashboardProvider"
import { SelectField } from "@/components/dashboard/primitives"
import { cn } from "@/lib/utils"

export function ModelField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const { models, modelOptions } = useDashboard()
    const model = models.find((item) => item.key === value)
    const hint = model
        ? [
              model.is_default ? "Padrão." : null,
              model.detail,
              model.downloaded === false ? "Baixa o modelo na primeira vez." : null,
          ]
              .filter(Boolean)
              .join(" ")
        : ""

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <SelectField label="Modelo AI" value={value} options={modelOptions} onChange={onChange} />
            {hint ? (
                <p className={cn("text-xs leading-5", model?.heavy ? "text-amber-600 dark:text-amber-300" : "app-faint")}>
                    {hint}
                </p>
            ) : null}
        </div>
    )
}
