import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MENU = ROOT / "sharpz.cmd"
SCRIPTS = sorted((ROOT / "scripts").glob("*.cmd"))
EXPECTED_SCRIPTS = {"sharpz-setup.cmd", "sharpz-dev.cmd", "sharpz-prod.cmd", "sharpz-smoke.cmd"}
ROOT_LINE = 'for %%I in ("%~dp0..") do set "ROOT=%%~fI"'


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


class LauncherTests(unittest.TestCase):
    def test_menu_and_scripts_exist(self):
        self.assertTrue(MENU.is_file())
        self.assertEqual({path.name for path in SCRIPTS}, EXPECTED_SCRIPTS)

    def test_no_unescaped_parenthesis_inside_blocks(self):
        for path in [MENU, *SCRIPTS]:
            with self.subTest(script=path.name):
                problems, depth = unescaped_parens_inside_blocks(path.read_text(encoding="ascii"))
                self.assertEqual(problems, [], f"linhas com ')' sem ^ dentro de bloco: {problems}")
                self.assertEqual(depth, 0)

    def test_checker_catches_the_known_bug(self):
        broken = 'if errorlevel 1 (\r\n  echo a transcricao (faster-whisper) continua.\r\n)\r\n'
        fixed = 'if errorlevel 1 (\r\n  echo a transcricao ^(faster-whisper^) continua.\r\n)\r\n'
        self.assertEqual(unescaped_parens_inside_blocks(broken)[0], [2])
        self.assertEqual(unescaped_parens_inside_blocks(fixed)[0], [])

    def test_scripts_use_crlf_and_ascii(self):
        for path in [MENU, *SCRIPTS]:
            with self.subTest(script=path.name):
                data = path.read_bytes()
                data.decode("ascii")
                self.assertNotIn(b"\n", data.replace(b"\r\n", b""), "quebra de linha LF solta")

    def test_scripts_resolve_the_repository_root(self):
        for path in SCRIPTS:
            with self.subTest(script=path.name):
                self.assertIn(ROOT_LINE, path.read_text(encoding="ascii"))

    def test_menu_points_to_existing_scripts(self):
        targets = set(re.findall(r"%SCRIPTS%\\([\w-]+\.cmd)", MENU.read_text(encoding="ascii")))
        self.assertEqual(targets, EXPECTED_SCRIPTS)


if __name__ == "__main__":
    unittest.main(verbosity=2)
