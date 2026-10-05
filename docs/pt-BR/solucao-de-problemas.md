[![EN](https://img.shields.io/badge/lang-EN-blue)](../en/troubleshooting.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](solucao-de-problemas.md)

[← Voltar ao início](../../README.pt-BR.md)

# Solução de problemas

## O painel abre, mas diz "API offline"

O servidor não está rodando. Rode `.\sharpz.cmd abrir` (ou a opção 2 do menu). Se a janela **Sharpz API** fechar sozinha, veja o erro em `fastapi.err.log`, na raiz do projeto.

## "Memória insuficiente"

O computador ficou sem RAM para o modelo escolhido. Em ordem:

1. feche programas pesados (navegador com muitas abas, editores, jogos);
2. troque para um modelo mais leve: **ISNet (rápido)** ou **U2Net (mais leve)**;
3. desligue o **Alpha matting**;
4. use uma imagem menor.

Os modelos BiRefNet são os mais pesados; veja a tabela em [Remoção de fundo e modelos de IA](remocao-de-fundo.md#modelos-de-ia).

## A primeira imagem demora

Na primeira vez que um modelo é usado, ele é baixado e carregado. As imagens seguintes saem bem mais rápido. Depois de 10 minutos sem uso o modelo é liberado da memória e a próxima imagem carrega de novo.

## "O servidor não respondeu"

O servidor caiu ou o processamento demorou demais. Confira se a janela **Sharpz API** está aberta e rode `.\sharpz.cmd abrir` de novo se precisar.

## As ferramentas de KTX não convertem

Falta o KTX-Software. Instale em **Baixar pacotes** (item **KTX-Software**). O painel mostra **Texturas KTX: ok** quando estiver pronto.

## "O conversor do Portfólio KTX não está instalado"

Rode `.\sharpz.cmd instalar`. Ele instala tudo que o Portfólio KTX precisa.

## A transcrição não começa

- Confira em **Baixar pacotes** se o **FFmpeg** e o **motor de transcrição** estão instalados.
- Na primeira transcrição o modelo é baixado (o Large v3 tem ~3 GB); acompanhe o progresso na tela.

## Separação de quem fala não funciona

O modelo de locutores é restrito. É preciso:

1. criar um token em <https://huggingface.co/settings/tokens>;
2. aceitar os termos em <https://huggingface.co/pyannote/speaker-diarization-community-1>;
3. informar o token no campo **Token da Hugging Face** da tela de Transcrição, ou salvar `HF_TOKEN=...` no arquivo `.env` da raiz.

## O resumo por IA não responde

O resumo usa o Ollama no próprio computador. Instale em **Baixar pacotes**, deixe ele aberto e baixe um modelo:

```powershell
ollama pull llama3.1
```

## Imagem para PDF sem texto selecionável

Sem uma IA de visão configurada, a leitura usa o Tesseract. Instale em **Baixar pacotes**; para português, o Tesseract precisa do idioma `por`.

## Abri de novo e ficou com duas cópias rodando

O **Abrir o painel** não fecha uma cópia antiga que ainda esteja no ar. Feche as janelas **Sharpz API** e **Sharpz Web** antes de abrir de novo, ou use `.\sharpz.cmd instalar` (ou `producao`), que encerra as cópias antigas antes de subir.

---

[← Linha de comando](linha-de-comando.md) · [Desenvolvimento →](desenvolvimento.md)
