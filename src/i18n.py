from __future__ import annotations

import contextvars
from collections.abc import Iterator
from contextlib import contextmanager
from urllib.parse import parse_qs

DEFAULT_LANG = "pt-BR"
SUPPORTED_LANGS = ("pt-BR", "en")

_LANG: contextvars.ContextVar[str] = contextvars.ContextVar("sharpz_lang", default=DEFAULT_LANG)


def normalize_lang(value: str | None) -> str | None:
    primary = (value or "").strip().replace("_", "-").split("-", 1)[0].lower()
    if primary == "pt":
        return "pt-BR"
    if primary == "en":
        return "en"
    return None


def accept_language(header: str | None) -> str | None:
    ranked: list[tuple[float, int, str]] = []
    for index, part in enumerate((header or "").split(",")):
        tag, *params = part.split(";")
        weight = 1.0
        for param in params:
            name, _, value = param.strip().partition("=")
            if name.strip().lower() == "q":
                try:
                    weight = float(value)
                except ValueError:
                    weight = 0.0
        lang = normalize_lang(tag)
        if lang and weight > 0:
            ranked.append((-weight, index, lang))
    return min(ranked)[2] if ranked else None


def resolve_lang(query: str | None = None, header: str | None = None) -> str:
    return normalize_lang(query) or accept_language(header) or DEFAULT_LANG


def scope_lang(scope: dict) -> str:
    raw = scope.get("query_string") or b""
    query = parse_qs(raw.decode("latin-1") if isinstance(raw, bytes) else str(raw)).get("lang") or [None]
    header = None
    for name, value in scope.get("headers") or []:
        if name.lower() == b"accept-language":
            header = value.decode("latin-1")
            break
    return resolve_lang(query[0], header)


def get_lang() -> str:
    return _LANG.get()


def set_lang(lang: str | None) -> contextvars.Token:
    return _LANG.set(normalize_lang(lang) or DEFAULT_LANG)


def reset_lang(token: contextvars.Token) -> None:
    _LANG.reset(token)


@contextmanager
def use_lang(lang: str | None) -> Iterator[str]:
    token = set_lang(lang)
    try:
        yield get_lang()
    finally:
        _LANG.reset(token)


class LanguageMiddleware:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        token = set_lang(scope_lang(scope))
        try:
            await self.app(scope, receive, send)
        finally:
            _LANG.reset(token)


def t(key: str, lang: str | None = None, /, **params: object) -> str:
    entry = MESSAGES[key]
    text = entry.get(normalize_lang(lang) or get_lang()) or entry[DEFAULT_LANG]
    return text.format(**params) if params else text


MESSAGES: dict[str, dict[str, str]] = {
    "server.error.unexpected": {
        "pt-BR": "Erro inesperado no servidor: {reason}",
        "en": "Unexpected server error: {reason}",
    },
    "server.error.unexpected_retry": {
        "pt-BR": "Erro inesperado no servidor. Tente de novo.",
        "en": "Unexpected server error. Please try again.",
    },
    "server.file_empty": {
        "pt-BR": "Arquivo vazio.",
        "en": "The file is empty.",
    },
    "server.upload_empty": {
        "pt-BR": "O arquivo enviado está vazio.",
        "en": "The uploaded file is empty.",
    },
    "server.image_too_large": {
        "pt-BR": "Imagem grande demais para processar. Reduza a resolução e tente de novo.",
        "en": "The image is too large to process. Lower the resolution and try again.",
    },
    "server.image_invalid": {
        "pt-BR": "Imagem inválida ou formato não suportado. Use PNG, JPG, WEBP, BMP ou TIFF.",
        "en": "Invalid image or unsupported format. Use PNG, JPG, WEBP, BMP or TIFF.",
    },
    "server.model_unknown": {
        "pt-BR": "Modelo desconhecido: {model}. Escolha um modelo da lista.",
        "en": "Unknown model: {model}. Pick a model from the list.",
    },
    "server.job_not_found": {
        "pt-BR": "Job não encontrado.",
        "en": "Job not found.",
    },
    "server.local_only": {
        "pt-BR": "O servidor só aceita requisições deste computador.",
        "en": "Requests are only accepted from this computer.",
    },
    "server.open_folder_failed": {
        "pt-BR": "Não foi possível abrir a pasta neste ambiente.",
        "en": "Could not open the folder in this environment.",
    },
    "server.ktx.missing": {
        "pt-BR": "KTX-Software não encontrado. Instale em Baixar pacotes (Texturas KTX) e tente de novo.",
        "en": "KTX-Software not found. Install it under Packages (KTX textures) and try again.",
    },
    "server.ktx.failed": {
        "pt-BR": "Falha na conversão KTX.",
        "en": "KTX conversion failed.",
    },
    "server.ktx.converted": {
        "pt-BR": "Convertido {name} em {ms} ms",
        "en": "Converted {name} in {ms} ms",
    },
    "server.ktx.aligned": {
        "pt-BR": "Alinhado {before} -> {after}",
        "en": "Aligned {before} -> {after}",
    },
    "server.ktx.input_missing": {
        "pt-BR": "Pasta de entrada não encontrada: {path}",
        "en": "Input folder not found: {path}",
    },
    "server.ktx.no_images": {
        "pt-BR": "Nenhuma imagem PNG/JPG em {path}",
        "en": "No PNG/JPG images in {path}",
    },
    "server.batch.path_missing": {
        "pt-BR": "Caminho não encontrado: {path}",
        "en": "Path not found: {path}",
    },
    "server.batch.no_images": {
        "pt-BR": "Nenhuma imagem suportada em {path}",
        "en": "No supported images in {path}",
    },
    "server.batch.processed": {
        "pt-BR": "Processadas {done}/{total} imagem(ns) em {seconds}s",
        "en": "Processed {done}/{total} image(s) in {seconds}s",
    },
    "server.batch.output": {
        "pt-BR": "Saída: {path}",
        "en": "Output: {path}",
    },
    "server.batch.out_of_memory": {
        "pt-BR": "Lote interrompido por falta de memória: {count} imagem(ns) não processada(s).",
        "en": "Batch stopped for lack of memory: {count} image(s) not processed.",
    },
    "server.batch.failures": {
        "pt-BR": "Falhas:",
        "en": "Failures:",
    },
    "server.orientation.failed": {
        "pt-BR": "Não consegui corrigir a orientação do KTX: {error}",
        "en": "Could not fix the KTX orientation: {error}",
    },
    "server.orientation.done": {
        "pt-BR": "Orientação corrigida: a textura aparece na posição certa na cena 3D.",
        "en": "Orientation fixed: the texture now shows the right way in the 3D scene.",
    },
    "server.portfolio.missing": {
        "pt-BR": "O conversor do Portfólio KTX não está instalado. Rode o sharpz.cmd e escolha Instalar.",
        "en": "The Portfolio KTX converter is not installed. Run sharpz.cmd and pick the install option.",
    },
    "server.portfolio.failed": {
        "pt-BR": "Falha ao gerar o Portfólio KTX: {error}",
        "en": "Could not create the Portfolio KTX: {error}",
    },
    "server.portfolio.fitted": {
        "pt-BR": "Ajustado {before} -> {after}",
        "en": "Resized {before} -> {after}",
    },
    "server.portfolio.canvas": {
        "pt-BR": "Tela {size}, ETC1S q255, sRGB, sem mipmaps",
        "en": "Canvas {size}, ETC1S q255, sRGB, no mipmaps",
    },
    "server.portfolio.saved": {
        "pt-BR": "Salvo em: {path}",
        "en": "Saved to: {path}",
    },
    "transcribe.local_missing": {
        "pt-BR": "Arquivo local não encontrado: {path}",
        "en": "Local file not found: {path}",
    },
    "transcribe.no_source": {
        "pt-BR": "Envie um arquivo, informe um caminho local ou uma URL.",
        "en": "Upload a file, enter a local path or a URL.",
    },
    "transcribe.model_unknown": {
        "pt-BR": "Modelo desconhecido: {key}.",
        "en": "Unknown model: {key}.",
    },
    "transcribe.model_download_start_failed": {
        "pt-BR": "Não consegui iniciar o download do modelo: {error}",
        "en": "Could not start the model download: {error}",
    },
    "transcribe.file_unavailable": {
        "pt-BR": "Arquivo '{fmt}' indisponível para este job.",
        "en": "File '{fmt}' is not available for this job.",
    },
    "transcribe.media_unavailable": {
        "pt-BR": "Mídia de entrada indisponível para este job.",
        "en": "The input media is not available for this job.",
    },
    "transcribe.summary.no_text": {
        "pt-BR": "Este job ainda não tem texto transcrito para resumir.",
        "en": "This job has no transcribed text to summarize yet.",
    },
    "transcribe.summary.base_url": {
        "pt-BR": "Informe a base_url do endpoint LLM (ex: http://localhost:11434/v1).",
        "en": "Enter the base URL of the LLM endpoint (e.g. http://localhost:11434/v1).",
    },
    "transcribe.summary.model": {
        "pt-BR": "Informe o modelo do LLM.",
        "en": "Enter the LLM model.",
    },
    "transcribe.summary.prompt": {
        "pt-BR": (
            "Você resume transcrições em português de forma clara e estruturada "
            "(título, tópicos com os pontos principais e próximos passos, se houver)."
        ),
        "en": (
            "You summarize transcripts in English, clearly and in a structured way "
            "(title, bullet points with the main points and next steps, if any)."
        ),
    },
    "transcribe.summary.http_error": {
        "pt-BR": "O LLM em {url} respondeu com erro {code}. {detail}",
        "en": "The LLM at {url} answered with error {code}. {detail}",
    },
    "transcribe.summary.unreachable": {
        "pt-BR": "Não consegui falar com o LLM em {url}. Verifique se o Ollama/endpoint está rodando. ({reason})",
        "en": "Could not reach the LLM at {url}. Check that Ollama or the endpoint is running. ({reason})",
    },
    "transcribe.summary.failed": {
        "pt-BR": "Falha ao resumir via LLM em {url}: {error}",
        "en": "Summarizing with the LLM at {url} failed: {error}",
    },
    "transcribe.summary.bad_response": {
        "pt-BR": "Resposta do LLM em formato inesperado (sem choices/message).",
        "en": "The LLM answered in an unexpected format (no choices/message).",
    },
    "transcribe.complete.missing": {
        "pt-BR": "Este job não tem pacote Complete.",
        "en": "This job has no Complete package.",
    },
    "transcribe.complete.file_missing": {
        "pt-BR": "Arquivo não encontrado no pacote.",
        "en": "File not found in the package.",
    },
    "transcribe.complete.zip_missing": {
        "pt-BR": "Zip indisponível para este job.",
        "en": "No zip available for this job.",
    },
    "transcribe.spawn_failed": {
        "pt-BR": (
            "Não consegui iniciar o motor de transcrição ({error}). "
            "Confira se o whisper-venv está instalado (rode o sharpz.cmd e escolha Instalar)."
        ),
        "en": (
            "Could not start the transcription engine ({error}). "
            "Check that the whisper-venv is installed (run sharpz.cmd and pick the install option)."
        ),
    },
    "transcribe.engine_died": {
        "pt-BR": "O motor de transcrição fechou no meio do trabalho",
        "en": "The transcription engine closed in the middle of the job",
    },
    "transcribe.engine_died_code": {
        "pt-BR": " (código {code})",
        "en": " (code {code})",
    },
    "transcribe.engine_died_hint": {
        "pt-BR": (
            ". Isso costuma ser falta de memória: feche programas pesados e tente de novo. "
            "O próximo envio abre um motor novo."
        ),
        "en": (
            ". This usually means the computer ran out of memory: close heavy programs and try again. "
            "The next job starts a fresh engine."
        ),
    },
    "transcribe.detail": {
        "pt-BR": " Detalhe: {detail}",
        "en": " Details: {detail}",
    },
    "transcribe.unexpected": {
        "pt-BR": "Erro inesperado na transcrição: {error}",
        "en": "Unexpected transcription error: {error}",
    },
    "transcribe.no_audio": {
        "pt-BR": "Nenhuma fonte de áudio disponível para este job.",
        "en": "No audio source available for this job.",
    },
    "transcribe.engine_failed": {
        "pt-BR": "O motor de transcrição falhou sem detalhar o erro.",
        "en": "The transcription engine failed without details.",
    },
    "transcribe.ytdlp_failed": {
        "pt-BR": "Não consegui iniciar o yt-dlp: {error}",
        "en": "Could not start yt-dlp: {error}",
    },
    "transcribe.download_failed": {
        "pt-BR": "Falha ao baixar o áudio da URL. Verifique se o link é válido e acessível.",
        "en": "Could not download the audio from the URL. Check that the link is valid and reachable.",
    },
    "transcribe.download_missing": {
        "pt-BR": "O download terminou, mas o arquivo de áudio não foi encontrado.",
        "en": "The download finished, but the audio file was not found.",
    },
    "transcribe.engine_missing": {
        "pt-BR": "O motor de transcrição não está instalado. Rode o sharpz.cmd, escolha Instalar e tente de novo.",
        "en": "The transcription engine is not installed. Run sharpz.cmd, pick the install option and try again.",
    },
    "transcribe.model_not_cached": {
        "pt-BR": "O download terminou, mas o modelo não apareceu no cache do Hugging Face.",
        "en": "The download finished, but the model did not show up in the Hugging Face cache.",
    },
    "transcribe.model_download_failed": {
        "pt-BR": "Falha ao baixar o modelo {key}.{detail}",
        "en": "Could not download the {key} model.{detail}",
    },
    "transcribe.unknown_error": {
        "pt-BR": "Erro desconhecido na transcrição.",
        "en": "Unknown transcription error.",
    },
    "transcribe.memory": {
        "pt-BR": "Memória insuficiente para rodar {target}. Feche programas pesados ou escolha um modelo menor e tente de novo.",
        "en": "Not enough memory to run {target}. Close heavy programs or pick a smaller model and try again.",
    },
    "transcribe.memory_target": {
        "pt-BR": "o modelo",
        "en": "the model",
    },
    "transcribe.memory_target_model": {
        "pt-BR": "o modelo {model}",
        "en": "the {model} model",
    },
    "transcribe.failed": {
        "pt-BR": "Falha na transcrição: {reason}",
        "en": "Transcription failed: {reason}",
    },
    "transcribe.file_missing": {
        "pt-BR": "Arquivo não encontrado: {path}",
        "en": "File not found: {path}",
    },
    "transcribe.speaker": {
        "pt-BR": "Locutor {name}",
        "en": "Speaker {name}",
    },
    "transcribe.diarize_no_token": {
        "pt-BR": "Sem token do Hugging Face: informe o HF_TOKEN para separar os locutores.",
        "en": "No Hugging Face token: set HF_TOKEN to separate the speakers.",
    },
    "transcribe.whisperx_unavailable": {
        "pt-BR": "whisperX indisponível: {error}",
        "en": "whisperX unavailable: {error}",
    },
    "transcribe.bad_request": {
        "pt-BR": "Pedido inválido para o motor de transcrição: {error}",
        "en": "Invalid request for the transcription engine: {error}",
    },
    "complete.ffmpeg_missing": {
        "pt-BR": "ffmpeg indisponível",
        "en": "ffmpeg unavailable",
    },
    "complete.frames": {
        "pt-BR": "{count} quadros",
        "en": "{count} frames",
    },
    "complete.scenes": {
        "pt-BR": "{count} cenas",
        "en": "{count} scenes",
    },
    "complete.no_video": {
        "pt-BR": "entrada sem vídeo",
        "en": "input has no video",
    },
    "complete.no_speech": {
        "pt-BR": "(sem fala)",
        "en": "(no speech)",
    },
    "complete.transcript.title": {
        "pt-BR": "TRANSCRIÇÃO COMPLETA",
        "en": "FULL TRANSCRIPT",
    },
    "complete.transcript.meta": {
        "pt-BR": "Idioma: {language} | Duração: {duration}s | Modelo: {model}",
        "en": "Language: {language} | Duration: {duration}s | Model: {model}",
    },
    "complete.transcript.text": {
        "pt-BR": "TEXTO CORRIDO",
        "en": "FULL TEXT",
    },
    "complete.transcript.segments": {
        "pt-BR": "SEGMENTOS COM TEMPOS",
        "en": "TIMED SEGMENTS",
    },
    "complete.docs.prompt": {
        "pt-BR": (
            "Você é um analista que assiste a uma GRAVAÇÃO DE TELA (a fala é curta, o conteúdo está na "
            "imagem) e documenta a funcionalidade mostrada para que um time a reconstrua. Escreva SEMPRE "
            "em PORTUGUÊS do Brasil, tom claro e prático, focando em beleza, praticidade e informação. "
            "Você recebe: a transcrição do áudio, um contact sheet numerado (visão geral) e as imagens de "
            "cena (cada uma é uma tela/etapa do fluxo). Produza três documentos markdown: README (índice "
            "curto), FEEDBACK (passo a passo do fluxo com tabela de etapas, dados vistos e o que construir) "
            "e SPEC (especificação técnica: campos, cálculos, telas, modelo de dados, fases). Nos markdowns, "
            "referencie as imagens pelo new_name que você escolher (ex: ![etapa](imagens/03-modal.jpg)).\n"
            "Responda APENAS com um objeto JSON válido (sem markdown, sem cercas ```), com as chaves: "
            "slug (kebab-case curto), title, images (lista de {file, new_name, caption}; file é o nome "
            "original tipo 'cena_001.jpg', new_name é um nome descritivo tipo '03-modal-xyz.jpg' com prefixo "
            "numérico), readme (string markdown), feedback (string markdown), spec (string markdown)."
        ),
        "en": (
            "You are an analyst watching a SCREEN RECORDING (the speech is short, the content is in the "
            "image) and documenting the feature shown so a team can rebuild it. ALWAYS write in English, "
            "in a clear and practical tone, focusing on looks, practicality and information. "
            "You get: the audio transcript, a numbered contact sheet (overview) and the scene images "
            "(each one is a screen/step of the flow). Produce three markdown documents: README (short "
            "index), FEEDBACK (step-by-step flow with a table of steps, data seen and what to build) "
            "and SPEC (technical specification: fields, calculations, screens, data model, phases). In the "
            "markdown files, reference the images by the new_name you choose (e.g. ![step](imagens/03-modal.jpg)).\n"
            "Reply ONLY with a valid JSON object (no markdown, no ``` fences), with the keys: "
            "slug (short kebab-case), title, images (list of {file, new_name, caption}; file is the original "
            "name like 'cena_001.jpg', new_name is a descriptive name like '03-modal-xyz.jpg' with a numeric "
            "prefix), readme (markdown string), feedback (markdown string), spec (markdown string)."
        ),
    },
    "complete.docs.transcript": {
        "pt-BR": (
            "TRANSCRIÇÃO DO ÁUDIO:\n{text}\n\nA seguir, o contact sheet numerado (visão geral) e as imagens "
            "de cena na ordem do fluxo. Use-as para entender e documentar a funcionalidade."
        ),
        "en": (
            "AUDIO TRANSCRIPT:\n{text}\n\nNext come the numbered contact sheet (overview) and the scene "
            "images in flow order. Use them to understand and document the feature."
        ),
    },
    "complete.docs.contact_sheet": {
        "pt-BR": "Contact sheet (visão geral, frames numerados):",
        "en": "Contact sheet (overview, numbered frames):",
    },
    "complete.docs.image": {
        "pt-BR": "Imagem: {name}",
        "en": "Image: {name}",
    },
    "complete.readme.title": {
        "pt-BR": "# Pacote Complete (sem docs de IA)",
        "en": "# Complete package (no AI docs)",
    },
    "complete.readme.missing": {
        "pt-BR": "Os docs analíticos (FEEDBACK/SPEC) não foram gerados (IA de visão desligada ou indisponível).",
        "en": "The analysis docs (FEEDBACK/SPEC) were not generated (vision AI off or unavailable).",
    },
    "complete.readme.index": {
        "pt-BR": "Abaixo, o índice do que foi extraído automaticamente.",
        "en": "Below is an index of what was extracted automatically.",
    },
    "complete.readme.transcripts": {
        "pt-BR": "- `transcricao-completa.txt` / `.srt` / `.vtt` / `.json` — transcrição",
        "en": "- `transcricao-completa.txt` / `.srt` / `.vtt` / `.json` — transcript",
    },
    "complete.readme.frames": {
        "pt-BR": "- `frames-todos/` — frames (1 a cada N s) + contact sheets",
        "en": "- `frames-todos/` — frames (1 every N s) + contact sheets",
    },
    "complete.readme.images": {
        "pt-BR": "- `imagens/` — {count} frames-chave por detecção de cena",
        "en": "- `imagens/` — {count} key frames from scene detection",
    },
    "complete.readme.text": {
        "pt-BR": "## Transcrição (texto corrido)",
        "en": "## Transcript (full text)",
    },
    "processor.model.isnet-general-use": {
        "pt-BR": "ISNet (rápido)",
        "en": "ISNet (fast)",
    },
    "processor.model.birefnet-general-lite": {
        "pt-BR": "BiRefNet Lite (detalhado)",
        "en": "BiRefNet Lite (detailed)",
    },
    "processor.model.birefnet-general": {
        "pt-BR": "BiRefNet (qualidade máxima)",
        "en": "BiRefNet (best quality)",
    },
    "processor.model.u2net": {
        "pt-BR": "U2Net (mais leve)",
        "en": "U2Net (lightest)",
    },
    "processor.model.birefnet-portrait": {
        "pt-BR": "BiRefNet Retrato (pessoas)",
        "en": "BiRefNet Portrait (people)",
    },
    "processor.model.u2net_human_seg": {
        "pt-BR": "U2Net Pessoas (leve)",
        "en": "U2Net People (light)",
    },
    "processor.model.sam": {
        "pt-BR": "Segment Anything (objeto central)",
        "en": "Segment Anything (central object)",
    },
    "processor.detail.isnet-general-use": {
        "pt-BR": "Leve e rápido: ~1,5 GB de RAM no pico, bom para a maioria das imagens (~180 MB).",
        "en": "Light and fast: ~1.5 GB of RAM at peak, good for most images (~180 MB).",
    },
    "processor.detail.birefnet-general-lite": {
        "pt-BR": "Recorte mais fino em cabelo e bordas, mas usa ~6 GB de RAM no pico e é bem mais lento (~220 MB).",
        "en": "Finer cutouts on hair and edges, but uses ~6 GB of RAM at peak and is much slower (~220 MB).",
    },
    "processor.detail.birefnet-general": {
        "pt-BR": "Melhor recorte, mas o mais pesado: ~970 MB e muitos GB de RAM. Pode deixar o PC lento.",
        "en": "Best cutout, but the heaviest: ~970 MB and many GB of RAM. It can slow your PC down.",
    },
    "processor.detail.u2net": {
        "pt-BR": "O mais leve e rápido; recorte mais simples (~175 MB).",
        "en": "The lightest and fastest; simpler cutouts (~175 MB).",
    },
    "processor.detail.birefnet-portrait": {
        "pt-BR": "Especialista em pessoas e rostos. Pesado como o BiRefNet: ~970 MB e muitos GB de RAM.",
        "en": "Specialized in people and faces. As heavy as BiRefNet: ~970 MB and many GB of RAM.",
    },
    "processor.detail.u2net_human_seg": {
        "pt-BR": "Leve, focado em pessoas de corpo inteiro (~175 MB).",
        "en": "Light, focused on full-body shots of people (~175 MB).",
    },
    "processor.detail.sam": {
        "pt-BR": "Recorta o objeto que está no centro da imagem.",
        "en": "Cuts out the object in the center of the image.",
    },
    "processor.memory.generic": {
        "pt-BR": (
            "Memória insuficiente para concluir a operação. "
            "Feche outros programas ou use uma imagem menor e tente de novo."
        ),
        "en": (
            "Not enough memory to finish the operation. "
            "Close other programs or use a smaller image and try again."
        ),
    },
    "processor.memory.model": {
        "pt-BR": "Memória insuficiente para rodar o modelo {model}.",
        "en": "Not enough memory to run the {model} model.",
    },
    "processor.memory.lighter": {
        "pt-BR": "Feche outros programas ou escolha um modelo mais leve: {models}.",
        "en": "Close other programs or pick a lighter model: {models}.",
    },
    "processor.memory.or": {
        "pt-BR": " ou ",
        "en": " or ",
    },
    "processor.memory.smaller": {
        "pt-BR": "Feche outros programas ou use uma imagem menor.",
        "en": "Close other programs or use a smaller image.",
    },
    "processor.memory.alpha": {
        "pt-BR": "Desligar o Alpha matting também reduz o uso de memória.",
        "en": "Turning off Alpha matting also reduces memory use.",
    },
    "processor.unknown_model": {
        "pt-BR": "Modelo desconhecido: {model}",
        "en": "Unknown model: {model}",
    },
    "ktx.error.input_missing": {
        "pt-BR": "A imagem de entrada não existe: {path}",
        "en": "The input image does not exist: {path}",
    },
    "ktx.error.extension": {
        "pt-BR": "Extensão não suportada: {suffix} (use png/jpg)",
        "en": "Unsupported extension: {suffix} (use png/jpg)",
    },
    "ktx.error.output_exists": {
        "pt-BR": "O arquivo de saída já existe (passe overwrite=True): {path}",
        "en": "The output file already exists (pass overwrite=True): {path}",
    },
    "ktx.error.preset": {
        "pt-BR": "Preset desconhecido '{preset}'. Disponíveis: {presets}",
        "en": "Unknown preset '{preset}'. Available: {presets}",
    },
    "ktx.error.timeout": {
        "pt-BR": "A conversão KTX passou de 5 min (imagem grande demais para este preset?)",
        "en": "The KTX conversion took more than 5 min (image too large for this preset?)",
    },
    "ktx.error.unexpected": {
        "pt-BR": "Erro inesperado: {error}",
        "en": "Unexpected error: {error}",
    },
    "ktx.error.exit_code": {
        "pt-BR": "A conversão KTX falhou (código {code}):\n{output}",
        "en": "The KTX conversion failed (code {code}):\n{output}",
    },
    "ktx.error.not_created": {
        "pt-BR": "A conversão KTX terminou, mas o arquivo não foi criado: {path}",
        "en": "The KTX conversion finished, but the file was not created: {path}",
    },
    "ktx.error.crashed": {
        "pt-BR": "Falha inesperada: {error}",
        "en": "Unexpected failure: {error}",
    },
    "ktx.install_hint": {
        "pt-BR": (
            "toktx não encontrado no PATH.\n"
            "\n"
            "Instale o KTX-Software (CLI 'toktx'):\n"
            "  Windows: https://github.com/KhronosGroup/KTX-Software/releases\n"
            "           Baixe o instalador .exe (KTX-Software-X.X.X-Windows-x64.exe)\n"
            "           Marque 'Add to PATH' durante a instalação.\n"
            "  Linux:   sudo apt install ktx-tools  (Ubuntu 24.04+)\n"
            "           OU compile do código-fonte com cmake + ASTC encoder.\n"
            "  Mac:     brew install ktx\n"
            "\n"
            "Verifique com: toktx --version\n"
            "Esperado: toktx vX.Y.Z ou similar."
        ),
        "en": (
            "toktx not found in PATH.\n"
            "\n"
            "Install KTX-Software (the 'toktx' CLI):\n"
            "  Windows: https://github.com/KhronosGroup/KTX-Software/releases\n"
            "           Download the .exe installer (KTX-Software-X.X.X-Windows-x64.exe)\n"
            "           Check 'Add to PATH' during setup.\n"
            "  Linux:   sudo apt install ktx-tools  (Ubuntu 24.04+)\n"
            "           OR build from source with cmake + ASTC encoder.\n"
            "  Mac:     brew install ktx\n"
            "\n"
            "Check with: toktx --version\n"
            "Expected: toktx vX.Y.Z or similar."
        ),
    },
    "ktx.preset.ultra": {
        "pt-BR": "[*] ULTRA - UASTC q4 + zcmp22 + mipmaps (PADRÃO, qualidade máxima)",
        "en": "[*] ULTRA - UASTC q4 + zcmp22 + mipmaps (DEFAULT, best quality)",
    },
    "ktx.preset.ultra_rgba": {
        "pt-BR": "[*] ULTRA RGBA - igual ao ultra + canal alpha preservado",
        "en": "[*] ULTRA RGBA - same as ultra + alpha channel kept",
    },
    "ktx.preset.default": {
        "pt-BR": "ETC1S sRGB RGB qmax - screenshots de projeto (com perdas, mas leve)",
        "en": "ETC1S sRGB RGB qmax - project screenshots (lossy but light)",
    },
    "ktx.preset.srgb_genmipmap": {
        "pt-BR": "UASTC q3 sRGB + mipmaps - paleta/atlas equilibrado",
        "en": "UASTC q3 sRGB + mipmaps - balanced palette/atlas",
    },
    "ktx.preset.linear_red_mask": {
        "pt-BR": "ETC1S R linear - máscara de um canal (alpha, brilho)",
        "en": "ETC1S R linear - single-channel mask (alpha, glow)",
    },
    "ktx.preset.uastc_red_mask": {
        "pt-BR": "UASTC q4 R linear - máscara crítica com degradês suaves",
        "en": "UASTC q4 R linear - critical mask with smooth gradients",
    },
    "ktx.preset.career_rg": {
        "pt-BR": "UASTC q4 sRGB RG - texto nítido das career stones",
        "en": "UASTC q4 sRGB RG - sharp career stones text",
    },
    "ktx.preset.uastc_genmipmap_linear": {
        "pt-BR": "UASTC q4 linear + mipmaps - terreno/normal map",
        "en": "UASTC q4 linear + mipmaps - terrain/normal map",
    },
    "ktx.summary.none": {
        "pt-BR": "Nenhuma imagem processada.",
        "en": "No images processed.",
    },
    "ktx.summary.counts": {
        "pt-BR": "[OK]{ok} sucesso  ·  [X]{fail} falha  ·  total: {total}",
        "en": "[OK]{ok} succeeded  ·  [X]{fail} failed  ·  total: {total}",
    },
    "ktx.summary.size": {
        "pt-BR": "tamanho: {before:.1f} MB -> {after:.1f} MB  ({ratio:.1f}x menor, economia {saved:.1f} MB)",
        "en": "size: {before:.1f} MB -> {after:.1f} MB  ({ratio:.1f}x smaller, {saved:.1f} MB saved)",
    },
    "ktx.summary.time": {
        "pt-BR": "tempo total: {seconds:.1f}s ({per_image}ms/img em média)",
        "en": "total time: {seconds:.1f}s ({per_image}ms/img on average)",
    },
    "ktx.summary.quality": {
        "pt-BR": "qualidade: PSNR médio {average:.1f} dB (mín. {minimum:.1f}), nota {grade}",
        "en": "quality: average PSNR {average:.1f} dB (min {minimum:.1f}), grade {grade}",
    },
    "ktx.summary.aligned": {
        "pt-BR": "alinhadas: {count} imagem(ns) completadas para múltiplo de 4",
        "en": "aligned: {count} image(s) padded to a multiple of 4",
    },
    "ktx.summary.failures": {
        "pt-BR": "\nfalhas:",
        "en": "\nfailures:",
    },
    "ktx.summary.error": {
        "pt-BR": "erro",
        "en": "error",
    },
    "imgpdf.local_missing": {
        "pt-BR": "Caminho local não encontrado: {path}",
        "en": "Local path not found: {path}",
    },
    "imgpdf.no_source": {
        "pt-BR": "Envie uma imagem ou informe um caminho local.",
        "en": "Upload an image or enter a local path.",
    },
    "imgpdf.pdf_missing": {
        "pt-BR": "PDF indisponível para este job.",
        "en": "No PDF available for this job.",
    },
    "imgpdf.preview_missing": {
        "pt-BR": "Prévia indisponível para este job.",
        "en": "No preview available for this job.",
    },
    "imgpdf.pdf_filename": {
        "pt-BR": "documento.pdf",
        "en": "document.pdf",
    },
    "imgpdf.text_layer_suffix": {
        "pt-BR": "-camada-texto.txt",
        "en": "-text-layer.txt",
    },
    "imgpdf.input_missing": {
        "pt-BR": "Imagem de entrada indisponível para este job.",
        "en": "The input image is not available for this job.",
    },
    "imgpdf.unknown_error": {
        "pt-BR": "erro desconhecido",
        "en": "unknown error",
    },
    "imgpdf.log.loaded": {
        "pt-BR": "Imagem carregada: {width}x{height} ({mode})",
        "en": "Image loaded: {width}x{height} ({mode})",
    },
    "imgpdf.log.layout": {
        "pt-BR": "Layout: {count} região(ões) para leitura",
        "en": "Layout: {count} region(s) to read",
    },
    "imgpdf.log.layer": {
        "pt-BR": "Camada: {blocks} bloco(s), ~{chars} caracteres (motor: {engine})",
        "en": "Layer: {blocks} block(s), ~{chars} characters (engine: {engine})",
    },
    "imgpdf.log.checked": {
        "pt-BR": "PDF conferido: {chars} caracteres, {hyphens} hifens, {glitches} caracteres estranhos, página {page} pt",
        "en": "PDF checked: {chars} characters, {hyphens} hyphens, {glitches} odd characters, page {page} pt",
    },
    "imgpdf.log.clean": {
        "pt-BR": "Camada de texto limpa (0 NBSP / hífen suave / parêntese ornamental)",
        "en": "Clean text layer (0 NBSP / soft hyphen / ornamental parenthesis)",
    },
    "imgpdf.log.glitches": {
        "pt-BR": "Caracteres estranhos encontrados: {glitches}",
        "en": "Odd characters found: {glitches}",
    },
    "imgpdf.log.copied": {
        "pt-BR": "PDF copiado para: {path}",
        "en": "PDF copied to: {path}",
    },
    "imgpdf.log.copy_failed": {
        "pt-BR": "Não consegui copiar para a pasta de saída: {error}",
        "en": "Could not copy to the output folder: {error}",
    },
    "imgpdf.log.done": {
        "pt-BR": "Concluído.",
        "en": "Done.",
    },
    "imgpdf.engine.vision": {
        "pt-BR": "IA de visão",
        "en": "vision AI",
    },
    "imgpdf.engine.tesseract": {
        "pt-BR": "Tesseract",
        "en": "Tesseract",
    },
    "imgpdf.engine.nenhum": {
        "pt-BR": "nenhum",
        "en": "none",
    },
    "imgpdf.vision.not_configured": {
        "pt-BR": "A IA de visão está sem base_url/modelo configurados.",
        "en": "The vision AI has no base_url/model set.",
    },
    "imgpdf.vision.http_error": {
        "pt-BR": "A IA de visão em {url} respondeu {code}. {detail}",
        "en": "The vision AI at {url} answered {code}. {detail}",
    },
    "imgpdf.vision.unreachable": {
        "pt-BR": "Não consegui falar com a IA de visão em {url} ({reason}).",
        "en": "Could not reach the vision AI at {url} ({reason}).",
    },
    "imgpdf.vision.bad_response": {
        "pt-BR": "Resposta da IA de visão em formato inesperado (sem choices/message).",
        "en": "The vision AI answered in an unexpected format (no choices/message).",
    },
    "imgpdf.vision.bad_json": {
        "pt-BR": "A IA de visão não devolveu um JSON válido.",
        "en": "The vision AI did not return valid JSON.",
    },
    "imgpdf.vision.pass": {
        "pt-BR": "leitura {number}",
        "en": "pass {number}",
    },
    "imgpdf.vision.region_ok": {
        "pt-BR": "{label}: região {index}/{total} -> {blocks} blocos",
        "en": "{label}: region {index}/{total} -> {blocks} blocks",
    },
    "imgpdf.vision.region_failed": {
        "pt-BR": "{label}: região {index}/{total} falhou ({error})",
        "en": "{label}: region {index}/{total} failed ({error})",
    },
    "imgpdf.vision.correction": {
        "pt-BR": "verificação: '{before}' -> '{after}'",
        "en": "check: '{before}' -> '{after}'",
    },
    "imgpdf.vision.verified": {
        "pt-BR": "verificação: {corrections} correção(ões), {blocks} blocos finais",
        "en": "check: {corrections} correction(s), {blocks} final blocks",
    },
    "imgpdf.vision.required": {
        "pt-BR": "Motor 'vision' selecionado, mas a IA de visão não foi configurada (base_url/modelo).",
        "en": "The 'vision' engine was selected, but the vision AI is not set up (base_url/model).",
    },
    "imgpdf.vision.empty": {
        "pt-BR": "A IA de visão não retornou texto; tentando o Tesseract.",
        "en": "The vision AI returned no text; trying Tesseract.",
    },
    "imgpdf.vision.failed": {
        "pt-BR": "A IA de visão falhou ({error}); tentando o Tesseract.",
        "en": "The vision AI failed ({error}); trying Tesseract.",
    },
    "imgpdf.tesseract.not_found": {
        "pt-BR": "Tesseract não encontrado no PATH.",
        "en": "Tesseract not found in PATH.",
    },
    "imgpdf.tesseract.inverted": {
        "pt-BR": "tesseract: imagem escura -> invertida para o OCR",
        "en": "tesseract: dark image -> inverted for OCR",
    },
    "imgpdf.tesseract.lines": {
        "pt-BR": "tesseract ({langs}): {count} linhas",
        "en": "tesseract ({langs}): {count} lines",
    },
    "imgpdf.tesseract.absent": {
        "pt-BR": "Tesseract ausente. Instale em 'Baixar pacotes'. O PDF sai sem camada de texto.",
        "en": "Tesseract is missing. Install it under 'Packages'. The PDF will have no text layer.",
    },
    "editor.read_failed": {
        "pt-BR": "Não consegui ler o arquivo: {error}",
        "en": "Could not read the file: {error}",
    },
    "editor.elements_missing": {
        "pt-BR": "Envie elements no corpo.",
        "en": "Send elements in the request body.",
    },
    "editor.pdf_failed": {
        "pt-BR": "Falha ao gerar PDF: {error}",
        "en": "Could not create the PDF: {error}",
    },
    "editor.html_missing": {
        "pt-BR": "Envie 'html' no corpo.",
        "en": "Send 'html' in the request body.",
    },
    "editor.filename": {
        "pt-BR": "documento-editado",
        "en": "edited-document",
    },
    "editor.chrome_missing_pdf": {
        "pt-BR": "Google Chrome não encontrado para exportar o PDF.",
        "en": "Google Chrome was not found to export the PDF.",
    },
    "editor.chrome_missing_png": {
        "pt-BR": "Google Chrome não encontrado para exportar o PNG.",
        "en": "Google Chrome was not found to export the PNG.",
    },
    "editor.chrome_no_pdf": {
        "pt-BR": "O Chrome não gerou o PDF.",
        "en": "Chrome did not create the PDF.",
    },
    "editor.chrome_no_png": {
        "pt-BR": "O Chrome não gerou o PNG.",
        "en": "Chrome did not create the PNG.",
    },
    "packages.unknown": {
        "pt-BR": "Pacote desconhecido ou sem instalador automático.",
        "en": "Unknown package or no automatic installer.",
    },
    "packages.node.name": {
        "pt-BR": "Node.js (LTS)",
        "en": "Node.js (LTS)",
    },
    "packages.node.description": {
        "pt-BR": "Runtime que roda o painel web do Sharpz.",
        "en": "Runtime that runs the Sharpz web dashboard.",
    },
    "packages.uv.name": {
        "pt-BR": "uv (gerenciador Python)",
        "en": "uv (Python manager)",
    },
    "packages.uv.description": {
        "pt-BR": "Cria os ambientes Python isolados e instala as libs de IA rápido.",
        "en": "Creates the isolated Python environments and installs the AI libraries fast.",
    },
    "packages.node_modules.name": {
        "pt-BR": "Dependências do painel (npm)",
        "en": "Dashboard dependencies (npm)",
    },
    "packages.node_modules.description": {
        "pt-BR": "Bibliotecas que o painel do Sharpz precisa para abrir no navegador.",
        "en": "Libraries the Sharpz dashboard needs to open in the browser.",
    },
    "packages.node_modules.manual_hint": {
        "pt-BR": "Requer Node.js instalado.",
        "en": "Requires Node.js.",
    },
    "packages.ffmpeg.name": {
        "pt-BR": "FFmpeg",
        "en": "FFmpeg",
    },
    "packages.ffmpeg.description": {
        "pt-BR": "Decodifica áudio/vídeo para a transcrição.",
        "en": "Decodes audio/video for transcription.",
    },
    "packages.whisper_engine.name": {
        "pt-BR": "Motor de transcrição (faster-whisper + whisperX)",
        "en": "Transcription engine (faster-whisper + whisperX)",
    },
    "packages.whisper_engine.description": {
        "pt-BR": (
            "Bibliotecas de IA da transcrição (rodam no processador). "
            "Habilita transcrição, tempo por palavra e diarização."
        ),
        "en": (
            "AI libraries for transcription (they run on the CPU). "
            "Enables transcription, word timing and speaker separation."
        ),
    },
    "packages.whisper_engine.manual_hint": {
        "pt-BR": "Requer uv instalado.",
        "en": "Requires uv.",
    },
    "packages.model_large_v3.name": {
        "pt-BR": "Modelo large-v3",
        "en": "large-v3 model",
    },
    "packages.model_large_v3.description": {
        "pt-BR": "Modelo de transcrição de máxima qualidade (multilíngue). Baixado uma vez e guardado em cache.",
        "en": "Top-quality transcription model (multilingual). Downloaded once and cached.",
    },
    "packages.model_large_v3.manual_hint": {
        "pt-BR": "Requer o Motor de transcrição instalado.",
        "en": "Requires the transcription engine.",
    },
    "packages.toktx.name": {
        "pt-BR": "KTX-Software (toktx)",
        "en": "KTX-Software (toktx)",
    },
    "packages.toktx.description": {
        "pt-BR": "Ferramenta oficial da Khronos para gerar texturas KTX2. Habilita PNG -> KTX e Batch KTX.",
        "en": "Khronos' official tool to create KTX2 textures. Enables PNG -> KTX and Batch KTX.",
    },
    "packages.toktx.manual_hint": {
        "pt-BR": "O instalador oficial pede confirmação de administrador (UAC).",
        "en": "The official installer asks for administrator approval (UAC).",
    },
    "packages.ollama.name": {
        "pt-BR": "Ollama (resumo por IA)",
        "en": "Ollama (AI summary)",
    },
    "packages.ollama.description": {
        "pt-BR": "LLM local opcional para resumir transcrições. Sem ele, o resumo por IA fica indisponível.",
        "en": "Optional local LLM to summarize transcripts. Without it, the AI summary is unavailable.",
    },
    "packages.ollama.manual_hint": {
        "pt-BR": "Depois de instalar, rode: ollama pull llama3.1",
        "en": "After installing, run: ollama pull llama3.1",
    },
    "packages.tesseract.name": {
        "pt-BR": "Tesseract OCR (alternativa do Imagem -> PDF)",
        "en": "Tesseract OCR (Image -> PDF fallback)",
    },
    "packages.tesseract.description": {
        "pt-BR": (
            "Motor de OCR local. Alternativa do modo Imagem -> PDF quando não há IA de visão configurada. "
            "Sem ele, o PDF sai idêntico, mas sem camada de texto."
        ),
        "en": (
            "Local OCR engine. Fallback for Image -> PDF when no vision AI is set up. "
            "Without it, the PDF looks identical but has no text layer."
        ),
    },
    "packages.tesseract.manual_hint": {
        "pt-BR": "Para OCR em português, instale também o idioma 'por' (por.traineddata) no instalador UB-Mannheim.",
        "en": "For Portuguese OCR, also install the 'por' language (por.traineddata) in the UB-Mannheim installer.",
    },
    "packages.unlock.web_panel": {
        "pt-BR": "Painel web",
        "en": "Web dashboard",
    },
    "packages.unlock.transcription_engine": {
        "pt-BR": "Motor de transcrição",
        "en": "Transcription engine",
    },
    "packages.unlock.transcription": {
        "pt-BR": "Transcrição",
        "en": "Transcription",
    },
    "packages.unlock.word_timing": {
        "pt-BR": "Tempo por palavra",
        "en": "Word timing",
    },
    "packages.unlock.diarization": {
        "pt-BR": "Diarização",
        "en": "Speaker separation",
    },
    "packages.unlock.transcription_large": {
        "pt-BR": "Transcrição large-v3",
        "en": "large-v3 transcription",
    },
    "packages.unlock.png_ktx": {
        "pt-BR": "PNG -> KTX",
        "en": "PNG -> KTX",
    },
    "packages.unlock.batch_ktx": {
        "pt-BR": "Batch KTX",
        "en": "Batch KTX",
    },
    "packages.unlock.ai_summary": {
        "pt-BR": "Resumo por IA",
        "en": "AI summary",
    },
    "packages.unlock.local_ocr": {
        "pt-BR": "OCR local (Imagem -> PDF)",
        "en": "Local OCR (Image -> PDF)",
    },
    "packages.detail.not_found": {
        "pt-BR": "não encontrado",
        "en": "not found",
    },
    "packages.detail.installed": {
        "pt-BR": "instalado",
        "en": "installed",
    },
    "packages.detail.not_installed": {
        "pt-BR": "não instalado",
        "en": "not installed",
    },
    "packages.detail.web_deps": {
        "pt-BR": "dependências web instaladas",
        "en": "web dependencies installed",
    },
    "packages.detail.engine_missing": {
        "pt-BR": "motor não instalado",
        "en": "engine not installed",
    },
    "packages.detail.engine_partial": {
        "pt-BR": "faster-whisper (sem whisperX: alinhamento/diarização desligados)",
        "en": "faster-whisper (no whisperX: alignment/speaker separation off)",
    },
    "packages.detail.model_missing": {
        "pt-BR": "large-v3 não baixado",
        "en": "large-v3 not downloaded",
    },
    "packages.detail.model_ready": {
        "pt-BR": "large-v3 pronto ({size} MB)",
        "en": "large-v3 ready ({size} MB)",
    },
    "packages.detail.model_partial": {
        "pt-BR": "download incompleto",
        "en": "incomplete download",
    },
    "packages.detail.ktx_missing": {
        "pt-BR": "KTX-Software não instalado",
        "en": "KTX-Software not installed",
    },
    "packages.detail.ollama_running": {
        "pt-BR": "rodando em :11434",
        "en": "running on :11434",
    },
    "packages.detail.ollama_stopped": {
        "pt-BR": "instalado (serviço parado)",
        "en": "installed (service stopped)",
    },
    "packages.detail.ollama_responding": {
        "pt-BR": "respondendo em :11434",
        "en": "responding on :11434",
    },
    "packages.detail.check_failed": {
        "pt-BR": "erro ao checar: {error}",
        "en": "check failed: {error}",
    },
    "packages.log.exe_missing": {
        "pt-BR": "[erro] executável não encontrado: {name}",
        "en": "[error] executable not found: {name}",
    },
    "packages.log.start_failed": {
        "pt-BR": "[erro] falha ao iniciar: {error}",
        "en": "[error] could not start: {error}",
    },
    "packages.log.winget_code": {
        "pt-BR": "[aviso] winget retornou {code} (pode já estar instalado ou exigir reinício).",
        "en": "[warning] winget returned {code} (it may already be installed or need a restart).",
    },
    "packages.log.uv_missing": {
        "pt-BR": "[erro] 'uv' não encontrado. Instale o pacote 'uv' antes.",
        "en": "[error] 'uv' not found. Install the 'uv' package first.",
    },
    "packages.log.creating_venv": {
        "pt-BR": "Criando whisper-venv (Python 3.12)...",
        "en": "Creating whisper-venv (Python 3.12)...",
    },
    "packages.log.engine_missing": {
        "pt-BR": "[erro] Motor de transcrição ausente. Instale 'Motor de transcrição' antes.",
        "en": "[error] Transcription engine missing. Install 'Transcription engine' first.",
    },
    "packages.log.ktx_release": {
        "pt-BR": "Consultando o release mais recente do KTX-Software no GitHub...",
        "en": "Checking the latest KTX-Software release on GitHub...",
    },
    "packages.log.github_failed": {
        "pt-BR": "[erro] não consegui consultar o GitHub: {error}",
        "en": "[error] could not reach GitHub: {error}",
    },
    "packages.log.asset_missing": {
        "pt-BR": "[erro] instalador Windows-x64 não encontrado no release.",
        "en": "[error] Windows-x64 installer not found in the release.",
    },
    "packages.log.downloading": {
        "pt-BR": "Baixando {name} (~{size} MB)...",
        "en": "Downloading {name} (~{size} MB)...",
    },
    "packages.log.download_failed": {
        "pt-BR": "[erro] falha no download: {error}",
        "en": "[error] download failed: {error}",
    },
    "packages.log.installing_silent": {
        "pt-BR": "Instalando (silencioso /S). Uma janela de permissão (UAC) vai aparecer — clique Sim.",
        "en": "Installing (silent /S). A permission window (UAC) will show up — click Yes.",
    },
    "packages.log.toktx_ok": {
        "pt-BR": "[ok] toktx instalado e detectado.",
        "en": "[ok] toktx installed and detected.",
    },
    "packages.log.toktx_path": {
        "pt-BR": "[ok] O instalador concluiu. Pode ser preciso reabrir o app para detectar o toktx no PATH.",
        "en": "[ok] The installer finished. You may need to reopen the app to detect toktx in PATH.",
    },
    "packages.log.install_failed": {
        "pt-BR": "[erro] A instalação não concluiu (UAC negado?). Tente de novo.",
        "en": "[error] The installation did not finish (UAC denied?). Try again.",
    },
    "packages.log.installing": {
        "pt-BR": "== Instalando: {name} ({size}) ==",
        "en": "== Installing: {name} ({size}) ==",
    },
    "packages.log.crashed": {
        "pt-BR": "[erro] {kind}: {error}",
        "en": "[error] {kind}: {error}",
    },
}
