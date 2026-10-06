import { test } from "node:test"
import assert from "node:assert/strict"

import { afterCreate, cancelAction } from "../lib/upload-cancel.ts"

test("cancel aborts an upload whose body is still being sent", () => {
    assert.equal(cancelAction({ hasUpload: true, bodySent: false, jobId: null }), "abort")
})

test("cancel waits for the job id when the body was already sent", () => {
    assert.equal(cancelAction({ hasUpload: true, bodySent: true, jobId: null }), "cancel-when-created")
})

test("cancel stops the job once it exists", () => {
    assert.equal(cancelAction({ hasUpload: false, bodySent: false, jobId: "abc" }), "cancel-job")
    assert.equal(cancelAction({ hasUpload: false, bodySent: true, jobId: "abc" }), "cancel-job")
})

test("cancel does nothing without an upload or a job", () => {
    assert.equal(cancelAction({ hasUpload: false, bodySent: false, jobId: null }), "none")
})

test("a created job continues when nobody asked to cancel", () => {
    assert.equal(afterCreate({ deduped: false, cancelRequested: false }), "continue")
    assert.equal(afterCreate({ deduped: true, cancelRequested: false }), "continue")
})

test("a job created after cancel is stopped when it belongs to this upload", () => {
    assert.equal(afterCreate({ deduped: false, cancelRequested: true }), "cancel-job")
})

test("a deduped job after cancel is left alone because another tab owns it", () => {
    assert.equal(afterCreate({ deduped: true, cancelRequested: true }), "drop")
})
