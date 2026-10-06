import { test } from "node:test"
import assert from "node:assert/strict"

import {
    PROXY_UPLOAD_LIMIT,
    exceedsProxyLimit,
    isDirectUpload,
    uploadEndpoint,
} from "../lib/upload-target.ts"

const DIRECT = "http://127.0.0.1:8000/api/transcribe"
const PROXY = "/api/transcribe"

test("localhost and 127.0.0.1 on the dashboard port upload straight to the server", () => {
    assert.equal(uploadEndpoint({ hostname: "localhost", port: "5174", protocol: "http:" }), DIRECT)
    assert.equal(uploadEndpoint({ hostname: "127.0.0.1", port: "5174", protocol: "http:" }), DIRECT)
    assert.equal(isDirectUpload({ hostname: "localhost", port: "5174", protocol: "http:" }), true)
})

test("origins outside the server CORS list keep the proxy", () => {
    assert.equal(uploadEndpoint({ hostname: "::1", port: "5174", protocol: "http:" }), PROXY)
    assert.equal(uploadEndpoint({ hostname: "[::1]", port: "5174", protocol: "http:" }), PROXY)
    assert.equal(uploadEndpoint({ hostname: "localhost", port: "3000", protocol: "http:" }), PROXY)
    assert.equal(uploadEndpoint({ hostname: "localhost", port: "5174", protocol: "https:" }), PROXY)
    assert.equal(uploadEndpoint({ hostname: "192.168.0.10", port: "5174", protocol: "http:" }), PROXY)
    assert.equal(isDirectUpload({ hostname: "example.com", port: "", protocol: "https:" }), false)
})

test("the proxy limit is 1 GB and only applies to proxied uploads", () => {
    assert.equal(PROXY_UPLOAD_LIMIT, 1024 ** 3)
    assert.equal(exceedsProxyLimit(PROXY_UPLOAD_LIMIT, false), false)
    assert.equal(exceedsProxyLimit(PROXY_UPLOAD_LIMIT + 1, false), true)
    assert.equal(exceedsProxyLimit(PROXY_UPLOAD_LIMIT * 4, true), false)
})
