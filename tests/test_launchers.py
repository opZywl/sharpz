import os
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MENU = ROOT / "sharpz.cmd"
SCRIPTS = sorted((ROOT / "scripts").glob("*.cmd"))
LANGUAGES = ROOT / "scripts" / "languages"
LANGUAGE_FILES = sorted(LANGUAGES.glob("*.cmd"))
EXPECTED_SCRIPTS = {"sharpz-setup.cmd", "sharpz-dev.cmd", "sharpz-prod.cmd", "sharpz-smoke.cmd"}
EXPECTED_LANGUAGE_FILES = {"load.cmd", "en.cmd", "pt-BR.cmd"}
ROOT_LINE = 'for %%I in ("%~dp0..") do set "ROOT=%%~fI"'
TEXT_LINE = re.compile(r'^set "(T_[A-Z0-9_]+)=(.*)"$')
TEXT_USE = re.compile(r"!(T_[A-Z0-9_]+)!")
DELAYED_VARIABLE = re.compile(r"![A-Za-z_][A-Za-z0-9_]*!")


def unescaped_parens_inside_blocks(text):
    depth = 0
    problems = []
    for number, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        lower = line.lower()
        if not line or lower.startswith("rem ") or line.startswith("::"):
            continue
        body = re.sub(r'"[^"]*"', '""', re.sub(r"\^.", "", line))
        if lower.startswith("echo") or lower.startswith("<nul set /p"):
            if depth > 0 and ")" in body:
                problems.append(number)
            continue
        depth = max(depth + body.count("(") - body.count(")"), 0)
    return problems, depth


def texts(language):
    found = {}
    for line in (LANGUAGES / f"{language}.cmd").read_text(encoding="ascii").splitlines():
        match = TEXT_LINE.match(line)
        if match:
            found[match.group(1)] = match.group(2)
    return found


def run_menu(language, *args):
    env = {**os.environ, "SHARPZ_LANG": language}
    return subprocess.run(
        ["cmd", "/d", "/c", "call", str(MENU), *args],
        cwd=ROOT,
        env=env,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        timeout=60,
    )


class LauncherTests(unittest.TestCase):
    def test_menu_scripts_and_languages_exist(self):
        self.assertTrue(MENU.is_file())
        self.assertEqual({path.name for path in SCRIPTS}, EXPECTED_SCRIPTS)
        self.assertEqual({path.name for path in LANGUAGE_FILES}, EXPECTED_LANGUAGE_FILES)

    def test_no_unescaped_parenthesis_inside_blocks(self):
        for path in [MENU, *SCRIPTS, *LANGUAGE_FILES]:
            with self.subTest(script=path.name):
                problems, depth = unescaped_parens_inside_blocks(path.read_text(encoding="ascii"))
                self.assertEqual(problems, [], f"lines with ')' not escaped with ^ inside a block: {problems}")
                self.assertEqual(depth, 0)

    def test_checker_catches_the_known_bug(self):
        broken = 'if errorlevel 1 (\r\n  echo a transcricao (faster-whisper) continua.\r\n)\r\n'
        fixed = 'if errorlevel 1 (\r\n  echo a transcricao ^(faster-whisper^) continua.\r\n)\r\n'
        self.assertEqual(unescaped_parens_inside_blocks(broken)[0], [2])
        self.assertEqual(unescaped_parens_inside_blocks(fixed)[0], [])

    def test_scripts_use_crlf_and_ascii(self):
        for path in [MENU, *SCRIPTS, *LANGUAGE_FILES]:
            with self.subTest(script=path.name):
                data = path.read_bytes()
                data.decode("ascii")
                self.assertNotIn(b"\n", data.replace(b"\r\n", b""), "bare LF line break")

    def test_scripts_resolve_the_repository_root(self):
        for path in SCRIPTS:
            with self.subTest(script=path.name):
                self.assertIn(ROOT_LINE, path.read_text(encoding="ascii"))

    def test_menu_points_to_existing_scripts(self):
        targets = set(re.findall(r"%SCRIPTS%\\([\w-]+\.cmd)", MENU.read_text(encoding="ascii")))
        self.assertEqual(targets, EXPECTED_SCRIPTS)

    def test_menu_and_scripts_load_the_language(self):
        self.assertIn(r'call "%SCRIPTS%\languages\load.cmd"', MENU.read_text(encoding="ascii"))
        for path in SCRIPTS:
            with self.subTest(script=path.name):
                self.assertIn(r'call "%~dp0languages\load.cmd"', path.read_text(encoding="ascii"))

    def test_both_languages_define_the_same_texts(self):
        english, portuguese = texts("en"), texts("pt-BR")
        self.assertTrue(english)
        self.assertEqual(sorted(english), sorted(portuguese))

    def test_every_text_used_is_defined(self):
        defined = set(texts("en"))
        for path in [MENU, *SCRIPTS]:
            with self.subTest(script=path.name):
                used = set(TEXT_USE.findall(path.read_text(encoding="ascii")))
                self.assertTrue(used)
                self.assertEqual(used - defined, set())

    def test_texts_survive_delayed_expansion(self):
        for language in ("en", "pt-BR"):
            for name, value in texts(language).items():
                with self.subTest(language=language, text=name):
                    self.assertTrue(value.strip())
                    self.assertNotIn("!", value)
                    self.assertNotIn("%", value)
                    self.assertNotIn("^", value)

    def test_no_stray_exclamation_marks_with_delayed_expansion(self):
        for path in [MENU, *SCRIPTS]:
            text = path.read_text(encoding="ascii")
            self.assertIn("enabledelayedexpansion", text)
            for number, line in enumerate(text.splitlines(), 1):
                with self.subTest(script=path.name, line=number):
                    self.assertNotIn("!", DELAYED_VARIABLE.sub("", line))

    def test_menu_accepts_english_and_portuguese_actions(self):
        text = MENU.read_text(encoding="ascii")
        for word, action in (
            ("1", "install"), ("2", "open"), ("3", "prod"), ("4", "test"),
            ("instalar", "install"), ("abrir", "open"), ("producao", "prod"), ("testar", "test"),
        ):
            with self.subTest(word=word):
                self.assertIn(f'if /i "%ACTION%"=="{word}" set "ACTION={action}"', text)

    @unittest.skipUnless(os.name == "nt", "the launcher only runs on Windows")
    def test_menu_runs_in_english(self):
        result = run_menu("en", "nao-existe")
        output = result.stdout.decode("utf-8", "replace")
        self.assertEqual(result.returncode, 1, output)
        self.assertIn("Invalid option: nao-existe", output)
        self.assertIn("sharpz.cmd install | open | prod | test", output)

    @unittest.skipUnless(os.name == "nt", "the launcher only runs on Windows")
    def test_menu_runs_in_portuguese(self):
        result = run_menu("pt-BR", "nao-existe")
        output = result.stdout.decode("utf-8", "replace")
        self.assertEqual(result.returncode, 1, output)
        self.assertIn("Opcao invalida: nao-existe", output)
        self.assertIn("sharpz.cmd instalar | abrir | producao | testar", output)

    @unittest.skipUnless(os.name == "nt", "the launcher only runs on Windows")
    def test_unknown_language_falls_back_to_english(self):
        output = run_menu("fr-FR", "nao-existe").stdout.decode("utf-8", "replace")
        self.assertIn("Invalid option: nao-existe", output)


if __name__ == "__main__":
    unittest.main(verbosity=2)
