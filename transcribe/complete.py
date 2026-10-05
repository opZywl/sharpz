from __future__ import annotations

import base64
import io
import json
import math
import os
import re
import shutil
import subprocess
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

from src.i18n import t
from transcribe import formats
from transcribe.ffmpeg_util import ffmpeg_exe

"""Modo Complete: a partir de um video transcrito, gera nativamente a mesma
estrutura que fazemos a mao (frames, contact sheets, imagens curadas por cena,
docs README/FEEDBACK/SPEC via Vision LLM) e entrega numa pasta/zip.

Roda in-process na venv do backend: so usa ffmpeg-CLI (subprocess), Pillow e
urllib. `emit(event)` empurra eventos no mesmo stream SSE do job."""

Emit = Callable[[dict], None]

VIDEO_EXTS = {".mp4", ".mkv", ".mov", ".webm", ".avi", ".m4v", ".wmv", ".flv"}
SCENE_MIN = 3
SCENE_MAX = 40
DOC_MAX_IMAGES = 14
DOC_IMAGE_WIDTH = 768


# ───────────────────────── helpers de baixo nivel ─────────────────────────


def _run_ff(args: list[str]) -> tuple[int, str]:
    proc = subprocess.run(
        args,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return proc.returncode, (proc.stderr or "")


def _is_video(path: Path) -> bool:
    return path.suffix.lower() in VIDEO_EXTS


def _safe_slug(text: str, fallback: str) -> str:
    text = (text or "").strip().lower()
    text = re.sub(r"[áàâãä]", "a", text)
    text = re.sub(r"[éèêë]", "e", text)
    text = re.sub(r"[íìîï]", "i", text)
    text = re.sub(r"[óòôõö]", "o", text)
    text = re.sub(r"[úùûü]", "u", text)
    text = re.sub(r"[ç]", "c", text)
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:60] or fallback


def _safe_name(name: str, fallback: str) -> str:
    name = (name or "").strip()
    base = Path(name).name
    base = re.sub(r"[^A-Za-z0-9._-]+", "-", base).strip("-")
    return base or fallback


# ───────────────────────── estagios ─────────────────────────


def extract_audio(ff: str, input_path: Path, out_dir: Path) -> Path | None:
    audio_dir = out_dir / "_audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    target = audio_dir / "audio.wav"
    rc, _ = _run_ff([ff, "-y", "-i", str(input_path), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(target)])
    return target if rc == 0 and target.exists() else None


def extract_frames(ff: str, input_path: Path, out_dir: Path, interval: float) -> list[Path]:
    frames_dir = out_dir / "frames-todos"
    frames_dir.mkdir(parents=True, exist_ok=True)
    fps = 1.0 / max(0.5, interval)
    rc, _ = _run_ff([ff, "-y", "-i", str(input_path), "-vf", f"fps={fps:.6f}", "-q:v", "3", str(frames_dir / "frame_%03d.jpg")])
    return sorted(frames_dir.glob("frame_*.jpg"))


def build_contact_sheets(ff: str, out_dir: Path, frames: list[Path]) -> list[str]:
    if not frames:
        return []
    frames_dir = out_dir / "frames-todos"
    cols = 5
    rows = max(1, math.ceil(len(frames) / cols))
    written: list[str] = []

    plain = frames_dir / "contact-sheet.jpg"
    rc, _ = _run_ff([
        ff, "-y", "-i", str(frames_dir / "frame_%03d.jpg"),
        "-vf", f"scale=300:-1,tile={cols}x{rows}:padding=4:color=black",
        "-frames:v", "1", str(plain),
    ])
    if rc == 0 and plain.exists():
        written.append("frames-todos/contact-sheet.jpg")

    font = _drawtext_font()
    if font:
        numbered = frames_dir / "contact-sheet-numerado.jpg"
        draw = (
            f"drawtext=fontfile='{font}':text='%{{eif\\:n+1\\:d}}':x=12:y=12:"
            "fontsize=46:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=8"
        )
        rc, _ = _run_ff([
            ff, "-y", "-i", str(frames_dir / "frame_%03d.jpg"),
            "-vf", f"{draw},scale=300:-1,tile={cols}x{rows}:padding=4:color=black",
            "-frames:v", "1", str(numbered),
        ])
        if rc == 0 and numbered.exists():
            written.append("frames-todos/contact-sheet-numerado.jpg")
    return written


def _drawtext_font() -> str | None:
    candidates = [
        r"C:/Windows/Fonts/arialbd.ttf",
        r"C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for cand in candidates:
        if Path(cand).exists():
            return cand.replace(":", "\\:")
    return None


def detect_scenes(ff: str, input_path: Path, out_dir: Path, threshold: float, frames: list[Path]) -> list[Path]:
    imagens_dir = out_dir / "imagens"
    imagens_dir.mkdir(parents=True, exist_ok=True)
    rc, _ = _run_ff([
        ff, "-y", "-i", str(input_path),
        "-vf", f"select='gt(scene,{threshold:.3f})'", "-vsync", "vfr", "-q:v", "3",
        str(imagens_dir / "cena_%03d.jpg"),
    ])
    scenes = sorted(imagens_dir.glob("cena_*.jpg"))
    if len(scenes) < SCENE_MIN and frames:
        for s in scenes:
            s.unlink(missing_ok=True)
        scenes = _evenly_spaced(frames, imagens_dir, count=min(12, len(frames)))
    elif len(scenes) > SCENE_MAX:
        for extra in scenes[SCENE_MAX:]:
            extra.unlink(missing_ok=True)
        scenes = scenes[:SCENE_MAX]
    return scenes


def _evenly_spaced(frames: list[Path], imagens_dir: Path, count: int) -> list[Path]:
    if not frames or count <= 0:
        return []
    step = max(1, len(frames) // count)
    picked = frames[::step][:count]
    out: list[Path] = []
    for idx, src in enumerate(picked, start=1):
        dest = imagens_dir / f"cena_{idx:03d}.jpg"
        shutil.copyfile(src, dest)
        out.append(dest)
    return out


def write_transcripts(out_dir: Path, segments: list[dict], info: dict) -> list[str]:
    written: list[str] = []
    (out_dir / "transcricao.srt").write_text(formats.to_srt(segments), encoding="utf-8")
    (out_dir / "transcricao.vtt").write_text(formats.to_vtt(segments), encoding="utf-8")
    (out_dir / "transcricao.json").write_text(formats.to_json(segments, info), encoding="utf-8")
    written += ["transcricao.srt", "transcricao.vtt", "transcricao.json"]

    corrido = " ".join((s.get("text") or "").strip() for s in segments if (s.get("text") or "").strip())
    lines = [
        t("complete.transcript.title"),
        t(
            "complete.transcript.meta",
            language=info.get("language"),
            duration=round(float(info.get("duration") or 0.0), 1),
            model=info.get("model"),
        ),
        "=" * 72,
        "",
        t("complete.transcript.text"),
        "-" * 72,
        corrido,
        "",
        t("complete.transcript.segments"),
        "-" * 72,
    ]
    for s in segments:
        start = _mmss(float(s.get("start") or 0.0))
        end = _mmss(float(s.get("end") or 0.0))
        text = (s.get("text") or "").strip()
        if text:
            lines.append(f"[{start} -> {end}] {text}")
    (out_dir / "transcricao-completa.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    written.append("transcricao-completa.txt")
    return written


def _mmss(seconds: float) -> str:
    seconds = max(0, int(seconds))
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


# ───────────────────────── docs via Vision LLM ─────────────────────────


def _image_data_uri(path: Path, width: int = DOC_IMAGE_WIDTH) -> str | None:
    try:
        from PIL import Image

        with Image.open(path) as im:
            im = im.convert("RGB")
            if im.width > width:
                ratio = width / im.width
                im = im.resize((width, max(1, int(im.height * ratio))))
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=72)
            encoded = base64.b64encode(buf.getvalue()).decode("ascii")
            return f"data:image/jpeg;base64,{encoded}"
    except Exception:
        return None


def generate_docs(out_dir: Path, scenes: list[Path], contact_sheets: list[str], transcript_text: str, vision: dict, emit: Emit) -> dict:
    base_url = (vision.get("base_url") or "").strip().rstrip("/")
    model = (vision.get("model") or "").strip()
    if not base_url or not model:
        raise RuntimeError(t("imgpdf.vision.not_configured"))

    content: list[dict] = [{
        "type": "text",
        "text": t("complete.docs.transcript", text=transcript_text or t("complete.no_speech")),
    }]

    overview = out_dir / (contact_sheets[-1] if contact_sheets else "")
    if contact_sheets and overview.exists():
        uri = _image_data_uri(overview, width=1100)
        if uri:
            content.append({"type": "text", "text": t("complete.docs.contact_sheet")})
            content.append({"type": "image_url", "image_url": {"url": uri}})

    sent = scenes[:DOC_MAX_IMAGES]
    for scene in sent:
        uri = _image_data_uri(scene)
        if not uri:
            continue
        content.append({"type": "text", "text": t("complete.docs.image", name=scene.name)})
        content.append({"type": "image_url", "image_url": {"url": uri}})

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": t("complete.docs.prompt")},
            {"role": "user", "content": content},
        ],
        "temperature": 0.4,
        "stream": False,
    }
    headers = {"Content-Type": "application/json"}
    if (vision.get("api_key") or "").strip():
        headers["Authorization"] = f"Bearer {vision['api_key'].strip()}"

    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=600) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")
        except Exception:
            detail = ""
        raise RuntimeError(t("imgpdf.vision.http_error", url=base_url, code=exc.code, detail=detail).strip())
    except urllib.error.URLError as exc:
        raise RuntimeError(t("imgpdf.vision.unreachable", url=base_url, reason=exc.reason))

    try:
        raw = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise RuntimeError(t("imgpdf.vision.bad_response"))

    parsed = _parse_json_blob(raw)
    docs_written = _write_docs_from_parsed(out_dir, parsed, sent)
    return {"slug": parsed.get("slug"), "title": parsed.get("title"), "docs": docs_written, "images": parsed.get("images") or []}


def _parse_json_blob(raw: str) -> dict:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text).strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(text[start:end + 1])
    raise RuntimeError(t("imgpdf.vision.bad_json"))


def _write_docs_from_parsed(out_dir: Path, parsed: dict, scenes: list[Path]) -> list[str]:
    imagens_dir = out_dir / "imagens"
    by_file = {Path(item.get("file", "")).name: item for item in (parsed.get("images") or []) if isinstance(item, dict)}
    used = 0
    for scene in scenes:
        item = by_file.get(scene.name)
        if not item:
            continue
        new_name = _safe_name(item.get("new_name") or "", scene.name)
        if new_name and new_name != scene.name:
            dest = imagens_dir / new_name
            if dest.resolve() != scene.resolve():
                try:
                    scene.rename(dest)
                    used += 1
                except OSError:
                    shutil.copyfile(scene, dest)
                    scene.unlink(missing_ok=True)
    written: list[str] = []
    for key, filename in (("readme", "README.md"), ("feedback", "FEEDBACK.md"), ("spec", "SPEC.md")):
        body = parsed.get(key)
        if isinstance(body, str) and body.strip():
            (out_dir / filename).write_text(body.strip() + "\n", encoding="utf-8")
            written.append(filename)
    return written


def _fallback_readme(out_dir: Path, transcript_text: str, scenes: list[Path]) -> list[str]:
    lines = [
        t("complete.readme.title"),
        "",
        t("complete.readme.missing"),
        t("complete.readme.index"),
        "",
        t("complete.readme.transcripts"),
        t("complete.readme.frames"),
        t("complete.readme.images", count=len(scenes)),
        "",
        t("complete.readme.text"),
        "",
        transcript_text or t("complete.no_speech"),
    ]
    (out_dir / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return ["README.md"]


# ───────────────────────── entrega ─────────────────────────


def deliver(out_dir: Path, job_id: str, slug: str, output_dir: str | None, make_zip: bool, open_folder: bool) -> dict:
    result: dict = {"dest_dir": None, "zip": None}

    dest = None
    if output_dir and output_dir.strip():
        base = Path(output_dir.strip()).expanduser()
        dest = base / slug
        try:
            base.mkdir(parents=True, exist_ok=True)
            shutil.copytree(out_dir, dest, dirs_exist_ok=True, ignore=shutil.ignore_patterns("complete.zip", "_uploads"))
            result["dest_dir"] = str(dest)
        except Exception as exc:
            result["dest_error"] = str(exc)
            dest = None

    if make_zip:
        try:
            archive_base = out_dir.parent / f"{job_id}_complete"
            zip_path = shutil.make_archive(str(archive_base), "zip", root_dir=str(out_dir))
            result["zip"] = zip_path
        except Exception as exc:
            result["zip_error"] = str(exc)

    if open_folder:
        target = dest or out_dir
        try:
            if os.name == "nt":
                os.startfile(str(target))  # noqa: S606
            else:
                subprocess.Popen(["xdg-open", str(target)])
        except Exception:
            pass

    return result


# ───────────────────────── orquestrador ─────────────────────────


def run(job_id: str, input_path: Path, out_dir: Path, segments: list[dict], info: dict, options: dict, emit: Emit) -> dict:
    degraded: list[str] = []

    def stage(name: str, status: str = "start", **extra) -> None:
        emit({"type": "stage", "stage": name, "status": status, **extra})

    def progress(pct: float, name: str) -> None:
        emit({"type": "progress", "pct": max(0.0, min(1.0, pct)), "stage": name})

    ff = ffmpeg_exe()
    if not ff:
        stage("complete", "skipped", detail=t("complete.ffmpeg_missing"))
        degraded.append("complete")
        return {"degraded": degraded, "docs_generated": False}

    input_path = Path(input_path)
    is_video = _is_video(input_path)

    stage("audio", "start")
    progress(0.05, "audio")
    extract_audio(ff, input_path, out_dir)
    stage("audio", "done")

    frames: list[Path] = []
    contact_sheets: list[str] = []
    scenes: list[Path] = []

    if is_video:
        stage("frames", "start")
        progress(0.15, "frames")
        try:
            frames = extract_frames(ff, input_path, out_dir, float(options.get("frame_interval") or 3.0))
            stage("frames", "done", detail=t("complete.frames", count=len(frames)))
        except Exception as exc:
            degraded.append("frames")
            stage("frames", "skipped", detail=str(exc))

        if frames:
            stage("contact", "start")
            progress(0.30, "contact")
            try:
                contact_sheets = build_contact_sheets(ff, out_dir, frames)
                stage("contact", "done")
            except Exception as exc:
                degraded.append("contact")
                stage("contact", "skipped", detail=str(exc))

            stage("cenas", "start")
            progress(0.45, "cenas")
            try:
                scenes = detect_scenes(ff, input_path, out_dir, float(options.get("scene_threshold") or 0.30), frames)
                stage("cenas", "done", detail=t("complete.scenes", count=len(scenes)))
            except Exception as exc:
                degraded.append("cenas")
                stage("cenas", "skipped", detail=str(exc))
    else:
        degraded.append("frames")
        stage("frames", "skipped", detail=t("complete.no_video"))

    stage("transcricao", "start")
    progress(0.55, "transcricao")
    transcripts = write_transcripts(out_dir, segments, info)
    transcript_text = " ".join((s.get("text") or "").strip() for s in segments if (s.get("text") or "").strip())
    stage("transcricao", "done")

    docs_generated = False
    docs_written: list[str] = []
    doc_meta: dict = {}
    slug = _safe_slug(options.get("output_name") or "", job_id[:8])

    if options.get("gen_docs"):
        stage("docs", "start")
        progress(0.70, "docs")
        try:
            doc_meta = generate_docs(out_dir, scenes, contact_sheets, transcript_text, options.get("vision") or {}, emit)
            docs_written = doc_meta.get("docs") or []
            if doc_meta.get("slug") and not (options.get("output_name") or "").strip():
                slug = _safe_slug(doc_meta["slug"], slug)
            docs_generated = bool(docs_written)
            stage("docs", "done")
        except Exception as exc:
            degraded.append("docs")
            stage("docs", "skipped", detail=str(exc))
            docs_written = _fallback_readme(out_dir, transcript_text, scenes)
    else:
        docs_written = _fallback_readme(out_dir, transcript_text, scenes)

    stage("entrega", "start")
    progress(0.90, "entrega")
    delivery = deliver(
        out_dir,
        job_id,
        slug,
        options.get("output_dir"),
        bool(options.get("make_zip")),
        bool(options.get("open_folder")),
    )
    stage("entrega", "done")
    progress(1.0, "complete")

    imagens_dir = out_dir / "imagens"
    image_files = [f"imagens/{p.name}" for p in sorted(imagens_dir.glob("*.jpg"))] if imagens_dir.exists() else []
    captions = {Path(item.get("file", "")).name: item.get("caption") for item in (doc_meta.get("images") or []) if isinstance(item, dict)}

    manifest = {
        "slug": slug,
        "title": doc_meta.get("title") or slug,
        "out_dir": str(out_dir),
        "dest_dir": delivery.get("dest_dir"),
        "zip": delivery.get("zip"),
        "frames": len(frames),
        "images": image_files,
        "captions": captions,
        "contact_sheets": contact_sheets,
        "docs": docs_written,
        "transcripts": transcripts,
        "docs_generated": docs_generated,
        "degraded": sorted(set(degraded)),
    }
    (out_dir / "complete.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest
