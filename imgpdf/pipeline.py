"""Pipeline Imagem -> PDF: estagios com callback emit (log/stage/progress).

Reproduz, ao vivo, o passo a passo: carregar -> analisar layout -> transcrever
(Vision) -> verificar -> montar camada -> construir PDF -> conferir -> entregar.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Callable

from PIL import Image

from imgpdf import pdfbuild, vision as vision_mod

Emit = Callable[[dict], None]


def _safe_name(name: str, default: str) -> str:
    raw = Path(name or default).name.strip()
    safe = "".join(ch for ch in raw if ch.isalnum() or ch in "._- ")
    safe = safe.strip(" .") or default
    return safe


def run(job_id: str, image_path: str | Path, out_dir: str | Path, options: dict, emit: Emit) -> dict:
    image_path = Path(image_path)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1) carregar
    emit({"type": "stage", "stage": "carregar"})
    emit({"type": "progress", "pct": 0.05, "stage": "carregar"})
    with Image.open(image_path) as im:
        img_w, img_h = im.size
        img_mode = im.mode
    emit({"type": "log", "level": "info", "message": f"Imagem carregada: {img_w}x{img_h} ({img_mode})"})

    # 2) analisar layout
    emit({"type": "stage", "stage": "layout"})
    emit({"type": "progress", "pct": 0.1, "stage": "layout"})
    tiles = vision_mod._tiles(img_w, img_h)
    emit({"type": "log", "level": "info", "message": f"Layout: {len(tiles)} regiao(oes) p/ leitura"})

    # 3+4) transcrever (+verificar): o modulo vision emite seus proprios logs/stages
    emit({"type": "progress", "pct": 0.2, "stage": "transcrever"})
    result = vision_mod.read_image(image_path, options, emit)
    blocks = result["blocks"]
    engine = result["engine"]
    degraded = list(result["degraded"])
    emit({"type": "progress", "pct": 0.78, "stage": "transcrever"})

    # 5) montar camada
    emit({"type": "stage", "stage": "montar"})
    chars = sum(len(b["text"]) for b in blocks)
    emit({"type": "log", "level": "info",
          "message": f"Camada: {len(blocks)} bloco(s), ~{chars} caracteres (motor: {engine})"})

    # 6) construir PDF
    emit({"type": "stage", "stage": "construir-pdf"})
    emit({"type": "progress", "pct": 0.85, "stage": "construir-pdf"})
    page_mode = (options.get("page_mode") or "auto").strip().lower()
    if page_mode not in ("auto", "a4"):
        page_mode = "auto"
    pdf_path = out_dir / "documento.pdf"
    report = pdfbuild.build_pdf(image_path, blocks, pdf_path, page_mode)

    # 7) conferir
    emit({"type": "stage", "stage": "conferir"})
    emit({"type": "progress", "pct": 0.92, "stage": "conferir"})
    emit({"type": "log", "level": "info",
          "message": (f"PDF conferido: {report['chars']} chars, {report['hyphens']} hifens, "
                      f"glitches={report['glitch_total']}, pagina {report['page_pt']} pt")})
    if report["glitch_total"] == 0:
        emit({"type": "log", "level": "ok", "message": "Camada de texto limpa (0 NBSP / hifen-suave / parentese ornamental)"})
    else:
        emit({"type": "log", "level": "warn", "message": f"Glitches detectados: {report['glitches']}"})

    txt_path = out_dir / "camada-texto.txt"
    pdfbuild.write_text_layer(pdf_path, txt_path)
    preview_path: Path | None = out_dir / "preview.png"
    try:
        pdfbuild.render_preview(pdf_path, preview_path)
    except Exception:
        preview_path = None

    # 8) entregar
    emit({"type": "stage", "stage": "entregar"})
    dest_dir: str | None = None
    dest_pdf: Path | None = None
    target = (options.get("output_dir") or "").strip()
    if target:
        try:
            dest = Path(target).expanduser()
            dest.mkdir(parents=True, exist_ok=True)
            name = _safe_name(options.get("output_name") or "", image_path.stem) + ".pdf"
            dest_pdf = dest / name
            shutil.copy2(pdf_path, dest_pdf)
            shutil.copy2(txt_path, dest / (Path(name).stem + "-camada-texto.txt"))
            dest_dir = str(dest)
            emit({"type": "log", "level": "ok", "message": f"PDF copiado para: {dest_pdf}"})
        except Exception as exc:
            emit({"type": "log", "level": "warn", "message": f"Nao consegui copiar p/ a pasta de saida: {exc}"})

    manifest = {
        "pdf": str(pdf_path),
        "pdf_name": "documento.pdf",
        "text_layer": str(txt_path),
        "preview": str(preview_path) if preview_path else None,
        "out_dir": str(out_dir),
        "dest_dir": dest_dir,
        "dest_pdf": str(dest_pdf) if dest_pdf else None,
        "engine": engine,
        "blocks": len(blocks),
        "report": report,
        "degraded": degraded,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    emit({"type": "log", "level": "ok", "message": "Concluido."})
    return manifest
