import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const web = join(dirname(fileURLToPath(import.meta.url)), "..")
const layout = readFileSync(join(web, "app", "layout.tsx"), "utf8")
const fonts = join(web, "app", "fonts")

test("the dashboard fonts ship with the project, so building needs no network", () => {
    assert.doesNotMatch(layout, /next\/font\/google/)
    assert.match(layout, /next\/font\/local/)
    for (const file of ["space-grotesk.woff2", "plus-jakarta-sans.woff2"]) {
        assert.ok(existsSync(join(fonts, file)), file)
        assert.ok(layout.includes(`./fonts/${file}`), file)
    }
})

test("each bundled font keeps its SIL Open Font License", () => {
    for (const [file, authors] of [
        ["OFL-SpaceGrotesk.txt", "The Space Grotesk Project Authors"],
        ["OFL-PlusJakartaSans.txt", "The Plus Jakarta Sans Project Authors"],
    ]) {
        const text = readFileSync(join(fonts, file), "utf8")
        assert.ok(text.includes("SIL Open Font License, Version 1.1"), file)
        assert.ok(text.includes(authors), file)
    }
})
