<div align="center">

# Sharpz

### A portfolio-style image cleanup, vectorization, and texture conversion workspace.

[![Python](https://img.shields.io/badge/Python-3.13-3776AB?style=for-the-badge&logo=python&logoColor=ffffff)](https://www.python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-API-009688?style=for-the-badge&logo=fastapi&logoColor=ffffff)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=nextdotjs)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=111111)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=ffffff)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=111111)](https://tailwindcss.com)

Private production tool by [opZywl](https://github.com/opZywl), styled after the portfolio interface with real light/dark themes.

</div>

## Preview

<p align="center">
  <img src="cleanup-ui.png" alt="Sharpz dashboard - dark portfolio style image cleanup workspace" />
</p>

## What Sharpz Does

Sharpz is a local-first utility for preparing images and textures:

- Remove backgrounds with AI segmentation or luma keying.
- Preserve neon, glow, smoke, fire, and transparent edge detail.
- Export a clean transparent PNG.
- Convert raster images to SVG with both background and transparent variants.
- Convert PNG/JPG textures to KTX2 for 3D pipelines.
- Patch missing `KTXorientation=rd` metadata.
- Generate portfolio-ready 960x540 KTX textures through `alktx2`.
- Run everything from the web dashboard, FastAPI endpoints, Gradio, or CLI.

## Web App

Start the API:

```powershell
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python server.py
```

Start the dashboard:

```powershell
cd web
npm install
npm run dev
```

Open:

```text
http://localhost:5174
```

The web dashboard talks to FastAPI at:

```text
http://127.0.0.1:8000
```

## Transcricao de Video

A aba **Transcricao** do dashboard converte audio de videos em texto usando
faster-whisper (modelo `large-v3` por padrao), com alinhamento de palavras e
diarizacao de falantes via whisperX quando disponivel. Os formatos de saida
sao `txt`, `srt`, `vtt`, `json` e `lrc`.

O motor roda em um venv isolado (`whisper-venv`, Python 3.12) e e exposto pelo
backend em `/api/transcribe/*`. O frontend consome via proxy relativo `/api`.

Forma mais simples de subir tudo (Windows): rode o launcher na raiz do repo.

```powershell
.\transcribe.cmd
```

O `transcribe.cmd` faz tudo de ponta a ponta, sem fricao:

1. Verifica `node`, `uv` e `ffmpeg` (instrui o `winget install` se faltar).
2. Cria/garante o `whisper-venv` e instala o motor (faster-whisper, torch/torchaudio
   do indice CPU `https://download.pytorch.org/whl/cpu`, whisperX).
3. Garante o venv do backend, sobe o `server.py` na porta 8000 e aguarda o
   healthcheck em `http://127.0.0.1:8000/api/health`.
4. Sobe o frontend (`npm run dev`) na porta 5174 e aguarda responder.
5. Valida 200 nos dois servicos e abre o dashboard no Chrome.

Na primeira transcricao o modelo `large-v3` e baixado automaticamente.

As dependencias do motor estao em `requirements-transcribe.txt` para
reprodutibilidade.

## Workspaces

| Workspace | Purpose |
| --- | --- |
| Pipeline | Remove background and generate PNG + SVG outputs in one pass. |
| Remover Fundo | Fine control over AI, alpha matting, luma keying, color, and edge cleanup. |
| PNG -> SVG | Direct vtracer controls for color mode, hierarchy, path mode, and precision. |
| Batch Pipeline | Run the CLI cleanup/SVG workflow over local files or folders. |
| PNG -> KTX | Single-file KTX2 conversion for uploaded textures. |
| Batch KTX | Local folder batch conversion with recursive and flattened output modes. |
| Patch KTX | Add `KTXorientation=rd` to uploaded KTX/KTX2 files. |
| Portfolio KTX | Fit images into the portfolio 960x540 canvas and encode via `alktx2`. |
| Transcricao | Transcribe video audio to text with faster-whisper and whisperX (txt/srt/vtt/json/lrc). |
| Sistema | Inspect API capabilities, endpoints, models, and encoder status. |

## API

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/health` | GET | API health check. |
| `/api/capabilities` | GET | Live module, endpoint, model, and encoder status. |
| `/api/models` | GET | Available rembg models. |
| `/api/pipeline` | POST | Full image cleanup + SVG pipeline. |
| `/api/clean` | POST | Background removal only. |
| `/api/svg` | POST | Vectorization only. |
| `/api/batch/pipeline` | POST | Batch cleanup/SVG pipeline for local paths. |
| `/api/ktx/presets` | GET | KTX preset list and `toktx` status. |
| `/api/ktx/single` | POST | Convert one uploaded image to KTX. |
| `/api/ktx/batch` | POST | Convert a local folder to KTX. |
| `/api/ktx/orientation` | POST | Patch uploaded KTX/KTX2 orientation metadata. |
| `/api/ktx/portfolio` | POST | Convert uploaded image to portfolio 960x540 KTX. |

## CLI

Full pipeline for one image:

```powershell
python cli.py graphics.png -o output/
```

Batch background cleanup:

```powershell
python cli.py samples/ -o output/ --no-svg --model u2net
```

Logo-style SVG:

```powershell
python cli.py logo.png -o output/ --color-mode binary --filter-speckle 8
```

KTX conversion:

```powershell
python ktx_cli.py texture.png -o texture.ktx --preset ultra
```

## KTX Setup

The standard KTX workspaces require `toktx` from KTX-Software in your PATH.
The portfolio 960x540 workspace uses the Python package `alktx2`, installed through `requirements.txt`.

- Windows: install KTX-Software from GitHub Releases and enable "Add to PATH".
- Linux: install `ktx-tools` when available.
- macOS: `brew install ktx`.

Check:

```powershell
toktx --version
```

## Project Structure

```text
sharpz/
  app.py                  # Legacy Gradio UI
  server.py               # FastAPI backend for the Next.js dashboard
  cli.py                  # Background removal + SVG CLI
  ktx_cli.py              # KTX2 CLI
  add_ktx_orientation.py  # KTXorientation patch helper
  convert_liquidlauncher.py # Portfolio 960x540 conversion reference
  src/
    processor.py          # Core cleanup and SVG pipeline
    ktx.py                # KTX conversion engine
  web/
    app/                  # Next.js App Router dashboard
    components/           # UI primitives and upload/results components
```

## Validation

Current checks used during setup:

```powershell
python -m py_compile server.py
cd web
npm run build
```

## Usage

This repository is private and intended as a personal production utility for image cleanup, vector asset preparation, and portfolio texture workflows.
