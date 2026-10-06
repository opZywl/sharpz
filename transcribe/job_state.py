from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path

from src.i18n import t
from transcribe.config import VALID_FORMATS
from transcribe.models import AUTO_MODEL, resolve_model

SECRET_KEY = re.compile(r"token|secret|password|passwd|api[_-]?key|authorization", re.IGNORECASE)


def mask_secrets(value):
    if isinstance(value, dict):
        return {
            key: ("***" if item and SECRET_KEY.search(str(key)) else mask_secrets(item))
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [mask_secrets(item) for item in value]
    return value


def job_fingerprint(options: dict) -> str:
    if options.get("source_sha1"):
        source = {"sha1": options["source_sha1"]}
    elif options.get("input_path"):
        path = Path(str(options["input_path"]))
        try:
            info = path.stat()
            source = {"path": os.path.normcase(str(path.resolve())), "mtime": info.st_mtime_ns, "size": info.st_size}
        except OSError:
            source = {"path": os.path.normcase(str(path))}
    else:
        source = {"url": (options.get("url") or "").strip()}
    settings = {
        key: value
        for key, value in options.items()
        if key not in ("input_path", "url", "source_sha1", "hf_token", "vision")
    }
    vision = options.get("vision") or {}
    settings["hf_token"] = bool(options.get("hf_token"))
    settings["vision"] = {
        "base_url": vision.get("base_url"),
        "model": vision.get("model"),
        "api_key": bool(vision.get("api_key")),
    }
    payload = json.dumps([source, settings], sort_keys=True, default=str)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def engine_argv(args: dict) -> list[str]:
    argv = [
        "--input", str(args["input"]),
        "--out-dir", str(args["out_dir"]),
        "--job-id", str(args["job_id"]),
        "--model", str(args["model"]),
        "--language", str(args["language"]),
        "--formats", str(args["formats"]),
    ]
    for flag in ("vad", "word_timestamps", "diarize", "translate"):
        if args.get(flag):
            argv.append("--" + flag.replace("_", "-"))
    for key in ("min_speakers", "max_speakers", "threads"):
        if args.get(key) is not None:
            argv.extend(["--" + key.replace("_", "-"), str(args[key])])
    return argv


def _apply_event(job: dict, event: dict) -> None:
    kind = event.get("type")
    if kind == "meta":
        job["language"] = event.get("language")
        job["duration"] = event.get("duration")
    elif kind == "progress":
        if event.get("pct") is not None:
            job["pct"] = float(event["pct"])
        if event.get("stage"):
            job["stage"] = event["stage"]
    elif kind == "segment":
        job["segments"].append(
            {
                "start": event.get("start"),
                "end": event.get("end"),
                "text": event.get("text", ""),
                "speaker": event.get("speaker"),
                "words": event.get("words"),
            }
        )
    elif kind == "stage":
        stage = event.get("stage")
        if stage:
            job["stage"] = stage
        if event.get("status") == "skipped" and stage and stage not in job["degraded"]:
            job["degraded"].append(stage)


def _terminal_event(job: dict) -> dict:
    if job["status"] == "canceled":
        return {"type": "canceled"}
    if job["status"] == "error":
        return {"type": "error", "message": job.get("error") or t("transcribe.unknown_error", job.get("lang"))}
    return {
        "type": "done",
        "files": dict(job["files"]),
        "segments": len(job["segments"]),
        "degraded": list(job["degraded"]),
        "elapsed": job["elapsed"],
    }


def _public_view(job: dict) -> dict:
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "pct": job["pct"],
        "progress": job["pct"],
        "stage": job["stage"],
        "language": job["language"],
        "duration": job["duration"],
        "segments": list(job["segments"]),
        "files": dict(job["files"]),
        "degraded": list(job["degraded"]),
        "error": job["error"],
        "elapsed": job["elapsed"],
        "options": mask_secrets(job["options"]),
        "input_path": job.get("input_path"),
        "complete": dict(job["complete"]) if job.get("complete") else None,
        "model": job["model"],
        "text": job["text"] if job["status"] == "done" else None,
        "last_event_id": len(job["events"]),
    }


def _engine_args(options: dict, input_path: str, out_dir: Path, job_id: str) -> dict:
    return {
        "input": str(input_path),
        "out_dir": str(out_dir),
        "job_id": job_id,
        "model": options.get("model") or resolve_model(AUTO_MODEL, bool(options.get("translate"))),
        "language": options.get("language") or "auto",
        "formats": ",".join(options.get("formats") or VALID_FORMATS),
        "vad": bool(options.get("vad")),
        "word_timestamps": bool(options.get("word_timestamps")),
        "diarize": bool(options.get("diarize")),
        "translate": bool(options.get("translate")),
        "min_speakers": options.get("min_speakers"),
        "max_speakers": options.get("max_speakers"),
        "threads": options.get("threads"),
    }
