[![EN](https://img.shields.io/badge/lang-EN-blue)](third-party-licenses.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](../pt-BR/licencas-de-terceiros.md)

[← Back to start](../../README.md)

# Third-party licenses

The Sharpz code is under the [MIT license](../../LICENSE). It relies on other projects, each under its own license. Sharpz does not ship them, except the two dashboard fonts (with their licenses in `web/app/fonts`): the installer downloads packages and tools from their official sources, and AI models are downloaded the first time they are used.

## Worth knowing

- **PyMuPDF** (Image to PDF and PDF editor) is licensed under the AGPL-3.0 or a commercial license from Artifex. Running Sharpz on your own computer is fine. If you redistribute Sharpz bundled with PyMuPDF (an installer, an executable or an image) or offer a modified version over a network, the AGPL-3.0 applies to the whole bundle.
- **alktx2** (the 960 × 540 KTX tool) does not declare a license in its package.
- **The speaker diarization model** is gated on Hugging Face: each user accepts its conditions on the model page, with their own account and token. Its license is on the model card.
- **The FFmpeg build** installed by the launcher is GPL-3.0. It runs as a separate program.

## AI models

| Model | Used for | License |
| --- | --- | --- |
| IS-Net (`isnet-general-use`, default) | Background removal | Apache-2.0 |
| U²-Net (`u2net`, `u2net_human_seg`) | Background removal | Apache-2.0 |
| BiRefNet (general, lite and portrait) | Background removal | MIT |
| Segment Anything (ViT-B) | Background removal | Apache-2.0 |
| Whisper (faster-whisper conversions, turbo and distil) | Transcription | MIT |
| pyannote speaker-diarization-community-1 | Speaker separation | See the model card (gated) |
| wav2vec2 alignment models | Word timestamps | See each model card |
| Models you run in Ollama or another server | Summary and vision | Each model's own license |

## Python packages

| Package | Used for | License |
| --- | --- | --- |
| rembg | Background removal | MIT |
| onnxruntime | Running the models | MIT |
| pymatting | Alpha matting | MIT |
| vtracer | Vectorization | MIT |
| resvg-py | SVG rendering | MIT |
| PyMuPDF | PDF creation and editing | AGPL-3.0 or commercial |
| Pillow | Images | MIT-CMU |
| NumPy | Image math | BSD-3-Clause |
| scikit-image | Texture quality check | BSD-3-Clause |
| alktx2 | 960 × 540 KTX | Not declared |
| FastAPI | Local server | MIT |
| Uvicorn | Local server | BSD-3-Clause |
| python-multipart | Uploads | Apache-2.0 |
| Gradio | Legacy interface (`app.py`) | Apache-2.0 |
| Click | Command line | BSD-3-Clause |
| yt-dlp | Audio from links | Unlicense |
| faster-whisper | Transcription | MIT |
| CTranslate2 | Transcription | MIT |
| whisperX | Alignment and diarization | BSD-2-Clause |
| pyannote.audio | Diarization | MIT |
| PyTorch and torchaudio | whisperX and pyannote | BSD-3-Clause |
| imageio-ffmpeg | Audio decoding | BSD-2-Clause (the bundled FFmpeg binary has its own license) |

## Dashboard packages

| Package | License |
| --- | --- |
| Next.js, React and React DOM | MIT |
| Framer Motion | MIT |
| Tailwind CSS, tailwind-merge and tailwindcss-animate | MIT |
| Radix Slot and clsx | MIT |
| class-variance-authority | Apache-2.0 |
| Lucide | ISC |
| wavesurfer.js | BSD-3-Clause |
| Space Grotesk and Plus Jakarta Sans fonts (bundled in `web/app/fonts`, with their license files) | SIL Open Font License 1.1 |

## External tools

These run as separate programs and are installed from their official sources.

| Tool | Used for | License |
| --- | --- | --- |
| KTX-Software (`toktx`) | KTX2 conversion | Apache-2.0 |
| FFmpeg | Audio and video | GPL-3.0 (build installed by the launcher) |
| Tesseract OCR | Text recognition fallback | Apache-2.0 |
| Ollama | Local AI summary and vision | MIT |
| Node.js | Dashboard runtime | MIT |
| uv | Transcription environment | MIT or Apache-2.0 |

---

[← Development](development.md) · [Back to start](../../README.md)
