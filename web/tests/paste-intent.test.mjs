import { test } from "node:test"
import assert from "node:assert/strict"

import { dragKind, droppedUrl, httpUrl, pasteIntent } from "../lib/paste-intent.ts"

test("httpUrl accepts a single http or https link", () => {
    assert.equal(httpUrl("https://www.youtube.com/watch?v=abc"), "https://www.youtube.com/watch?v=abc")
    assert.equal(httpUrl("  http://example.com/video.mp4\n"), "http://example.com/video.mp4")
})

test("httpUrl rejects other schemes, plain text and several words", () => {
    assert.equal(httpUrl("ftp://example.com/a.mp3"), null)
    assert.equal(httpUrl("javascript:alert(1)"), null)
    assert.equal(httpUrl("file:///C:/video.mp4"), null)
    assert.equal(httpUrl("just some text"), null)
    assert.equal(httpUrl("look https://example.com"), null)
    assert.equal(httpUrl("https://a.com https://b.com"), null)
    assert.equal(httpUrl("www.youtube.com/watch"), null)
    assert.equal(httpUrl(""), null)
})

const base = { editableTarget: false, hasMediaFile: false, hasFile: false, text: "" }

test("text pasted into a field always stays in the field", () => {
    assert.equal(pasteIntent({ ...base, editableTarget: true, hasFile: true, text: "A1\tB1" }), "ignore")
    assert.equal(pasteIntent({ ...base, editableTarget: true, hasMediaFile: true, hasFile: true, text: "x" }), "ignore")
    assert.equal(pasteIntent({ ...base, editableTarget: true, text: "https://youtu.be/abc" }), "ignore")
})

test("a pasted media file is used, even inside a field without text", () => {
    assert.equal(pasteIntent({ ...base, hasMediaFile: true, hasFile: true }), "file")
    assert.equal(pasteIntent({ ...base, editableTarget: true, hasMediaFile: true, hasFile: true }), "file")
})

test("a non media file inside a field is left alone", () => {
    assert.equal(pasteIntent({ ...base, editableTarget: true, hasFile: true }), "ignore")
})

test("a link pasted outside the fields becomes the source", () => {
    assert.equal(pasteIntent({ ...base, text: "https://youtu.be/abc" }), "url")
    assert.equal(pasteIntent({ ...base, hasFile: true, text: "https://youtu.be/abc" }), "url")
})

test("a non media file pasted outside the fields is rejected", () => {
    assert.equal(pasteIntent({ ...base, hasFile: true, text: "cells" }), "reject-file")
    assert.equal(pasteIntent({ ...base, hasFile: true }), "reject-file")
})

test("plain text pasted outside the fields is ignored", () => {
    assert.equal(pasteIntent({ ...base, text: "hello" }), "ignore")
    assert.equal(pasteIntent(base), "ignore")
})

test("dragKind accepts files and links dragged from outside the page", () => {
    assert.equal(dragKind(["Files"], false), "files")
    assert.equal(dragKind(["text/uri-list", "text/plain"], false), "link")
    assert.equal(dragKind(["Files", "text/uri-list"], false), "files")
})

test("dragKind ignores drags that started in the page and plain text", () => {
    assert.equal(dragKind(["text/uri-list", "text/plain"], true), null)
    assert.equal(dragKind(["Files"], true), null)
    assert.equal(dragKind(["text/plain"], false), null)
    assert.equal(dragKind([], false), null)
})

test("droppedUrl reads the first link of a uri-list and falls back to the text", () => {
    assert.equal(droppedUrl("# comment\r\nhttps://youtu.be/abc\r\nhttps://other.com", ""), "https://youtu.be/abc")
    assert.equal(droppedUrl("", "https://youtu.be/abc"), "https://youtu.be/abc")
    assert.equal(droppedUrl("javascript:alert(1)", "not a link"), null)
})
