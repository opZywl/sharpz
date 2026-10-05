[![EN](https://img.shields.io/badge/lang-EN-blue)](troubleshooting.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](../pt-BR/solucao-de-problemas.md)

[← Back to start](../../README.md)

# Troubleshooting

## The dashboard opens but says "API offline"

The server is not running. Run `.\sharpz.cmd open` (or option 2 in the menu). If the **Sharpz API** window closes on its own, check the error in `fastapi.err.log`, in the project root.

## "Not enough memory"

The computer ran out of RAM for the chosen model. In this order:

1. close heavy programs (a browser with many tabs, editors, games);
2. switch to a lighter model: **ISNet (fast)** or **U2Net (lightest)**;
3. turn off **Alpha matting**;
4. use a smaller image.

The BiRefNet models are the heaviest; see the table in [Background removal and AI models](background-removal.md#ai-models).

## The first image takes a while

The first time a model is used, it is downloaded and loaded. The next images come out much faster. After 10 minutes without use, the model is released from memory and the next image loads it again.

## "The server did not respond"

The server crashed or processing took too long. Check that the **Sharpz API** window is open and run `.\sharpz.cmd open` again if needed.

## The KTX tools do not convert

KTX-Software is missing. Install it in **Packages** (item **KTX-Software**). The dashboard shows **KTX textures: ok** when it is ready.

## "The Portfolio KTX converter is not installed"

Run `.\sharpz.cmd install`. It installs everything Portfolio KTX needs.

## Transcription does not start

- Check in **Packages** that **FFmpeg** and the **transcription engine** are installed.
- On the first transcription, the model is downloaded (Large v3 is ~3 GB); follow the progress on screen.

## Speaker separation does not work

The speaker model is gated. You need to:

1. create a token at <https://huggingface.co/settings/tokens>;
2. accept the terms at <https://huggingface.co/pyannote/speaker-diarization-community-1>;
3. enter the token in the **Hugging Face token** field on the Transcription screen, or save `HF_TOKEN=...` in the `.env` file in the project root.

## The AI summary does not respond

The summary uses Ollama on your own computer. Install it in **Packages**, keep it open and download a model:

```powershell
ollama pull llama3.1
```

## Image to PDF without selectable text

Without a vision AI configured, reading uses Tesseract. Install it in **Packages**; for Portuguese, Tesseract needs the `por` language.

## I opened it again and two copies are running

**Open the dashboard** does not close an old copy that is still running. Close the **Sharpz API** and **Sharpz Web** windows before opening it again, or use `.\sharpz.cmd install` (or `prod`), which shuts down old copies before starting.

---

[← Command line](command-line.md) · [Development →](development.md)
