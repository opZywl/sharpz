const script = `(() => {
  try {
    const storageKey = 'theme';
    const root = document.documentElement;
    const stored = localStorage.getItem(storageKey);
    const theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
  } catch (error) { /* ignore */ }
})();`

export function ThemeScript() {
    return <script dangerouslySetInnerHTML={{ __html: script }} />
}
