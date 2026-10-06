export type CancelAction = "abort" | "cancel-when-created" | "cancel-job" | "none"
export type AfterCreate = "continue" | "cancel-job" | "drop"

export function cancelAction(input: { hasUpload: boolean; bodySent: boolean; jobId: string | null }): CancelAction {
    if (input.hasUpload) return input.bodySent ? "cancel-when-created" : "abort"
    return input.jobId ? "cancel-job" : "none"
}

export function afterCreate(input: { deduped: boolean; cancelRequested: boolean }): AfterCreate {
    if (!input.cancelRequested) return "continue"
    return input.deduped ? "drop" : "cancel-job"
}
