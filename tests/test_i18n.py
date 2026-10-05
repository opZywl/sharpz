import io
import json
import os
import string
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient
from PIL import Image

import imgpdf.jobs as imgpdf_jobs
import packages
import server
import src.processor as processor
from src import ktx
from src.i18n import DEFAULT_LANG, MESSAGES, SUPPORTED_LANGS, accept_language, normalize_lang, resolve_lang, t, use_lang
from transcribe import engine, jobs

REPO_ROOT = Path(__file__).resolve().parent.parent
EN = {"Accept-Language": "en-US,en;q=0.9"}
PT = {"Accept-Language": "pt-BR,pt;q=0.9"}


def png_bytes(size=(48, 32)):
    buffer = io.BytesIO()
    Image.new("RGB", size, (250, 250, 250)).save(buffer, format="PNG")
    return buffer.getvalue()


def raising(exc):
    def fake(*args, **kwargs):
        raise exc

    return fake


def wait_until(predicate, timeout=30.0, interval=0.05):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(interval)
    raise AssertionError("condition not met in time")


def placeholders(text):
    return sorted({field for _, field, _, _ in string.Formatter().parse(text) if field})


class CatalogTests(unittest.TestCase):
    def test_every_message_has_both_languages_with_the_same_placeholders(self):
        for key, entry in MESSAGES.items():
            with self.subTest(key=key):
                self.assertEqual(set(entry), set(SUPPORTED_LANGS))
                self.assertTrue(all(entry[lang].strip() for lang in SUPPORTED_LANGS))
                if key != "complete.docs.prompt":
                    self.assertEqual(placeholders(entry["pt-BR"]), placeholders(entry["en"]))

    def test_every_message_formats_with_its_placeholders(self):
        for key, entry in MESSAGES.items():
            if key == "complete.docs.prompt":
                continue
            values = {name: 1 for name in placeholders(entry["pt-BR"])}
            for lang in SUPPORTED_LANGS:
                with self.subTest(key=key, lang=lang):
                    self.assertTrue(t(key, lang, **values))

    def test_translate_formats_and_falls_back_to_the_active_language(self):
        self.assertEqual(t("server.batch.path_missing", "en", path="C:/x"), "Path not found: C:/x")
        self.assertEqual(t("server.batch.path_missing", path="C:/x"), "Caminho não encontrado: C:/x")
        with use_lang("en"):
            self.assertEqual(t("server.file_empty"), "The file is empty.")
            self.assertEqual(t("server.file_empty", "pt-BR"), "Arquivo vazio.")
        self.assertEqual(t("server.file_empty"), "Arquivo vazio.")


class LanguageResolutionTests(unittest.TestCase):
    def test_normalize_lang(self):
        cases = {
            "en": "en",
            "EN-us": "en",
            "en_GB": "en",
            "pt": "pt-BR",
            "pt-PT": "pt-BR",
            "PT-br": "pt-BR",
            "fr": None,
            "*": None,
            "": None,
            None: None,
        }
        for value, expected in cases.items():
            with self.subTest(value=value):
                self.assertEqual(normalize_lang(value), expected)

    def test_accept_language_respects_quality(self):
        self.assertEqual(accept_language("fr-FR,fr;q=0.9,en-US;q=0.8,pt;q=0.7"), "en")
        self.assertEqual(accept_language("en;q=0.4, pt-BR;q=0.8"), "pt-BR")
        self.assertEqual(accept_language("de, en;q=0"), None)
        self.assertEqual(accept_language("en;q=abc, pt"), "pt-BR")
        self.assertIsNone(accept_language(""))
        self.assertIsNone(accept_language(None))

    def test_query_beats_header_and_default_is_portuguese(self):
        self.assertEqual(resolve_lang("en", "pt-BR"), "en")
        self.assertEqual(resolve_lang("pt-BR", "en"), "pt-BR")
        self.assertEqual(resolve_lang("xx", "en-US"), "en")
        self.assertEqual(resolve_lang(None, "fr-FR"), DEFAULT_LANG)
        self.assertEqual(resolve_lang(), "pt-BR")


class ApiLanguageTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app, raise_server_exceptions=False)
        self.originals = {name: getattr(processor, name) for name in ("_luma_key",)}

    def tearDown(self):
        for name, value in self.originals.items():
            setattr(processor, name, value)

    def labels(self, response):
        self.assertEqual(response.status_code, 200, response.text)
        return {item["key"]: item for item in response.json()["models"]}

    def test_models_follow_the_request_language(self):
        default = self.labels(self.client.get("/api/models"))
        english = self.labels(self.client.get("/api/models", headers=EN))
        self.assertEqual(default["birefnet-general"]["label"], "BiRefNet (qualidade máxima)")
        self.assertEqual(english["birefnet-general"]["label"], "BiRefNet (best quality)")
        self.assertEqual(english["isnet-general-use"]["label"], "ISNet (fast)")
        self.assertTrue(english["isnet-general-use"]["detail"].startswith("Light and fast"))
        self.assertEqual(set(default), set(english))

    def test_lang_query_param_wins_over_the_header(self):
        english = self.labels(self.client.get("/api/models?lang=en", headers=PT))
        portuguese = self.labels(self.client.get("/api/models?lang=pt-BR", headers=EN))
        self.assertEqual(english["u2net"]["label"], "U2Net (lightest)")
        self.assertEqual(portuguese["u2net"]["label"], "U2Net (mais leve)")

    def test_validation_errors_in_english(self):
        empty = self.client.post("/api/clean", files={"file": ("a.png", b"", "image/png")}, headers=EN)
        self.assertEqual(empty.status_code, 400)
        self.assertEqual(empty.json()["detail"], "The file is empty.")
        invalid = self.client.post("/api/clean", files={"file": ("a.png", b"not an image", "image/png")}, headers=EN)
        self.assertTrue(invalid.json()["detail"].startswith("Invalid image or unsupported format"))
        model = self.client.post(
            "/api/clean", files={"file": ("a.png", png_bytes(), "image/png")}, data={"model": "nope"}, headers=EN,
        )
        self.assertEqual(model.json()["detail"], "Unknown model: nope. Pick a model from the list.")

    def test_remote_requests_are_refused_in_the_request_language(self):
        remote = TestClient(server.app, base_url="http://example.com")
        english = remote.get("/api/health", headers=EN)
        portuguese = remote.get("/api/health")
        self.assertEqual((english.status_code, portuguese.status_code), (403, 403))
        self.assertEqual(english.json()["detail"], "Requests are only accepted from this computer.")
        self.assertEqual(portuguese.json()["detail"], "O servidor só aceita requisições deste computador.")

    def test_unknown_transcription_model_in_english(self):
        response = self.client.post("/api/transcribe/models/nope/download", headers=EN)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Unknown model: nope.")
        self.assertEqual(self.client.get("/api/transcribe/models/nope/download").json()["detail"], "Modelo desconhecido: nope.")

    def test_not_found_uses_the_query_language_for_streams_and_downloads(self):
        stream = self.client.get("/api/transcribe/jobs/missing/stream?lang=en")
        self.assertEqual(stream.status_code, 404)
        self.assertEqual(stream.json()["detail"], "Job not found.")
        download = self.client.get("/api/image-to-pdf/jobs/missing/download?lang=en")
        self.assertEqual(download.json()["detail"], "Job not found.")
        self.assertEqual(self.client.get("/api/image-to-pdf/jobs/missing").json()["detail"], "Job não encontrado.")

    def test_memory_and_unexpected_errors_in_english(self):
        processor._luma_key = raising(MemoryError())
        memory = self.client.post(
            "/api/clean", files={"file": ("a.png", png_bytes(), "image/png")}, data={"method": "luma_dark"}, headers=EN,
        )
        self.assertEqual(memory.status_code, 503)
        self.assertEqual(memory.json()["code"], "memoria_insuficiente")
        self.assertTrue(memory.json()["detail"].startswith("Not enough memory to finish the operation"))

        processor._luma_key = raising(RuntimeError("boom"))
        crash = self.client.post(
            "/api/clean?lang=en", files={"file": ("a.png", png_bytes(), "image/png")}, data={"method": "luma_dark"},
        )
        self.assertEqual(crash.status_code, 500)
        self.assertEqual(crash.json()["detail"], "Unexpected server error: boom")

    def test_model_memory_message_in_english(self):
        with use_lang("en"):
            message = processor.memory_message("birefnet-general", alpha_matting=True)
        self.assertIn("BiRefNet (best quality)", message)
        self.assertIn("ISNet (fast) or BiRefNet Lite (detailed)", message)
        self.assertIn("Turning off Alpha matting", message)

    def test_batch_summary_in_english(self):
        missing = str(Path(tempfile.gettempdir(), "sharpz-missing-folder"))
        response = self.client.post(
            "/api/batch/pipeline", data={"input_path": missing, "output_dir": "out"}, headers=EN,
        )
        self.assertTrue(response.json()["summary"].startswith("Path not found:"))

    def test_image_to_pdf_job_keeps_its_language(self):
        output = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(output.cleanup)
        root = Path(output.name)
        for patcher in (
            mock.patch.object(imgpdf_jobs, "OUTPUT_ROOT", root),
            mock.patch.object(server, "IMGPDF_UPLOAD_DIR", root / "_uploads"),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        created = self.client.post(
            "/api/image-to-pdf",
            files={"file": ("doc.png", png_bytes((120, 160)), "image/png")},
            data={"ocr_engine": "tesseract", "page_mode": "auto", "verify": "false"},
            headers=EN,
        )
        self.assertEqual(created.status_code, 200, created.text)
        job_id = created.json()["job_id"]
        state = wait_until(
            lambda: (lambda job: job if job["status"] in ("done", "error") else None)(
                self.client.get(f"/api/image-to-pdf/jobs/{job_id}", headers=PT).json()
            ),
            timeout=120,
        )
        self.assertEqual(state["status"], "done", state)
        messages = [entry["message"] for entry in state["logs"]]
        self.assertTrue(any(message.startswith("Image loaded:") for message in messages), messages)
        self.assertEqual(messages[-1], "Done.")
        self.assertEqual(state["manifest"]["pdf_name"], "document.pdf")
        english = self.client.get(f"/api/image-to-pdf/jobs/{job_id}/download?lang=en")
        portuguese = self.client.get(f"/api/image-to-pdf/jobs/{job_id}/download")
        self.assertIn("document.pdf", english.headers["content-disposition"])
        self.assertIn("documento.pdf", portuguese.headers["content-disposition"])


class BackgroundJobLanguageTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.root = Path(self._tmp.name)
        self.stores = []

    def tearDown(self):
        for store in self.stores:
            with store._lock:
                job_ids = list(store._jobs)
            for job_id in job_ids:
                store.cancel(job_id)
            store.worker.shutdown()
        time.sleep(0.2)
        self._tmp.cleanup()

    def make_store(self, worker_source):
        script = self.root / "fake_worker.py"
        script.write_text(worker_source, encoding="utf-8")
        store = jobs.JobStore(
            output_root=self.root / "out",
            worker_cmd=[sys.executable, str(script)],
            engine_cmd=[sys.executable, str(script)],
            heartbeat_s=0.2,
            use_worker=True,
        )
        self.stores.append(store)
        return store

    def options(self, path):
        return {
            "input_path": str(path) if path else None,
            "url": None,
            "source_sha1": None,
            "model": "base",
            "language": "pt",
            "formats": ["txt"],
            "vad": True,
            "word_timestamps": False,
            "diarize": False,
            "translate": False,
            "hf_token": None,
            "min_speakers": None,
            "max_speakers": None,
            "threads": None,
            "mode": "standard",
            "frame_interval": 3.0,
            "scene_threshold": 0.3,
            "gen_docs": False,
            "vision": {"base_url": "", "api_key": "", "model": ""},
            "output_dir": None,
            "output_name": None,
            "make_zip": False,
            "open_folder": False,
        }

    def finished(self, store, job_id):
        return wait_until(lambda: (lambda job: job if job["status"] in ("done", "error", "canceled") else None)(store.get(job_id)))

    def test_transcription_errors_use_the_language_of_the_request_that_created_the_job(self):
        store = self.make_store("import sys\nsys.exit(0)\n")
        with use_lang("en"):
            english_id, _ = store.enqueue(self.options(None))
        portuguese_id, _ = store.enqueue({**self.options(None), "model": "small"})
        self.assertEqual(self.finished(store, english_id)["error"], "No audio source available for this job.")
        self.assertEqual(self.finished(store, portuguese_id)["error"], "Nenhuma fonte de áudio disponível para este job.")

    def test_worker_receives_the_job_language(self):
        worker = (
            "import json, sys\n"
            "for raw in sys.stdin:\n"
            "    request = json.loads(raw)\n"
            "    print(json.dumps({'type': 'error', 'message': request.get('lang'), 'job_id': request['job_id']}), flush=True)\n"
        )
        store = self.make_store(worker)
        media = self.root / "audio.ogg"
        media.write_text("ok", encoding="utf-8")
        with use_lang("en"):
            job_id, _ = store.enqueue(self.options(media))
        self.assertEqual(self.finished(store, job_id)["error"], "en")

    def test_model_download_failure_keeps_its_language(self):
        downloads = jobs.ModelDownloads(
            command=lambda key: [sys.executable, "-c", "print('broken'); raise SystemExit(3)"],
            hub=self.root / "hub",
            log_path=self.root / "log.txt",
        )
        with use_lang("en"):
            self.assertEqual(downloads.start("base"), "running")
        state = wait_until(lambda: (lambda s: s if s["status"] == "error" else None)(downloads.status("base")))
        self.assertEqual(state["error"], "Could not download the base model. Details: broken")

    def test_package_install_log_uses_the_job_language(self):
        package = packages.Package(
            id="fake", name="packages.ffmpeg.name", description="packages.ffmpeg.description",
            category="opcional", optional=True, size_hint="~1 MB",
            checker=lambda: (False, t("packages.detail.not_found")),
            installer=lambda emit: emit(t("packages.log.uv_missing")) or 1,
        )
        job = packages._InstallJob("job", "fake")
        packages.MANAGER._run(job, package, "en")
        log = job.snapshot()["log"]
        self.assertEqual(log[0], "== Installing: FFmpeg (~1 MB) ==")
        self.assertEqual(log[1], "[error] 'uv' not found. Install the 'uv' package first.")
        self.assertEqual(job.status, "error")

    def test_package_list_is_translated(self):
        for package in packages.PACKAGES:
            with self.subTest(package=package.id):
                self.assertTrue(t(package.name, "en"))
                self.assertTrue(t(package.description, "en"))
                self.assertTrue(all(t(key, "en") for key in package.unlocks))
        self.assertEqual(t("packages.uv.name", "en"), "uv (Python manager)")
        self.assertEqual(t("packages.uv.name"), "uv (gerenciador Python)")

    def test_ktx_messages_follow_the_language_inside_worker_threads(self):
        missing = [self.root / "a.png", self.root / "b.png"]
        with use_lang("en"):
            results = ktx.batch_convert(missing, self.root / "ktx", max_workers=2)
            summary = ktx.summarize(results)
        self.assertTrue(all(result.error.startswith("The input image does not exist") for result in results))
        self.assertIn("failed", summary)
        self.assertEqual(ktx.summarize([]), "Nenhuma imagem processada.")

    def test_engine_messages_follow_the_job_language(self):
        with use_lang("en"):
            self.assertEqual(engine.speaker_label("SPEAKER_01"), "Speaker 2")
            self.assertEqual(engine.describe_error(MemoryError(), "base"), (
                "Not enough memory to run the base model. Close heavy programs or pick a smaller model and try again."
            ))
        self.assertEqual(engine.speaker_label("SPEAKER_00"), "Locutor 1")

    def test_engine_cli_reads_the_language_from_its_environment(self):
        env = {**os.environ, "SHARPZ_ENGINE_LANG": "en", "PYTHONUTF8": "1"}
        result = subprocess.run(
            [sys.executable, "-m", "transcribe.engine", "--input", str(self.root / "gone.ogg"),
             "--out-dir", str(self.root / "cli"), "--job-id", "cli", "--model", "base"],
            cwd=str(REPO_ROOT), capture_output=True, text=True, encoding="utf-8", timeout=120, env=env,
        )
        self.assertEqual(result.returncode, 1, result.stderr)
        event = json.loads(result.stdout.strip().splitlines()[-1])
        self.assertEqual(event["type"], "error")
        self.assertTrue(event["message"].startswith("Transcription failed: File not found"), event)


if __name__ == "__main__":
    unittest.main(verbosity=2)
