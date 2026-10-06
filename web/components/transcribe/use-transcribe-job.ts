"use client"

import { useEffect, useReducer, useState } from "react"

import { useLatest } from "@/components/transcribe/transcribe-hooks"
import { createController } from "@/components/transcribe/transcribe-job-controller"
import { INITIAL, reducer } from "@/components/transcribe/transcribe-job-reducer"

export { hasProgress, remainingSeconds } from "@/components/transcribe/transcribe-job-reducer"
export type { JobMode, JobPhase, JobState, StartInfo } from "@/components/transcribe/transcribe-job-types"

export function useTranscribeJob() {
    const [state, dispatch] = useReducer(reducer, INITIAL)
    const [controller] = useState(() => createController(dispatch))
    const busy = state.phase === "uploading" || state.phase === "queued" || state.phase === "running"
    const busyRef = useLatest(busy)

    useEffect(() => {
        controller.mount(busyRef.current)
        return () => controller.dispose()
    }, [controller, busyRef])

    return { state, busy, start: controller.start, cancel: controller.cancel, clear: controller.clear }
}
