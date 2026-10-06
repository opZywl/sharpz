import { test } from "node:test"
import assert from "node:assert/strict"

import { wordTimestampsAvailable } from "../lib/capabilities.ts"

test("word timestamps follow the server flag when present", () => {
    assert.equal(wordTimestampsAvailable({ word_timestamps: true, venv: false }), true)
    assert.equal(wordTimestampsAvailable({ word_timestamps: false, venv: true }), false)
})

test("word timestamps fall back to the engine environment", () => {
    assert.equal(wordTimestampsAvailable({ venv: true }), true)
    assert.equal(wordTimestampsAvailable({ venv: false }), false)
    assert.equal(wordTimestampsAvailable({ word_timestamps: "yes", venv: false }), false)
})
