"""Editor (tipo Canva): extrai textos+posicoes de um PDF para elementos editaveis
e reconstroi um PDF a partir dos elementos editados (texto real). Usado pelo modo
Editor do dashboard, onde cada texto vira uma caixa arrastavel/editavel.
"""

from __future__ import annotations

import base64
import math
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import fitz  # PyMuPDF

from imgpdf.pdfbuild import _sanitize, A4
from src.i18n import t


def _find_chrome() -> str | None:
    for env in ("ProgramFiles", "ProgramFiles(x86)", "LocalAppData"):
        base = os.environ.get(env)
        if base:
            cand = Path(base) / "Google" / "Chrome" / "Application" / "chrome.exe"
            if cand.exists():
                return str(cand)
    return shutil.which("chrome") or shutil.which("chrome.exe") or shutil.which("google-chrome")


_LOCKDOWN = [
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE fonts.googleapis.com, EXCLUDE fonts.gstatic.com",
]
_CSP = (
    "<meta http-equiv=\"Content-Security-Policy\" content=\"script-src 'none'; object-src 'none'; "
    "frame-src 'none'; base-uri 'none'; form-action 'none'\">"
)
_PROLOGUE = re.compile(r"\A\ufeff?[\t\n\f\r ]*<!doctype[^>]*>", re.IGNORECASE)


def _locked_html(html: str) -> str:
    m = _PROLOGUE.match(html)
    end = m.end() if m else 0
    return html[:end] + _CSP + html[end:]


def render_html_pdf(html: str) -> bytes:
    """Renderiza um HTML completo (A4) em PDF via Chrome headless. Honra fontes web,
    icones e estilos exatamente como na tela do editor (WYSIWYG)."""
    chrome = _find_chrome()
    if not chrome:
        raise RuntimeError(t("editor.chrome_missing_pdf"))
    with tempfile.TemporaryDirectory() as tmp:
        hp = Path(tmp) / "doc.html"
        op = Path(tmp) / "out.pdf"
        hp.write_text(_locked_html(html), encoding="utf-8")
        url = "file:///" + str(hp).replace("\\", "/")
        subprocess.run(
            [chrome, "--headless", "--disable-gpu", "--no-sandbox", *_LOCKDOWN, "--no-pdf-header-footer",
             "--virtual-time-budget=3500", f"--print-to-pdf={op}", url],
            timeout=90, capture_output=True,
        )
        if not op.exists():
            raise RuntimeError(t("editor.chrome_no_pdf"))
        return op.read_bytes()


def render_html_png(html: str, page_w: float, page_h: float, scale: int = 2) -> bytes:
    """Renderiza o HTML (A4) em PNG via Chrome headless (screenshot WYSIWYG)."""
    chrome = _find_chrome()
    if not chrome:
        raise RuntimeError(t("editor.chrome_missing_png"))
    page_w = min(14400.0, max(1.0, page_w)) if math.isfinite(page_w) else A4[0]
    page_h = min(14400.0, max(1.0, page_h)) if math.isfinite(page_h) else A4[1]
    w_px = max(1, round(page_w * 4 / 3))
    h_px = max(1, round(page_h * 4 / 3))
    scale = 1 if scale < 1 else 3 if scale > 3 else int(scale)
    with tempfile.TemporaryDirectory() as tmp:
        hp = Path(tmp) / "doc.html"
        op = Path(tmp) / "out.png"
        hp.write_text(_locked_html(html), encoding="utf-8")
        url = "file:///" + str(hp).replace("\\", "/")
        subprocess.run(
            [chrome, "--headless", "--disable-gpu", "--no-sandbox", *_LOCKDOWN, "--hide-scrollbars",
             f"--force-device-scale-factor={scale}", "--virtual-time-budget=3500",
             f"--window-size={w_px},{h_px}", f"--screenshot={op}", url],
            timeout=90, capture_output=True,
        )
        if not op.exists():
            raise RuntimeError(t("editor.chrome_no_png"))
        return op.read_bytes()

_BOLD = 1 << 4
_ITALIC = 1 << 1


def _hex_to_rgb01(h: str) -> tuple[float, float, float]:
    h = (h or "").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        return (0.1, 0.14, 0.21)
    return (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255)


def extract_elements(pdf_bytes: bytes, render_bg: bool = False) -> dict:
    """Abre o PDF e devolve {page:{w,h}, elements:[...], bg?}. Cada elemento e uma
    linha de texto com posicao, tamanho de fonte, cor, negrito/italico."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    pw, ph = page.rect.width, page.rect.height
    data = page.get_text("dict")
    elements: list[dict] = []
    idx = 0
    for block in data.get("blocks", []):
        if block.get("type", 0) != 0:
            continue
        for line in block.get("lines", []):
            spans = [s for s in line.get("spans", []) if (s.get("text") or "").strip()]
            if not spans:
                continue
            parts: list[str] = []
            for i, s in enumerate(spans):
                txt = s.get("text", "")
                if i > 0:
                    gap = s["bbox"][0] - spans[i - 1]["bbox"][2]
                    if gap > 0.6 and parts and not parts[-1].endswith(" ") and not txt.startswith(" "):
                        parts.append(" ")
                parts.append(txt)
            text = "".join(parts).strip()
            if not text:
                continue
            x0 = min(s["bbox"][0] for s in spans)
            y0 = min(s["bbox"][1] for s in spans)
            x1 = max(s["bbox"][2] for s in spans)
            y1 = max(s["bbox"][3] for s in spans)
            s0 = max(spans, key=lambda s: s.get("size", 0))
            flags = int(s0.get("flags", 0))
            col = int(s0.get("color", 0))
            r, g, b = (col >> 16) & 255, (col >> 8) & 255, col & 255
            idx += 1
            elements.append({
                "id": f"e{idx}",
                "text": text,
                "x": round(x0, 1),
                "y": round(y0, 1),
                "w": round(max(8.0, x1 - x0), 1),
                "h": round(max(8.0, y1 - y0), 1),
                "fontSize": round(float(s0.get("size", 11)), 1),
                "bold": bool(flags & _BOLD),
                "italic": bool(flags & _ITALIC),
                "color": f"#{r:02x}{g:02x}{b:02x}",
                "align": "left",
            })
    page_bg = "#ffffff"
    try:
        from collections import Counter
        sp = page.get_pixmap(dpi=36)
        pts = [(1, 1), (sp.width - 2, 1), (1, sp.height - 2), (sp.width - 2, sp.height - 2), (sp.width // 2, 2)]
        cols = [tuple(sp.pixel(x, y)[:3]) for (x, y) in pts]
        r, g, b = Counter(cols).most_common(1)[0][0]
        page_bg = f"#{r:02x}{g:02x}{b:02x}"
    except Exception:
        pass

    bg = None
    if render_bg:
        pix = page.get_pixmap(dpi=120)
        bg = "data:image/png;base64," + base64.b64encode(pix.tobytes("png")).decode("ascii")
    doc.close()
    return {"page": {"w": round(pw, 1), "h": round(ph, 1)}, "elements": elements, "bg": bg, "page_bg": page_bg}


def build_pdf(payload: dict, out_path: str | Path | None = None) -> bytes | None:
    """Reconstroi um PDF (texto real) a partir dos elementos editados no editor."""
    page = payload.get("page") or {}
    pw = float(page.get("w") or A4[0])
    ph = float(page.get("h") or A4[1])
    theme = (payload.get("theme") or "light").strip().lower()

    doc = fitz.open()
    pg = doc.new_page(width=pw, height=ph)
    if theme == "dark":
        pg.draw_rect(pg.rect, fill=(0.027, 0.043, 0.059), color=None)

    default_ink = "#f3f5f8" if theme == "dark" else "#1a2436"
    for el in payload.get("elements", []):
        text = _sanitize(str(el.get("text") or "")).strip("\n")
        if not text.strip():
            continue
        try:
            x = float(el.get("x", 0)); y = float(el.get("y", 0)); w = float(el.get("w", 200))
            fs = float(el.get("fontSize", 11))
        except (TypeError, ValueError):
            continue
        bold = bool(el.get("bold")); italic = bool(el.get("italic"))
        fontname = "hebi" if (bold and italic) else "hebo" if bold else "heit" if italic else "helv"
        color = _hex_to_rgb01(el.get("color") or default_ink)
        align = {"left": 0, "center": 1, "right": 2}.get(str(el.get("align", "left")), 0)
        rect = fitz.Rect(x, y, x + max(w, fs * 2), min(ph, y + fs * 1.25 * 40))
        try:
            pg.insert_textbox(rect, text, fontname=fontname, fontsize=fs, color=color,
                              align=align, lineheight=1.2)
        except Exception:
            pass

    if out_path is not None:
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        doc.save(str(out_path), garbage=4, deflate=True)
        doc.close()
        return None
    data = doc.tobytes(garbage=4, deflate=True)
    doc.close()
    return data
