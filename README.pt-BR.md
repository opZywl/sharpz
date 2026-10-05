<div align="center">

<img src="web/public/brand/sharpz-logo.svg" alt="Sharpz" width="140" />

# Sharpz

[![EN](https://img.shields.io/badge/lang-EN-blue)](README.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](README.pt-BR.md)

**Um kit de mídia local para processamento de imagens, vetorização, texturas KTX, transcrição e PDFs editáveis**

</div>

## Recursos

O Sharpz reúne várias ferramentas de processamento de mídia numa única interface local.

- **Remoção de fundo** — Remove o fundo de imagens com modelos de IA locais.
- **Vetorização SVG** — Converte imagens rasterizadas em arquivos SVG escaláveis.
- **Processamento em lote** — Processa várias imagens ou pastas inteiras de uma vez.
- **Texturas KTX / KTX2** — Converte, otimiza e corrige texturas para projetos 3D.
- **Transcrição** — Transcreve áudio, vídeo e conteúdo do YouTube localmente.
- **Legendas** — Exporta transcrições em TXT, SRT, VTT, JSON ou LRC.
- **Imagem para PDF** — Converte imagens em PDFs pesquisáveis e editáveis.
- **Editor de PDF** — Edita o texto de PDFs direto na interface do Sharpz.
- **Gerenciador de pacotes** — Detecta e instala as ferramentas e os modelos opcionais que cada módulo precisa.

## Começando

1. Dê dois cliques no **`sharpz.cmd`**, na raiz do projeto.
2. Na primeira vez, escolha **1 · Instalar tudo e abrir**. Depois disso, use **2 · Abrir o painel**.
3. O painel abre sozinho no Chrome, em <http://localhost:5174>.

O painel tem os botões **EN** e **PT-BR** no cabeçalho para trocar o idioma, e o menu do `sharpz.cmd` segue o idioma de exibição do Windows.

O passo a passo completo está em [Instalação e uso](docs/pt-BR/instalacao.md).

## Documentação

| Página | Assunto |
| --- | --- |
| [Instalação e uso](docs/pt-BR/instalacao.md) | Requisitos, primeira instalação, uso diário, idioma, modo produção e como parar. |
| [Ferramentas do painel](docs/pt-BR/ferramentas.md) | O que cada módulo faz e quando usar. |
| [Remoção de fundo e modelos de IA](docs/pt-BR/remocao-de-fundo.md) | Métodos de recorte, modelos, uso de memória e alpha matting. |
| [Transcrição](docs/pt-BR/transcricao.md) | Modelos, motor quente, separação de locutores e resumo por IA. |
| [Texturas KTX](docs/pt-BR/texturas-ktx.md) | Presets, pasta inteira, correção de orientação e Portfólio KTX. |
| [Linha de comando](docs/pt-BR/linha-de-comando.md) | Como usar as ferramentas sem abrir o painel. |
| [Solução de problemas](docs/pt-BR/solucao-de-problemas.md) | Erros comuns e como resolver cada um. |
| [Desenvolvimento](docs/pt-BR/desenvolvimento.md) | Estrutura do projeto, rotas da API, testes e integração contínua. |

## Contribuindo

Bugs, ideias e pull requests são bem-vindos. Veja [como contribuir](docs/pt-BR/CONTRIBUTING.md), o [código de conduta](docs/pt-BR/CODE_OF_CONDUCT.md) e a [política de segurança](docs/pt-BR/SECURITY.md).

## Licença

O código é aberto, sob a [licença MIT](LICENSE).

Algumas dependências têm licença própria. O PyMuPDF, usado no Imagem para PDF e no Editor de PDF, é AGPL-3.0, e os modelos de IA de remoção de fundo e de transcrição seguem as licenças dos seus autores.
