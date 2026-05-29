from __future__ import annotations

import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)

import argparse
import json
import os
import shutil
import time
from pathlib import Path

from transcribe.formats import write_all

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "120")


def emit(obj: dict) -> None:
    print(json.dumps(obj, ensure_ascii=False), flush=True)


def _prepend_path(directory: str) -> None:
    if directory:
        os.environ["PATH"] = directory + os.pathsep + os.environ.get("PATH", "")


def ensure_ffmpeg() -> None:
    if shutil.which("ffmpeg"):
        return
    if os.name == "nt":
        try:
            import winreg

            for root, sub in (
                (winreg.HKEY_CURRENT_USER, "Environment"),
                (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
            ):
                try:
                    with winreg.OpenKey(root, sub) as key:
                        value, _ = winreg.QueryValueEx(key, "Path")
                        _prepend_path(os.path.expandvars(value))
                except OSError:
                    pass
            if shutil.which("ffmpeg"):
                return
            import glob

            base = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages")
            for exe in glob.glob(os.path.join(base, "Gyan.FFmpeg*", "**", "ffmpeg.exe"), recursive=True):
                _prepend_path(os.path.dirname(exe))
                if shutil.which("ffmpeg"):
                    return
        except Exception:
            pass
    try:
        import imageio_ffmpeg

        exe = imageio_ffmpeg.get_ffmpeg_exe()
        _prepend_path(str(Path(exe).parent))
    except Exception:
        pass


def speaker_label(raw: str | None) -> str | None:
    if not raw:
        return None
    text = str(raw)
    digits = "".join(ch for ch in text if ch.isdigit())
    if digits:
        return f"Locutor {int(digits) + 1}"
    return f"Locutor {text}"


def normalize_word(word: dict) -> dict:
    return {
        "start": float(word.get("start") or 0.0),
        "end": float(word.get("end") or 0.0),
        "word": word.get("word") or word.get("text") or "",
        "speaker": speaker_label(word.get("speaker")),
    }


def run_faster_whisper(args) -> None:
    from faster_whisper import WhisperModel

    lang = None if args.language == "auto" else args.language
    task = "translate" if args.translate else "transcribe"

    model = WhisperModel(
        args.model,
        device="cpu",
        compute_type="int8",
        cpu_threads=args.threads,
        download_root=None,
    )

    segments_iter, info = model.transcribe(
        args.input,
        language=lang,
        task=task,
        vad_filter=args.vad,
        word_timestamps=args.word_timestamps,
    )

    duration = float(info.duration or 0.0)
    emit({
        "type": "meta",
        "language": info.language,
        "duration": duration,
        "model": args.model,
    })

    normalized: list[dict] = []
    for idx, seg in enumerate(segments_iter):
        words = None
        if args.word_timestamps and getattr(seg, "words", None):
            words = [
                {
                    "start": float(w.start or 0.0),
                    "end": float(w.end or 0.0),
                    "word": w.word,
                    "speaker": None,
                }
                for w in seg.words
            ]
        item = {
            "start": float(seg.start or 0.0),
            "end": float(seg.end or 0.0),
            "text": (seg.text or "").strip(),
            "speaker": None,
            "words": words,
        }
        normalized.append(item)
        emit({
            "type": "segment",
            "id": idx,
            "start": item["start"],
            "end": item["end"],
            "text": item["text"],
            "speaker": None,
        })
        if duration > 0:
            pct = min(item["end"] / duration, 1.0)
            emit({"type": "progress", "pct": pct, "stage": "transcribe"})

    info_dict = {
        "language": info.language,
        "duration": duration,
        "model": args.model,
    }
    return normalized, info_dict


def run_whisperx(args, degraded: list[str]):
    import whisperx

    lang = None if args.language == "auto" else args.language

    model = whisperx.load_model(args.model, "cpu", compute_type="int8")
    audio = whisperx.load_audio(args.input)
    result = model.transcribe(audio, batch_size=8, language=lang)

    detected_lang = result.get("language")
    duration = float(len(audio) / 16000.0) if hasattr(audio, "__len__") else 0.0
    emit({
        "type": "meta",
        "language": detected_lang,
        "duration": duration,
        "model": args.model,
    })

    emit({"type": "progress", "pct": 0.5, "stage": "transcribe"})

    aligned = False
    emit({"type": "stage", "stage": "align", "status": "start", "detail": ""})
    try:
        model_a, meta = whisperx.load_align_model(
            language_code=detected_lang, device="cpu"
        )
        result = whisperx.align(
            result["segments"], model_a, meta, audio, "cpu",
            return_char_alignments=False,
        )
        aligned = True
        emit({"type": "stage", "stage": "align", "status": "done", "detail": ""})
    except Exception as exc:
        degraded.append("align")
        emit({
            "type": "stage", "stage": "align", "status": "skipped",
            "detail": str(exc),
        })

    if args.diarize:
        emit({"type": "stage", "stage": "diarize", "status": "start", "detail": ""})
        hf_token = args.hf_token or os.environ.get("HF_TOKEN")
        if not hf_token:
            degraded.append("diarize")
            emit({
                "type": "stage", "stage": "diarize", "status": "skipped",
                "detail": "hf_token ausente",
            })
        else:
            try:
                try:
                    from whisperx.diarize import DiarizationPipeline
                except Exception:
                    DiarizationPipeline = whisperx.DiarizationPipeline
                try:
                    dia = DiarizationPipeline(token=hf_token, device="cpu")
                except TypeError:
                    dia = DiarizationPipeline(use_auth_token=hf_token, device="cpu")
                diar = dia(
                    audio,
                    min_speakers=args.min_speakers or None,
                    max_speakers=args.max_speakers or None,
                )
                result = whisperx.assign_word_speakers(diar, result)
                emit({
                    "type": "stage", "stage": "diarize", "status": "done",
                    "detail": "",
                })
            except Exception as exc:
                degraded.append("diarize")
                emit({
                    "type": "stage", "stage": "diarize", "status": "skipped",
                    "detail": str(exc),
                })

    normalized: list[dict] = []
    for idx, seg in enumerate(result.get("segments", [])):
        raw_words = seg.get("words") or []
        words = [normalize_word(w) for w in raw_words if w.get("word") or w.get("text")]
        seg_speaker = speaker_label(seg.get("speaker"))
        if not seg_speaker:
            for w in words:
                if w["speaker"]:
                    seg_speaker = w["speaker"]
                    break
        item = {
            "start": float(seg.get("start") or 0.0),
            "end": float(seg.get("end") or 0.0),
            "text": (seg.get("text") or "").strip(),
            "speaker": seg_speaker,
            "words": words or None,
        }
        normalized.append(item)
        emit({
            "type": "segment",
            "id": idx,
            "start": item["start"],
            "end": item["end"],
            "text": item["text"],
            "speaker": item["speaker"],
        })

    emit({"type": "progress", "pct": 1.0, "stage": "transcribe"})

    info_dict = {
        "language": detected_lang,
        "duration": duration,
        "model": args.model,
    }
    return normalized, info_dict


def parse_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="transcribe.engine",
        description="Motor de transcricao (faster-whisper / whisperx).",
    )
    parser.add_argument("--input", required=True, help="Caminho do audio/video de entrada.")
    parser.add_argument("--out-dir", required=True, dest="out_dir", help="Diretorio de saida.")
    parser.add_argument("--job-id", required=True, dest="job_id", help="Identificador do job.")
    parser.add_argument("--model", default="large-v3", help="Modelo Whisper (ex: large-v3, base).")
    parser.add_argument("--language", default="auto", help="Idioma (codigo ISO ou 'auto').")
    parser.add_argument("--formats", default="txt,srt,vtt,json,lrc", help="Formatos de saida (csv).")
    parser.add_argument("--vad", action="store_true", help="Ativa filtro VAD.")
    parser.add_argument("--word-timestamps", action="store_true", dest="word_timestamps", help="Timestamps por palavra (usa whisperx).")
    parser.add_argument("--diarize", action="store_true", help="Diarizacao de locutores (usa whisperx).")
    parser.add_argument("--translate", action="store_true", help="Traduz para ingles.")
    parser.add_argument("--hf-token", default=None, dest="hf_token", help="Token Hugging Face para diarizacao.")
    parser.add_argument("--min-speakers", type=int, default=None, dest="min_speakers", help="Minimo de locutores.")
    parser.add_argument("--max-speakers", type=int, default=None, dest="max_speakers", help="Maximo de locutores.")
    parser.add_argument("--threads", type=int, default=8, help="Threads de CPU.")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    started = time.perf_counter()
    degraded: list[str] = []

    try:
        ensure_ffmpeg()

        input_path = Path(args.input)
        if not input_path.exists():
            emit({"type": "error", "message": f"Arquivo nao encontrado: {args.input}"})
            return 1

        Path(args.out_dir).mkdir(parents=True, exist_ok=True)

        use_whisperx = args.word_timestamps or args.diarize
        segments = None
        info_dict = None

        if use_whisperx:
            try:
                segments, info_dict = run_whisperx(args, degraded)
            except Exception as exc:
                emit({
                    "type": "stage", "stage": "align", "status": "skipped",
                    "detail": f"whisperx indisponivel: {exc}",
                })
                if args.word_timestamps:
                    degraded.append("word_timestamps")
                if args.diarize:
                    degraded.append("diarize")
                segments = None

        if segments is None:
            segments, info_dict = run_faster_whisper(args)

        formats_list = [f.strip() for f in args.formats.split(",") if f.strip()]
        files = write_all(args.out_dir, segments, info_dict, formats_list)

        elapsed = round(time.perf_counter() - started, 3)
        emit({
            "type": "done",
            "files": files,
            "segments": len(segments),
            "degraded": sorted(set(degraded)),
            "elapsed": elapsed,
        })
        return 0
    except Exception as exc:
        emit({"type": "error", "message": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
