"""Leitura da imagem -> blocos de texto + caixas.

Reproduz o passo de "ler a imagem": recorta em tiles sobrepostos, transcreve cada
tile via Vision LLM (endpoint OpenAI-compativel) e, opcionalmente, faz uma 2a leitura
independente cruzando as divergencias (verificacao adversarial). Fallback local via
Tesseract (CLI) com pre-inversao p/ imagens escuras.
"""

from __future__ import annotations

import base64
import io
import json
import re
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

from PIL import Image, ImageOps

Emit = Callable[[dict], None]

TILE_TARGET = 640
TILE_OVERLAP = 0.14
MAX_TIEBREAKS = 16
VISION_TIMEOUT = 180

_OCR_SYSTEM = (
    "Voce e um motor de OCR de altissima precisao. Recebe UMA imagem (um recorte de "
    "documento) e devolve o texto exatamente como aparece. Preserve acentos, pontuacao, "
    "maiusculas/minusculas e simbolos. NAO traduza, NAO corrija, NAO invente, NAO resuma."
)

_OCR_INSTRUCTION = (
    "Transcreva TODO o texto visivel nesta imagem. Responda APENAS com um objeto JSON "
    "valido (sem markdown, sem cercas), no formato:\n"
    '{"blocks":[{"text":"...","bbox":[x0,y0,x1,y1]}]}\n'
    "onde cada entrada e uma linha ou frase curta visivel, em ordem de leitura (cima->baixo, "
    "esquerda->direita), e bbox sao coordenadas NORMALIZADAS entre 0 e 1 dentro DESTA imagem "
    "(x0,y0 = canto superior esquerdo; x1,y1 = canto inferior direito). Se nao tiver certeza "
    "da posicao, ainda assim devolva o texto na ordem correta."
)


# ───────────────────────── helpers de imagem / http ─────────────────────────

def _data_uri(img: Image.Image, scale: float = 2.0) -> str:
    work = img.convert("RGB")
    if scale and scale != 1.0:
        work = work.resize((max(1, int(work.width * scale)), max(1, int(work.height * scale))), Image.LANCZOS)
    buf = io.BytesIO()
    work.save(buf, format="JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def _chat_vision(cfg: dict, data_uri: str, instruction: str, timeout: int = VISION_TIMEOUT) -> str:
    base_url = (cfg.get("base_url") or "").strip().rstrip("/")
    model = (cfg.get("model") or "").strip()
    if not base_url or not model:
        raise RuntimeError("Vision LLM sem base_url/model configurados.")
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": _OCR_SYSTEM},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": instruction},
                    {"type": "image_url", "image_url": {"url": data_uri}},
                ],
            },
        ],
        "temperature": 0,
        "stream": False,
    }
    headers = {"Content-Type": "application/json"}
    if (cfg.get("api_key") or "").strip():
        headers["Authorization"] = f"Bearer {cfg['api_key'].strip()}"
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")
        except Exception:
            detail = ""
        raise RuntimeError(f"Vision LLM em {base_url} respondeu {exc.code}. {detail}".strip())
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Nao consegui falar com o Vision LLM em {base_url} ({exc.reason}).")
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise RuntimeError("Resposta do Vision LLM em formato inesperado (sem choices/message).")


def _parse_blocks(raw: str) -> list[dict]:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text).strip()
    parsed = None
    try:
        parsed = json.loads(text)
    except Exception:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            try:
                parsed = json.loads(text[start:end + 1])
            except Exception:
                parsed = None
    if parsed is None:
        return []
    if isinstance(parsed, dict):
        items = parsed.get("blocks") or parsed.get("lines") or []
    elif isinstance(parsed, list):
        items = parsed
    else:
        items = []
    out = []
    for item in items:
        if isinstance(item, str):
            out.append({"text": item, "bbox": None})
        elif isinstance(item, dict):
            out.append({"text": str(item.get("text") or "").strip(), "bbox": item.get("bbox")})
    return [b for b in out if b["text"]]


# ───────────────────────── tiles / geometria ─────────────────────────

def _tiles(w: int, h: int) -> list[tuple[int, int, int, int]]:
    cols = max(1, round(w / TILE_TARGET))
    rows = max(1, round(h / TILE_TARGET))
    if cols == 1 and rows == 1:
        return [(0, 0, w, h)]
    ov_x = int(w / cols * TILE_OVERLAP)
    ov_y = int(h / rows * TILE_OVERLAP)
    step_x = w / cols
    step_y = h / rows
    tiles = []
    for r in range(rows):
        for c in range(cols):
            x0 = max(0, int(c * step_x) - ov_x)
            y0 = max(0, int(r * step_y) - ov_y)
            x1 = min(w, int((c + 1) * step_x) + ov_x)
            y1 = min(h, int((r + 1) * step_y) + ov_y)
            tiles.append((x0, y0, x1, y1))
    return tiles


def _to_px(parsed: list[dict], tile: tuple[int, int, int, int]) -> list[dict]:
    tx0, ty0, tx1, ty1 = tile
    tw, th = tx1 - tx0, ty1 - ty0
    n = max(1, len(parsed))
    result = []
    for i, b in enumerate(parsed):
        text = (b.get("text") or "").strip()
        if not text:
            continue
        bb = b.get("bbox")
        ok = isinstance(bb, (list, tuple)) and len(bb) == 4
        if ok:
            try:
                x0, y0, x1, y1 = float(bb[0]), float(bb[1]), float(bb[2]), float(bb[3])
            except (TypeError, ValueError):
                ok = False
        if ok:
            if x1 < x0:
                x0, x1 = x1, x0
            if y1 < y0:
                y0, y1 = y1, y0
            ok = (-0.05 <= x0 <= 1.2 and -0.05 <= y0 <= 1.2 and (x1 - x0) > 0.004 and (y1 - y0) > 0.002)
        if ok:
            cx0 = tx0 + max(0.0, min(1.0, x0)) * tw
            cy0 = ty0 + max(0.0, min(1.0, y0)) * th
            cx1 = tx0 + max(0.0, min(1.0, x1)) * tw
            cy1 = ty0 + max(0.0, min(1.0, y1)) * th
        else:
            slot = th / n
            cx0, cy0, cx1, cy1 = tx0, ty0 + i * slot, tx1, ty0 + (i + 1) * slot
        result.append({"text": text, "bbox": [cx0, cy0, cx1, cy1]})
    return result


def _iou(a: list[float], b: list[float]) -> float:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    iw, ih = max(0.0, ix1 - ix0), max(0.0, iy1 - iy0)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax1 - ax0) * max(0.0, ay1 - ay0)
    area_b = max(0.0, bx1 - bx0) * max(0.0, by1 - by0)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip()).casefold()


def _sim(a: str, b: str) -> bool:
    na, nb = _norm(a), _norm(b)
    if not na or not nb:
        return False
    return na == nb or na in nb or nb in na


def _dedupe(blocks: list[dict]) -> list[dict]:
    kept: list[dict] = []
    for b in blocks:
        merged = False
        for k in kept:
            if _iou(b["bbox"], k["bbox"]) > 0.4 and _sim(b["text"], k["text"]):
                if len(b["text"]) > len(k["text"]):
                    k["text"], k["bbox"] = b["text"], b["bbox"]
                merged = True
                break
        if not merged:
            kept.append(dict(b))
    return kept


# ───────────────────────── leituras ─────────────────────────

def _read_vision_pass(img: Image.Image, cfg: dict, emit: Emit, label: str) -> list[dict]:
    tiles = _tiles(img.width, img.height)
    blocks: list[dict] = []
    for idx, tile in enumerate(tiles, 1):
        crop = img.crop(tile)
        try:
            raw = _chat_vision(cfg, _data_uri(crop), _OCR_INSTRUCTION)
            parsed = _parse_blocks(raw)
            blocks.extend(_to_px(parsed, tile))
            emit({"type": "log", "level": "info",
                  "message": f"{label}: regiao {idx}/{len(tiles)} -> {len(parsed)} blocos"})
        except Exception as exc:
            emit({"type": "log", "level": "warn",
                  "message": f"{label}: regiao {idx}/{len(tiles)} falhou ({exc})"})
    return _dedupe(blocks)


def _tiebreak(img: Image.Image, bbox: list[float], cfg: dict) -> str | None:
    x0, y0, x1, y1 = bbox
    pad_x = (x1 - x0) * 0.08
    pad_y = (y1 - y0) * 0.25
    crop = img.crop((
        max(0, int(x0 - pad_x)), max(0, int(y0 - pad_y)),
        min(img.width, int(x1 + pad_x)), min(img.height, int(y1 + pad_y)),
    ))
    try:
        raw = _chat_vision(
            cfg, _data_uri(crop, scale=3.0),
            "Transcreva EXATAMENTE o texto desta imagem (uma ou poucas linhas). "
            "Responda so com o texto, sem aspas, sem JSON, sem explicacao.",
            timeout=90,
        )
        return raw.strip().strip('"').strip()
    except Exception:
        return None


def _reconcile(a_blocks: list[dict], b_blocks: list[dict], img: Image.Image, cfg: dict, emit: Emit) -> list[dict]:
    used: set[int] = set()
    result: list[dict] = []
    tiebreaks = 0
    corrections = 0
    for a in a_blocks:
        best, bj = -1.0, -1
        for j, b in enumerate(b_blocks):
            if j in used:
                continue
            iou = _iou(a["bbox"], b["bbox"])
            if iou > best:
                best, bj = iou, j
        if bj >= 0 and best > 0.4:
            used.add(bj)
            b = b_blocks[bj]
            if _norm(a["text"]) == _norm(b["text"]):
                result.append(a)
                continue
            chosen = a["text"]
            c = None
            if tiebreaks < MAX_TIEBREAKS:
                tiebreaks += 1
                c = _tiebreak(img, a["bbox"], cfg)
            cand = [t for t in (a["text"], b["text"], c) if t]
            if c and _norm(c) == _norm(a["text"]):
                chosen = a["text"]
            elif c and _norm(c) == _norm(b["text"]):
                chosen = b["text"]
            elif c:
                chosen = c
            else:
                chosen = max(cand, key=len)
            if _norm(chosen) != _norm(a["text"]):
                corrections += 1
                emit({"type": "log", "level": "ok",
                      "message": f"verificacao: '{a['text'][:40]}' -> '{chosen[:40]}'"})
            result.append({"text": chosen, "bbox": a["bbox"]})
        else:
            result.append(a)
    for j, b in enumerate(b_blocks):
        if j not in used:
            result.append(b)
    emit({"type": "log", "level": "info",
          "message": f"verificacao: {corrections} correcao(oes), {len(result)} blocos finais"})
    return _dedupe(result)


# ───────────────────────── tesseract (fallback) ─────────────────────────

def tesseract_available() -> bool:
    return shutil.which("tesseract") is not None


def _tesseract_langs() -> str:
    exe = shutil.which("tesseract")
    if not exe:
        return "eng"
    try:
        out = subprocess.run([exe, "--list-langs"], capture_output=True, text=True, timeout=15,
                             encoding="utf-8", errors="replace")
        langs = {line.strip() for line in (out.stdout or "").splitlines()[1:] if line.strip()}
    except Exception:
        langs = set()
    if "por" in langs and "eng" in langs:
        return "por+eng"
    if "por" in langs:
        return "por"
    return "eng"


def _read_tesseract(img: Image.Image, emit: Emit) -> list[dict]:
    exe = shutil.which("tesseract")
    if not exe:
        raise RuntimeError("Tesseract nao encontrado no PATH.")
    work = img.convert("RGB")
    gray = work.convert("L")
    mean = sum(gray.getdata()) / max(1, gray.width * gray.height)
    if mean < 110:
        work = ImageOps.invert(work)
        emit({"type": "log", "level": "info", "message": "tesseract: imagem escura -> invertida p/ OCR"})
    scale = 2
    work = work.resize((work.width * scale, work.height * scale), Image.LANCZOS)
    langs = _tesseract_langs()
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "ocr.png"
        work.save(src)
        out = subprocess.run(
            [exe, str(src), "stdout", "--psm", "3", "-l", langs, "tsv"],
            capture_output=True, text=True, timeout=180, encoding="utf-8", errors="replace",
        )
    lines: dict[tuple, dict] = {}
    for row in (out.stdout or "").splitlines()[1:]:
        cols = row.split("\t")
        if len(cols) < 12:
            continue
        try:
            conf = float(cols[10])
        except ValueError:
            continue
        word = cols[11].strip()
        if conf < 30 or not word:
            continue
        left, top, w, h = int(cols[6]), int(cols[7]), int(cols[8]), int(cols[9])
        key = (cols[2], cols[3], cols[4])
        slot = lines.setdefault(key, {"words": [], "x0": left, "y0": top, "x1": left + w, "y1": top + h})
        slot["words"].append(word)
        slot["x0"] = min(slot["x0"], left)
        slot["y0"] = min(slot["y0"], top)
        slot["x1"] = max(slot["x1"], left + w)
        slot["y1"] = max(slot["y1"], top + h)
    blocks = []
    for slot in lines.values():
        text = " ".join(slot["words"]).strip()
        if not text:
            continue
        blocks.append({"text": text, "bbox": [slot["x0"] / scale, slot["y0"] / scale, slot["x1"] / scale, slot["y1"] / scale]})
    emit({"type": "log", "level": "info", "message": f"tesseract ({langs}): {len(blocks)} linhas"})
    return blocks


# ───────────────────────── orquestrador ─────────────────────────

def read_image(image_path: str | Path, options: dict, emit: Emit) -> dict:
    img = Image.open(image_path)
    img.load()
    engine = (options.get("ocr_engine") or "auto").strip().lower()
    cfg = options.get("vision") or {}
    has_vision = bool((cfg.get("base_url") or "").strip() and (cfg.get("model") or "").strip())
    verify = bool(options.get("verify", True))
    degraded: list[str] = []

    use_vision = engine == "vision" or (engine == "auto" and has_vision)
    if use_vision and not has_vision:
        raise RuntimeError("Motor 'vision' selecionado mas Vision LLM nao foi configurado (base_url/model).")

    if use_vision:
        try:
            emit({"type": "stage", "stage": "transcrever"})
            blocks = _read_vision_pass(img, cfg, emit, "leitura 1")
            if verify:
                emit({"type": "stage", "stage": "verificar"})
                b2 = _read_vision_pass(img, cfg, emit, "leitura 2")
                blocks = _reconcile(blocks, b2, img, cfg, emit)
            if blocks:
                return {"blocks": blocks, "engine": "vision", "degraded": degraded}
            emit({"type": "log", "level": "warn", "message": "Vision nao retornou texto; tentando Tesseract."})
            degraded.append("vision-vazio")
        except Exception as exc:
            emit({"type": "log", "level": "warn", "message": f"Vision falhou ({exc}); tentando Tesseract."})
            if engine == "vision":
                raise
            degraded.append("vision")

    if tesseract_available():
        emit({"type": "stage", "stage": "transcrever"})
        blocks = _read_tesseract(img, emit)
        if blocks:
            return {"blocks": blocks, "engine": "tesseract", "degraded": degraded}
        degraded.append("tesseract-vazio")
    else:
        emit({"type": "log", "level": "warn",
              "message": "Tesseract ausente. Instale em 'Baixar pacotes'. PDF sai sem camada de texto."})
        degraded.append("sem-ocr")

    return {"blocks": [], "engine": "nenhum", "degraded": degraded}
