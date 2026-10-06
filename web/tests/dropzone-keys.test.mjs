import { test } from "node:test"
import assert from "node:assert/strict"

import { shouldOpenPicker } from "../lib/dropzone-keys.ts"

test("Enter and Space on the dropzone itself open the picker", () => {
    assert.equal(shouldOpenPicker("Enter", true), true)
    assert.equal(shouldOpenPicker(" ", true), true)
})

test("keys coming from a button inside the dropzone are left to that button", () => {
    assert.equal(shouldOpenPicker("Enter", false), false)
    assert.equal(shouldOpenPicker(" ", false), false)
})

test("other keys never open the picker", () => {
    assert.equal(shouldOpenPicker("Tab", true), false)
    assert.equal(shouldOpenPicker("a", true), false)
})
