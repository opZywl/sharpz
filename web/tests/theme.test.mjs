import { test } from "node:test"
import assert from "node:assert/strict"

import { DEFAULT_THEME, THEMES, nextTheme, parseStoredTheme, themeAttributes, themeBootScript } from "../lib/theme.ts"

test("the theme button cycles light, dark, ruby and back to light", () => {
    assert.deepEqual(THEMES, ["light", "dark", "ruby"])
    assert.equal(nextTheme("light"), "dark")
    assert.equal(nextTheme("dark"), "ruby")
    assert.equal(nextTheme("ruby"), "light")
})

test("stored values outside the three themes fall back to dark", () => {
    assert.equal(DEFAULT_THEME, "dark")
    for (const value of ["light", "dark", "ruby"]) assert.equal(parseStoredTheme(value), value)
    for (const value of [null, undefined, "", "Ruby", "purple", 1]) assert.equal(parseStoredTheme(value), "dark")
})

test("ruby keeps every dark style and adds the ruby class", () => {
    assert.deepEqual(themeAttributes("ruby"), { classes: ["dark", "ruby"], dataTheme: "dark", colorScheme: "dark" })
    assert.deepEqual(themeAttributes("dark"), { classes: ["dark"], dataTheme: "dark", colorScheme: "dark" })
    assert.deepEqual(themeAttributes("light"), { classes: ["light"], dataTheme: "light", colorScheme: "light" })
})

function runBootScript(stored) {
    const classes = new Set(["light", "dark", "ruby"])
    const attributes = {}
    const style = {}
    const document = {
        documentElement: {
            classList: {
                remove: (...names) => names.forEach((name) => classes.delete(name)),
                add: (...names) => names.forEach((name) => classes.add(name)),
            },
            setAttribute: (name, value) => {
                attributes[name] = value
            },
            style,
        },
    }
    const localStorage = { getItem: () => stored }
    new Function("document", "localStorage", themeBootScript())(document, localStorage)
    return { classes: [...classes].sort(), dataTheme: attributes["data-theme"], colorScheme: style.colorScheme }
}

test("the boot script applies the stored theme exactly like the provider", () => {
    for (const stored of [...THEMES, null, "", "purple"]) {
        const expected = themeAttributes(parseStoredTheme(stored))
        assert.deepEqual(
            runBootScript(stored),
            { classes: [...expected.classes].sort(), dataTheme: expected.dataTheme, colorScheme: expected.colorScheme },
            String(stored),
        )
    }
})
