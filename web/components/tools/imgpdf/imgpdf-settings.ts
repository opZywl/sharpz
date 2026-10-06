export type Status = "idle" | "running" | "done" | "error"
export type PageMode = "auto" | "a4"
export type OcrEngine = "auto" | "vision" | "tesseract"

export const VISION_BASE_URL_KEY = "cleanup-image.vision-base-url"
export const VISION_MODEL_KEY = "cleanup-image.vision-model"
export const VISION_API_KEY_KEY = "cleanup-image.vision-api-key"
export const OUTPUT_DIR_KEY = "cleanup-image.imgpdf-output-dir"
export const DEFAULT_VISION_BASE_URL = "http://localhost:11434/v1"
export const DEFAULT_VISION_MODEL = "llama3.2-vision"

export const PAGE_MODES: PageMode[] = ["auto", "a4"]
export const OCR_ENGINES: OcrEngine[] = ["auto", "vision", "tesseract"]
