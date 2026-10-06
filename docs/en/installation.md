[![EN](https://img.shields.io/badge/lang-EN-blue)](installation.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](../pt-BR/instalacao.md)

[← Back to start](../../README.md)

# Installation and usage

## Requirements

- Windows 10 or 11
- Python 3.13 installed on the system
- Node.js 20 or newer
- Google Chrome (the dashboard opens in it, and the PDF editor uses Chrome to export)

The installer takes care of the rest: `uv` (which creates the transcription environment), FFmpeg, the libraries and the transcription model. The optional items (KTX texture tools, Tesseract and Ollama) can be installed later, with one click, on the **Packages** screen.

## The launcher

Everything starts with `sharpz.cmd`, in the project root. It shows a menu:

| Option | What it does | When to use |
| --- | --- | --- |
| **1 · Install everything and open** | Checks and installs what is missing, downloads the fast transcription model (~1.6 GB, only once), starts the server and the dashboard, and opens Chrome. | The first time and after updating the project. |
| **2 · Open the dashboard** | Starts the server and the dashboard and opens Chrome. | Everyday use. |
| **3 · Production mode** | Builds the optimized version of the dashboard and runs everything in that mode. | When you want a lighter, faster dashboard. |
| **4 · Test** | Runs the quick test against the running server. | To check that everything works. |

You can also skip the menu and pass the option directly:

```powershell
.\sharpz.cmd install
.\sharpz.cmd open
.\sharpz.cmd prod
.\sharpz.cmd test
```

The Portuguese names (`instalar`, `abrir`, `producao` and `testar`) still work.

The scripts behind each option live in [`scripts/`](../../scripts). They only open the browser after the server and the dashboard respond, and they flag anything missing in red.

## Language

The dashboard has **EN** and **PT-BR** buttons in the header to switch the interface language.

The `sharpz.cmd` menu and messages follow the Windows display language: Portuguese when Windows is in Portuguese, English otherwise. To force one, set `SHARPZ_LANG` to `en` or `pt-BR` before running it (for example `set SHARPZ_LANG=en`). The options are the same in both languages, and the command-line actions work in both (`install`, `open`, `prod`, `test` or `instalar`, `abrir`, `producao`, `testar`):

| English | Português |
| --- | --- |
| 1 · Install everything and open (first time) | 1 · Instalar tudo e abrir (primeira vez) |
| 2 · Open the dashboard (everyday use) | 2 · Abrir o painel (uso do dia a dia) |
| 3 · Production mode (optimized build) | 3 · Modo produção (build otimizado) |
| 4 · Test (smoke test) | 4 · Testar (smoke test) |

## Addresses

| Service | Address |
| --- | --- |
| Dashboard | <http://localhost:5174> |
| Server | <http://127.0.0.1:8000> |

## How to stop

Close the **Sharpz API** and **Sharpz Web** windows (in production mode, **Sharpz Web (prod)**). Or, in a terminal:

```powershell
taskkill /FI "WINDOWTITLE eq Sharpz API*" /T /F
taskkill /FI "WINDOWTITLE eq Sharpz Web*" /T /F
```

## Where files are stored

| What | Where |
| --- | --- |
| Transcripts | `output/transcripts/` |
| Generated PDFs | `output/pdf/` |
| Whole folder output | the folder you choose (default: `output/`) |
| Background removal models | `%USERPROFILE%\.u2net` |
| Transcription models | the Hugging Face cache in your user folder |

None of these files go to Git.

## Updating

After pulling a new version of the project, run `.\sharpz.cmd install` once to update the dependencies.

---

[Dashboard tools →](tools.md)
