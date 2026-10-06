import { test } from "node:test"
import assert from "node:assert/strict"

import { busyKeys } from "../lib/busy-message.ts"

test("a file or a path waiting for a running job uses the file texts", () => {
    assert.deepEqual(busyKeys("file"), { busy: "busy", ready: "ready" })
    assert.deepEqual(busyKeys("path"), { busy: "busy", ready: "ready" })
})

test("a link waiting for a running job uses the link texts", () => {
    assert.deepEqual(busyKeys("url"), { busy: "busyLink", ready: "readyLink" })
})
