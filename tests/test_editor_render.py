import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

import fitz

from imgpdf import editor

CSP = (
    "<meta http-equiv=\"Content-Security-Policy\" content=\"script-src 'none'; object-src 'none'; "
    "frame-src 'none'; base-uri 'none'; form-action 'none'\">"
)
HOSTILE_HTML = (
    "<!doctype html><html><head><meta charset='utf-8'>"
    "<style>@page{size:300pt 200pt;margin:0}body{background:#ffffff}</style></head>"
    "<body><p style='font-size:40px'>STATIC</p>"
    "<script>document.body.innerHTML = \"<p style='font-size:40px'>SCRIPT RAN</p>\";"
    "document.body.style.background = '#ff0000'</script>"
    "<iframe srcdoc=\"<script>parent.document.body.innerHTML = 'IFRAME RAN'</script>\"></iframe>"
    "</body></html>"
)
REPO = Path(__file__).resolve().parent.parent
RED_JS = (
    "<script>addEventListener('load',function(){document.documentElement.style.background='#ff0000';"
    "document.body.style.background='#ff0000'})</script>"
)
RED_TAIL = "<html><head></head><body style='background:#ffffff'><p>x</p></body></html>"
BYPASSES = {
    "empty comment": "<!-->" + RED_JS + "<!-- --><!doctype html>" + RED_TAIL,
    "dash comment": "<!--->" + RED_JS + "<!-- --><!doctype html>" + RED_TAIL,
    "bang close comment": "<!-- --!>" + RED_JS + "<!-- --><!doctype html>" + RED_TAIL,
    "x1c before doctype": "<!doctype html>" + RED_JS + RED_TAIL,
    "nbsp before doctype": " <!doctype html>" + RED_JS + RED_TAIL,
}


def _fake_chrome(calls, pages):
    def run(argv, **kwargs):
        calls.append(list(argv))
        pages.append(Path(argv[-1][len("file:///"):]).read_text(encoding="utf-8"))
        for arg in argv:
            for prefix in ("--print-to-pdf=", "--screenshot="):
                if arg.startswith(prefix):
                    Path(arg[len(prefix):]).write_bytes(b"out")
        return mock.Mock(returncode=0)
    return run


class ChromeLockdownTests(unittest.TestCase):
    def _render(self, kind, html="<!doctype html><html><head></head><body><p>x</p></body></html>"):
        calls, pages = [], []
        with mock.patch.object(editor, "_find_chrome", return_value="chrome.exe"), \
                mock.patch.object(editor.subprocess, "run", side_effect=_fake_chrome(calls, pages)):
            if kind == "pdf":
                self.assertEqual(editor.render_html_pdf(html), b"out")
            else:
                self.assertEqual(editor.render_html_png(html, 595, 842), b"out")
        self.assertEqual(len(calls), 1)
        return calls[0], pages[0]

    def test_csp_blocks_scripts_before_any_page_content(self):
        html = "<!doctype html><html style=\"\"><script>x()</script><head></head><body></body></html>"
        for kind in ("pdf", "png"):
            with self.subTest(render=kind):
                _, page = self._render(kind, html)
                self.assertEqual(page, "<!doctype html>" + CSP + html[len("<!doctype html>"):])

    def test_csp_goes_after_a_leading_doctype_and_first_otherwise(self):
        cases = {
            "<!DOCTYPE html>\n<html></html>": "<!DOCTYPE html>" + CSP + "\n<html></html>",
            "\ufeff \t\f\n<!doctype html><p>x</p>": "\ufeff \t\f\n<!doctype html>" + CSP + "<p>x</p>",
            "\ufeff \n<!-- a --><!doctype html><p>x</p>": CSP + "\ufeff \n<!-- a --><!doctype html><p>x</p>",
            "<html><body>x</body></html>": CSP + "<html><body>x</body></html>",
            "": CSP,
        }
        for html, expected in cases.items():
            with self.subTest(html=html):
                self.assertEqual(self._render("pdf", html)[1], expected)

    def test_csp_goes_first_when_anything_but_html_whitespace_precedes_the_doctype(self):
        for name, html in BYPASSES.items():
            with self.subTest(case=name):
                self.assertEqual(self._render("pdf", html)[1], CSP + html)

    def test_many_comments_do_not_hang_the_csp_placement(self):
        code = "from imgpdf import editor; editor._locked_html('<!---->' * 60 + 'x')"
        try:
            subprocess.run([sys.executable, "-c", code], cwd=REPO, timeout=30, check=True, capture_output=True)
        except subprocess.TimeoutExpired:
            self.fail("_locked_html backtracks on repeated comments")

    def test_png_window_size_is_clamped(self):
        cases = {(1e7, 1e7): "--window-size=19200,19200", (-5, 0): "--window-size=1,1",
                 (float("inf"), float("nan")): "--window-size=793,1123"}
        for (w, h), flag in cases.items():
            with self.subTest(w=w, h=h):
                calls, pages = [], []
                with mock.patch.object(editor, "_find_chrome", return_value="chrome.exe"),                         mock.patch.object(editor.subprocess, "run", side_effect=_fake_chrome(calls, pages)):
                    editor.render_html_png("<p>x</p>", w, h)
                self.assertIn(flag, calls[0])

    def test_only_google_fonts_hosts_resolve(self):
        for kind in ("pdf", "png"):
            with self.subTest(render=kind):
                rules = [a for a in self._render(kind)[0] if a.startswith("--host-resolver-rules=")]
                self.assertEqual(len(rules), 1)
                self.assertIn("MAP * ~NOTFOUND", rules[0])
                self.assertIn("EXCLUDE fonts.googleapis.com", rules[0])
                self.assertIn("EXCLUDE fonts.gstatic.com", rules[0])

    def test_existing_flags_are_kept(self):
        pdf = self._render("pdf")[0]
        for flag in ("--headless", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer", "--virtual-time-budget=3500"):
            self.assertIn(flag, pdf)
        self.assertTrue(pdf[-1].startswith("file:///"))
        png = self._render("png")[0]
        for flag in ("--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
                     "--force-device-scale-factor=2", "--virtual-time-budget=3500", "--window-size=793,1123"):
            self.assertIn(flag, png)
        self.assertTrue(png[-1].startswith("file:///"))


@unittest.skipUnless(editor._find_chrome(), "Google Chrome not installed")
class RealChromeTests(unittest.TestCase):
    def test_script_in_export_pdf_does_not_run(self):
        pdf = editor.render_html_pdf(HOSTILE_HTML)
        with fitz.open(stream=pdf, filetype="pdf") as doc:
            text = "".join(page.get_text() for page in doc)
        self.assertIn("STATIC", text)
        self.assertNotIn("SCRIPT RAN", text)
        self.assertNotIn("IFRAME RAN", text)

    def test_script_in_export_png_does_not_run(self):
        png = editor.render_html_png(HOSTILE_HTML, 300, 200, scale=1)
        pix = fitz.Pixmap(png)
        self.assertEqual(tuple(pix.pixel(pix.width - 5, pix.height - 5))[:3], (255, 255, 255))

    def test_markup_before_the_doctype_cannot_run_scripts(self):
        for name, html in BYPASSES.items():
            with self.subTest(case=name):
                pix = fitz.Pixmap(editor.render_html_png(html, 300, 200, scale=1))
                self.assertNotEqual(tuple(pix.pixel(pix.width - 5, pix.height - 5))[:3], (255, 0, 0))


if __name__ == "__main__":
    unittest.main()
