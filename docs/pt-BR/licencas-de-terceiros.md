[![EN](https://img.shields.io/badge/lang-EN-blue)](../en/third-party-licenses.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](licencas-de-terceiros.md)

[← Voltar ao início](../../README.pt-BR.md)

# Licenças de terceiros

O código do Sharpz está sob a [licença MIT](../../LICENSE). Ele usa outros projetos, cada um com a sua licença. O Sharpz não distribui esses projetos, exceto as duas fontes do painel (com as licenças em `web/app/fonts`): o instalador baixa pacotes e ferramentas das fontes oficiais, e os modelos de IA são baixados na primeira vez em que são usados.

## Vale saber

- **PyMuPDF** (Imagem para PDF e Editor de PDF) tem licença AGPL-3.0 ou licença comercial da Artifex. Rodar o Sharpz no seu computador não tem problema. Se você redistribuir o Sharpz junto com o PyMuPDF (instalador, executável ou imagem) ou oferecer uma versão modificada pela rede, a AGPL-3.0 vale para o conjunto todo.
- **alktx2** (a ferramenta de KTX 960 × 540) não declara licença no pacote.
- **O modelo de separação de locutores** tem acesso restrito no Hugging Face: cada usuário aceita as condições na página do modelo, com a própria conta e o próprio token. A licença está no cartão do modelo.
- **O FFmpeg** instalado pelo launcher é uma build GPL-3.0. Ele roda como um programa separado.

## Modelos de IA

| Modelo | Uso | Licença |
| --- | --- | --- |
| IS-Net (`isnet-general-use`, padrão) | Remoção de fundo | Apache-2.0 |
| U²-Net (`u2net`, `u2net_human_seg`) | Remoção de fundo | Apache-2.0 |
| BiRefNet (geral, lite e retrato) | Remoção de fundo | MIT |
| Segment Anything (ViT-B) | Remoção de fundo | Apache-2.0 |
| Whisper (conversões do faster-whisper, turbo e distil) | Transcrição | MIT |
| pyannote speaker-diarization-community-1 | Separação de locutores | Veja o cartão do modelo (acesso restrito) |
| Modelos de alinhamento wav2vec2 | Tempo por palavra | Veja o cartão de cada modelo |
| Modelos que você roda no Ollama ou em outro servidor | Resumo e visão | Licença de cada modelo |

## Pacotes Python

| Pacote | Uso | Licença |
| --- | --- | --- |
| rembg | Remoção de fundo | MIT |
| onnxruntime | Execução dos modelos | MIT |
| pymatting | Alpha matting | MIT |
| vtracer | Vetorização | MIT |
| resvg-py | Renderização de SVG | MIT |
| PyMuPDF | Criação e edição de PDF | AGPL-3.0 ou comercial |
| Pillow | Imagens | MIT-CMU |
| NumPy | Cálculo com imagens | BSD-3-Clause |
| scikit-image | Conferência de qualidade das texturas | BSD-3-Clause |
| alktx2 | KTX 960 × 540 | Não declarada |
| FastAPI | Servidor local | MIT |
| Uvicorn | Servidor local | BSD-3-Clause |
| python-multipart | Envio de arquivos | Apache-2.0 |
| Gradio | Interface antiga (`app.py`) | Apache-2.0 |
| Click | Linha de comando | BSD-3-Clause |
| yt-dlp | Áudio de links | Unlicense |
| faster-whisper | Transcrição | MIT |
| CTranslate2 | Transcrição | MIT |
| whisperX | Alinhamento e separação de locutores | BSD-2-Clause |
| pyannote.audio | Separação de locutores | MIT |
| PyTorch e torchaudio | whisperX e pyannote | BSD-3-Clause |
| imageio-ffmpeg | Leitura de áudio | BSD-2-Clause (o binário do FFmpeg embutido tem licença própria) |

## Pacotes do painel

| Pacote | Licença |
| --- | --- |
| Next.js, React e React DOM | MIT |
| Framer Motion | MIT |
| Tailwind CSS, tailwind-merge e tailwindcss-animate | MIT |
| Radix Slot e clsx | MIT |
| class-variance-authority | Apache-2.0 |
| Lucide | ISC |
| wavesurfer.js | BSD-3-Clause |
| Fontes Space Grotesk e Plus Jakarta Sans (incluídas em `web/app/fonts`, com os arquivos de licença) | SIL Open Font License 1.1 |

## Ferramentas externas

Rodam como programas separados e são instaladas das fontes oficiais.

| Ferramenta | Uso | Licença |
| --- | --- | --- |
| KTX-Software (`toktx`) | Conversão KTX2 | Apache-2.0 |
| FFmpeg | Áudio e vídeo | GPL-3.0 (build instalada pelo launcher) |
| Tesseract OCR | Reconhecimento de texto de reserva | Apache-2.0 |
| Ollama | Resumo e visão por IA local | MIT |
| Node.js | Execução do painel | MIT |
| uv | Ambiente da transcrição | MIT ou Apache-2.0 |

---

[← Desenvolvimento](desenvolvimento.md) · [Voltar ao início](../../README.pt-BR.md)
