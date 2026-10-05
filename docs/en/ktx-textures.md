[![EN](https://img.shields.io/badge/lang-EN-blue)](ktx-textures.md) [![PT-BR](https://img.shields.io/badge/lang-PT--BR-green)](../pt-BR/texturas-ktx.md)

[← Back to start](../../README.md)

# KTX textures

KTX2 is a lightweight texture format, used in 3D scenes like the ones in the portfolio.

## What needs to be installed

| Tools | Need |
| --- | --- |
| Image to KTX and Folder to KTX | **KTX-Software** |
| Portfolio KTX | the Portfolio converter, which the installer already sets up |
| Fix flipped KTX | nothing beyond Sharpz |

KTX-Software can be installed with one click in **Packages** (item **KTX-Software**). The dashboard shows in the corner whether KTX textures are ready.

## Image to KTX

Converts one image at a time. Options:

- **Preset:** the quality and compression level. The default (`ultra`) favors quality.
- **Auto-align:** pads the image to a multiple of 4 pixels, which the format requires.
- **Automatic preset:** chooses the preset on its own; images with transparency use `ultra_rgba`.
- **Check PSNR:** compares the texture with the original and reports the quality. Makes the conversion slower.

## Folder to KTX

Converts every PNG or JPG image in a folder. On top of the options above:

- **Include subfolders:** processes files in subfolders too.
- **No subfolders in the output:** writes everything straight into the output folder, without recreating the structure.
- **Parallel conversions:** how many images to convert at the same time.

## Fix flipped KTX

Fixes a `.ktx` or `.ktx2` texture that shows up upside down or mirrored in the 3D scene. You can download the fixed file or save it straight to a folder.

## Portfolio KTX

Fits the image to 960 × 540 (without distortion, with black bars when needed) and delivers the texture ready for the portfolio, already in the right orientation.

---

[← Transcription](transcription.md) · [Command line →](command-line.md)
