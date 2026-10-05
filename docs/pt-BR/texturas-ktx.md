[![EN](https://img.shields.io/badge/lang-EN-blue)](../en/ktx-textures.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](texturas-ktx.md)

[← Voltar ao início](../../README.pt-BR.md)

# Texturas KTX

KTX2 é um formato de textura leve, usado em cenas 3D como as do portfólio.

## O que precisa estar instalado

| Ferramentas | Precisam de |
| --- | --- |
| Imagem para KTX e Pasta para KTX | **KTX-Software** |
| Portfólio KTX | o conversor do Portfólio, que o instalador já coloca |
| Corrigir KTX virado | nada além do Sharpz |

O KTX-Software pode ser instalado com um clique em **Baixar pacotes** (item **KTX-Software**). O painel mostra no canto se as texturas KTX estão prontas.

## Imagem para KTX

Converte uma imagem por vez. Opções:

- **Preset:** o nível de qualidade e compressão. O padrão (`ultra`) prioriza qualidade.
- **Auto-alinhar:** completa a imagem até um múltiplo de 4 pixels, que o formato exige.
- **Preset automático:** escolhe o preset sozinho; imagens com transparência usam `ultra_rgba`.
- **Validar PSNR:** compara a textura com o original e informa a qualidade. Deixa a conversão mais lenta.

## Pasta para KTX

Converte todas as imagens PNG ou JPG de uma pasta. Além das opções acima:

- **Recursivo:** inclui as subpastas.
- **Sem subpastas na saída:** grava tudo direto na pasta de saída, sem recriar a estrutura.
- **Conversões simultâneas:** quantas imagens converter ao mesmo tempo.

## Corrigir KTX virado

Conserta uma textura `.ktx` ou `.ktx2` que aparece de cabeça para baixo ou espelhada na cena 3D. Você pode baixar o arquivo corrigido ou salvar direto numa pasta.

## Portfólio KTX

Ajusta a imagem a 960 × 540 (sem distorcer, com bordas pretas quando precisa) e entrega a textura pronta para o portfólio, já na orientação certa.

---

[← Transcrição](transcricao.md) · [Linha de comando →](linha-de-comando.md)
