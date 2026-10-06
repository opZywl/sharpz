[![EN](https://img.shields.io/badge/lang-EN-blue)](../en/command-line.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](linha-de-comando.md)

[← Voltar ao início](../../README.pt-BR.md)

# Linha de comando

As principais ferramentas também funcionam sem o painel. Rode os comandos na raiz do projeto, usando o Python do ambiente criado pelo instalador (`venv`).

## Remover fundo e gerar SVG

```powershell
.\venv\Scripts\python.exe cli.py foto.png -o output/
```

Aceita um arquivo ou uma pasta. Exemplos:

```powershell
# pasta inteira, só o PNG sem fundo, com o modelo mais leve
.\venv\Scripts\python.exe cli.py fotos/ -o output/ --no-svg --model u2net

# logo em preto e branco, sem manchas
.\venv\Scripts\python.exe cli.py logo.png -o output/ --color-mode binary --filter-speckle 8

# neon sobre fundo preto, preservando o brilho
.\venv\Scripts\python.exe cli.py neon.png -o output/ --method luma_dark

# listar os modelos de IA
.\venv\Scripts\python.exe cli.py --list-models
```

| Opção | Para quê |
| --- | --- |
| `--method` | `auto`, `ai`, `luma_dark`, `luma_light` ou `none` (veja [Remoção de fundo](remocao-de-fundo.md#métodos-de-recorte)). |
| `--model` | Modelo de IA. Padrão: `isnet-general-use`. |
| `--no-alpha-matting` | Desliga o refinamento de bordas (mais rápido). |
| `--no-svg` | Gera só o PNG sem fundo. |
| `--no-bg-removal` | Só vetoriza, sem tirar o fundo. |
| `--color-mode` | `color` ou `binary` (preto e branco). |
| `--filter-speckle` | Remove manchas pequenas do SVG. |
| `--upscale` | Amplia antes de vetorizar, para capturar mais detalhe. |

A lista completa sai em `cli.py --help`.

## Converter para KTX

```powershell
# uma imagem
.\venv\Scripts\python.exe ktx_cli.py textura.png -o textura.ktx --preset ultra

# uma pasta inteira, escolhendo o preset sozinho
.\venv\Scripts\python.exe ktx_cli.py texturas/ -o saida-ktx/ --auto-preset

# ver os presets
.\venv\Scripts\python.exe ktx_cli.py --list-presets
```

Precisa do KTX-Software instalado (veja [Texturas KTX](texturas-ktx.md)).

## Baixar modelos de transcrição

```powershell
.\whisper-venv\Scripts\python.exe tools\download_model.py
.\whisper-venv\Scripts\python.exe tools\download_model.py large-v3
```

Sem argumento, baixa o modelo rápido `large-v3-turbo`, o mesmo que o instalador baixa. Passe `large-v3` para a melhor qualidade e para a tradução. O download tenta de novo sozinho se a conexão cair e mostra o progresso.

---

[← Texturas KTX](texturas-ktx.md) · [Solução de problemas →](solucao-de-problemas.md)
