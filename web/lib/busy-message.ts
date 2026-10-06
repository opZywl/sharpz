export type BusySource = "file" | "path" | "url"

export function busyKeys(kind: BusySource): { busy: "busy" | "busyLink"; ready: "ready" | "readyLink" } {
    return kind === "url" ? { busy: "busyLink", ready: "readyLink" } : { busy: "busy", ready: "ready" }
}
