<div align="center">

<img src="web/public/brand/sharpz-logo.svg" alt="Sharpz" width="140" />

# Sharpz

[![EN](https://img.shields.io/badge/lang-EN-blue)](README.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](README.pt-BR.md)

**A local media toolkit for image processing, vectorization, KTX textures, transcription and editable PDFs**

</div>

## Features

Sharpz brings multiple media-processing tools into a single local interface.

- **Background Removal** — Remove image backgrounds using local AI models.
- **SVG Vectorization** — Convert raster images into scalable SVG files.
- **Batch Processing** — Process multiple images or entire folders at once.
- **KTX / KTX2 Textures** — Convert, optimize and fix textures for 3D projects.
- **Transcription** — Transcribe audio, video and YouTube content locally.
- **Subtitles** — Export transcriptions as TXT, SRT, VTT, JSON or LRC.
- **Image to PDF** — Convert images into searchable and editable PDFs.
- **PDF Editor** — Edit PDF text directly through the Sharpz interface.
- **Package Manager** — Detect and install optional tools and models required by each module.

## Getting started

1. Double-click **`sharpz.cmd`** in the project root.
2. The first time, choose **1 · Install everything and open**. After that, use **2 · Open the dashboard**.
3. The dashboard opens in Chrome on its own, at <http://localhost:5174>.

The dashboard has **EN** and **PT-BR** buttons in the header to switch languages, and the `sharpz.cmd` menu follows the Windows display language.

The full walkthrough is in [Installation and usage](docs/en/installation.md).

## Documentation

| Page | Topic |
| --- | --- |
| [Installation and usage](docs/en/installation.md) | Requirements, first install, everyday use, language, production mode and how to stop. |
| [Dashboard tools](docs/en/tools.md) | What each module does and when to use it. |
| [Background removal and AI models](docs/en/background-removal.md) | Cutout methods, models, memory use and alpha matting. |
| [Transcription](docs/en/transcription.md) | Models, warm engine, speaker separation and AI summary. |
| [KTX textures](docs/en/ktx-textures.md) | Presets, whole folders, orientation fix and Portfolio KTX. |
| [Command line](docs/en/command-line.md) | How to use the tools without opening the dashboard. |
| [Troubleshooting](docs/en/troubleshooting.md) | Common errors and how to fix each one. |
| [Development](docs/en/development.md) | Project structure, API routes, tests and continuous integration. |

## Contributing

Bugs, ideas and pull requests are welcome. See [how to contribute](CONTRIBUTING.md), the [code of conduct](CODE_OF_CONDUCT.md) and the [security policy](SECURITY.md).

## License

The code is open source, under the [MIT license](LICENSE).

Some dependencies have their own licenses. PyMuPDF, used in Image to PDF and in the PDF editor, is AGPL-3.0, and the background removal and transcription AI models follow their authors' licenses.
