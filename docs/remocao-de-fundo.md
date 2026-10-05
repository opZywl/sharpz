[← Voltar ao início](../README.md)

# Remoção de fundo e modelos de IA

## Métodos de recorte

| Método | Quando usar |
| --- | --- |
| **Auto** (padrão) | Olha a imagem e escolhe sozinho. Se ela já tem transparência, mantém; se o fundo é preto ou branco liso, usa o recorte por luz; senão, usa a IA. |
| **IA** | Fotos e objetos em fundos variados. |
| **Fundo escuro (luma)** | Neon, brilho, fogo, fumaça e lasers sobre fundo preto. Preserva todo o brilho. |
| **Fundo claro (luma)** | Logos e traços escuros sobre fundo branco. |
| **Sem remoção** | Mantém a imagem como está (útil quando só quer o SVG). |

No recorte por luz, **Luma mínimo** e **Luma máximo** definem o que vira transparente e o que fica opaco, e **Unmult (brilho)** recupera a cor pura do brilho para ele ficar bonito em qualquer fundo.

## Modelos de IA

Os modelos são baixados uma vez na primeira utilização e ficam em `%USERPROFILE%\.u2net`. O seletor mostra uma dica de tamanho e uso de memória, em âmbar quando o modelo é pesado.

| Modelo | Perfil | Download | Pico de RAM medido |
| --- | --- | --- | --- |
| **ISNet (rápido)** · padrão | Leve e rápido, bom para a maioria das imagens. | ~180 MB | ~1,5 GB |
| **BiRefNet Lite (detalhado)** | Recorte mais fino em cabelo e bordas, bem mais lento. | ~220 MB | ~6 GB |
| **BiRefNet (qualidade máxima)** | O melhor recorte e o mais pesado. | ~970 MB | vários GB |
| **U2Net (mais leve)** | O mais rápido; recorte mais simples. | ~175 MB | ~1,4 GB |
| **BiRefNet Retrato (pessoas)** | Especialista em pessoas e rostos. Pesado. | ~970 MB | vários GB |
| **U2Net Pessoas (leve)** | Pessoas de corpo inteiro. | ~175 MB | ~1,4 GB (estimado, mesma base do U2Net) |
| **Segment Anything (objeto central)** | Recorta o objeto que está no centro da imagem. | não medido | não medido |

As medições foram feitas num notebook com 16 GB de RAM, processador i7 de 13ª geração e sem placa de vídeo. Com o ISNet, uma imagem leva cerca de 2 segundos; com o BiRefNet Lite, de 15 a 20 segundos.

### Por que o padrão é o ISNet

O BiRefNet tem o melhor recorte, mas usa muitos gigabytes de RAM e chegava a travar o computador. O ISNet usa cerca de 4 vezes menos memória e é umas 7 vezes mais rápido, com qualidade muito boa para o uso do dia a dia. Os modelos BiRefNet continuam disponíveis no seletor quando você precisar de mais detalhe.

## Alpha matting

Refina as bordas do recorte da IA (cabelo, pelos, contornos suaves). Deixa o processamento um pouco mais lento. Está ligado por padrão e pode ser desligado em **Remover fundo**, **Remover fundo + SVG** e **Pasta inteira**.

**Limite da frente**, **Limite do fundo** e **Erosão** controlam a faixa de borda que o refinamento analisa.

## Uso de memória

O Sharpz foi ajustado para não pesar o computador:

- só um modelo fica carregado por vez, e ele é liberado depois de 10 minutos sem uso;
- a memória usada em cada imagem é devolvida ao sistema assim que o processamento termina;
- só uma imagem é processada pela IA por vez, mesmo com várias abas abertas.

Se a memória acabar, o painel mostra uma mensagem clara em vez de um erro genérico, sugerindo um modelo mais leve, desligar o alpha matting ou usar uma imagem menor. Na **Pasta inteira**, o lote para na primeira falta de memória e informa quantas imagens ficaram de fora.

---

[← Ferramentas do painel](ferramentas.md) · [Transcrição →](transcricao.md)
