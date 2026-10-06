const TERMINAL_PHASES = new Set(["done", "error", "canceled"])

export function livePhase<P extends string>(phase: P, stage: string | null): P | "queued" | "running" {
    if (TERMINAL_PHASES.has(phase)) return phase
    return stage === "queued" ? "queued" : "running"
}
