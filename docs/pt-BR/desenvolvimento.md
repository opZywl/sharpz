[![EN](https://img.shields.io/badge/lang-EN-blue)](../en/development.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](desenvolvimento.md)

[← Voltar ao início](../../README.pt-BR.md)

# Desenvolvimento

## Estrutura do projeto

```text
sharpz/
  sharpz.cmd              launcher principal (menu)
  scripts/                instalar, abrir, produção e teste
  server.py               servidor do painel (todas as rotas /api)
  app.py                  interface antiga, mantida como alternativa
  cli.py                  remoção de fundo e SVG pela linha de comando
  ktx_cli.py              conversão KTX pela linha de comando
  add_ktx_orientation.py  correção de orientação de texturas KTX
  packages.py             central Baixar pacotes (detecção e instalação)
  src/
    processor.py          remoção de fundo, modelos de IA e vetorização
    memory.py             detecção de falta de memória
    ktx.py                motor de conversão KTX
  transcribe/             motor de transcrição (roda num ambiente separado)
  imgpdf/                 Imagem para PDF e Editor de PDF
  tools/                  utilitários (download de modelos)
  tests/                  testes
  web/
    app/                  página do painel e ícones
    components/           módulos, ferramentas e componentes da interface
    lib/                  chamadas à API, tipos e lista de módulos
    public/brand/         logo do Sharpz
  docs/                   esta documentação
```

Há dois ambientes Python: `venv` (servidor do painel, Python 3.13) e `whisper-venv` (motor de transcrição, Python 3.12). O painel conversa com o servidor por `/api`, que o painel repassa para a porta 8000.

## Rotas da API

| Rota | Método | O que faz |
| --- | --- | --- |
| `/api/health` | GET | Confere se o servidor está no ar. |
| `/api/capabilities` | GET | Módulos, rotas, modelo padrão e ferramentas encontradas. |
| `/api/models` | GET | Modelos de remoção de fundo, com rótulo, detalhe, se é pesado e se já foi baixado. |
| `/api/clean` | POST | Remove o fundo de uma imagem. |
| `/api/svg` | POST | Vetoriza uma imagem. |
| `/api/pipeline` | POST | Remove o fundo e vetoriza num passo só. |
| `/api/batch/pipeline` | POST | Faz o mesmo para uma pasta do computador. |
| `/api/ktx/presets` | GET | Presets de KTX e se o KTX-Software foi encontrado. |
| `/api/ktx/single` | POST | Converte uma imagem em KTX. |
| `/api/ktx/batch` | POST | Converte uma pasta em KTX. |
| `/api/ktx/orientation` | POST | Corrige a orientação de um KTX. |
| `/api/ktx/portfolio` | POST | Gera o KTX 960 × 540 do portfólio. |
| `/api/transcribe` | POST | Cria um trabalho de transcrição. |
| `/api/transcribe/models` | GET | Modelos de transcrição e se já foram baixados. |
| `/api/transcribe/models/{key}/download` | GET / POST | Progresso / início do download de um modelo. |
| `/api/transcribe/capabilities` | GET | O que o motor de transcrição tem disponível. |
| `/api/transcribe/jobs/{id}` | GET | Estado de um trabalho. |
| `/api/transcribe/jobs/{id}/stream` | GET | Progresso ao vivo (eventos). |
| `/api/transcribe/jobs/{id}/cancel` | POST | Cancela um trabalho. |
| `/api/transcribe/jobs/{id}/download` | GET | Baixa um formato (`txt`, `srt`, `vtt`, `json`, `lrc`). |
| `/api/transcribe/jobs/{id}/audio` | GET | Áudio de entrada, para tocar no painel. |
| `/api/transcribe/jobs/{id}/summarize` | POST | Resumo por IA. |
| `/api/transcribe/jobs/{id}/complete` | GET | Pacote do modo Complete (manifesto, arquivo, zip, abrir pasta). |
| `/api/packages` | GET | Lista do Baixar pacotes. |
| `/api/packages/{id}/install` | POST | Instala um pacote. |
| `/api/packages/jobs/{id}/stream` | GET | Log da instalação ao vivo. |
| `/api/image-to-pdf` | POST | Cria um trabalho de Imagem para PDF. |
| `/api/image-to-pdf/jobs/{id}` | GET | Estado, progresso ao vivo, download, prévia e abrir pasta. |
| `/api/editor/import` | POST | Abre um PDF ou imagem no Editor. |
| `/api/editor/export` | POST | Gera o PDF editado. |
| `/api/editor/render-html` | POST | Gera o PDF a partir da página do Editor. |
| `/api/editor/render-png` | POST | Gera um PNG a partir da página do Editor. |

Erros voltam em JSON com o campo `detail` (texto pronto para mostrar ao usuário). Falta de memória volta com status 503 e `code: "memoria_insuficiente"`.

## Testes

```powershell
# todos os testes (API sem carregar modelos de IA, launchers e motor de transcrição)
.\venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"

# Imagem para PDF, sem servidor
.\venv\Scripts\python.exe -m imgpdf.smoke_test

# lint (só erros reais: sintaxe e nomes indefinidos)
uvx ruff check .

# teste rápido contra o servidor no ar
.\sharpz.cmd testar

# checagem de tipos e build do painel (com o painel parado)
cd web
npx tsc --noEmit -p .
npm run build
```

## Integração contínua

Todo push na `main` e todo pull request rodam o [CI](../../.github/workflows/ci.yml). Os nomes dos jobs ficam em inglês, do jeito que aparecem na aba Actions e nos pull requests:

| Job | Onde roda | O que faz |
| --- | --- | --- |
| Lint (Python) | Linux | ruff com erros reais e compilação de todo o Python. |
| Backend tests (Windows) | Windows | Todos os testes e o smoke do Imagem para PDF. |
| Dashboard (types and build) | Linux | Checagem de tipos e build de produção do painel. |
| End-to-end (launcher, server and dashboard) | Windows | Cria o `venv` como o instalador, baixa o modelo padrão, sobe servidor e painel, roda `sharpz.cmd test` e confere o proxy da API. |

As dependências Python são instaladas com o `constraints.txt`, que trava as versões testadas. O Dependabot propõe atualizações toda semana, e o CI valida cada uma antes do merge.

## Convenções

- Textos da interface em inglês e em português do Brasil, sem nomes de bibliotecas ou ferramentas internas.
- Documentação nos dois idiomas: `README.md` e `docs/en/` em inglês, `README.pt-BR.md` e `docs/pt-BR/` em português.
- Sem comentários no código.
- Commits no formato `tipo: (escopo) descrição`, por exemplo `fix: (painel) ...`.
- Saídas, modelos, ambientes, logs e anotações internas ficam fora do Git (veja o `.gitignore`).

---

[← Solução de problemas](solucao-de-problemas.md) · [Voltar ao início](../../README.pt-BR.md)
