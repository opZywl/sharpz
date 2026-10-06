[![EN](https://img.shields.io/badge/lang-EN-blue)](../en/transcription.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](transcricao.md)

[← Voltar ao início](../../README.pt-BR.md)

# Transcrição

Transforma áudio e vídeo em texto. Solte o arquivo, informe um caminho do computador ou cole um link (YouTube e afins) e espere: o texto completo aparece na tela no fim, e os arquivos saem em `txt`, `srt`, `vtt`, `json` e `lrc`, na pasta `output/transcripts/`.

## Modelos

| Modelo | Tamanho | Observação |
| --- | --- | --- |
| **Automático** (padrão) | — | Escolhe sozinho entre o Large v3 Turbo e o Large v3 (veja abaixo). |
| Large v3 Turbo | ~1,6 GB | Quase a mesma qualidade do Large v3 em português e várias vezes mais rápido. Baixado pelo instalador. |
| Large v3 | ~3 GB | Melhor qualidade e usado na tradução. Opcional: baixe na tela **Baixar pacotes**. |
| Large v2 | ~3 GB | Versão anterior do Large. |
| Medium | ~1,5 GB | Meio-termo. |
| Small | ~490 MB | Rápido, qualidade razoável. |
| Base | ~150 MB | Muito rápido, qualidade básica. |
| Tiny | ~80 MB | Só para testes. |
| Distil Large v3 | ~1,5 GB | Só inglês. |

### Como o Automático escolhe

- usa o **Large v3 Turbo** quando ele já está baixado;
- usa o **Large v3** enquanto o Turbo não foi baixado;
- com **traduzir para inglês** ligado, usa sempre o Large v3 (o Turbo não traduz bem).

O Turbo pode ser baixado pelo botão de baixar modelo na própria tela de Transcrição. O download roda em segundo plano, com prioridade baixa, e o painel mostra o progresso. Também dá para baixar pela [linha de comando](linha-de-comando.md#baixar-modelos-de-transcrição).

Um modelo que ainda não está no computador é baixado automaticamente na primeira transcrição que precisar dele.

## Motor quente

O primeiro envio abre o motor de transcrição em segundo plano e carrega o modelo uma vez só. Os envios seguintes reaproveitam o modelo carregado, então áudios curtos (como os do WhatsApp) ficam prontos em segundos. Depois de 5 minutos sem trabalho o motor desliga sozinho e devolve a memória; o próximo envio abre outro.

O motor roda com prioridade abaixo do normal, para o computador continuar usável, e grava o log em `output/transcripts/_worker.log`.

| Variável | Efeito |
| --- | --- |
| `SHARPZ_WORKER_IDLE_S` | Muda o tempo (em segundos) até o motor desligar sozinho. |
| `SHARPZ_WORKER=0` | Desliga o motor quente: cada envio abre um processo novo. |

## Recursos

- **Mesmo arquivo de novo:** se ele já está na fila ou rodando, o painel volta para o trabalho que já existe em vez de criar outro.
- **Cancelar:** dá para cancelar um trabalho na fila ou em andamento.
- **Tempo por palavra:** leve, já vem com o motor básico.
- **Separação de quem fala:** bem mais pesada e precisa de um token do Hugging Face com os termos do modelo de locutores aceitos (veja [Solução de problemas](solucao-de-problemas.md#separação-de-quem-fala-não-funciona)).
- **Links:** o áudio é baixado no formato original, sem reconversão.
- **Modo Complete:** além do texto, gera quadros do vídeo, folhas de contato, imagens por cena e documentos de análise com IA de visão, num pacote só.
- **Resumo por IA:** gera um resumo da transcrição usando um servidor de IA compatível com OpenAI (o padrão é o Ollama, no próprio computador).

---

[← Remoção de fundo e modelos de IA](remocao-de-fundo.md) · [Texturas KTX →](texturas-ktx.md)
