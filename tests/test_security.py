import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient
from starlette.datastructures import Headers

import server
from transcribe import jobs as transcribe_jobs


class LocalOnlyTests(unittest.TestCase):
    def test_requests_from_this_computer_are_accepted(self):
        for base_url in ("http://127.0.0.1:8000", "http://localhost:8000", "http://testserver"):
            with self.subTest(base_url=base_url):
                self.assertEqual(TestClient(server.app, base_url=base_url).get("/api/health").status_code, 200)

    def test_ipv6_loopback_is_local(self):
        self.assertTrue(server._is_local_request(Headers({"host": "[::1]:8000", "origin": "http://[::1]:5174"})))
        self.assertFalse(server._is_local_request(Headers({"host": "[::2]:8000"})))
        self.assertFalse(server._is_local_request(Headers({})))

    def test_dashboard_origins_are_accepted(self):
        client = TestClient(server.app)
        for origin in ("http://localhost:5174", "http://127.0.0.1:5174"):
            with self.subTest(origin=origin):
                self.assertEqual(client.get("/api/health", headers={"Origin": origin}).status_code, 200)

    def test_other_hosts_are_rejected(self):
        for base_url in ("http://evil.example", "http://localhost.evil.example", "http://192.168.0.10:8000"):
            with self.subTest(base_url=base_url):
                self.assertEqual(TestClient(server.app, base_url=base_url).get("/api/health").status_code, 403)

    def test_other_origins_are_rejected_before_the_route_runs(self):
        client = TestClient(server.app)
        for origin in ("https://evil.example", "null", "http://192.168.0.10:5174"):
            with self.subTest(origin=origin):
                response = client.post(
                    "/api/clean",
                    headers={"Origin": origin},
                    files={"file": ("imagem.png", b"", "image/png")},
                )
                self.assertEqual(response.status_code, 403)
                self.assertTrue(response.json()["detail"])


class YtDlpArgumentTests(unittest.TestCase):
    def test_url_is_passed_after_the_end_of_options(self):
        captured = {}

        def fake_spawn(argv, *args, **kwargs):
            captured["argv"] = [str(item) for item in argv]
            raise OSError("not started")

        url = "--config-locations=//evil.example/config"
        with tempfile.TemporaryDirectory() as tmp:
            store = object.__new__(transcribe_jobs.JobStore)
            store.log_path = Path(tmp) / "jobs.log"
            store._handle_event = lambda job_id, event: None
            with mock.patch.object(transcribe_jobs, "_spawn", fake_spawn):
                with self.assertRaises(transcribe_jobs.JobFailed):
                    store._download_url("job-0001", url, Path(tmp))
        self.assertEqual(captured["argv"][-2:], ["--", url])


if __name__ == "__main__":
    unittest.main(verbosity=2)
