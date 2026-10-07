export type Theme = "light" | "dark" | "ruby"

export const THEMES: readonly Theme[] = ["light", "dark", "ruby"]
export const DEFAULT_THEME: Theme = "dark"
export const THEME_CLASSES: readonly string[] = ["light", "dark", "ruby"]

export function parseStoredTheme(value: unknown): Theme {
    return value === "light" || value === "dark" || value === "ruby" ? value : DEFAULT_THEME
}

export function nextTheme(theme: Theme): Theme {
    return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]
}

export function themeAttributes(theme: Theme): { classes: string[]; dataTheme: "light" | "dark"; colorScheme: "light" | "dark" } {
    if (theme === "ruby") return { classes: ["dark", "ruby"], dataTheme: "dark", colorScheme: "dark" }
    return { classes: [theme], dataTheme: theme, colorScheme: theme }
}

export function themeBootScript(): string {
    return `(() => {
  try {
    const root = document.documentElement;
    const stored = localStorage.getItem('theme');
    const theme = ${JSON.stringify(THEMES)}.includes(stored) ? stored : '${DEFAULT_THEME}';
    const base = theme === 'ruby' ? 'dark' : theme;
    root.classList.remove(${THEME_CLASSES.map((name) => `'${name}'`).join(", ")});
    root.classList.add(base);
    if (theme === 'ruby') root.classList.add('ruby');
    root.setAttribute('data-theme', base);
    root.style.colorScheme = base;
  } catch (error) {}
})();`
}
