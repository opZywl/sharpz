import { test } from "node:test"
import assert from "node:assert/strict"

import { livePhase } from "../lib/transcribe-phase.ts"

test("the start stage takes a queued job out of the queue", () => {
    assert.equal(livePhase("queued", "start"), "running")
})

test("the queued stage keeps the job queued", () => {
    assert.equal(livePhase("queued", "queued"), "queued")
    assert.equal(livePhase("running", "queued"), "queued")
})

test("terminal phases are kept", () => {
    for (const phase of ["done", "error", "canceled"]) {
        assert.equal(livePhase(phase, "start"), phase)
        assert.equal(livePhase(phase, null), phase)
    }
})

test("other stages and segments mean the job is running", () => {
    assert.equal(livePhase("uploading", "transcribe"), "running")
    assert.equal(livePhase("queued", null), "running")
})
