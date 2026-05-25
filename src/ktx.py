"""PNG -> KTX2 batch converter (qualidade maxima).

Wraps `toktx` (KTX-Software CLI) com presets afinados pra MAXIMA
qualidade visual nos GLBs do portfolio 3D world. Diferente do
yzy/scripts/compress.js (presets default), aqui usamos:

    - UASTC com `--uastc_quality 4` (max, default eh 1) + `--zcmp 22`
      (Zstd supercompression pra contrabalancar tamanho)
    - ETC1S com `--qlevel 255` + `--clevel 5` (max compression effort)
    - Pre-processing: ensure dimensions sao multiplos de 4 (BasisU
      requirement pra eficiencia max + sem fallback baixa-qualidade)
    - Auto-detect alpha channel pra escolher RGBA vs RGB target_type

Pos-conversao opcional: PSNR/SSIM via scikit-image pra validar
qualidade visual (>= 38 dB PSNR = excelente, < 30 dB = ruim).

Multi-threaded batch -toktx eh single-threaded, processar em paralelo
escala linearmente com numero de cores.

Module sits alongside background removal -independente, sem deps cruzadas.
"""

from __future__ import annotations

import shutil
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Optional


# Presets em qualidade MAXIMA -diferente do yzy/scripts/compress.js
# que usa defaults. Aqui assumimos producao final, vale a pena gastar
# 2-3x mais tempo de encode pra ganhar 3-6 dB PSNR.
PRESETS: dict[str, list[str]] = {
    "default": [
        # ETC1S sRGB RGB com max effort. 90% dos casos.
        "--nowarn", "--2d", "--t2", "--encode", "etc1s",
        "--qlevel", "255", "--clevel", "5",
        "--assign_oetf", "srgb", "--target_type", "RGB",
    ],
    "ultra": [
        # UASTC qualidade 4 (MAX) + Zstd supercompression. Use pra
        # screenshots criticas que precisam ser indistinguiveis do PNG.
        # Encode lento mas resultado ~indistinguivel.
        "--nowarn", "--2d", "--t2", "--encode", "uastc",
        "--uastc_quality", "4", "--zcmp", "22",
        "--genmipmap", "--assign_oetf", "srgb", "--target_type", "RGB",
    ],
    "ultra_rgba": [
        # Igual ultra mas pra imagens com alpha channel (transparencia).
        # target_type RGBA preserva canal alpha.
        "--nowarn", "--2d", "--t2", "--encode", "uastc",
        "--uastc_quality", "4", "--zcmp", "22",
        "--genmipmap", "--assign_oetf", "srgb", "--target_type", "RGBA",
    ],
    "srgb_genmipmap": [
        # UASTC sRGB com mipmaps + zcmp. Pra palette/atlas detalhado.
        "--nowarn", "--2d", "--t2", "--encode", "uastc",
        "--uastc_quality", "3", "--zcmp", "22",
        "--genmipmap", "--assign_oetf", "srgb", "--target_type", "RGB",
    ],
    "linear_red_mask": [
        # ETC1S R linear single-channel. Mascaras (alpha, glow, etc).
        "--nowarn", "--2d", "--t2", "--encode", "etc1s",
        "--qlevel", "255", "--clevel", "5",
        "--assign_oetf", "linear", "--target_type", "R", "--swizzle", "r001",
    ],
    "uastc_red_mask": [
        # UASTC R linear single-channel + zcmp. Mascaras criticas
        # (flame SDF, smooth gradients onde ETC1S faz banding).
        "--nowarn", "--2d", "--t2", "--encode", "uastc",
        "--uastc_quality", "4", "--zcmp", "22",
        "--assign_oetf", "linear", "--target_type", "R", "--swizzle", "r001",
    ],
    "career_rg": [
        # UASTC sRGB RG pra texto career stones (sem mipmaps).
        # Quality 4 preserva nitidez de texto sem aliasing.
        "--nowarn", "--2d", "--t2", "--encode", "uastc",
        "--uastc_quality", "4", "--zcmp", "22",
        "--assign_oetf", "srgb", "--target_type", "RG",
    ],
    "uastc_genmipmap_linear": [
        # UASTC linear RGB + mipmaps. Terrain/normal maps.
        "--nowarn", "--2d", "--t2", "--encode", "uastc",
        "--uastc_quality", "4", "--zcmp", "22",
        "--genmipmap", "--assign_oetf", "linear", "--target_type", "RGB",
    ],
}

DEFAULT_PRESET = "ultra"  # Bumpado de "default" pra "ultra" -assume que
                          # qualidade > velocidade no fluxo final do user.

SUPPORTED_INPUT_EXT = {".png", ".jpg", ".jpeg"}

# BasisU eficiencia max em multiplos de 4. Imagens fora desse alinhamento
# tem fallback de baixa qualidade interno.
BLOCK_SIZE = 4


@dataclass
class ConversionResult:
    """Resultado de UMA conversao PNG -> KTX."""
    input_path: Path
    output_path: Path
    success: bool
    size_input: int = 0
    size_output: int = 0
    error: Optional[str] = None
    duration_ms: int = 0
    # Qualidade -populado se validate_quality=True
    psnr: Optional[float] = None
    ssim: Optional[float] = None
    # Pre-processing -populado se PoT resize aconteceu
    preprocessed: bool = False
    pre_size: Optional[tuple[int, int]] = None
    final_size: Optional[tuple[int, int]] = None
    # Toktx stderr/stdout (pra debug)
    encoder_log: str = ""

    @property
    def ratio(self) -> float:
        if self.size_output <= 0:
            return 0.0
        return self.size_input / self.size_output

    @property
    def quality_grade(self) -> str:
        """Letra de A+ a F baseada em PSNR. None se nao validado."""
        if self.psnr is None:
            return ""
        if self.psnr >= 45: return "A+"
        if self.psnr >= 40: return "A"
        if self.psnr >= 36: return "B"
        if self.psnr >= 32: return "C"
        if self.psnr >= 28: return "D"
        return "F"


def find_toktx() -> Optional[str]:
    """Retorna path do toktx, ou None se nao estiver instalado."""
    return shutil.which("toktx")


def install_hint() -> str:
    """Mensagem amigavel pra usuario quando toktx ausente."""
    return (
        "toktx nao encontrado no PATH.\n"
        "\n"
        "Instale o KTX-Software (CLI 'toktx'):\n"
        "  Windows: https://github.com/KhronosGroup/KTX-Software/releases\n"
        "           Baixe o .exe installer (KTX-Software-X.X.X-Windows-x64.exe)\n"
        "           Marque 'Add to PATH' durante instalacao.\n"
        "  Linux:   sudo apt install ktx-tools  (Ubuntu 24.04+)\n"
        "           OU build do source com cmake + ASTC encoder.\n"
        "  Mac:     brew install ktx\n"
        "\n"
        "Verifique com: toktx --version\n"
        "Esperado: toktx vX.Y.Z ou similar."
    )


def list_presets() -> list[tuple[str, str]]:
    """Lista presets pra UI dropdown -(key, descricao curta)."""
    return [
        ("ultra", "[*] ULTRA - UASTC q4 + zcmp22 + mipmaps (DEFAULT, max qualidade)"),
        ("ultra_rgba", "[*] ULTRA RGBA - igual ultra + alpha channel preservado"),
        ("default", "ETC1S sRGB RGB qmax -projeto screenshots (lossy mas leve)"),
        ("srgb_genmipmap", "UASTC q3 sRGB + mipmaps -palette/atlas balanceado"),
        ("linear_red_mask", "ETC1S R linear -mascara single-channel (alpha, glow)"),
        ("uastc_red_mask", "UASTC q4 R linear -mascara critica smooth gradients"),
        ("career_rg", "UASTC q4 sRGB RG -texto career stones nitido"),
        ("uastc_genmipmap_linear", "UASTC q4 linear + mipmaps -terrain/normal map"),
    ]


def _has_alpha(image_path: Path) -> bool:
    """Detecta se a imagem tem canal alpha (transparencia real)."""
    try:
        from PIL import Image
        with Image.open(image_path) as img:
            return img.mode in ("RGBA", "LA") or "transparency" in img.info
    except Exception:
        return False


def auto_pick_preset(image_path: Path) -> str:
    """Escolhe preset automaticamente baseado em propriedades da imagem.

    - Alpha channel: ultra_rgba
    - Default: ultra (RGB)
    """
    if _has_alpha(image_path):
        return "ultra_rgba"
    return "ultra"


def _ensure_block_aligned(
    input_path: Path,
    workdir: Path,
    block: int = BLOCK_SIZE,
) -> tuple[Path, bool, tuple[int, int], tuple[int, int]]:
    """Pre-processa imagem pra alinhar dimensoes a multiplo de `block`.

    BasisU (ETC1S/UASTC) tem fallback baixa-qualidade quando dimensoes
    nao sao multiplas de 4. Pad com transparencia (RGBA) ou repeat
    (RGB) pra alinhar -preserva conteudo original sem reescalar.

    Retorna (path_processado, foi_modificada, tamanho_original, tamanho_final).
    """
    try:
        from PIL import Image
        with Image.open(input_path) as img:
            w, h = img.size
            new_w = ((w + block - 1) // block) * block
            new_h = ((h + block - 1) // block) * block

            if (new_w, new_h) == (w, h):
                return input_path, False, (w, h), (w, h)

            # Pad -extend canvas, mantem original em (0,0)
            mode = img.mode
            if mode in ("RGBA", "LA"):
                # Transparente extra
                bg = (0, 0, 0, 0) if mode == "RGBA" else (0, 0)
                padded = Image.new(mode, (new_w, new_h), bg)
                padded.paste(img, (0, 0))
            elif mode == "L":
                padded = Image.new("L", (new_w, new_h), 0)
                padded.paste(img, (0, 0))
            else:
                # RGB ou outro -converte pra RGB e pad com preto
                rgb = img.convert("RGB")
                padded = Image.new("RGB", (new_w, new_h), (0, 0, 0))
                padded.paste(rgb, (0, 0))

            workdir.mkdir(parents=True, exist_ok=True)
            out_path = workdir / f"{input_path.stem}__aligned.png"
            padded.save(out_path, format="PNG", optimize=False)
            return out_path, True, (w, h), (new_w, new_h)
    except Exception:
        # Best-effort -se falhar, usa input original
        return input_path, False, (0, 0), (0, 0)


def _measure_quality(original: Path, ktx_output: Path) -> tuple[Optional[float], Optional[float]]:
    """Mede PSNR e SSIM entre original e KTX decodificado.

    Requer scikit-image. Se ausente ou erro, retorna (None, None).
    KTX precisa ser decodificado -usa toktx2png ou similar; se nao
    disponivel, skip silencioso.
    """
    try:
        from PIL import Image
        import numpy as np
        from skimage.metrics import peak_signal_noise_ratio, structural_similarity

        # toktx --info nao decodifica. Decodifica via gltf-transform OR
        # ktx2_decode. Como nao podemos garantir disponibilidade, skip se
        # nao conseguir gerar o decoded PNG.
        ktx_decoded = ktx_output.with_suffix(".decoded.png")
        decoder = shutil.which("ktx") or shutil.which("ktx2_decode")
        if decoder is None:
            return (None, None)

        # `ktx extract` (KTX-Software v4.3+) extrai layer 0 mip 0
        cmd = [decoder, "extract", "--mip", "0", str(ktx_output), str(ktx_decoded)]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if proc.returncode != 0 or not ktx_decoded.exists():
            return (None, None)

        with Image.open(original) as orig_img, Image.open(ktx_decoded) as dec_img:
            orig_rgb = np.array(orig_img.convert("RGB"))
            dec_rgb = np.array(dec_img.convert("RGB"))
            # Crop to common size (decode pode ser block-aligned > original)
            h = min(orig_rgb.shape[0], dec_rgb.shape[0])
            w = min(orig_rgb.shape[1], dec_rgb.shape[1])
            orig_rgb = orig_rgb[:h, :w]
            dec_rgb = dec_rgb[:h, :w]

            psnr = float(peak_signal_noise_ratio(orig_rgb, dec_rgb, data_range=255))
            ssim = float(structural_similarity(orig_rgb, dec_rgb, channel_axis=2, data_range=255))
            ktx_decoded.unlink(missing_ok=True)
            return (psnr, ssim)
    except Exception:
        return (None, None)


def convert_file(
    input_path: Path,
    output_path: Path,
    preset: str = DEFAULT_PRESET,
    *,
    overwrite: bool = True,
    auto_align: bool = True,
    auto_preset: bool = False,
    validate_quality: bool = False,
) -> ConversionResult:
    """Converte UMA imagem PNG/JPG -> KTX usando o preset escolhido.

    Args:
        auto_align: pad imagem pra dimensoes multiplas de 4 (default True).
            Sem isso, BasisU usa fallback baixa qualidade em algumas
            dimensoes. Pre-processing eh fast (PIL paste).
        auto_preset: se True, ignora `preset` e escolhe baseado em alpha
            channel da imagem.
        validate_quality: roda PSNR/SSIM pos-conversao (precisa
            scikit-image + ktx CLI v4.3+). Adiciona ~500ms-2s por imagem.
    """
    input_path = Path(input_path)
    output_path = Path(output_path)

    if not input_path.exists():
        return ConversionResult(input_path, output_path, False,
                                error=f"input nao existe: {input_path}")

    if input_path.suffix.lower() not in SUPPORTED_INPUT_EXT:
        return ConversionResult(input_path, output_path, False,
                                error=f"extensao nao suportada: {input_path.suffix} (use png/jpg)")

    if output_path.exists() and not overwrite:
        return ConversionResult(input_path, output_path, False,
                                error=f"output ja existe (passe overwrite=True): {output_path}")

    if auto_preset:
        preset = auto_pick_preset(input_path)

    if preset not in PRESETS:
        return ConversionResult(input_path, output_path, False,
                                error=f"preset desconhecido '{preset}'. Disponiveis: {list(PRESETS.keys())}")

    toktx = find_toktx()
    if toktx is None:
        return ConversionResult(input_path, output_path, False, error=install_hint())

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Pre-process: ensure block alignment pra max qualidade
    pre_size = (0, 0)
    final_size = (0, 0)
    preprocessed = False
    encode_input = input_path
    workdir = output_path.parent / ".ktx_work"

    if auto_align:
        encode_input, preprocessed, pre_size, final_size = _ensure_block_aligned(
            input_path, workdir
        )

    flags = PRESETS[preset]
    cmd = [toktx, *flags, str(output_path), str(encode_input)]

    size_input = input_path.stat().st_size
    start = time.perf_counter()

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        return ConversionResult(
            input_path, output_path, False,
            size_input=size_input, error="toktx timeout (>5min -uastc q4 em imagem gigante?)",
            preprocessed=preprocessed, pre_size=pre_size, final_size=final_size,
        )
    except Exception as e:
        return ConversionResult(
            input_path, output_path, False,
            size_input=size_input, error=f"erro inesperado: {e}",
            preprocessed=preprocessed, pre_size=pre_size, final_size=final_size,
        )
    finally:
        # Cleanup temp aligned input
        if preprocessed and encode_input != input_path:
            encode_input.unlink(missing_ok=True)
            try:
                workdir.rmdir()
            except OSError:
                pass

    duration_ms = int((time.perf_counter() - start) * 1000)
    encoder_log = (proc.stdout or "") + (proc.stderr or "")

    if proc.returncode != 0:
        return ConversionResult(
            input_path, output_path, False,
            size_input=size_input, duration_ms=duration_ms,
            error=f"toktx falhou (exit {proc.returncode}):\n{(proc.stderr or proc.stdout)[:500]}",
            encoder_log=encoder_log,
            preprocessed=preprocessed, pre_size=pre_size, final_size=final_size,
        )

    if not output_path.exists():
        return ConversionResult(
            input_path, output_path, False,
            size_input=size_input, duration_ms=duration_ms,
            error=f"toktx retornou OK mas output nao foi criado: {output_path}",
            encoder_log=encoder_log,
            preprocessed=preprocessed, pre_size=pre_size, final_size=final_size,
        )

    result = ConversionResult(
        input_path, output_path, True,
        size_input=size_input,
        size_output=output_path.stat().st_size,
        duration_ms=duration_ms,
        preprocessed=preprocessed, pre_size=pre_size, final_size=final_size,
        encoder_log=encoder_log,
    )

    if validate_quality:
        psnr, ssim = _measure_quality(input_path, output_path)
        result.psnr = psnr
        result.ssim = ssim

    return result


def collect_images(path: Path, recursive: bool = True) -> list[Path]:
    """Lista PNG/JPG em path. Aceita arquivo ou diretorio."""
    path = Path(path)
    if path.is_file():
        return [path] if path.suffix.lower() in SUPPORTED_INPUT_EXT else []
    if not path.is_dir():
        return []
    pattern = "**/*" if recursive else "*"
    return sorted(
        p for p in path.glob(pattern)
        if p.is_file() and p.suffix.lower() in SUPPORTED_INPUT_EXT
    )


def batch_convert(
    inputs: Iterable[Path],
    output_dir: Path,
    preset: str = DEFAULT_PRESET,
    *,
    base_dir: Optional[Path] = None,
    overwrite: bool = True,
    auto_align: bool = True,
    auto_preset: bool = False,
    validate_quality: bool = False,
    max_workers: int = 4,
    on_progress: Optional[Callable] = None,
) -> list[ConversionResult]:
    """Converte multiplas imagens -> KTX no output_dir em paralelo.

    `max_workers` controla quantos toktx rodam simultaneamente (cada
    toktx eh single-threaded, paralelizar escala linear ate # de cores).

    `on_progress(idx, total, result)` chamado apos cada conversao.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    inputs_list = list(inputs)
    total = len(inputs_list)
    results: list[Optional[ConversionResult]] = [None] * total

    def _resolve_output(input_path: Path) -> Path:
        if base_dir is not None:
            try:
                rel = input_path.relative_to(base_dir)
                return output_dir / rel.with_suffix(".ktx")
            except ValueError:
                return output_dir / (input_path.stem + ".ktx")
        return output_dir / (input_path.stem + ".ktx")

    # Single-thread se max_workers <= 1 ou pouca coisa pra paralelizar
    if max_workers <= 1 or total <= 1:
        for idx, input_path in enumerate(inputs_list):
            output_path = _resolve_output(input_path)
            result = convert_file(
                input_path, output_path,
                preset=preset, overwrite=overwrite,
                auto_align=auto_align, auto_preset=auto_preset,
                validate_quality=validate_quality,
            )
            results[idx] = result
            if on_progress is not None:
                try:
                    on_progress(idx + 1, total, result)
                except Exception:
                    pass
        return [r for r in results if r is not None]

    # Parallel
    completed = 0
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        future_to_idx = {}
        for idx, input_path in enumerate(inputs_list):
            output_path = _resolve_output(input_path)
            future = pool.submit(
                convert_file,
                input_path, output_path,
                preset=preset, overwrite=overwrite,
                auto_align=auto_align, auto_preset=auto_preset,
                validate_quality=validate_quality,
            )
            future_to_idx[future] = idx

        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                result = future.result()
            except Exception as e:
                result = ConversionResult(
                    inputs_list[idx], _resolve_output(inputs_list[idx]),
                    False, error=f"thread crashed: {e}",
                )
            results[idx] = result
            completed += 1
            if on_progress is not None:
                try:
                    on_progress(completed, total, result)
                except Exception:
                    pass

    return [r for r in results if r is not None]


def summarize(results: list[ConversionResult]) -> str:
    """Texto resumo de uma run pra exibir em CLI/UI."""
    if not results:
        return "Nenhuma imagem processada."

    ok = [r for r in results if r.success]
    fail = [r for r in results if not r.success]

    total_in = sum(r.size_input for r in ok)
    total_out = sum(r.size_output for r in ok)
    ratio = (total_in / total_out) if total_out > 0 else 0
    saved_mb = (total_in - total_out) / 1024 / 1024
    total_ms = sum(r.duration_ms for r in ok)

    lines = [
        f"[OK]{len(ok)} sucesso  ·  [X]{len(fail)} falha  ·  total: {len(results)}",
    ]
    if ok:
        lines.append(
            f"size: {total_in / 1024 / 1024:.1f} MB -> {total_out / 1024 / 1024:.1f} MB  "
            f"({ratio:.1f}x menor, economia {saved_mb:.1f} MB)"
        )
        lines.append(f"tempo total: {total_ms / 1000:.1f}s ({total_ms // max(len(ok), 1)}ms/img medio)")

        # Quality stats se algum tiver PSNR
        psnrs = [r.psnr for r in ok if r.psnr is not None]
        if psnrs:
            avg_psnr = sum(psnrs) / len(psnrs)
            min_psnr = min(psnrs)
            grade = "A+" if avg_psnr >= 45 else "A" if avg_psnr >= 40 else "B" if avg_psnr >= 36 else "C"
            lines.append(f"qualidade: PSNR medio {avg_psnr:.1f} dB (min {min_psnr:.1f}), grade {grade}")

        # Pre-processing stats
        pre_count = sum(1 for r in ok if r.preprocessed)
        if pre_count:
            lines.append(f"pre-aligned: {pre_count} imagem(ns) padded pra multiplo de 4")

    if fail:
        lines.append("\nfalhas:")
        for r in fail:
            err_first = (r.error or "").splitlines()[0] if r.error else "erro"
            lines.append(f"  [X]{r.input_path.name}: {err_first}")

    return "\n".join(lines)
