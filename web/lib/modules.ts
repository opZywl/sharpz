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
        title: "Imagem & Fundo",
        label: "Limpar e recortar",
        description:
            "Remova o fundo das suas imagens, gere versoes limpas com transparencia e processe pastas inteiras. Aceita praticamente qualquer formato (PNG, JPG, WEBP, BMP, TIFF).",
        icon: ImagePlus,
        accent: "text-emerald-500 dark:text-emerald-200",
        tools: [
            {
                id: "clean",
                title: "Remover Fundo",
                label: "Recorte com IA",
                description:
                    "Recorte com controle fino: IA ou claro/escuro, bordas, transparencia e cor. Aceita PNG, JPG, WEBP, BMP e TIFF.",
                icon: Scissors,
                accent: "text-zinc-700 dark:text-stone-100",
            },
            {
                id: "pipeline",
                title: "Pipeline",
                label: "Fundo + vetor",
                description:
                    "Faz tudo de uma vez: remove o fundo e ja transforma a imagem em vetor (SVG) num passo so.",
                icon: Wand2,
                accent: "text-emerald-500 dark:text-emerald-200",
            },
            {
                id: "batch-pipeline",
                title: "Batch Pipeline",
                label: "Pasta inteira",
                description:
                    "O mesmo fluxo (remover fundo + vetorizar), mas aplicado a uma pasta inteira de imagens de uma vez.",
                icon: FolderOpen,
                accent: "text-violet-600 dark:text-violet-200",
            },
        ],
    },
    {
        id: "vetor",
        title: "Vetor (SVG)",
        label: "Imagem em vetor",
        description:
            "Converte uma imagem em SVG: grafico vetorial que amplia sem perder qualidade e e editavel em ferramentas de design. Ideal para logos e icones.",
        icon: FileCode2,
        accent: "text-amber-600 dark:text-amber-200",
        tools: [
            {
                id: "svg",
                title: "PNG -> SVG",
                label: "Vetorizar",
                description:
                    "Transforma uma imagem em vetor (SVG) que amplia sem perder qualidade. Escolha cor ou preto e branco e ajuste o nivel de detalhe.",
                icon: FileCode2,
                accent: "text-amber-600 dark:text-amber-200",
            },
        ],
    },
    {
        id: "ktx",
        title: "Texturas KTX",
        label: "Texturas 3D (avancado)",
        description:
            "Texturas KTX2 usadas no portfolio e em cenas 3D. Converta imagem ou pasta, corrija orientacao ou gere no tamanho do portfolio. Requer as ferramentas KTX instaladas.",
        icon: Box,
        accent: "text-sky-600 dark:text-sky-200",
        tools: [
            {
                id: "ktx-single",
                title: "PNG -> KTX",
                label: "Imagem unica",
                description:
                    "Converte uma imagem no formato de textura KTX2 (usado em 3D), escolhendo um preset de qualidade.",
                icon: Box,
                accent: "text-sky-600 dark:text-sky-200",
            },
            {
                id: "ktx-batch",
                title: "Batch KTX",
                label: "Pasta inteira",
                description:
                    "Converte de uma vez todas as imagens (PNG/JPG) de uma pasta para textura KTX2.",
                icon: FolderSync,
                accent: "text-orange-600 dark:text-orange-200",
            },
            {
                id: "ktx-orientation",
                title: "Patch KTX",
                label: "Corrige orientacao",
                description:
                    "Conserta texturas KTX que aparecem de cabeca para baixo ou invertidas na cena 3D.",
                icon: ShieldCheck,
                accent: "text-lime-600 dark:text-lime-200",
            },
            {
                id: "portfolio-ktx",
                title: "Portfolio KTX",
                label: "960 x 540",
                description:
                    "Ajusta a imagem ao tamanho 960x540 do portfolio e ja entrega a textura KTX pronta e na orientacao certa.",
                icon: PackageCheck,
                accent: "text-cyan-600 dark:text-cyan-200",
            },
        ],
    },
    {
        id: "transcricao",
        title: "Transcricao",
        label: "Video/audio em texto",
        description:
            "Envie um video ou audio e receba o texto transcrito, com legendas, tempo por palavra e separacao de quem fala.",
        icon: AudioLines,
        accent: "text-rose-600 dark:text-rose-200",
        tools: [
            {
                id: "transcribe",
                title: "Transcricao",
                label: "Video -> Texto",
                description:
                    "Envie um video ou audio e receba o texto, com legendas e separacao de quem fala.",
                icon: AudioLines,
                accent: "text-rose-600 dark:text-rose-200",
            },
        ],
    },
    {
        id: "documento",
        title: "Documento (PDF)",
        label: "Imagem em PDF editavel",
        description:
            "Converte uma imagem com texto num PDF visualmente identico a imagem + camada de texto real (selecionavel, pesquisavel e editavel). Le a imagem com IA de visao (ou Tesseract), com verificacao, e mostra o passo a passo ao vivo.",
        icon: FileType2,
        accent: "text-red-600 dark:text-red-200",
        tools: [
            {
                id: "image-to-pdf",
                title: "Imagem -> PDF",
                label: "PDF editavel 100%",
                description:
                    "Imagem com texto -> PDF identico a imagem + camada de texto selecionavel/editavel. Le via Vision LLM (com verificacao) ou Tesseract, passo a passo ao vivo.",
                icon: FileText,
                accent: "text-red-600 dark:text-red-200",
            },
        ],
    },
    {
        id: "pacotes",
        title: "Baixar pacotes",
        label: "Instalar dependencias",
        description:
            "Central de instalacao do Sharpz. Veja o que ja esta instalado e o que falta (ffmpeg, modelo large-v3 ~3GB, KTX-Software, Ollama...) e instale cada item com 1 clique, acompanhando o progresso ao vivo.",
        icon: HardDriveDownload,
        accent: "text-indigo-600 dark:text-indigo-200",
        tools: [
            {
                id: "packages",
                title: "Baixar pacotes",
                label: "Dependencias",
                description:
                    "Detecta e instala tudo que o Sharpz precisa pra funcionar 100%, com log ao vivo.",
                icon: HardDriveDownload,
                accent: "text-indigo-600 dark:text-indigo-200",
            },
        ],
    },
    {
        id: "sistema",
        title: "Sistema",
        label: "Status (avancado)",
        description:
            "Status tecnico do app: modulos, endpoints, modelos de IA e ferramentas KTX detectadas.",
        icon: Server,
        accent: "text-zinc-700 dark:text-zinc-100",
        tools: [
            {
                id: "system",
                title: "Sistema",
                label: "Status",
                description: "Status e diagnostico do app.",
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
