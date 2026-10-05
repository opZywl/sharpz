[![EN](https://img.shields.io/badge/lang-EN-blue)](command-line.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](../pt-BR/linha-de-comando.md)

[← Back to start](../../README.md)

# Command line

The main tools also work without the dashboard. Run the commands in the project root, using the Python from the environment the installer creates (`venv`).

## Remove backgrounds and generate SVG

```powershell
.\venv\Scripts\python.exe cli.py photo.png -o output/
```

Accepts a file or a folder. Examples:

```powershell
# whole folder, only the background-free PNG, with the lightest model
.\venv\Scripts\python.exe cli.py photos/ -o output/ --no-svg --model u2net

# black and white logo, without specks
.\venv\Scripts\python.exe cli.py logo.png -o output/ --color-mode binary --filter-speckle 8

# neon on a black background, keeping the glow
.\venv\Scripts\python.exe cli.py neon.png -o output/ --method luma_dark

# list the AI models
.\venv\Scripts\python.exe cli.py --list-models
```

| Option | What for |
| --- | --- |
| `--method` | `auto`, `ai`, `luma_dark`, `luma_light` or `none` (see [Background removal](background-removal.md#cutout-methods)). |
| `--model` | AI model. Default: `isnet-general-use`. |
| `--no-alpha-matting` | Turns off edge refinement (faster). |
| `--no-svg` | Generates only the background-free PNG. |
| `--no-bg-removal` | Only vectorizes, without removing the background. |
| `--color-mode` | `color` or `binary` (black and white). |
| `--filter-speckle` | Removes small specks from the SVG. |
| `--upscale` | Upscales before vectorizing, to capture more detail. |

The full list comes from `cli.py --help`.

## Convert to KTX

```powershell
# one image
.\venv\Scripts\python.exe ktx_cli.py texture.png -o texture.ktx --preset ultra

# a whole folder, choosing the preset automatically
.\venv\Scripts\python.exe ktx_cli.py textures/ -o ktx-output/ --auto-preset

# list the presets
.\venv\Scripts\python.exe ktx_cli.py --list-presets
```

Requires KTX-Software (see [KTX textures](ktx-textures.md)).

## Download transcription models

```powershell
.\whisper-venv\Scripts\python.exe tools\download_model.py turbo
.\whisper-venv\Scripts\python.exe tools\download_model.py large-v3
```

With no argument, it downloads `large-v3`. The download retries on its own if the connection drops, and shows the progress.

---

[← KTX textures](ktx-textures.md) · [Troubleshooting →](troubleshooting.md)
