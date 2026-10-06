export function wordTimestampsAvailable(caps: { word_timestamps?: unknown; venv: boolean }): boolean {
    return typeof caps.word_timestamps === "boolean" ? caps.word_timestamps : caps.venv
}
