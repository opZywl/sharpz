"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { Store } from "@/components/transcribe/transcribe-utils"
import type { Message } from "@/lib/i18n"

export function usePersistentState<T>(fallback: T, store: Store<T>) {
    const [value, setValue] = useState<T>(fallback)
    const [hydrated, setHydrated] = useState(false)

    useEffect(() => {
        const saved = store.load()
        if (saved !== null) setValue(saved)
        setHydrated(true)
    }, [store])

    useEffect(() => {
        if (hydrated) store.save(value)
    }, [hydrated, store, value])

    return [value, setValue] as const
}

export function useLatest<T>(value: T) {
    const ref = useRef(value)
    useEffect(() => {
        ref.current = value
    })
    return ref
}

export function useNow(active: boolean) {
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        if (!active) return
        setNow(Date.now())
        const timer = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(timer)
    }, [active])

    return now
}

export function useStickToBottom<T extends HTMLElement>(trigger: unknown, resetKey: unknown) {
    const ref = useRef<T | null>(null)
    const stick = useRef(true)

    const onScroll = useCallback(() => {
        const node = ref.current
        if (!node) return
        stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 40
    }, [])

    useEffect(() => {
        stick.current = true
    }, [resetKey])

    useEffect(() => {
        const node = ref.current
        if (node && stick.current) node.scrollTop = node.scrollHeight
    }, [trigger, resetKey])

    return { ref, onScroll }
}

function recordingName(prefix: string) {
    const now = new Date()
    const pad = (value: number) => String(value).padStart(2, "0")
    return `${prefix}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.webm`
}

export function useMicRecorder(
    onRecorded: (file: File) => void,
    onError: (message: Message) => void,
    namePrefix: string,
) {
    const [recording, setRecording] = useState(false)
    const [seconds, setSeconds] = useState(0)
    const recorderRef = useRef<MediaRecorder | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const timerRef = useRef<number | null>(null)
    const chunksRef = useRef<BlobPart[]>([])
    const startingRef = useRef(false)
    const aliveRef = useRef(true)
    const onRecordedRef = useLatest(onRecorded)
    const onErrorRef = useLatest(onError)
    const namePrefixRef = useLatest(namePrefix)

    const release = useCallback(() => {
        if (timerRef.current) window.clearInterval(timerRef.current)
        timerRef.current = null
        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = null
    }, [])

    const start = useCallback(async () => {
        if (recorderRef.current || startingRef.current) return
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
            onErrorRef.current((t) => t.mic.unsupported)
            return
        }
        startingRef.current = true
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            if (!aliveRef.current) {
                stream.getTracks().forEach((track) => track.stop())
                return
            }
            streamRef.current = stream
            chunksRef.current = []
            const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : ""
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunksRef.current.push(event.data)
            }
            recorder.onstop = () => {
                const type = recorder.mimeType || "audio/webm"
                const blob = new Blob(chunksRef.current, { type })
                chunksRef.current = []
                release()
                if (blob.size > 0) onRecordedRef.current(new File([blob], recordingName(namePrefixRef.current), { type }))
                else onErrorRef.current((t) => t.mic.empty)
            }
            recorderRef.current = recorder
            recorder.start()
            setRecording(true)
            setSeconds(0)
            timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000)
        } catch (err) {
            release()
            if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
                onErrorRef.current((t) => t.mic.blocked)
            } else if (err instanceof DOMException && err.name === "NotFoundError") {
                onErrorRef.current((t) => t.mic.notFound)
            } else {
                onErrorRef.current((t) => t.mic.failed)
            }
        } finally {
            startingRef.current = false
        }
    }, [namePrefixRef, onErrorRef, onRecordedRef, release])

    const stop = useCallback(() => {
        const recorder = recorderRef.current
        recorderRef.current = null
        setRecording(false)
        if (timerRef.current) window.clearInterval(timerRef.current)
        timerRef.current = null
        if (!recorder || recorder.state === "inactive") {
            release()
            return
        }
        recorder.stop()
    }, [release])

    useEffect(() => {
        aliveRef.current = true
        return () => {
            aliveRef.current = false
            const recorder = recorderRef.current
            recorderRef.current = null
            if (recorder) {
                recorder.onstop = null
                if (recorder.state !== "inactive") recorder.stop()
            }
            release()
        }
    }, [release])

    return { recording, seconds, start, stop }
}
