from __future__ import annotations

import json
from pathlib import Path


def _clamp(value: float) -> float:
    return value if value > 0 else 0.0


def _format_srt_time(seconds: float) -> str:
    seconds = _clamp(seconds)
    total_ms = int(round(seconds * 1000))
    hours, rem = divmod(total_ms, 3600000)
    minutes, rem = divmod(rem, 60000)
    secs, millis = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def _format_vtt_time(seconds: float) -> str:
    seconds = _clamp(seconds)
    total_ms = int(round(seconds * 1000))
    hours, rem = divmod(total_ms, 3600000)
    minutes, rem = divmod(rem, 60000)
    secs, millis = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"


def _format_lrc_time(seconds: float) -> str:
    seconds = _clamp(seconds)
    total_centis = int(round(seconds * 100))
    minutes, rem = divmod(total_centis, 6000)
    secs, centis = divmod(rem, 100)
    return f"{minutes:02d}:{secs:02d}.{centis:02d}"


def _decorate(segment: dict) -> str:
    text = (segment.get("text") or "").strip()
    speaker = segment.get("speaker")
    if speaker:
        return f"[{speaker}] {text}"
    return text


def to_txt(segments: list[dict]) -> str:
    lines = []
    for segment in segments:
        text = _decorate(segment)
        if text:
            lines.append(text)
    return "\n".join(lines) + ("\n" if lines else "")


def to_srt(segments: list[dict]) -> str:
    blocks = []
    index = 1
    for segment in segments:
        text = _decorate(segment)
        if not text:
            continue
        start = _format_srt_time(float(segment.get("start") or 0.0))
        end = _format_srt_time(float(segment.get("end") or 0.0))
        blocks.append(f"{index}\n{start} --> {end}\n{text}\n")
        index += 1
    return "\n".join(blocks)


def to_vtt(segments: list[dict]) -> str:
    blocks = ["WEBVTT\n"]
    for segment in segments:
        text = _decorate(segment)
        if not text:
            continue
        start = _format_vtt_time(float(segment.get("start") or 0.0))
        end = _format_vtt_time(float(segment.get("end") or 0.0))
        blocks.append(f"{start} --> {end}\n{text}\n")
    return "\n".join(blocks)


def to_lrc(segments: list[dict]) -> str:
    lines = []
    for segment in segments:
        text = _decorate(segment)
        if not text:
            continue
        stamp = _format_lrc_time(float(segment.get("start") or 0.0))
        lines.append(f"[{stamp}]{text}")
    return "\n".join(lines) + ("\n" if lines else "")


def to_json(segments: list[dict], info_dict: dict) -> str:
    payload = {
        "language": info_dict.get("language"),
        "duration": info_dict.get("duration"),
        "model": info_dict.get("model"),
        "segments": segments,
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


_FILENAMES = {
    "txt": "transcript.txt",
    "srt": "transcript.srt",
    "vtt": "transcript.vtt",
    "json": "transcript.json",
    "lrc": "transcript.lrc",
}

_BUILDERS = {
    "txt": lambda segments, info: to_txt(segments),
    "srt": lambda segments, info: to_srt(segments),
    "vtt": lambda segments, info: to_vtt(segments),
    "lrc": lambda segments, info: to_lrc(segments),
    "json": lambda segments, info: to_json(segments, info),
}


def write_all(
    out_dir: str | Path,
    segments: list[dict],
    info_dict: dict,
    formats_list: list[str],
) -> dict[str, str]:
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    written: dict[str, str] = {}
    for fmt in formats_list:
        fmt = fmt.strip().lower()
        if fmt not in _BUILDERS:
            continue
        content = _BUILDERS[fmt](segments, info_dict)
        filename = _FILENAMES[fmt]
        (out_path / filename).write_text(content, encoding="utf-8")
        written[fmt] = filename
    return written
