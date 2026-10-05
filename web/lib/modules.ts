import {
    AudioLines,
    Box,
    FileCode2,
    FileText,
    FileType2,
    FolderOpen,
    FolderSync,
    HardDriveDownload,
    ImagePlus,
    MousePointer2,
    PackageCheck,
    Scissors,
    Server,
    ShieldCheck,
    Wand2,
    type LucideIcon,
} from "lucide-react"

export type ToolId =
    | "pipeline"
    | "clean"
    | "svg"
    | "batch-pipeline"
    | "ktx-single"
    | "ktx-batch"
    | "ktx-orientation"
    | "portfolio-ktx"
    | "transcribe"
    | "image-to-pdf"
    | "editor"
    | "packages"
    | "system"

export type ModuleId = "image" | "vector" | "ktx" | "transcription" | "document" | "packages" | "system"

export interface Tool {
    id: ToolId
    icon: LucideIcon
    accent: string
}

export interface Module {
    id: ModuleId
    icon: LucideIcon
    accent: string
    tools: Tool[]
}

export const MODULES: Module[] = [
    {
        id: "image",
        icon: ImagePlus,
        accent: "text-emerald-500 dark:text-emerald-200",
        tools: [
            { id: "clean", icon: Scissors, accent: "text-zinc-700 dark:text-stone-100" },
            { id: "pipeline", icon: Wand2, accent: "text-emerald-500 dark:text-emerald-200" },
            { id: "batch-pipeline", icon: FolderOpen, accent: "text-violet-600 dark:text-violet-200" },
        ],
    },
    {
        id: "vector",
        icon: FileCode2,
        accent: "text-amber-600 dark:text-amber-200",
        tools: [{ id: "svg", icon: FileCode2, accent: "text-amber-600 dark:text-amber-200" }],
    },
    {
        id: "ktx",
        icon: Box,
        accent: "text-sky-600 dark:text-sky-200",
        tools: [
            { id: "ktx-single", icon: Box, accent: "text-sky-600 dark:text-sky-200" },
            { id: "ktx-batch", icon: FolderSync, accent: "text-orange-600 dark:text-orange-200" },
            { id: "ktx-orientation", icon: ShieldCheck, accent: "text-lime-600 dark:text-lime-200" },
            { id: "portfolio-ktx", icon: PackageCheck, accent: "text-cyan-600 dark:text-cyan-200" },
        ],
    },
    {
        id: "transcription",
        icon: AudioLines,
        accent: "text-rose-600 dark:text-rose-200",
        tools: [{ id: "transcribe", icon: AudioLines, accent: "text-rose-600 dark:text-rose-200" }],
    },
    {
        id: "document",
        icon: FileType2,
        accent: "text-red-600 dark:text-red-200",
        tools: [
            { id: "image-to-pdf", icon: FileText, accent: "text-red-600 dark:text-red-200" },
            { id: "editor", icon: MousePointer2, accent: "text-fuchsia-600 dark:text-fuchsia-200" },
        ],
    },
    {
        id: "packages",
        icon: HardDriveDownload,
        accent: "text-indigo-600 dark:text-indigo-200",
        tools: [{ id: "packages", icon: HardDriveDownload, accent: "text-indigo-600 dark:text-indigo-200" }],
    },
    {
        id: "system",
        icon: Server,
        accent: "text-zinc-700 dark:text-zinc-100",
        tools: [{ id: "system", icon: Server, accent: "text-zinc-700 dark:text-zinc-100" }],
    },
]

export const TOOLS: Record<ToolId, Tool> = MODULES.reduce(
    (acc, module) => {
        module.tools.forEach((tool) => {
            acc[tool.id] = tool
        })
        return acc
    },
    {} as Record<ToolId, Tool>,
)

export function findToolModule(id: ToolId): Module | undefined {
    return MODULES.find((module) => module.tools.some((tool) => tool.id === id))
}
