"use client"

import { TranscribeWorkspace } from "@/components/transcribe/transcribe-workspace"
import { BatchPipelineTool } from "@/components/tools/BatchPipelineTool"
import { CleanTool } from "@/components/tools/CleanTool"
import { EditorTool } from "@/components/tools/EditorTool"
import { ImageToPdfTool } from "@/components/tools/ImageToPdfTool"
import { KtxBatchTool } from "@/components/tools/KtxBatchTool"
import { KtxOrientationTool } from "@/components/tools/KtxOrientationTool"
import { KtxSingleTool } from "@/components/tools/KtxSingleTool"
import { PackagesTool } from "@/components/tools/PackagesTool"
import { PipelineTool } from "@/components/tools/PipelineTool"
import { PortfolioKtxTool } from "@/components/tools/PortfolioKtxTool"
import { SvgTool } from "@/components/tools/SvgTool"
import { SystemTool } from "@/components/tools/SystemTool"
import { ToolId } from "@/lib/modules"

export function ToolHost({ tool }: { tool: ToolId }) {
    switch (tool) {
        case "clean":
            return <CleanTool />
        case "pipeline":
            return <PipelineTool />
        case "batch-pipeline":
            return <BatchPipelineTool />
        case "svg":
            return <SvgTool />
        case "ktx-single":
            return <KtxSingleTool />
        case "ktx-batch":
            return <KtxBatchTool />
        case "ktx-orientation":
            return <KtxOrientationTool />
        case "portfolio-ktx":
            return <PortfolioKtxTool />
        case "transcribe":
            return <TranscribeWorkspace />
        case "image-to-pdf":
            return <ImageToPdfTool />
        case "editor":
            return <EditorTool />
        case "packages":
            return <PackagesTool />
        case "system":
            return <SystemTool />
        default:
            return null
    }
}
