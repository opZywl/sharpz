import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import httpx
from fastapi.testclient import TestClient

import server


def upload_request() -> tuple[bytes, str]:
    request = httpx.Request("POST", "http://127.0.0.1/api/transcribe", files={"file": ("a.ogg", b"abc")})
    return request.read(), request.headers["content-type"]


async def post_upload(after_body) -> list[dict]:
    body, content_type = upload_request()
    pending = [{"type": "http.request", "body": body, "more_body": False}]

    async def receive() -> dict:
        if pending:
            return pending.pop(0)
        return await after_body()

    sent: list[dict] = []

    async def send(message: dict) -> None:
        sent.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/transcribe",
        "raw_path": b"/api/transcribe",
        "query_string": b"",
        "root_path": "",
        "headers": [
            (b"host", b"127.0.0.1"),
            (b"content-type", content_type.encode("latin-1")),
            (b"content-length", str(len(body)).encode("latin-1")),
        ],
        "client": ("127.0.0.1", 50000),
        "server": ("127.0.0.1", 8000),
    }
    await server.app(scope, receive, send)
    return sent


class TranscribeApiCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.root = Path(self._tmp.name)
        self.store = mock.MagicMock()
        self.store.enqueue.return_value = ("job1", False)
        patches = [
            mock.patch.object(server, "TRANSCRIBE_STORE", self.store),
            mock.patch.object(server, "TRANSCRIBE_UPLOAD_DIR", self.root / "uploads"),
        ]
        for patcher in patches:
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = TestClient(server.app)

    def tearDown(self) -> None:
        self._tmp.cleanup()


class UploadDisconnectTests(TranscribeApiCase):
    def test_upload_from_a_client_that_left_creates_no_job(self) -> None:
        async def disconnect() -> dict:
            return {"type": "http.disconnect"}

        sent = asyncio.run(asyncio.wait_for(post_upload(disconnect), 30))
        self.store.enqueue.assert_not_called()
        self.assertEqual(list((self.root / "uploads").iterdir()), [])
        self.assertEqual(sent[0]["status"], 400)

    def test_upload_from_a_connected_client_creates_the_job(self) -> None:
        async def stay_connected() -> dict:
            await asyncio.Event().wait()
            return {"type": "http.disconnect"}

        sent = asyncio.run(asyncio.wait_for(post_upload(stay_connected), 30))
        self.assertEqual(sent[0]["status"], 200)
        self.store.enqueue.assert_called_once()
        saved = list((self.root / "uploads").iterdir())
        self.assertEqual(len(saved), 1)
        self.assertEqual(self.store.enqueue.call_args.args[0]["input_path"], str(saved[0]))


class CapabilitiesTests(TranscribeApiCase):
    def capabilities(self, venv: bool, whisperx: bool) -> dict:
        with mock.patch.object(server, "transcribe_venv_available", return_value=venv), \
                mock.patch.object(server, "transcribe_whisperx_available", return_value=whisperx):
            response = self.client.get("/api/transcribe/capabilities")
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_word_timestamps_follow_the_engine_environment(self) -> None:
        missing = self.capabilities(venv=False, whisperx=False)
        self.assertIs(missing["word_timestamps"], False)
        ready = self.capabilities(venv=True, whisperx=False)
        self.assertIs(ready["word_timestamps"], True)
        self.assertIs(ready["whisperx"], False)
        self.assertIs(ready["diarization"], False)
        self.assertTrue({"ffmpeg", "whisperx", "diarization", "venv", "default_model", "word_timestamps"} <= set(ready))
        full = self.capabilities(venv=True, whisperx=True)
        self.assertIs(full["diarization"], True)


class AudioRangeTests(TranscribeApiCase):
    def setUp(self) -> None:
        super().setUp()
        media = self.root / "audio.ogg"
        media.write_bytes(bytes(range(100)))
        self.store.exists.return_value = True
        self.store.get_input_path.return_value = media

    def test_audio_answers_range_requests(self) -> None:
        partial = self.client.get("/api/transcribe/jobs/job1/audio", headers={"Range": "bytes=0-9"})
        self.assertEqual(partial.status_code, 206)
        self.assertEqual(partial.headers["content-range"], "bytes 0-9/100")
        self.assertEqual(partial.content, bytes(range(10)))

        whole = self.client.get("/api/transcribe/jobs/job1/audio")
        self.assertEqual(whole.status_code, 200)
        self.assertEqual(whole.headers["accept-ranges"], "bytes")
        self.assertEqual(len(whole.content), 100)

        outside = self.client.get("/api/transcribe/jobs/job1/audio", headers={"Range": "bytes=500-600"})
        self.assertEqual(outside.status_code, 416)


if __name__ == "__main__":
    unittest.main(verbosity=2)
