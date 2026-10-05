"""Smoke determinista do modo Imagem -> PDF (nao precisa de servidor nem OCR).

Gera uma imagem, monta o PDF com blocos contendo caracteres dificeis (traco longo,
hifen, acentos, parenteses, ordinal) e confere a camada de texto: 0 glitches de cmap
(NBSP / hifen-suave / parentese ornamental) e termos-chave presentes/pesquisaveis.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from PIL import Image

from imgpdf import pdfbuild


def _make_image(path: Path) -> None:
    Image.new("RGB", (1055, 1491), (12, 12, 12)).save(path)


def run() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="imgpdf_smoke_"))
    img = tmp / "fonte.png"
    pdf = tmp / "documento.pdf"
    _make_image(img)

    blocks = [
        {"text": "LUCAS LIMA", "bbox": [18, 22, 335, 132]},
        {"text": "Sao Paulo, Brasil (remoto)", "bbox": [48, 270, 340, 300]},
        {"text": "contato@lucas-lima.dev", "bbox": [48, 320, 340, 348]},
        {"text": "back-end, front-end e e-mail; integracao de IA — producao.", "bbox": [18, 420, 760, 470]},
        {"text": "Next.js 16, React 19, TypeScript — webphone.", "bbox": [18, 520, 760, 570]},
        {"text": "Educacao: Bacharelado (8o semestre).", "bbox": [18, 640, 760, 690]},
    ]
    terms = [
        "LUCAS LIMA", "(remoto)", "contato@lucas-lima.dev",
        "back-end", "front-end", "e-mail", "Next.js 16", "webphone",
    ]

    report = pdfbuild.build_pdf(img, blocks, pdf, page_mode="a4", key_terms=terms)

    failures = []
    if report["glitch_total"] != 0:
        failures.append(f"glitches na camada: {report['glitches']}")
    if not report["clean"]:
        failures.append("camada marcada como nao-limpa")
    if report["terms_missing"]:
        failures.append(f"termos ausentes: {report['terms_missing']}")
    if report["hyphens"] < 3:
        failures.append(f"hifens reais insuficientes: {report['hyphens']}")
    if report["blocks_placed"] != len(blocks):
        failures.append(f"blocos colocados {report['blocks_placed']} != {len(blocks)}")
    if not pdf.exists() or pdf.read_bytes()[:4] != b"%PDF":
        failures.append("PDF invalido ou ausente")

    print("imgpdf smoke ->", tmp)
    print("-" * 50)
    print(f"pagina {report['page_pt']} pt | chars {report['chars']} | hifens {report['hyphens']} | glitches {report['glitch_total']}")
    if failures:
        for item in failures:
            print("[FAIL]", item)
        print("-" * 50)
        print("FALHOU")
        return 1
    print("[PASS] camada de texto limpa e termos-chave pesquisaveis")
    print("-" * 50)
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(run())
