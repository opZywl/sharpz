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

export type ModuleId = "imagem" | "vetor" | "ktx" | "transcricao" | "documento" | "pacotes" | "sistema"

export interface Tool {
    id: ToolId
    title: string
    label: string
    description: string
    icon: LucideIcon
    accent: string
}

export interface Module {
    id: ModuleId
    title: string
    label: string
    description: string
    icon: LucideIcon
    accent: string
    tools: Tool[]
}

export const MODULES: Module[] = [
    {
        id: "imagem",
        title: "Imagem e fundo",
        label: "Tire o fundo de fotos",
        description:
            "Tire o fundo de fotos e imagens, uma de cada vez ou a pasta toda. Se quiser, também vira desenho em SVG. Aceita PNG, JPG, WEBP, BMP e TIFF.",
        icon: ImagePlus,
        accent: "text-emerald-500 dark:text-emerald-200",
        tools: [
            {
                id: "clean",
                title: "Remover fundo",
                label: "Fundo transparente",
                description:
                    "Tire o fundo de uma imagem e baixe em PNG ou WEBP. Dá para ajustar bordas, cor e o modo de recorte (IA ou claro/escuro).",
                icon: Scissors,
                accent: "text-zinc-700 dark:text-stone-100",
            },
            {
                id: "pipeline",
                title: "Remover fundo + SVG",
                label: "Fundo e SVG de uma vez",
                description:
                    "Tire o fundo e já transforme a imagem em SVG, num passo só. SVG é um desenho que amplia sem perder qualidade.",
                icon: Wand2,
                accent: "text-emerald-500 dark:text-emerald-200",
            },
            {
                id: "batch-pipeline",
                title: "Pasta inteira",
                label: "Várias imagens de uma vez",
                description:
                    "Tire o fundo e gere o SVG de todas as imagens de uma pasta do computador. Dá para pular uma das duas etapas.",
                icon: FolderOpen,
                accent: "text-violet-600 dark:text-violet-200",
            },
        ],
    },
    {
        id: "vetor",
        title: "Vetor (SVG)",
        label: "Transforme imagem em SVG",
        description:
            "Transforme uma imagem em SVG, um desenho que amplia sem perder qualidade e pode ser editado em programas de design. Ideal para logos e ícones.",
        icon: FileCode2,
        accent: "text-amber-600 dark:text-amber-200",
        tools: [
            {
                id: "svg",
                title: "Vetorizar (SVG)",
                label: "Amplia sem perder qualidade",
                description:
                    "Transforme uma imagem em SVG, ideal para logos e ícones. Escolha colorido ou preto e branco e ajuste o nível de detalhe.",
                icon: FileCode2,
                accent: "text-amber-600 dark:text-amber-200",
            },
        ],
    },
    {
        id: "ktx",
        title: "Texturas KTX",
        label: "Para cenas 3D (avançado)",
        description:
            "Transforme imagens em KTX2, textura leve para cenas 3D como as do portfólio. Também conserta texturas viradas. Precisa das ferramentas de textura instaladas.",
        icon: Box,
        accent: "text-sky-600 dark:text-sky-200",
        tools: [
            {
                id: "ktx-single",
                title: "Imagem para KTX",
                label: "Uma imagem por vez",
                description:
                    "Transforme uma imagem em KTX2, textura leve para cenas 3D. Escolha o nível de qualidade antes de converter.",
                icon: Box,
                accent: "text-sky-600 dark:text-sky-200",
            },
            {
                id: "ktx-batch",
                title: "Pasta para KTX",
                label: "Várias imagens de uma vez",
                description:
                    "Transforme em KTX2 todas as imagens PNG ou JPG de uma pasta do computador.",
                icon: FolderSync,
                accent: "text-orange-600 dark:text-orange-200",
            },
            {
                id: "ktx-orientation",
                title: "Corrigir KTX virado",
                label: "Para arquivos KTX prontos",
                description:
                    "Conserte uma textura KTX que aparece de cabeça para baixo ou espelhada na cena 3D.",
                icon: ShieldCheck,
                accent: "text-lime-600 dark:text-lime-200",
            },
            {
                id: "portfolio-ktx",
                title: "Portfólio KTX",
                label: "Tamanho 960 x 540",
                description:
                    "Ajuste a imagem ao tamanho do portfólio (960 x 540) e receba a textura KTX pronta, já na posição certa.",
                icon: PackageCheck,
                accent: "text-cyan-600 dark:text-cyan-200",
            },
        ],
    },
    {
        id: "transcricao",
        title: "Transcrição",
        label: "Áudio ou vídeo em texto",
        description:
            "Solte um áudio ou vídeo (WhatsApp, reunião, aula ou link do YouTube) e receba o texto pronto para copiar. Também gera legenda.",
        icon: AudioLines,
        accent: "text-rose-600 dark:text-rose-200",
        tools: [
            {
                id: "transcribe",
                title: "Transcrição",
                label: "Texto e legenda",
                description:
                    "Solte um áudio ou vídeo, ou cole um link do YouTube, e receba a transcrição pronta para copiar ou como legenda.",
                icon: AudioLines,
                accent: "text-rose-600 dark:text-rose-200",
            },
        ],
    },
    {
        id: "documento",
        title: "Documento (PDF)",
        label: "Crie e edite PDFs",
        description:
            "Transforme a foto ou o print de um documento em PDF com texto de verdade, que dá para copiar, buscar e editar. Ou abra um PDF e edite os textos direto na página.",
        icon: FileType2,
        accent: "text-red-600 dark:text-red-200",
        tools: [
            {
                id: "image-to-pdf",
                title: "Imagem para PDF",
                label: "PDF com texto editável",
                description:
                    "Transforme a foto de um documento em um PDF igual à imagem, com texto que dá para copiar e editar. A leitura usa IA ou o Tesseract, que funciona sem internet.",
                icon: FileText,
                accent: "text-red-600 dark:text-red-200",
            },
            {
                id: "editor",
                title: "Editor de PDF",
                label: "Arraste e edite textos",
                description:
                    "Abra um PDF e edite como no Canva: cada texto vira uma caixa que você arrasta, alinha e muda fonte, tamanho e cor. No fim, baixe o PDF pronto.",
                icon: MousePointer2,
                accent: "text-fuchsia-600 dark:text-fuchsia-200",
            },
        ],
    },
    {
        id: "pacotes",
        title: "Baixar pacotes",
        label: "Instale o que falta",
        description:
            "Veja o que já está instalado e instale o que falta com um clique: modelos de IA, ffmpeg (lê áudio e vídeo) e ferramentas de textura.",
        icon: HardDriveDownload,
        accent: "text-indigo-600 dark:text-indigo-200",
        tools: [
            {
                id: "packages",
                title: "Baixar pacotes",
                label: "Modelos e ferramentas",
                description:
                    "Descubra o que falta no Sharpz e baixe os pacotes com um clique, vendo o progresso ao vivo.",
                icon: HardDriveDownload,
                accent: "text-indigo-600 dark:text-indigo-200",
            },
        ],
    },
    {
        id: "sistema",
        title: "Sistema",
        label: "Detalhes técnicos",
        description:
            "Veja se o servidor está no ar e o que ele encontrou: módulos, modelos de IA e ferramentas de textura. Útil quando algo não funciona.",
        icon: Server,
        accent: "text-zinc-700 dark:text-zinc-100",
        tools: [
            {
                id: "system",
                title: "Sistema",
                label: "Status e diagnóstico",
                description: "Veja o status do sistema: servidor, modelos de IA e ferramentas encontradas.",
                icon: Server,
                accent: "text-zinc-700 dark:text-zinc-100",
            },
        ],
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
