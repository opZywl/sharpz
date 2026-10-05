[![EN](https://img.shields.io/badge/lang-EN-blue)](background-removal.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](../pt-BR/remocao-de-fundo.md)

[← Back to start](../../README.md)

# Background removal and AI models

## Cutout methods

| Method | When to use |
| --- | --- |
| **Auto** (default) | Looks at the image and chooses on its own. If the image already has transparency, it keeps it; if the background is plain black or white, it uses the light-based cutout; otherwise, it uses AI. |
| **AI** | Photos and objects on varied backgrounds. |
| **Dark background (luma)** | Neon, glow, fire, smoke and lasers on a black background. Keeps all of the glow. |
| **Light background (luma)** | Logos and dark strokes on a white background. |
| **No removal** | Keeps the image as it is (useful when you only want the SVG). |

In the light-based cutout, **Luma low** and **Luma high** set what becomes transparent and what stays opaque, and **Unmult (glow)** recovers the pure color of the glow so it looks good on any background.

## AI models

The models are downloaded once, the first time they are used, and are stored in `%USERPROFILE%\.u2net`. The selector shows a hint about size and memory use, in amber when the model is heavy.

| Model | Profile | Download | Measured peak RAM |
| --- | --- | --- | --- |
| **ISNet (fast)** · default | Light and fast, good for most images. | ~180 MB | ~1.5 GB |
| **BiRefNet Lite (detailed)** | Finer cutout on hair and edges, much slower. | ~220 MB | ~6 GB |
| **BiRefNet (best quality)** | The best cutout and the heaviest. | ~970 MB | several GB |
| **U2Net (lightest)** | The fastest; simpler cutout. | ~175 MB | ~1.4 GB |
| **BiRefNet Portrait (people)** | Specialized in people and faces. Heavy. | ~970 MB | several GB |
| **U2Net People (light)** | Full-body people. | ~175 MB | ~1.4 GB (estimated, same base as U2Net) |
| **Segment Anything (central object)** | Cuts out the object at the center of the image. | not measured | not measured |

The measurements were taken on a laptop with 16 GB of RAM, a 13th-generation i7 processor and no graphics card. With ISNet, an image takes about 2 seconds; with BiRefNet Lite, 15 to 20 seconds.

### Why ISNet is the default

BiRefNet has the best cutout, but it uses many gigabytes of RAM and could freeze the computer. ISNet uses about 4 times less memory and is about 7 times faster, with very good quality for everyday use. The BiRefNet models are still available in the selector when you need more detail.

## Alpha matting

Refines the edges of the AI cutout (hair, fur, soft outlines). It makes processing a bit slower. It is on by default and can be turned off in **Remove background**, **Remove background + SVG** and **Whole folder**.

**Foreground threshold**, **Background threshold** and **Erosion** control the edge band that the refinement analyzes.

## Memory use

Sharpz is tuned so it does not weigh down your computer:

- only one model is loaded at a time, and it is released after 10 minutes without use;
- the memory used for each image is given back to the system as soon as processing ends;
- only one image is processed by the AI at a time, even with several tabs open.

If memory runs out, the dashboard shows a clear message instead of a generic error, suggesting a lighter model, turning off alpha matting or using a smaller image. In **Whole folder**, the batch stops at the first out-of-memory error and reports how many images were left out.

---

[← Dashboard tools](tools.md) · [Transcription →](transcription.md)
