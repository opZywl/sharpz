[![EN](https://img.shields.io/badge/lang-EN-blue)](../en/installation.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](instalacao.md)

[← Voltar ao início](../../README.pt-BR.md)

# Instalação e uso

## Requisitos

- Windows 10 ou 11
- Python 3.13 instalado no sistema
- Node.js 20 ou mais novo
- Google Chrome (o painel abre nele, e o Editor de PDF usa o Chrome para exportar)

O instalador cuida do resto: o `uv` (que cria o ambiente da transcrição), o FFmpeg, as bibliotecas e o modelo de transcrição. Os itens opcionais (ferramentas de textura KTX, Tesseract e Ollama) podem ser instalados depois, com um clique, na tela **Baixar pacotes**.

## O launcher

Tudo começa pelo `sharpz.cmd`, na raiz do projeto. Ele mostra um menu:

| Opção | O que faz | Quando usar |
| --- | --- | --- |
| **1 · Instalar tudo e abrir** | Confere e instala o que falta, baixa o modelo rápido de transcrição (~1,6 GB, uma vez só), sobe o servidor e o painel e abre o Chrome. | Na primeira vez e depois de atualizar o projeto. |
| **2 · Abrir o painel** | Sobe o servidor e o painel e abre o Chrome. | No dia a dia. |
| **3 · Modo produção** | Gera a versão otimizada do painel e sobe tudo nesse modo. | Quando quiser o painel mais leve e rápido. |
| **4 · Testar** | Roda o teste rápido contra o servidor que está no ar. | Para conferir se está tudo funcionando. |

Também dá para pular o menu e passar a opção direto:

```powershell
.\sharpz.cmd instalar
.\sharpz.cmd abrir
.\sharpz.cmd producao
.\sharpz.cmd testar
```

Os nomes em inglês (`install`, `open`, `prod` e `test`) também funcionam.

Os scripts de cada opção ficam em [`scripts/`](../../scripts). Eles só abrem o navegador depois que o servidor e o painel respondem, e avisam em vermelho o que faltar.

## Idioma

O painel tem os botões **EN** e **PT-BR** no cabeçalho para trocar o idioma da interface.

O menu e as mensagens do `sharpz.cmd` seguem o idioma de exibição do Windows: português quando o Windows está em português, inglês nos outros casos. Para forçar um deles, defina `SHARPZ_LANG` como `pt-BR` ou `en` antes de rodar (por exemplo `set SHARPZ_LANG=pt-BR`). As opções são as mesmas nos dois idiomas, e as ações pela linha de comando funcionam nos dois (`instalar`, `abrir`, `producao`, `testar` ou `install`, `open`, `prod`, `test`):

| Português | English |
| --- | --- |
| 1 · Instalar tudo e abrir (primeira vez) | 1 · Install everything and open (first time) |
| 2 · Abrir o painel (uso do dia a dia) | 2 · Open the dashboard (everyday use) |
| 3 · Modo produção (build otimizado) | 3 · Production mode (optimized build) |
| 4 · Testar (smoke test) | 4 · Test (smoke test) |

## Endereços

| Serviço | Endereço |
| --- | --- |
| Painel | <http://localhost:5174> |
| Servidor | <http://127.0.0.1:8000> |

## Como parar

Feche as janelas **Sharpz API** e **Sharpz Web** (no modo produção, **Sharpz Web (prod)**). Ou, em um terminal:

```powershell
taskkill /FI "WINDOWTITLE eq Sharpz API*" /T /F
taskkill /FI "WINDOWTITLE eq Sharpz Web*" /T /F
```

## Onde ficam os arquivos

| O quê | Onde |
| --- | --- |
| Transcrições | `output/transcripts/` |
| PDFs gerados | `output/pdf/` |
| Saída da Pasta inteira | a pasta que você escolher (padrão: `output/`) |
| Modelos de remoção de fundo | `%USERPROFILE%\.u2net` |
| Modelos de transcrição | cache do Hugging Face no seu usuário |

Nenhum desses arquivos vai para o Git.

## Atualizar

Depois de puxar uma versão nova do projeto, rode `.\sharpz.cmd instalar` uma vez para atualizar as dependências.

---

[Ferramentas do painel →](ferramentas.md)
