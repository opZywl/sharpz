"""Construtor do PDF: imagem como pagina + camada de texto invisivel.

Aprendizados de cmap embutidos: a fonte base-14 'helv' faz round-trip perfeito de
ASCII/acentos/parenteses/ordinais na extracao de texto; os tracos longos e simbolos
fora do latin-1 sao normalizados/saneados so na camada invisivel (o visual continua
sendo a imagem). Resultado: 0 NBSP, 0 hifen-suave, 0 parentese ornamental.
"""

from __future__ import annotations

import unicodedata
from pathlib import Path

import fitz  # PyMuPDF

A4 = fitz.paper_size("a4")  # (595.276, 841.89)

GLITCH_CHARS = {
    " ": "nbsp",
    "­": "soft-hyphen",
    "‐": "hyphen-2010",
    "﴾": "ornate-paren-left",
    "﴿": "ornate-paren-right",
}

_DASHES = {
    "‐": "-", "‑": "-", "‒": "-", "–": "-",
    "—": "-", "―": "-", "•": "-", "·": "-",
}
_QUOTES = {
    "“": '"', "”": '"', "„": '"', "″": '"',
    "‘": "'", "’": "'", "‚": "'", "′": "'",
    "…": "...",
}


def _sanitize(text: str) -> str:
    """Texto seguro p/ a camada helv: tracos/aspas normalizados, latin-1 preservado,
    o resto reduzido a ASCII (NFKD) ou espaco. Nunca quebra a insercao."""
    out: list[str] = []
    for ch in text:
        if ch in ("\n", "\t"):
            out.append(ch)
            continue
        if ch in _DASHES:
            out.append(_DASHES[ch])
            continue
        if ch in _QUOTES:
            out.append(_QUOTES[ch])
            continue
        code = ord(ch)
        if code == 0x20:
            out.append(" ")
            continue
        if code == 0xA0:
            out.append(" ")
            continue
        if code == 0xAD:
            out.append("-")
            continue
        if 0x21 <= code < 0x7F or 0xA1 <= code < 0x100:
            out.append(ch)
            continue
        nf = unicodedata.normalize("NFKD", ch)
        asc = "".join(c for c in nf if 0x20 <= ord(c) < 0x7F)
        out.append(asc if asc else " ")
    return "".join(out)


def _page_size(img_w: int, img_h: int, page_mode: str) -> tuple[float, float]:
    if page_mode == "a4":
        if img_w >= img_h:
            return (A4[1], A4[0])
        return (A4[0], A4[1])
    width = A4[0]
    height = width * (img_h / max(1, img_w))
    return (width, height)


class _Fitter:
    def __init__(self) -> None:
        self._font = fitz.Font("helv")

    def wrap(self, text: str, width_pt: float, fs: float) -> list[str]:
        lines: list[str] = []
        for para in text.split("\n"):
            words = para.split(" ")
            cur = ""
            for word in words:
                trial = word if not cur else f"{cur} {word}"
                if not cur or self._font.text_length(trial, fontsize=fs) <= width_pt:
                    cur = trial
                else:
                    lines.append(cur)
                    cur = word
            lines.append(cur)
        return lines


def build_pdf(
    image_path: str | Path,
    blocks: list[dict],
    out_path: str | Path,
    page_mode: str = "auto",
    key_terms: list[str] | None = None,
) -> dict:
    """Gera o PDF. blocks = [{"text": str, "bbox": [x0,y0,x1,y1] em px da imagem}].

    Retorna manifesto com o relatorio de conferencia da camada de texto.
    """
    image_path = Path(image_path)
    out_path = Path(out_path)
    fitter = _Fitter()

    img_pix = fitz.Pixmap(str(image_path))
    if img_pix.alpha or img_pix.colorspace is None or img_pix.colorspace.n > 3:
        img_pix = fitz.Pixmap(fitz.csRGB, img_pix)
    img_w, img_h = img_pix.width, img_pix.height

    page_w, page_h = _page_size(img_w, img_h, page_mode)
    sx = page_w / max(1, img_w)
    sy = page_h / max(1, img_h)

    doc = fitz.open()
    page = doc.new_page(width=page_w, height=page_h)
    page.insert_image(fitz.Rect(0, 0, page_w, page_h), pixmap=img_pix)

    placed = 0
    for block in blocks:
        text = _sanitize(str(block.get("text") or "")).strip("\n")
        if not text.strip():
            continue
        bbox = block.get("bbox") or [0, 0, img_w, img_h]
        try:
            x0, y0, x1, y1 = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])
        except (TypeError, ValueError, IndexError):
            continue
        x0, x1 = sorted((max(0.0, x0), min(float(img_w), x1)))
        y0, y1 = sorted((max(0.0, y0), min(float(img_h), y1)))
        rx0, ry0, rx1, ry1 = x0 * sx, y0 * sy, x1 * sx, y1 * sy
        box_w = max(6.0, rx1 - rx0)
        box_h = max(6.0, ry1 - ry0)

        fs = min(box_h, 40.0)
        while fs >= 3:
            lines = fitter.wrap(text, box_w, fs)
            if len(lines) * (fs * 1.18) <= box_h + 0.6:
                break
            fs -= 0.5
        lines = fitter.wrap(text, box_w, fs)
        lh = fs * 1.18
        y = ry0 + fs
        for line in lines:
            try:
                page.insert_text(
                    (rx0, y), line, fontname="helv", fontsize=fs,
                    color=(0, 0, 0), render_mode=3,
                )
            except Exception:
                pass
            y += lh
        placed += 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(out_path), garbage=4, deflate=True)
    doc.close()

    report = verify_text_layer(out_path, key_terms)
    report["blocks_placed"] = placed
    report["page_mode"] = page_mode
    report["page_pt"] = [round(page_w, 2), round(page_h, 2)]
    report["image_px"] = [img_w, img_h]
    return report


def verify_text_layer(pdf_path: str | Path, key_terms: list[str] | None = None) -> dict:
    doc = fitz.open(str(pdf_path))
    text = doc[0].get_text()
    doc.close()

    glitches = {label: text.count(ch) for ch, label in GLITCH_CHARS.items() if text.count(ch)}
    terms_missing = [term for term in (key_terms or []) if term not in text]
    return {
        "chars": len(text),
        "hyphens": text.count("-"),
        "spaces": text.count(" "),
        "glitches": glitches,
        "glitch_total": sum(glitches.values()),
        "terms_missing": terms_missing,
        "clean": sum(glitches.values()) == 0,
    }


def write_text_layer(pdf_path: str | Path, out_txt: str | Path) -> int:
    doc = fitz.open(str(pdf_path))
    text = doc[0].get_text()
    doc.close()
    Path(out_txt).write_text(text, encoding="utf-8")
    return len(text)


def render_preview(pdf_path: str | Path, out_png: str | Path, dpi: int = 150) -> None:
    doc = fitz.open(str(pdf_path))
    pix = doc[0].get_pixmap(dpi=dpi)
    pix.save(str(out_png))
    doc.close()
