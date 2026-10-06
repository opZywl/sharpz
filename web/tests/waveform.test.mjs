import { test } from "node:test"
import assert from "node:assert/strict"

import { WAVEFORM_LIMIT, contentRangeTotal, mediaFailed, probedSize, waveformAllowed } from "../lib/waveform.ts"

test("the waveform limit is 150 MB", () => {
    assert.equal(WAVEFORM_LIMIT, 150 * 1024 * 1024)
})

test("the waveform is only allowed for known sizes up to the limit", () => {
    assert.equal(waveformAllowed(1024), true)
    assert.equal(waveformAllowed(WAVEFORM_LIMIT), true)
    assert.equal(waveformAllowed(WAVEFORM_LIMIT + 1), false)
    assert.equal(waveformAllowed(null), false)
    assert.equal(waveformAllowed(undefined), false)
    assert.equal(waveformAllowed(0), false)
    assert.equal(waveformAllowed(Number.NaN), false)
})

test("contentRangeTotal reads the full size from a Content-Range header", () => {
    assert.equal(contentRangeTotal("bytes 0-0/12345"), 12345)
    assert.equal(contentRangeTotal("bytes */987"), 987)
    assert.equal(contentRangeTotal("BYTES 0-0/5"), 5)
})

test("contentRangeTotal returns null when the size is unknown or the header is invalid", () => {
    assert.equal(contentRangeTotal("bytes 0-0/*"), null)
    assert.equal(contentRangeTotal(null), null)
    assert.equal(contentRangeTotal(""), null)
    assert.equal(contentRangeTotal("garbage"), null)
})

test("probedSize uses Content-Range on 206 and Content-Length on 200", () => {
    assert.equal(probedSize({ status: 206, contentRange: "bytes 0-0/42", contentLength: "1" }), 42)
    assert.equal(probedSize({ status: 200, contentRange: null, contentLength: "777" }), 777)
    assert.equal(probedSize({ status: 200, contentRange: null, contentLength: null }), null)
    assert.equal(probedSize({ status: 404, contentRange: null, contentLength: "10" }), null)
    assert.equal(probedSize({ status: 206, contentRange: null, contentLength: "1" }), null)
})

test("mediaFailed spots an audio element that already failed to load", () => {
    assert.equal(mediaFailed({ error: { code: 4 }, networkState: 1 }), true)
    assert.equal(mediaFailed({ error: null, networkState: 3 }), true)
    assert.equal(mediaFailed({ error: null, networkState: 1 }), false)
    assert.equal(mediaFailed({ error: null, networkState: 2 }), false)
    assert.equal(mediaFailed({ error: null, networkState: 0 }), false)
})
