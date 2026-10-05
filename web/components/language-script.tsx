import { DEFAULT_LANG, LANG_ATTRIBUTE, LANG_PENDING_ATTRIBUTE, LANG_STORAGE_KEY } from "@/lib/i18n/config"

const script = `(() => {
  try {
    var root = document.documentElement;
    var stored = null;
    try {
      stored = localStorage.getItem(${JSON.stringify(LANG_STORAGE_KEY)});
    } catch (error) {
      stored = null;
    }
    var browser = (navigator.language || "").toLowerCase();
    var lang = stored === "en" || stored === "pt-BR" ? stored : browser.indexOf("pt") === 0 ? "pt-BR" : "en";
    root.lang = lang;
    root.setAttribute(${JSON.stringify(LANG_ATTRIBUTE)}, lang);
    if (lang !== ${JSON.stringify(DEFAULT_LANG)}) {
      root.setAttribute(${JSON.stringify(LANG_PENDING_ATTRIBUTE)}, "");
      setTimeout(function () {
        root.removeAttribute(${JSON.stringify(LANG_PENDING_ATTRIBUTE)});
      }, 3000);
    }
  } catch (error) {
    document.documentElement.removeAttribute(${JSON.stringify(LANG_PENDING_ATTRIBUTE)});
  }
})();`

export function LanguageScript() {
    return <script dangerouslySetInnerHTML={{ __html: script }} />
}
