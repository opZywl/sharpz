import importlib.util
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import packages  # noqa: E402
from src.i18n import t  # noqa: E402


def make_snapshot(hub: Path, repo: str, commit: str = "abc123", with_model: bool = True) -> Path:
    folder = hub / ("models--" + repo.replace("/", "--"))
    snapshot = folder / "snapshots" / commit
    snapshot.mkdir(parents=True, exist_ok=True)
    (snapshot / "config.json").write_text("{}", encoding="utf-8")
    if with_model:
        (snapshot / "model.bin").write_bytes(b"0" * 64)
        (folder / "refs").mkdir(parents=True, exist_ok=True)
        (folder / "refs" / "main").write_text(commit, encoding="utf-8")
    return folder


def load_download_tool():
    spec = importlib.util.spec_from_file_location("sharpz_download_model", REPO_ROOT / "tools" / "download_model.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ModelPackageTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.root = Path(self._tmp.name)
        self.hub = self.root / "hub"
        self.hub.mkdir()
        env = mock.patch.dict(os.environ, {"HF_HUB_CACHE": str(self.hub)})
        env.start()
        self.addCleanup(env.stop)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_turbo_is_required_and_large_v3_is_optional(self) -> None:
        turbo = packages.PACKAGES_BY_ID["model_large_v3_turbo"]
        large = packages.PACKAGES_BY_ID["model_large_v3"]
        self.assertFalse(turbo.optional)
        self.assertTrue(large.optional)
        self.assertEqual(turbo.category, "transcricao")
        self.assertIn("packages.unlock.transcription_fast", turbo.unlocks)
        self.assertTrue(t(turbo.name, "en") and t(turbo.description, "en") and t(turbo.manual_hint, "en"))

    def test_checkers_follow_the_hub_cache_of_each_model(self) -> None:
        turbo = packages.PACKAGES_BY_ID["model_large_v3_turbo"]
        large = packages.PACKAGES_BY_ID["model_large_v3"]
        self.assertEqual(turbo.checker(), (False, t("packages.detail.model_missing", model="large-v3-turbo")))

        make_snapshot(self.hub, "mobiuslabsgmbh/faster-whisper-large-v3-turbo")
        installed, detail = turbo.checker()
        self.assertTrue(installed)
        self.assertIn("large-v3-turbo", detail)
        self.assertEqual(large.checker(), (False, t("packages.detail.model_missing", model="large-v3")))

        partial = make_snapshot(self.hub, "Systran/faster-whisper-large-v3", with_model=False)
        (partial / "blobs").mkdir()
        (partial / "blobs" / "x.incomplete").write_bytes(b"1" * 100)
        self.assertEqual(large.checker(), (False, t("packages.detail.model_partial")))

    def test_installers_download_their_own_model(self) -> None:
        python = self.root / "python.exe"
        python.write_bytes(b"")
        calls: list[list[str]] = []

        def fake_stream(args, emit, cwd=None, env=None):
            calls.append([str(arg) for arg in args])
            return 0

        with mock.patch.object(packages, "WHISPER_PY", python), mock.patch.object(packages, "_stream_cmd", fake_stream):
            packages.PACKAGES_BY_ID["model_large_v3_turbo"].installer(lambda line: None)
            packages.PACKAGES_BY_ID["model_large_v3"].installer(lambda line: None)
        self.assertEqual(calls[0][-1], "large-v3-turbo")
        self.assertEqual(calls[1][-1], "large-v3")
        self.assertTrue(all(call[1].endswith("download_model.py") for call in calls))

    def test_download_tool_defaults_to_the_fast_model(self) -> None:
        tool = load_download_tool()
        utils = types.SimpleNamespace(
            _MODELS={"large-v3": "Systran/faster-whisper-large-v3", "large-v3-turbo": "mobiuslabsgmbh/x"},
            download_model=mock.MagicMock(return_value=str(self.root / "model")),
        )
        with mock.patch.object(tool, "faster_whisper_utils", return_value=utils):
            self.assertEqual(tool.main(["download_model.py"]), 0)
            self.assertEqual(tool.main(["download_model.py", "large-v3"]), 0)
        self.assertEqual([call.args[0] for call in utils.download_model.call_args_list], ["large-v3-turbo", "large-v3"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
