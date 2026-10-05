from __future__ import annotations

import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
import textwrap
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from transcribe import jobs  # noqa: E402

FAKE_WORKER = textwrap.dedent(
    """
    import json, os, sys, time
    from pathlib import Path

    loaded = False


    def emit(event):
        sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\\n")
        sys.stdout.flush()


    for raw in sys.stdin:
        if not raw.strip():
            continue
        request = json.loads(raw)
        job_id = request["job_id"]
        args = request["args"]

        def send(event):
            emit({**event, "job_id": job_id})

        out = Path(args["out_dir"])
        out.mkdir(parents=True, exist_ok=True)
        (out / "worker_args.json").write_text(json.dumps(args), encoding="utf-8")
        behavior = Path(args["input"]).read_text(encoding="utf-8").strip()
        if not loaded:
            send({"type": "stage", "stage": "load_model", "status": "start", "detail": args["model"]})
            loaded = True
            send({"type": "stage", "stage": "load_model", "status": "done", "detail": args["model"]})
        send({"type": "stage", "stage": "transcribe", "status": "start", "detail": ""})
        send({"type": "meta", "language": "pt", "duration": 4.0, "model": args["model"], "pid": os.getpid()})
        send({"type": "segment", "id": 0, "start": 0.0, "end": 2.0, "text": "linha 1", "speaker": None})
        send({"type": "progress", "pct": 0.5, "stage": "transcribe"})
        if behavior == "slow":
            time.sleep(60)
        if behavior == "crash":
            sys.stderr.write("MemoryError: sem memória\\n")
            sys.stderr.flush()
            os._exit(3)
        if behavior == "fail":
            send({"type": "error", "message": "Falha na transcrição: arquivo corrompido"})
            continue
        send({"type": "segment", "id": 1, "start": 2.0, "end": 4.0, "text": "linha 2", "speaker": None})
        send({"type": "progress", "pct": 1.0, "stage": "transcribe"})
        files = {}
        if "txt" in args["formats"].split(","):
            (out / "transcript.txt").write_text("linha 1\\nlinha 2\\n", encoding="utf-8")
            files["txt"] = "transcript.txt"
        send({"type": "done", "files": files, "segments": 2, "degraded": [], "elapsed": 0.1})
    """
)

FAKE_ENGINE = textwrap.dedent(
    """
    import argparse, json, os, sys
    from pathlib import Path

    parser = argparse.ArgumentParser()
    for name in ("--input", "--out-dir", "--job-id", "--model", "--language", "--formats", "--min-speakers", "--max-speakers", "--threads", "--hf-token"):
        parser.add_argument(name)
    for flag in ("--vad", "--word-timestamps", "--diarize", "--translate"):
        parser.add_argument(flag, action="store_true")
    args = parser.parse_args()


    def emit(event):
        sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\\n")
        sys.stdout.flush()


    emit({"type": "stage", "stage": "load_model", "status": "start", "detail": args.model})
    emit({"type": "meta", "language": "pt", "duration": 2.0, "model": args.model, "engine": True,
          "diarize": args.diarize, "has_token": bool(os.environ.get("HF_TOKEN")), "argv_token": "--hf-token" in sys.argv})
    emit({"type": "segment", "id": 0, "start": 0.0, "end": 2.0, "text": "fala", "speaker": "Locutor 1"})
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    files = {}
    if "srt" in args.formats.split(","):
        (out / "transcript.srt").write_text("1\\n00:00:00,000 --> 00:00:02,000\\n[Locutor 1] fala\\n", encoding="utf-8")
        files["srt"] = "transcript.srt"
    emit({"type": "done", "files": files, "segments": 1, "degraded": [], "elapsed": 0.1})
    """
)

FAKE_DOWNLOAD = textwrap.dedent(
    """
    import sys, time
    from pathlib import Path

    folder = Path(sys.argv[1])
    blobs = folder / "blobs"
    blobs.mkdir(parents=True, exist_ok=True)
    partial = blobs / "abc.incomplete"
    partial.write_bytes(b"x" * 1000)
    time.sleep(0.4)
    snapshot = folder / "snapshots" / "c0ffee"
    snapshot.mkdir(parents=True, exist_ok=True)
    (snapshot / "model.bin").write_bytes(b"m" * 2000)
    (folder / "refs").mkdir(parents=True, exist_ok=True)
    (folder / "refs" / "main").write_text("c0ffee", encoding="utf-8")
    partial.unlink()
    print("[ok] modelo pronto", flush=True)
    """
)

STUB_FASTER_WHISPER = textwrap.dedent(
    """
    import json
    import os


    class _Info:
        language = "pt"
        duration = 4.0


    class _Word:
        def __init__(self, start, end, word):
            self.start = start
            self.end = end
            self.word = word


    class _Segment:
        def __init__(self, start, end, text, words):
            self.start = start
            self.end = end
            self.text = text
            self.words = words


    def _log(entry):
        with open(os.environ["STUB_LOG"], "a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\\n")


    class WhisperModel:
        def __init__(self, path, device="cpu", compute_type="default", cpu_threads=0, local_files_only=False, **kwargs):
            _log({"event": "load", "path": path, "device": device, "compute_type": compute_type,
                  "cpu_threads": cpu_threads, "local_files_only": local_files_only, "pid": os.getpid()})

        def transcribe(self, audio, **options):
            _log({"event": "transcribe", "audio": audio, "options": options, "pid": os.getpid()})
            words = options.get("word_timestamps")
            segments = [
                _Segment(0.0, 2.0, " olá mundo", [_Word(0.0, 1.0, " olá"), _Word(1.0, 2.0, " mundo")] if words else None),
                _Segment(2.0, 4.0, " tudo bem", [_Word(2.0, 3.0, " tudo"), _Word(3.0, 4.0, " bem")] if words else None),
            ]
            return iter(segments), _Info()
    """
)

STUB_FASTER_WHISPER_UTILS = textwrap.dedent(
    """
    import os


    def download_model(size_or_id, output_dir=None, local_files_only=False, cache_dir=None, revision=None, use_auth_token=None):
        path = os.path.join(os.environ["STUB_MODELS"], size_or_id)
        if local_files_only:
            if not os.path.isfile(os.path.join(path, "model.bin")):
                raise RuntimeError("modelo fora do cache")
            return path
        os.makedirs(path, exist_ok=True)
        with open(os.path.join(path, "model.bin"), "w", encoding="utf-8") as handle:
            handle.write("x")
        return path
    """
)

ML_MODULES = ("faster_whisper", "ctranslate2", "torch", "whisperx", "pyannote")


def wait_until(predicate, timeout: float = 15.0, interval: float = 0.05):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(interval)
    raise AssertionError("condição não atingida a tempo")


def parse_frames(frames: list[str]) -> list[tuple[int, dict]]:
    parsed = []
    for frame in frames:
        if frame.startswith(":"):
            continue
        head, data = frame.split("\n", 1)
        assert head.startswith("id: "), frame
        assert data.startswith("data: ") and frame.endswith("\n\n"), frame
        parsed.append((int(head[4:]), json.loads(data[6:].strip())))
    return parsed


def make_snapshot(hub: Path, repo: str, commit: str = "abc123", with_ref: bool = True, with_model: bool = True) -> Path:
    folder = hub / ("models--" + repo.replace("/", "--"))
    snapshot = folder / "snapshots" / commit
    snapshot.mkdir(parents=True, exist_ok=True)
    (snapshot / "config.json").write_text("{}", encoding="utf-8")
    if with_model:
        (snapshot / "model.bin").write_bytes(b"0" * 64)
    if with_ref:
        (folder / "refs").mkdir(parents=True, exist_ok=True)
        (folder / "refs" / "main").write_text(commit, encoding="utf-8")
    return folder


class BackendTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.root = Path(self._tmp.name)
        self.scripts = self.root / "scripts"
        self.scripts.mkdir()
        self.fake_worker = self.scripts / "fake_worker.py"
        self.fake_worker.write_text(FAKE_WORKER, encoding="utf-8")
        self.fake_engine = self.scripts / "fake_engine.py"
        self.fake_engine.write_text(FAKE_ENGINE, encoding="utf-8")
        self.fake_download = self.scripts / "fake_download.py"
        self.fake_download.write_text(FAKE_DOWNLOAD, encoding="utf-8")
        self.stores: list[jobs.JobStore] = []

    def tearDown(self) -> None:
        for store in self.stores:
            with store._lock:
                job_ids = list(store._jobs)
            for job_id in job_ids:
                store.cancel(job_id)
            store.worker.shutdown()
        time.sleep(0.2)
        self._tmp.cleanup()

    def make_store(self, worker_cmd: list | None = None) -> jobs.JobStore:
        store = jobs.JobStore(
            output_root=self.root / "out",
            worker_cmd=worker_cmd or [sys.executable, str(self.fake_worker)],
            engine_cmd=[sys.executable, str(self.fake_engine)],
            heartbeat_s=0.2,
            use_worker=True,
        )
        self.stores.append(store)
        return store

    def make_input(self, behavior: str = "ok", name: str | None = None) -> Path:
        path = self.root / (name or f"input_{behavior}_{time.monotonic_ns()}.ogg")
        path.write_text(behavior, encoding="utf-8")
        return path

    def options(self, path: Path | None, **extra) -> dict:
        base = {
            "input_path": str(path) if path else None,
            "url": None,
            "source_sha1": None,
            "model": "base",
            "language": "pt",
            "formats": ["txt", "srt"],
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
        base.update(extra)
        return base

    def run_job(self, store: jobs.JobStore, options: dict) -> tuple[str, list[tuple[int, dict]]]:
        job_id, deduped = store.enqueue(options)
        self.assertFalse(deduped)
        events = parse_frames(list(store.stream(job_id, 0)))
        return job_id, events


class ImportTests(unittest.TestCase):
    def test_backend_modules_do_not_import_ml(self) -> None:
        import transcribe.engine  # noqa: F401
        import transcribe.worker  # noqa: F401

        loaded = [name for name in ML_MODULES if name in sys.modules]
        self.assertEqual(loaded, [])

    def test_save_stream_hashes_while_copying(self) -> None:
        payload = os.urandom(3 * 1024 * 1024 + 7)
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            target = Path(tmp) / "sub" / "upload.ogg"
            size, digest = jobs.save_stream(io.BytesIO(payload), target, chunk_size=64 * 1024)
            self.assertEqual(size, len(payload))
            self.assertEqual(digest, hashlib.sha1(payload).hexdigest())
            self.assertEqual(target.read_bytes(), payload)

    def test_engine_argv_has_flags_and_no_token(self) -> None:
        argv = jobs.engine_argv({
            "input": "C:\\a\\b.ogg", "out_dir": "C:\\out", "job_id": "j1", "model": "large-v3",
            "language": "pt", "formats": "txt,srt", "vad": True, "word_timestamps": True,
            "diarize": True, "translate": False, "min_speakers": 2, "max_speakers": None, "threads": None,
        })
        self.assertIn("--diarize", argv)
        self.assertIn("--word-timestamps", argv)
        self.assertIn("--vad", argv)
        self.assertNotIn("--translate", argv)
        self.assertNotIn("--hf-token", argv)
        self.assertNotIn("--threads", argv)
        self.assertEqual(argv[argv.index("--min-speakers") + 1], "2")

    def test_download_progress_regex(self) -> None:
        match = jobs.DOWNLOAD_PCT.search("[download]  42.5% of   3.10MiB at  1.00MiB/s ETA 00:02")
        self.assertIsNotNone(match)
        self.assertEqual(match.group(1), "42.5")

    def test_mask_secrets_nested(self) -> None:
        masked = jobs.mask_secrets({
            "hf_token": "hf_abc",
            "word_timestamps": True,
            "vision": {"api_key": "sk-1", "model": "x", "base_url": "http://h"},
            "empty_token": "",
            "list": [{"password": "p"}],
        })
        self.assertEqual(masked["hf_token"], "***")
        self.assertIs(masked["word_timestamps"], True)
        self.assertEqual(masked["vision"], {"api_key": "***", "model": "x", "base_url": "http://h"})
        self.assertEqual(masked["empty_token"], "")
        self.assertEqual(masked["list"], [{"password": "***"}])


class ModelCatalogTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.hub = Path(self._tmp.name) / "hub"
        self.hub.mkdir()
        self._env = mock.patch.dict(os.environ, {"HF_HUB_CACHE": str(self.hub)})
        self._env.start()

    def tearDown(self) -> None:
        self._env.stop()
        self._tmp.cleanup()

    def test_repo_names_follow_faster_whisper(self) -> None:
        self.assertEqual(jobs.repo_dir("large-v3-turbo").name, "models--mobiuslabsgmbh--faster-whisper-large-v3-turbo")
        self.assertEqual(jobs.repo_dir("distil-large-v3").name, "models--Systran--faster-distil-whisper-large-v3")
        self.assertEqual(jobs.repo_dir("large-v3").name, "models--Systran--faster-whisper-large-v3")
        self.assertEqual(jobs.repo_dir("base").parent, self.hub)

    def test_auto_resolves_turbo_only_when_cached(self) -> None:
        self.assertEqual(jobs.resolve_model("auto"), "large-v3")
        self.assertEqual(jobs.resolve_model(None), "large-v3")
        self.assertEqual(jobs.resolve_model("modelo-inexistente"), "large-v3")
        self.assertEqual(jobs.resolve_model("base"), "base")
        self.assertEqual(jobs.resolve_model("turbo"), "large-v3-turbo")
        make_snapshot(self.hub, "mobiuslabsgmbh/faster-whisper-large-v3-turbo")
        self.assertEqual(jobs.resolve_model("auto"), "large-v3-turbo")
        self.assertEqual(jobs.resolve_model("auto", translate=True), "large-v3")
        self.assertEqual(jobs.resolve_model("large-v3-turbo", translate=True), "large-v3")
        self.assertEqual(jobs.resolve_model("distil-large-v3"), "distil-large-v3")

    def test_catalog_detects_real_repo_folders(self) -> None:
        make_snapshot(self.hub, "Systran/faster-whisper-base")
        make_snapshot(self.hub, "Systran/faster-distil-whisper-large-v3", with_ref=False)
        turbo = make_snapshot(self.hub, "mobiuslabsgmbh/faster-whisper-large-v3-turbo", with_model=False)
        (turbo / "blobs").mkdir()
        (turbo / "blobs" / "deadbeef.incomplete").write_bytes(b"1" * 500)
        downloads = jobs.ModelDownloads(hub=self.hub, log_path=Path(self._tmp.name) / "log.txt")

        catalog = {entry["key"]: entry for entry in jobs.model_catalog(downloads=downloads)}
        self.assertEqual(set(catalog), set(jobs.VALID_MODELS))
        self.assertTrue(catalog["base"]["downloaded"])
        self.assertTrue(catalog["distil-large-v3"]["downloaded"])
        self.assertFalse(catalog["large-v3-turbo"]["downloaded"])
        self.assertFalse(catalog["large-v3"]["downloaded"])
        self.assertEqual([key for key, entry in catalog.items() if entry["english_only"]], ["distil-large-v3"])
        self.assertEqual([key for key, entry in catalog.items() if entry["is_default"]], ["large-v3"])
        self.assertTrue(all(entry["size_mb"] > 0 and entry["downloading"] is False for entry in catalog.values()))
        self.assertGreaterEqual(jobs.repo_bytes("large-v3-turbo"), 500)

        (turbo / "snapshots" / "abc123" / "model.bin").write_bytes(b"0" * 64)
        catalog = {entry["key"]: entry for entry in jobs.model_catalog(downloads=downloads)}
        self.assertTrue(catalog["large-v3-turbo"]["downloaded"])
        self.assertEqual([key for key, entry in catalog.items() if entry["is_default"]], ["large-v3-turbo"])

    def test_download_manager_reports_progress_and_done(self) -> None:
        script = Path(self._tmp.name) / "fake_download.py"
        script.write_text(FAKE_DOWNLOAD, encoding="utf-8")
        downloads = jobs.ModelDownloads(
            command=lambda key: [sys.executable, str(script), str(jobs.repo_dir(key, self.hub))],
            hub=self.hub,
            log_path=Path(self._tmp.name) / "log.txt",
        )
        idle = downloads.status("large-v3-turbo")
        self.assertEqual(idle["status"], "idle")
        self.assertEqual(idle["downloaded_bytes"], 0)
        self.assertEqual(idle["total_bytes"], jobs.MODEL_INFO["large-v3-turbo"]["size_mb"] * 1_000_000)
        self.assertIsNone(idle["error"])

        self.assertEqual(downloads.start("large-v3-turbo"), "running")
        self.assertTrue(downloads.is_running("large-v3-turbo"))
        self.assertEqual(downloads.start("large-v3-turbo"), "running")
        final = wait_until(lambda: (lambda s: s if s["status"] == "done" else None)(downloads.status("large-v3-turbo")))
        self.assertGreaterEqual(final["downloaded_bytes"], 2000)
        wait_until(lambda: not downloads.is_running("large-v3-turbo"))
        self.assertEqual(downloads.start("large-v3-turbo"), "done")
        self.assertIn("modelo pronto", (Path(self._tmp.name) / "log.txt").read_text(encoding="utf-8"))


class JobStoreTests(BackendTestCase):
    def test_events_have_ids_replay_and_text(self) -> None:
        store = self.make_store()
        job_id, events = self.run_job(store, self.options(self.make_input()))

        ids = [event_id for event_id, _ in events]
        self.assertEqual(ids, list(range(1, len(ids) + 1)))
        kinds = [event["type"] for _, event in events]
        self.assertEqual(events[0][1], {"type": "stage", "stage": "queued", "status": "start", "detail": ""})
        self.assertEqual(kinds[-1], "done")
        self.assertEqual(kinds.count("done"), 1)
        self.assertIn("segment", kinds)
        self.assertTrue(all("job_id" not in event for _, event in events))
        done = events[-1][1]
        self.assertEqual(done["segments"], 2)
        self.assertEqual(done["files"], {"txt": "transcript.txt"})

        snapshot = store.get(job_id)
        self.assertEqual(snapshot["status"], "done")
        self.assertEqual(snapshot["stage"], "done")
        self.assertEqual(snapshot["progress"], 1.0)
        self.assertEqual(snapshot["pct"], 1.0)
        self.assertEqual(snapshot["model"], "base")
        self.assertEqual(snapshot["language"], "pt")
        self.assertEqual(snapshot["duration"], 4.0)
        self.assertEqual(snapshot["text"], "linha 1\nlinha 2\n")
        self.assertEqual(snapshot["last_event_id"], len(events))
        self.assertIsNotNone(snapshot["elapsed"])
        self.assertEqual([seg["text"] for seg in snapshot["segments"]], ["linha 1", "linha 2"])
        self.assertTrue(all({"start", "end", "text", "speaker"} <= set(seg) for seg in snapshot["segments"]))

        tail = parse_frames(list(store.stream(job_id, len(events) - 2)))
        self.assertEqual([event_id for event_id, _ in tail], [len(events) - 1, len(events)])
        again = parse_frames(list(store.stream(job_id, len(events))))
        self.assertEqual(again, [events[-1]])

        meta = json.loads((self.root / "out" / job_id / "meta.json").read_text(encoding="utf-8"))
        self.assertEqual(meta["status"], "done")
        self.assertNotIn("text", meta)

    def test_multiple_consumers_receive_every_event(self) -> None:
        store = self.make_store()
        job_id, _ = store.enqueue(self.options(self.make_input()))
        results: dict[int, list] = {}

        def consume(slot: int) -> None:
            results[slot] = parse_frames(list(store.stream(job_id, 0)))

        threads = [threading.Thread(target=consume, args=(slot,)) for slot in range(3)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(20)
        self.assertEqual(len(results), 3)
        self.assertEqual(results[0], results[1])
        self.assertEqual(results[1], results[2])
        self.assertEqual(results[0][-1][1]["type"], "done")

    def test_worker_stays_warm_between_jobs(self) -> None:
        store = self.make_store()
        _, first = self.run_job(store, self.options(self.make_input()))
        _, second = self.run_job(store, self.options(self.make_input(), language="en"))

        def stages(events):
            return [event["stage"] for _, event in events if event["type"] == "stage"]

        def pid(events):
            return next(event["pid"] for _, event in events if event["type"] == "meta")

        self.assertIn("load_model", stages(first))
        self.assertNotIn("load_model", stages(second))
        self.assertEqual(pid(first), pid(second))

    def test_heartbeat_while_queued_and_cancel_of_queued_job(self) -> None:
        store = self.make_store()
        slow_id, _ = store.enqueue(self.options(self.make_input("slow")))
        wait_until(lambda: (store.get(slow_id) or {}).get("segments"))
        queued_id, _ = store.enqueue(self.options(self.make_input()))
        self.assertEqual(store.get(queued_id)["status"], "queued")

        stream = store.stream(queued_id, 1)
        self.assertEqual(next(stream), ": ping\n\n")

        self.assertEqual(store.cancel(queued_id), {"ok": True, "status": "canceled"})
        frame = parse_frames([next(stream)])
        self.assertEqual(frame, [(2, {"type": "canceled"})])
        self.assertEqual(list(stream), [])
        snapshot = store.get(queued_id)
        self.assertEqual(snapshot["status"], "canceled")
        self.assertEqual(snapshot["stage"], "canceled")
        self.assertEqual(store.get(slow_id)["status"], "running")
        self.assertEqual(store.cancel(queued_id), {"ok": False, "status": "canceled"})

    def test_cancel_running_job_kills_worker_and_next_job_runs(self) -> None:
        store = self.make_store()
        slow_id, _ = store.enqueue(self.options(self.make_input("slow")))
        wait_until(lambda: (store.get(slow_id) or {}).get("segments"))
        proc = store.worker._proc
        self.assertIsNotNone(proc)

        self.assertEqual(store.cancel(slow_id), {"ok": True, "status": "canceled"})
        self.assertEqual(store.get(slow_id)["status"], "canceled")
        proc.wait(timeout=10)
        events = parse_frames(list(store.stream(slow_id, 0)))
        self.assertEqual(events[-1][1], {"type": "canceled"})
        self.assertEqual([e for _, e in events].count({"type": "canceled"}), 1)

        next_id, next_events = self.run_job(store, self.options(self.make_input()))
        self.assertEqual(next_events[-1][1]["type"], "done")
        self.assertEqual(store.get(next_id)["status"], "done")
        meta_path = self.root / "out" / slow_id / "meta.json"
        wait_until(meta_path.exists)
        self.assertEqual(json.loads(meta_path.read_text(encoding="utf-8"))["status"], "canceled")
        self.assertEqual(store.get(slow_id)["status"], "canceled")

    def test_dedupe_returns_active_job(self) -> None:
        store = self.make_store()
        slow_path = self.make_input("slow")
        first_id, deduped = store.enqueue(self.options(slow_path))
        self.assertFalse(deduped)
        self.assertEqual(store.enqueue(self.options(slow_path)), (first_id, True))
        other_id, deduped = store.enqueue(self.options(slow_path, language="en"))
        self.assertFalse(deduped)
        self.assertNotEqual(other_id, first_id)

        upload_a = self.make_input("ok", "upload_a.ogg")
        upload_b = self.make_input("ok", "upload_b.ogg")
        sha_id, _ = store.enqueue(self.options(upload_a, source_sha1="f" * 40))
        self.assertEqual(store.enqueue(self.options(upload_b, source_sha1="f" * 40)), (sha_id, True))

        url_id, _ = store.enqueue(self.options(None, url="https://exemplo.com/video"))
        self.assertEqual(store.enqueue(self.options(None, url="https://exemplo.com/video")), (url_id, True))

        for job_id in (url_id, sha_id, other_id, first_id):
            store.cancel(job_id)
        third_id, deduped = store.enqueue(self.options(slow_path))
        self.assertFalse(deduped)
        self.assertNotEqual(third_id, first_id)

    def test_local_path_fingerprint_changes_with_mtime(self) -> None:
        path = self.make_input()
        options = self.options(path)
        before = jobs.job_fingerprint(options)
        self.assertEqual(before, jobs.job_fingerprint(dict(options)))
        stamp = path.stat().st_mtime + 30
        os.utime(path, (stamp, stamp))
        self.assertNotEqual(before, jobs.job_fingerprint(options))

    def test_secrets_are_masked_in_snapshot_and_meta(self) -> None:
        store = self.make_store()
        options = self.options(
            self.make_input(),
            hf_token="hf_SEGREDO123",
            vision={"base_url": "http://localhost:11434/v1", "api_key": "sk-SEGREDO456", "model": "llava"},
        )
        job_id, _ = self.run_job(store, options)
        snapshot = store.get(job_id)
        self.assertEqual(snapshot["options"]["hf_token"], "***")
        self.assertEqual(snapshot["options"]["vision"]["api_key"], "***")
        self.assertEqual(snapshot["options"]["vision"]["model"], "llava")
        meta = (self.root / "out" / job_id / "meta.json").read_text(encoding="utf-8")
        self.assertNotIn("SEGREDO", meta)
        self.assertNotIn("SEGREDO", json.dumps(snapshot))
        worker_args = (self.root / "out" / job_id / "worker_args.json").read_text(encoding="utf-8")
        self.assertNotIn("SEGREDO", worker_args)

    def test_worker_crash_becomes_clear_error_and_next_job_respawns(self) -> None:
        store = self.make_store()
        crash_id, events = self.run_job(store, self.options(self.make_input("crash")))
        self.assertEqual(events[-1][1]["type"], "error")
        snapshot = store.get(crash_id)
        self.assertEqual(snapshot["status"], "error")
        self.assertIn("motor de transcrição fechou", snapshot["error"])
        self.assertIn("código 3", snapshot["error"])
        self.assertIn("MemoryError", snapshot["error"])
        self.assertIsNone(snapshot["text"])

        _, after = self.run_job(store, self.options(self.make_input()))
        self.assertEqual(after[-1][1]["type"], "done")

    def test_worker_error_event_keeps_worker_alive(self) -> None:
        store = self.make_store()
        fail_id, events = self.run_job(store, self.options(self.make_input("fail")))
        self.assertEqual(events[-1][1], {"type": "error", "message": "Falha na transcrição: arquivo corrompido"})
        self.assertEqual(store.get(fail_id)["error"], "Falha na transcrição: arquivo corrompido")
        pid = next(event["pid"] for _, event in events if event["type"] == "meta")
        _, after = self.run_job(store, self.options(self.make_input()))
        self.assertEqual(next(event["pid"] for _, event in after if event["type"] == "meta"), pid)

    def test_diarize_uses_engine_with_token_in_env(self) -> None:
        store = self.make_store()
        options = self.options(self.make_input(), diarize=True, hf_token="hf_SEGREDO", formats=["srt"])
        job_id, events = self.run_job(store, options)
        meta = next(event for _, event in events if event["type"] == "meta")
        self.assertTrue(meta["engine"])
        self.assertTrue(meta["diarize"])
        self.assertTrue(meta["has_token"])
        self.assertFalse(meta["argv_token"])
        snapshot = store.get(job_id)
        self.assertEqual(snapshot["status"], "done")
        self.assertEqual(snapshot["files"], {"srt": "transcript.srt"})
        self.assertEqual(snapshot["text"], "[Locutor 1] fala\n")
        self.assertIsNone(store.worker._proc)

    def test_unavailable_worker_falls_back_to_engine(self) -> None:
        store = self.make_store(worker_cmd=[sys.executable, "-c", "import sys; sys.exit(5)"])
        job_id, events = self.run_job(store, self.options(self.make_input()))
        meta = next(event for _, event in events if event["type"] == "meta")
        self.assertTrue(meta["engine"])
        self.assertEqual(store.get(job_id)["status"], "done")
        self.assertIn("motor quente indisponível", (self.root / "out" / "_worker.log").read_text(encoding="utf-8"))


class RealWorkerTests(BackendTestCase):
    def setUp(self) -> None:
        super().setUp()
        package = self.root / "stub" / "faster_whisper"
        package.mkdir(parents=True)
        (package / "__init__.py").write_text(STUB_FASTER_WHISPER, encoding="utf-8")
        (package / "utils.py").write_text(STUB_FASTER_WHISPER_UTILS, encoding="utf-8")
        self.stub_log = self.root / "stub_log.jsonl"
        self.hub = self.root / "hub"
        self.hub.mkdir()
        self._env = mock.patch.dict(os.environ, {
            "PYTHONPATH": str(self.root / "stub"),
            "PYTHONUTF8": "1",
            "STUB_MODELS": str(self.root / "models"),
            "STUB_LOG": str(self.stub_log),
            "HF_HUB_CACHE": str(self.hub),
            "SHARPZ_WORKER_IDLE_S": "300",
        })
        self._env.start()

    def tearDown(self) -> None:
        try:
            super().tearDown()
        finally:
            self._env.stop()

    def make_real_store(self) -> jobs.JobStore:
        store = jobs.JobStore(
            output_root=self.root / "out",
            worker_cmd=[sys.executable, "-m", "transcribe.worker"],
            engine_cmd=[sys.executable, "-m", "transcribe.engine"],
            heartbeat_s=0.2,
            use_worker=True,
        )
        self.stores.append(store)
        return store

    def stub_entries(self, kind: str) -> list[dict]:
        if not self.stub_log.exists():
            return []
        entries = [json.loads(line) for line in self.stub_log.read_text(encoding="utf-8").splitlines() if line.strip()]
        return [entry for entry in entries if entry["event"] == kind]

    @staticmethod
    def stages(events) -> list[tuple[str, str]]:
        return [(event["stage"], event["status"]) for _, event in events if event["type"] == "stage"]

    def run_cli(self, *extra: str) -> tuple[int, list[dict], str]:
        result = subprocess.run(
            [sys.executable, "-m", "transcribe.engine", "--input", str(self.make_input()),
             "--out-dir", str(self.root / "cli"), "--job-id", "cli", "--formats", "txt", *extra],
            cwd=str(REPO_ROOT), capture_output=True, text=True, encoding="utf-8", timeout=120,
        )
        events = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
        return result.returncode, events, result.stderr

    def test_real_worker_runs_jobs_and_keeps_model_warm(self) -> None:
        store = self.make_real_store()
        first_id, first = self.run_job(store, self.options(self.make_input(), word_timestamps=True, formats=["txt", "json"]))
        self.assertEqual(self.stages(first), [
            ("queued", "start"),
            ("load_model", "start"),
            ("download_model", "start"),
            ("download_model", "done"),
            ("load_model", "start"),
            ("load_model", "done"),
            ("transcribe", "start"),
            ("transcribe", "done"),
            ("write", "start"),
            ("write", "done"),
        ])
        segments = [event for _, event in first if event["type"] == "segment"]
        self.assertEqual([segment["text"] for segment in segments], ["olá mundo", "tudo bem"])
        self.assertEqual([word["word"] for word in segments[0]["words"]], [" olá", " mundo"])
        snapshot = store.get(first_id)
        self.assertEqual(snapshot["status"], "done")
        self.assertEqual(snapshot["text"], "olá mundo\ntudo bem\n")
        self.assertEqual(snapshot["files"], {"txt": "transcript.txt", "json": "transcript.json"})
        saved = json.loads((self.root / "out" / first_id / "transcript.json").read_text(encoding="utf-8"))
        self.assertEqual(len(saved["segments"][0]["words"]), 2)

        loads = self.stub_entries("load")
        self.assertEqual(len(loads), 1)
        self.assertEqual((loads[0]["device"], loads[0]["compute_type"], loads[0]["cpu_threads"]), ("cpu", "int8", 8))
        options = self.stub_entries("transcribe")[0]["options"]
        self.assertEqual(options["beam_size"], 5)
        self.assertIs(options["condition_on_previous_text"], False)
        self.assertIs(options["vad_filter"], True)
        self.assertIs(options["word_timestamps"], True)
        self.assertEqual((options["language"], options["task"]), ("pt", "transcribe"))

        _, second = self.run_job(store, self.options(self.make_input(), language="auto"))
        self.assertNotIn(("load_model", "start"), self.stages(second))
        self.assertEqual(len(self.stub_entries("load")), 1)
        self.assertIsNone(self.stub_entries("transcribe")[1]["options"]["language"])

        _, third = self.run_job(store, self.options(self.make_input(), model="small"))
        self.assertIn(("load_model", "start"), self.stages(third))
        loads = self.stub_entries("load")
        self.assertEqual(len(loads), 2)
        self.assertEqual(loads[0]["pid"], loads[1]["pid"])

    def test_real_worker_exits_when_idle_and_next_job_respawns(self) -> None:
        os.environ["SHARPZ_WORKER_IDLE_S"] = "0.5"
        store = self.make_real_store()
        self.run_job(store, self.options(self.make_input()))
        proc = store.worker._proc
        self.assertEqual(proc.wait(timeout=15), 0)
        _, events = self.run_job(store, self.options(self.make_input()))
        self.assertEqual(events[-1][1]["type"], "done")
        loads = self.stub_entries("load")
        self.assertEqual(len(loads), 2)
        self.assertNotEqual(loads[0]["pid"], loads[1]["pid"])

    def test_worker_protocol_tags_events_and_exits_on_eof(self) -> None:
        out_dir = self.root / "direct"
        proc = subprocess.Popen(
            [sys.executable, "-m", "transcribe.worker"],
            cwd=str(REPO_ROOT), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding="utf-8",
        )
        request = {"type": "job", "job_id": "abc", "args": {
            "input": str(self.make_input()), "out_dir": str(out_dir), "model": "base", "language": "pt", "formats": "txt",
        }}
        proc.stdin.write("isto não é json\n" + json.dumps(request) + "\n")
        proc.stdin.flush()
        events = []
        for line in proc.stdout:
            events.append(json.loads(line))
            if events[-1]["type"] in ("done", "error"):
                break
        self.assertTrue(all(event["job_id"] == "abc" for event in events))
        self.assertEqual(events[-1]["type"], "done")
        self.assertEqual((out_dir / "transcript.txt").read_text(encoding="utf-8"), "olá mundo\ntudo bem\n")
        proc.stdin.close()
        self.assertEqual(proc.wait(timeout=15), 0)
        proc.stdout.close()

    def test_engine_cli_resolves_auto_and_survives_missing_whisperx(self) -> None:
        code, events, stderr = self.run_cli("--diarize")
        self.assertEqual(code, 0, stderr)
        self.assertEqual(next(event for event in events if event["type"] == "meta")["model"], "large-v3")
        diarize = [event for event in events if event["type"] == "stage" and event["stage"] == "diarize"]
        self.assertEqual(diarize[0]["status"], "skipped")
        self.assertIn("whisperX indisponível", diarize[0]["detail"])
        self.assertEqual(events[-1]["type"], "done")
        self.assertEqual(events[-1]["degraded"], ["diarize"])

        make_snapshot(self.hub, "mobiuslabsgmbh/faster-whisper-large-v3-turbo")
        code, events, stderr = self.run_cli()
        self.assertEqual(code, 0, stderr)
        self.assertEqual(next(event for event in events if event["type"] == "meta")["model"], "large-v3-turbo")
        code, events, stderr = self.run_cli("--translate")
        self.assertEqual(code, 0, stderr)
        self.assertEqual(next(event for event in events if event["type"] == "meta")["model"], "large-v3")

    def test_engine_cli_reports_missing_file_in_portuguese(self) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "transcribe.engine", "--input", str(self.root / "sumiu.ogg"),
             "--out-dir", str(self.root / "cli"), "--job-id", "cli", "--model", "base"],
            cwd=str(REPO_ROOT), capture_output=True, text=True, encoding="utf-8", timeout=120,
        )
        self.assertEqual(result.returncode, 1)
        event = json.loads(result.stdout.strip().splitlines()[-1])
        self.assertEqual(event["type"], "error")
        self.assertIn("Arquivo não encontrado", event["message"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
