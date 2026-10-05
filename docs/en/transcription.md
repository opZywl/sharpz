[![EN](https://img.shields.io/badge/lang-EN-blue)](transcription.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](../pt-BR/transcricao.md)

[← Back to start](../../README.md)

# Transcription

Turns audio and video into text. Drop the file, enter a path on your computer or paste a link (YouTube and similar sites) and wait: the full text shows up on screen at the end, and the files come out as `txt`, `srt`, `vtt`, `json` and `lrc`, in the `output/transcripts/` folder.

## Models

| Model | Size | Notes |
| --- | --- | --- |
| **Auto** (default) | — | Chooses between Large v3 Turbo and Large v3 on its own (see below). |
| Large v3 Turbo | ~1.6 GB | Almost the same quality as Large v3 in Portuguese, and several times faster. |
| Large v3 | ~3 GB | Best quality. Downloaded by the installer. |
| Large v2 | ~3 GB | Previous version of Large. |
| Medium | ~1.5 GB | Middle ground. |
| Small | ~490 MB | Fast, reasonable quality. |
| Base | ~150 MB | Very fast, basic quality. |
| Tiny | ~80 MB | For tests only. |
| Distil Large v3 | ~1.5 GB | English only. |

### How Auto chooses

- uses **Large v3 Turbo** when it is already downloaded;
- uses **Large v3** while Turbo has not been downloaded;
- with **Translate to English** on, always uses Large v3 (Turbo does not translate well).

You can download Turbo with the download button on the Transcription screen itself. The download runs in the background, at low priority, and the dashboard shows the progress. You can also download it from the [command line](command-line.md#download-transcription-models).

A model that is not on the computer yet is downloaded automatically by the first transcription that needs it.

## Warm engine

The first job starts the transcription engine in the background and loads the model only once. Later jobs reuse the loaded model, so short clips (like WhatsApp voice messages) are ready in seconds. After 5 minutes without work, the engine shuts down on its own and frees the memory; the next job starts a new one.

The engine runs below normal priority, so the computer stays usable, and writes its log to `output/transcripts/_worker.log`.

| Variable | Effect |
| --- | --- |
| `SHARPZ_WORKER_IDLE_S` | Changes the time (in seconds) until the engine shuts down on its own. |
| `SHARPZ_WORKER=0` | Turns off the warm engine: each job starts a new process. |

## Features

- **Same file again:** if it is already queued or running, the dashboard goes back to the existing job instead of creating another one.
- **Cancel:** you can cancel a queued or running job.
- **Word timestamps:** light, included with the basic engine.
- **Speaker separation:** much heavier, and needs a Hugging Face token with the speaker model terms accepted (see [Troubleshooting](troubleshooting.md#speaker-separation-does-not-work)).
- **Links:** the audio is downloaded in its original format, with no re-encoding.
- **Complete mode:** besides the text, generates video frames, contact sheets, per-scene images and analysis documents written by a vision AI, all in one package.
- **AI summary:** writes a summary of the transcript using an OpenAI-compatible AI server (the default is Ollama, on your own computer).

---

[← Background removal and AI models](background-removal.md) · [KTX textures →](ktx-textures.md)
