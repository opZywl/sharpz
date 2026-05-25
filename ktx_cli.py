"""CLI for PNG -> KTX2 batch conversion (qualidade maxima).

Wraps src/ktx.py com presets afinados pra portfolio 3D world. Default
preset eh `ultra` (UASTC q4 + zcmp22) — encode ~3x mais lento que ETC1S
default mas qualidade visual quase indistinguivel do PNG original.

Examples:
    # Pasta inteira com max qualidade + parallel + PoT align
    python ktx_cli.py samples/ -o output_ktx/ --jobs 8

    # Single file, auto-detect alpha (usa ultra_rgba se PNG tem alpha)
    python ktx_cli.py screenshot.png -o screenshot.ktx --auto-preset

    # Pasta com validacao de qualidade (PSNR/SSIM pos-conversao)
    python ktx_cli.py samples/ -o output_ktx/ --validate

    # Velocidade max (preset ETC1S leve, sem alignment)
    python ktx_cli.py samples/ -o output_ktx/ --preset default --no-align

    # Listar presets
    python ktx_cli.py --list-presets

Requires:
    - toktx (KTX-Software CLI) no PATH — obrigatorio
    - scikit-image (opcional) pra --validate funcionar
    - ktx CLI v4.3+ (opcional) pra --validate decodificar
"""

from __future__ import annotations

import sys
from pathlib import Path

import click

from src.ktx import (
    DEFAULT_PRESET,
    PRESETS,
    batch_convert,
    collect_images,
    convert_file,
    find_toktx,
    install_hint,
    list_presets as _list_presets,
    summarize,
)


def _check_toktx_or_exit() -> None:
    if find_toktx() is None:
        click.echo(install_hint(), err=True)
        sys.exit(1)


def _print_progress(idx: int, total: int, result) -> None:
    if result.success:
        size_kb_in = result.size_input / 1024
        size_kb_out = result.size_output / 1024
        bits = []
        if result.preprocessed and result.pre_size != result.final_size:
            ow, oh = result.pre_size or (0, 0)
            nw, nh = result.final_size or (0, 0)
            bits.append(f"pad {ow}x{oh}->{nw}x{nh}")
        if result.psnr is not None:
            bits.append(f"PSNR {result.psnr:.1f}dB {result.quality_grade}")
        suffix = f"  [{', '.join(bits)}]" if bits else ""
        click.echo(
            f"  [{idx}/{total}] ✓ {result.input_path.name} -> {result.output_path.name}  "
            f"({size_kb_in:.0f}KB -> {size_kb_out:.0f}KB, {result.ratio:.1f}x  •  "
            f"{result.duration_ms}ms){suffix}"
        )
    else:
        err_first = (result.error or "").splitlines()[0] if result.error else "erro"
        click.echo(f"  [{idx}/{total}] ✗ {result.input_path.name}: {err_first}", err=True)


@click.command(context_settings={"help_option_names": ["-h", "--help"]})
@click.argument("input_path", type=click.Path(path_type=Path), required=False)
@click.option(
    "-o", "--output", "output_path",
    type=click.Path(path_type=Path), default=None,
    help="Output: arquivo .ktx (input file) ou diretorio (input dir).",
)
@click.option(
    "--preset",
    type=click.Choice(list(PRESETS.keys())),
    default=DEFAULT_PRESET, show_default=True,
    help="Preset de codificacao (vê --list-presets).",
)
@click.option(
    "--auto-preset",
    is_flag=True,
    help="Auto-escolhe preset baseado em propriedades da imagem (ex: alpha -> ultra_rgba).",
)
@click.option(
    "-r/--no-recursive", "recursive",
    default=True, show_default=True,
    help="Recursivo em subpastas (so se input for diretorio).",
)
@click.option(
    "--no-overwrite", is_flag=True,
    help="Pula arquivos cujo output ja existe (default: sobrescreve).",
)
@click.option(
    "--flatten", is_flag=True,
    help="Joga todos outputs em output_dir sem preservar subpastas.",
)
@click.option(
    "--no-align", "no_align", is_flag=True,
    help="Desabilita pad pra dimensoes multiplas de 4 (default: alinha auto pra max qualidade).",
)
@click.option(
    "--validate", is_flag=True,
    help="Mede PSNR/SSIM pos-conversao (precisa scikit-image + ktx CLI v4.3+, ~+1s/img).",
)
@click.option(
    "-j", "--jobs", "max_workers",
    type=int, default=4, show_default=True,
    help="Threads em paralelo (toktx eh single-thread, escala linear).",
)
@click.option(
    "--list-presets", "show_presets", is_flag=True,
    help="Lista presets disponiveis e sai.",
)
def main(
    input_path: Path | None,
    output_path: Path | None,
    preset: str,
    auto_preset: bool,
    recursive: bool,
    no_overwrite: bool,
    flatten: bool,
    no_align: bool,
    validate: bool,
    max_workers: int,
    show_presets: bool,
) -> None:
    """Converte PNG/JPG -> KTX2 em batch (qualidade maxima por default)."""
    if show_presets:
        click.echo("\nPresets disponiveis:\n")
        for key, desc in _list_presets():
            click.echo(f"  {key:30s}  {desc}")
        click.echo("\n  [*] = qualidade maxima (default)\n")
        return

    if input_path is None:
        click.echo("Erro: input_path nao foi passado. Use --help.", err=True)
        sys.exit(1)

    if not input_path.exists():
        click.echo(f"Erro: input nao existe: {input_path}", err=True)
        sys.exit(1)

    _check_toktx_or_exit()

    auto_align = not no_align

    # Single file
    if input_path.is_file():
        out = output_path
        if out is None:
            out = input_path.with_suffix(".ktx")
        elif out.is_dir() or (not out.suffix and not out.exists()):
            out = (out / input_path.stem).with_suffix(".ktx")

        click.echo(
            f"Convertendo {input_path.name} -> {out.name}  "
            f"(preset={'auto' if auto_preset else preset}, "
            f"align={auto_align}, validate={validate})"
        )
        result = convert_file(
            input_path, out,
            preset=preset, overwrite=not no_overwrite,
            auto_align=auto_align, auto_preset=auto_preset,
            validate_quality=validate,
        )
        _print_progress(1, 1, result)
        click.echo("\n" + summarize([result]))
        sys.exit(0 if result.success else 1)

    # Folder
    if output_path is None:
        click.echo("Erro: -o/--output e obrigatorio quando input e diretorio.", err=True)
        sys.exit(1)

    images = collect_images(input_path, recursive=recursive)
    if not images:
        click.echo(f"Nenhuma PNG/JPG encontrada em {input_path}", err=True)
        sys.exit(1)

    click.echo(
        f"\nProcessando {len(images)} imagem(ns) -> {output_path}/  "
        f"(preset={'auto' if auto_preset else preset}, "
        f"jobs={max_workers}, align={auto_align}, "
        f"validate={validate}, recursive={recursive})\n"
    )

    base = None if flatten else input_path
    results = batch_convert(
        images, output_path,
        preset=preset, base_dir=base,
        overwrite=not no_overwrite,
        auto_align=auto_align,
        auto_preset=auto_preset,
        validate_quality=validate,
        max_workers=max_workers,
        on_progress=_print_progress,
    )

    click.echo("\n" + summarize(results))
    fail_count = sum(1 for r in results if not r.success)
    sys.exit(0 if fail_count == 0 else 2)


if __name__ == "__main__":
    main()
