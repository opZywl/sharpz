[![EN](https://img.shields.io/badge/lang-EN-blue)](development.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](../pt-BR/desenvolvimento.md)

[← Back to start](../../README.md)

# Development

## Project structure

```text
sharpz/
  sharpz.cmd              main launcher (menu)
  scripts/                install, open, production and test
  server.py               dashboard server (all /api routes)
  app.py                  legacy interface, kept as an alternative
  cli.py                  background removal and SVG from the command line
  ktx_cli.py              KTX conversion from the command line
  add_ktx_orientation.py  orientation fix for KTX textures
  packages.py             Download packages center (detection and install)
  src/
    processor.py          background removal, AI models and vectorization
    memory.py             out-of-memory detection
    ktx.py                KTX conversion engine
  transcribe/             transcription engine (runs in a separate environment)
  imgpdf/                 Image to PDF and PDF editor
  tools/                  utilities (model download)
  tests/                  tests
  web/
    app/                  dashboard page and icons
    components/           modules, tools and interface components
    lib/                  API calls, types and module list
    public/brand/         Sharpz logo
  docs/                   this documentation
```

There are two Python environments: `venv` (dashboard server, Python 3.13) and `whisper-venv` (transcription engine, Python 3.12). The dashboard talks to the server through `/api`, which the dashboard forwards to port 8000.

## API routes

| Route | Method | What it does |
| --- | --- | --- |
| `/api/health` | GET | Checks whether the server is up. |
| `/api/capabilities` | GET | Modules, routes, default model and tools found. |
| `/api/models` | GET | Background removal models, with label, detail, whether it is heavy and whether it is already downloaded. |
| `/api/clean` | POST | Removes the background from an image. |
| `/api/svg` | POST | Vectorizes an image. |
| `/api/pipeline` | POST | Removes the background and vectorizes in one step. |
| `/api/batch/pipeline` | POST | Does the same for a folder on the computer. |
| `/api/ktx/presets` | GET | KTX presets and whether KTX-Software was found. |
| `/api/ktx/single` | POST | Converts an image to KTX. |
| `/api/ktx/batch` | POST | Converts a folder to KTX. |
| `/api/ktx/orientation` | POST | Fixes the orientation of a KTX. |
| `/api/ktx/portfolio` | POST | Generates the 960 × 540 portfolio KTX. |
| `/api/transcribe` | POST | Creates a transcription job. |
| `/api/transcribe/models` | GET | Transcription models and whether they are already downloaded. |
| `/api/transcribe/models/{key}/download` | GET / POST | Progress / start of a model download. |
| `/api/transcribe/capabilities` | GET | What the transcription engine has available. |
| `/api/transcribe/jobs/{id}` | GET | State of a job. |
| `/api/transcribe/jobs/{id}/stream` | GET | Live progress (events). |
| `/api/transcribe/jobs/{id}/cancel` | POST | Cancels a job. |
| `/api/transcribe/jobs/{id}/download` | GET | Downloads a format (`txt`, `srt`, `vtt`, `json`, `lrc`). |
| `/api/transcribe/jobs/{id}/audio` | GET | Input audio, for playback in the dashboard. |
| `/api/transcribe/jobs/{id}/summarize` | POST | AI summary. |
| `/api/transcribe/jobs/{id}/complete` | GET | Complete mode package (manifest, file, zip, open folder). |
| `/api/packages` | GET | Download packages list. |
| `/api/packages/{id}/install` | POST | Installs a package. |
| `/api/packages/jobs/{id}/stream` | GET | Live install log. |
| `/api/image-to-pdf` | POST | Creates an Image to PDF job. |
| `/api/image-to-pdf/jobs/{id}` | GET | State, live progress, download, preview and open folder. |
| `/api/editor/import` | POST | Opens a PDF or image in the editor. |
| `/api/editor/export` | POST | Generates the edited PDF. |
| `/api/editor/render-html` | POST | Generates the PDF from the editor page. |
| `/api/editor/render-png` | POST | Generates a PNG from the editor page. |

Errors come back as JSON with a `detail` field (text ready to show to the user). Out-of-memory errors come back with status 503 and `code: "memoria_insuficiente"`.

## Tests

```powershell
# all tests (API without loading AI models, launchers and transcription engine)
.\venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"

# Image to PDF, without the server
.\venv\Scripts\python.exe -m imgpdf.smoke_test

# lint (real errors only: syntax and undefined names)
uvx ruff check .

# quick test against the running server
.\sharpz.cmd test

# type check and dashboard build (with the dashboard stopped)
cd web
npx tsc --noEmit -p .
npm run build
```

## Continuous integration

Every push to `main` and every pull request runs the [CI](../../.github/workflows/ci.yml). These are the job names as they show up in the Actions tab and on pull requests:

| Job | Runs on | What it does |
| --- | --- | --- |
| Lint (Python) | Linux | ruff with real errors only, and compilation of all the Python code. |
| Backend tests (Windows) | Windows | All tests and the Image to PDF smoke test. |
| Dashboard (types and build) | Linux | Type check and production build of the dashboard. |
| End-to-end (launcher, server and dashboard) | Windows | Creates the `venv` like the installer does, downloads the default model, starts the server and the dashboard, runs `sharpz.cmd test` and checks the API proxy. |

Python dependencies are installed with `constraints.txt`, which pins the tested versions. Dependabot proposes updates every week, and CI validates each one before the merge.

## Conventions

- Interface text in English and Brazilian Portuguese, with no library or internal tool names.
- Documentation in both languages: `README.md` and `docs/en/` in English, `README.pt-BR.md` and `docs/pt-BR/` in Portuguese.
- No code comments.
- Commits in the format `type: (scope) description`, for example `fix: (dashboard) ...`.
- Outputs, models, environments, logs and internal notes stay out of Git (see `.gitignore`).

---

[← Troubleshooting](troubleshooting.md) · [Back to start](../../README.md)
