import { test } from "node:test"
import assert from "node:assert/strict"

import { normalizeCompleteManifest } from "../lib/complete-manifest.ts"

const EMPTY = {
    slug: "",
    title: "",
    out_dir: "",
    dest_dir: null,
    zip: null,
    frames: 0,
    images: [],
    captions: {},
    contact_sheets: [],
    docs: [],
    transcripts: [],
    docs_generated: false,
    degraded: [],
}

test("a partial manifest gets every field with safe defaults", () => {
    assert.deepEqual(normalizeCompleteManifest({ degraded: ["complete"], docs_generated: false }), {
        ...EMPTY,
        degraded: ["complete"],
    })
})

test("missing or non object manifests become null", () => {
    assert.equal(normalizeCompleteManifest(null), null)
    assert.equal(normalizeCompleteManifest(undefined), null)
    assert.equal(normalizeCompleteManifest("manifest"), null)
    assert.equal(normalizeCompleteManifest(42), null)
    assert.equal(normalizeCompleteManifest(["docs"]), null)
})

test("wrong types are replaced and non string items are dropped", () => {
    assert.deepEqual(
        normalizeCompleteManifest({
            slug: 7,
            title: null,
            out_dir: ["x"],
            dest_dir: 3,
            zip: {},
            frames: "12",
            images: ["a.jpg", 1, null, "b.jpg"],
            captions: { "a.jpg": "cap", "b.jpg": null, "c.jpg": 5 },
            contact_sheets: "sheet.jpg",
            docs: [null, "doc.md"],
            transcripts: [{}, "t.txt"],
            docs_generated: "yes",
            degraded: [1, "frames"],
        }),
        {
            ...EMPTY,
            images: ["a.jpg", "b.jpg"],
            captions: { "a.jpg": "cap", "b.jpg": null },
            docs: ["doc.md"],
            transcripts: ["t.txt"],
            degraded: ["frames"],
        },
    )
})

test("a full manifest is kept as is", () => {
    const full = {
        slug: "aula-1",
        title: "Aula 1",
        out_dir: "C:/Users/zywl/Videos/aula-1",
        dest_dir: "C:/Users/zywl/Desktop/aula-1",
        zip: "aula-1.zip",
        frames: 24,
        images: ["frames/0001.jpg"],
        captions: { "0001.jpg": "Slide" },
        contact_sheets: ["contact.jpg"],
        docs: ["README.md"],
        transcripts: ["transcript.txt"],
        docs_generated: true,
        degraded: [],
    }
    assert.deepEqual(normalizeCompleteManifest(full), full)
})

test("captions that are not a plain object become empty", () => {
    assert.deepEqual(normalizeCompleteManifest({ captions: ["a"] })?.captions, {})
    assert.deepEqual(normalizeCompleteManifest({ captions: null })?.captions, {})
})
