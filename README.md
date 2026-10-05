<div align="center">

<img src="web/public/brand/sharpz-logo.svg" alt="Sharpz" width="140" />

# Sharpz

**Seu estúdio local para imagens, vetores, texturas 3D, transcrições e PDFs.**

Um painel só, rodando no seu próprio computador.

</div>

## O que dá para fazer

| Módulo | Para quê |
| --- | --- |
| **Imagem e fundo** | Tirar o fundo de fotos e artes (uma imagem ou a pasta toda) e baixar em PNG, WEBP ou SVG. |
| **Vetor (SVG)** | Transformar uma imagem em SVG, que amplia sem perder qualidade. Ideal para logos e ícones. |
| **Texturas KTX** | Gerar texturas KTX2 para cenas 3D, consertar texturas viradas e montar o formato do portfólio (960 × 540). |
| **Transcrição** | Transformar áudio, vídeo ou link do YouTube em texto e legenda, com tempo por palavra e separação de quem fala. |
| **Documento (PDF)** | Converter a foto de um documento em PDF com texto editável e editar PDFs arrastando os textos. |
| **Baixar pacotes** | Ver o que falta instalar e instalar com um clique, acompanhando o progresso. |

## Começando

1. Dê dois cliques no **`sharpz.cmd`**, na raiz do projeto.
2. Na primeira vez, escolha **1 · Instalar tudo e abrir**. Depois disso, use **2 · Abrir o painel**.
3. O painel abre sozinho no Chrome, em <http://localhost:5174>.

O passo a passo completo está em [Instalação e uso](docs/instalacao.md).

## Documentação

| Página | Assunto |
| --- | --- |
| [Instalação e uso](docs/instalacao.md) | Requisitos, primeira instalação, uso diário, modo produção e como parar. |
| [Ferramentas do painel](docs/ferramentas.md) | O que cada módulo faz e quando usar. |
| [Remoção de fundo e modelos de IA](docs/remocao-de-fundo.md) | Métodos de recorte, modelos, uso de memória e alpha matting. |
| [Transcrição](docs/transcricao.md) | Modelos, motor quente, separação de locutores e resumo por IA. |
| [Texturas KTX](docs/texturas-ktx.md) | Presets, pasta inteira, correção de orientação e Portfólio KTX. |
| [Linha de comando](docs/linha-de-comando.md) | Como usar as ferramentas sem abrir o painel. |
| [Solução de problemas](docs/solucao-de-problemas.md) | Erros comuns e como resolver cada um. |
| [Desenvolvimento](docs/desenvolvimento.md) | Estrutura do projeto, rotas da API e testes. |

## Licença

O código é aberto, sob a [licença MIT](LICENSE).

O nome **Sharpz** e o logo identificam o projeto original e não fazem parte dessa licença: em forks e versões modificadas, use outro nome e outro logo. Os créditos e direitos estão gravados nos metadados das próprias imagens.

Algumas dependências têm licença própria. O PyMuPDF, usado no Imagem para PDF e no Editor de PDF, é AGPL-3.0, e os modelos de IA de remoção de fundo e de transcrição seguem as licenças dos seus autores.
