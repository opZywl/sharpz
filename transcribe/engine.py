from __future__ import annotations

import argparse
import gc
import json
import os
import sys
import threading
import time
from pathlib import Path

from src.i18n import t, use_lang
from transcribe.ffmpeg_util import ensure_ffmpeg
from transcribe.formats import write_all

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "120")

COMPUTE_TYPE = "int8"
DEFAULT_THREADS = 8
BEAM_SIZE = 5
WHISPERX_BATCH_SIZE = 8
MEMORY_HINTS = (
    "bad_alloc",
    "out of memory",
    "not enough memory",
    "unable to allocate",
    "paging file",
    "memoryerror",
)

_events = sys.stdout
_emit_lock = threading.Lock()


def configure_output() -> None:
    global _events
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
        except (AttributeError, ValueError):
            pass
    _events = sys.stdout
    sys.stdout = sys.stderr


def emit(obj: dict) -> None:
    line = json.dumps(obj, ensure_ascii=False)
    with _emit_lock:
        _events.write(line + "\n")
        _events.flush()


def stage_event(stage: str, status: str, detail: str = "") -> dict:
    return {"type": "stage", "stage": stage, "status": status, "detail": detail}


def is_memory_error(exc: BaseException) -> bool:
    if isinstance(exc, MemoryError):
        return True
    text = f"{type(exc).__name__} {exc}".lower()
    return any(hint in text for hint in MEMORY_HINTS)


def describe_error(exc: BaseException, model: str | None = None) -> str:
    if is_memory_error(exc):
        target = t("transcribe.memory_target_model", model=model) if model else t("transcribe.memory_target")
        return t("transcribe.memory", target=target)
    reason = str(exc).strip() or type(exc).__name__
    return t("transcribe.failed", reason=reason)


def speaker_label(raw: str | None) -> str | None:
    if not raw:
        return None
    text = str(raw)
    digits = "".join(ch for ch in text if ch.isdigit())
    if digits:
        return t("transcribe.speaker", name=int(digits) + 1)
    return t("transcribe.speaker", name=text)


def normalize_word(word: dict) -> dict:
    return {
        "start": float(word.get("start") or 0.0),
        "end": float(word.get("end") or 0.0),
        "word": word.get("word") or word.get("text") or "",
        "speaker": speaker_label(word.get("speaker")),
    }


def segment_event(idx: int, item: dict) -> dict:
    event = {
        "type": "segment",
        "id": idx,
        "start": item["start"],
        "end": item["end"],
        "text": item["text"],
        "speaker": item["speaker"],
    }
    if item.get("words"):
        event["words"] = item["words"]
    return event


def model_path(name: str, emit_fn=emit) -> str:
    if os.path.isdir(name):
        return name
    from faster_whisper.utils import download_model

    try:
        path = download_model(name, local_files_only=True)
        if (Path(path) / "model.bin").is_file():
            return path
    except Exception:
        pass
    emit_fn(stage_event("download_model", "start", name))
    path = download_model(name)
    emit_fn(stage_event("download_model", "done", name))
    emit_fn(stage_event("load_model", "start", name))
    return path


def load_whisper_model(name: str, threads: int | None, emit_fn=emit):
    emit_fn(stage_event("load_model", "start", name))
    from faster_whisper import WhisperModel

    path = model_path(name, emit_fn)
    model = WhisperModel(
        path,
        device="cpu",
        compute_type=COMPUTE_TYPE,
        cpu_threads=int(threads or DEFAULT_THREADS),
        local_files_only=True,
    )
    emit_fn(stage_event("load_model", "done", name))
    return model


def decode_options(args) -> dict:
    return {
        "language": None if args.language == "auto" else args.language,
        "task": "translate" if args.translate else "transcribe",
        "beam_size": BEAM_SIZE,
        "vad_filter": bool(args.vad),
        "word_timestamps": bool(args.word_timestamps),
        "condition_on_previous_text": False,
    }


def run_faster_whisper(args, emit_fn=emit, model=None):
    if model is None:
        model = load_whisper_model(args.model, args.threads, emit_fn)

    emit_fn(stage_event("transcribe", "start"))
    emit_fn({"type": "progress", "pct": 0.0, "stage": "transcribe"})
    segments_iter, info = model.transcribe(args.input, **decode_options(args))

    duration = float(info.duration or 0.0)
    emit_fn({
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
        emit_fn(segment_event(idx, item))
        if duration > 0:
            emit_fn({"type": "progress", "pct": min(item["end"] / duration, 1.0), "stage": "transcribe"})

    emit_fn(stage_event("transcribe", "done"))
    info_dict = {
        "language": info.language,
        "duration": duration,
        "model": args.model,
    }
    return normalized, info_dict


def _align(whisperx, result: dict, audio, language: str | None, degraded: list[str], emit_fn) -> dict:
    emit_fn(stage_event("align", "start"))
    try:
        model_a, meta = whisperx.load_align_model(language_code=language, device="cpu")
        aligned = whisperx.align(
            result["segments"], model_a, meta, audio, "cpu",
            return_char_alignments=False,
        )
        emit_fn(stage_event("align", "done"))
        return aligned
    except Exception as exc:
        degraded.append("align")
        emit_fn(stage_event("align", "skipped", str(exc)))
        return result


def _diarize(whisperx, args, result: dict, audio, degraded: list[str], emit_fn) -> dict:
    emit_fn(stage_event("diarize", "start"))
    hf_token = args.hf_token or os.environ.get("HF_TOKEN")
    if not hf_token:
        degraded.append("diarize")
        emit_fn(stage_event("diarize", "skipped", t("transcribe.diarize_no_token")))
        return result
    try:
        try:
            from whisperx.diarize import DiarizationPipeline
        except Exception:
            DiarizationPipeline = whisperx.DiarizationPipeline
        try:
            pipeline = DiarizationPipeline(token=hf_token, device="cpu")
        except TypeError:
            pipeline = DiarizationPipeline(use_auth_token=hf_token, device="cpu")
        diar = pipeline(
            audio,
            min_speakers=args.min_speakers or None,
            max_speakers=args.max_speakers or None,
        )
        result = whisperx.assign_word_speakers(diar, result)
        emit_fn(stage_event("diarize", "done"))
    except Exception as exc:
        degraded.append("diarize")
        emit_fn(stage_event("diarize", "skipped", str(exc)))
    return result


def run_whisperx(args, degraded: list[str], emit_fn=emit):
    import whisperx

    options = decode_options(args)
    lang = options["language"]
    task = options["task"]

    emit_fn(stage_event("load_model", "start", args.model))
    path = model_path(args.model, emit_fn)
    model = whisperx.load_model(
        path,
        "cpu",
        compute_type=COMPUTE_TYPE,
        language=lang,
        task=task,
        threads=int(args.threads or DEFAULT_THREADS),
    )
    emit_fn(stage_event("load_model", "done", args.model))

    emit_fn(stage_event("transcribe", "start"))
    emit_fn({"type": "progress", "pct": 0.0, "stage": "transcribe"})
    audio = whisperx.load_audio(args.input)
    result = model.transcribe(audio, batch_size=WHISPERX_BATCH_SIZE, language=lang, task=task)
    del model
    gc.collect()

    detected_lang = result.get("language") or lang
    duration = float(len(audio) / 16000.0) if hasattr(audio, "__len__") else 0.0
    emit_fn({
        "type": "meta",
        "language": detected_lang,
        "duration": duration,
        "model": args.model,
    })
    emit_fn({"type": "progress", "pct": 0.5, "stage": "transcribe"})
    emit_fn(stage_event("transcribe", "done"))

    result = _align(whisperx, result, audio, detected_lang, degraded, emit_fn)
    gc.collect()
    result = _diarize(whisperx, args, result, audio, degraded, emit_fn)
    gc.collect()

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
        emit_fn(segment_event(idx, item))

    emit_fn({"type": "progress", "pct": 1.0, "stage": "transcribe"})

    info_dict = {
        "language": detected_lang,
        "duration": duration,
        "model": args.model,
    }
    return normalized, info_dict


def run_job(args, emit_fn=emit, model_provider=None) -> BaseException | None:
    started = time.perf_counter()
    degraded: list[str] = []
    try:
        ensure_ffmpeg()
        if not Path(args.input).exists():
            raise FileNotFoundError(t("transcribe.file_missing", path=args.input))
        Path(args.out_dir).mkdir(parents=True, exist_ok=True)

        segments = None
        info_dict = None
        if args.diarize:
            try:
                segments, info_dict = run_whisperx(args, degraded, emit_fn)
            except Exception as exc:
                degraded.append("diarize")
                emit_fn(stage_event("diarize", "skipped", t("transcribe.whisperx_unavailable", error=exc)))
                segments = None
                gc.collect()

        if segments is None:
            model = model_provider(args, emit_fn) if model_provider else None
            segments, info_dict = run_faster_whisper(args, emit_fn, model)

        emit_fn(stage_event("write", "start"))
        formats_list = [f.strip() for f in str(args.formats).split(",") if f.strip()]
        files = write_all(args.out_dir, segments, info_dict, formats_list)
        emit_fn(stage_event("write", "done"))

        emit_fn({
            "type": "done",
            "files": files,
            "segments": len(segments),
            "degraded": sorted(set(degraded)),
            "elapsed": round(time.perf_counter() - started, 3),
        })
        return None
    except Exception as exc:
        emit_fn({"type": "error", "message": describe_error(exc, getattr(args, "model", None))})
        return exc


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="transcribe.engine",
        description="Motor de transcrição (faster-whisper / whisperX).",
    )
    parser.add_argument("--input", required=True, help="Caminho do áudio/vídeo de entrada.")
    parser.add_argument("--out-dir", required=True, dest="out_dir", help="Diretório de saída.")
    parser.add_argument("--job-id", required=True, dest="job_id", help="Identificador do job.")
    parser.add_argument("--model", default="auto", help="Modelo Whisper (auto, large-v3-turbo, large-v3, base...).")
    parser.add_argument("--language", default="auto", help="Idioma (código ISO ou 'auto').")
    parser.add_argument("--formats", default="txt,srt,vtt,json,lrc", help="Formatos de saída (csv).")
    parser.add_argument("--vad", action="store_true", help="Ativa o filtro VAD.")
    parser.add_argument("--word-timestamps", action="store_true", dest="word_timestamps", help="Tempo por palavra (nativo do faster-whisper).")
    parser.add_argument("--diarize", action="store_true", help="Separa os locutores (usa whisperX).")
    parser.add_argument("--translate", action="store_true", help="Traduz para inglês.")
    parser.add_argument("--hf-token", default=None, dest="hf_token", help="Token do Hugging Face para a diarização.")
    parser.add_argument("--min-speakers", type=int, default=None, dest="min_speakers", help="Mínimo de locutores.")
    parser.add_argument("--max-speakers", type=int, default=None, dest="max_speakers", help="Máximo de locutores.")
    parser.add_argument("--threads", type=int, default=DEFAULT_THREADS, help="Threads de CPU.")
    return parser


def parse_args(argv=None) -> argparse.Namespace:
    return build_parser().parse_args(argv)


def args_from_dict(values: dict) -> argparse.Namespace:
    args = parse_args([
        "--input", str(values["input"]),
        "--out-dir", str(values["out_dir"]),
        "--job-id", str(values["job_id"]),
    ])
    for key, value in values.items():
        if value is not None and hasattr(args, key):
            setattr(args, key, value)
    return args


def main(argv=None) -> int:
    configure_output()
    args = parse_args(argv)
    if args.model == "auto":
        from transcribe.jobs import resolve_model

        args.model = resolve_model(args.model, args.translate)
    with use_lang(os.environ.get("SHARPZ_ENGINE_LANG")):
        return 0 if run_job(args) is None else 1


if __name__ == "__main__":
    raise SystemExit(main())
