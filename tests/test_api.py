import io
import tempfile
import threading
import time
import unittest
from pathlib import Path

import rembg.bg as rembg_bg
from fastapi.testclient import TestClient
from onnxruntime.capi.onnxruntime_pybind11_state import Fail, InvalidArgument, RuntimeException
from PIL import Image, ImageDraw, ImageFilter

import server
import src.processor as processor
from src.memory import is_out_of_memory

ORT_ARENA = RuntimeException(
    "[ONNXRuntimeError] : 6 : RUNTIME_EXCEPTION : Non-zero status code returned while running Concat node. "
    "Name:'Concat_131' Status Message: bfc_arena.cc:358 onnxruntime::BFCArena::AllocateRawInternal "
    "Failed to allocate memory for requested buffer of size 26214400"
)
ORT_BAD_ALLOCATION = RuntimeException(
    "[ONNXRuntimeError] : 6 : RUNTIME_EXCEPTION : Non-zero status code returned while running ReorderInput node. "
    "Name:'ReorderInput_token_40' Status Message: bad allocation"
)
ORT_LOAD = Fail("[ONNXRuntimeError] : 1 : FAIL : Load model from u2net.onnx failed:bad allocation")
ORT_INIT = RuntimeException("[ONNXRuntimeError] : 6 : RUNTIME_EXCEPTION : Exception during initialization: bad allocation")
ORT_BAD_RANK = InvalidArgument("[ONNXRuntimeError] : 2 : INVALID_ARGUMENT : Invalid rank for input: input.1 Got: 3 Expected: 4")
PAGING_FILE = OSError(22, "O arquivo de paginação é muito pequeno para que esta operação seja concluída.", None, 1455)


def png_bytes(size=(64, 48), background=(0, 0, 0)):
    image = Image.new("RGB", size, background)
    ImageDraw.Draw(image).ellipse((10, 8, size[0] - 10, size[1] - 8), fill=(40, 200, 255))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def raising(exc):
    def fake(*args, **kwargs):
        raise exc

    return fake


class DummySession:
    pass


class PatchedProcessorCase(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app, raise_server_exceptions=False)
        self.originals = {
            name: getattr(processor, name)
            for name in ("_get_session", "remove", "_luma_key", "SESSION_IDLE_SECONDS")
        }
        processor._session_cache.clear()

    def tearDown(self):
        if processor._idle_timer is not None:
            processor._idle_timer.cancel()
        for name, value in self.originals.items():
            setattr(processor, name, value)
        processor._session_cache.clear()

    def wait_until_released(self, timeout=10.0):
        deadline = time.monotonic() + timeout
        while processor._session_cache and time.monotonic() < deadline:
            time.sleep(0.05)
        return not processor._session_cache

    def post_image(self, route, **fields):
        return self.client.post(route, files={"file": ("imagem.png", png_bytes(), "image/png")}, data=fields)


class MemoryDetectionTests(unittest.TestCase):
    def test_real_out_of_memory_errors_are_detected(self):
        for exc in (ORT_ARENA, ORT_BAD_ALLOCATION, ORT_LOAD, ORT_INIT, MemoryError(), PAGING_FILE):
            with self.subTest(exc=type(exc).__name__):
                self.assertTrue(is_out_of_memory(exc))

    def test_other_errors_are_not_out_of_memory(self):
        for exc in (ORT_BAD_RANK, ValueError("out of memory"), KeyError("x"), Image.DecompressionBombError("grande")):
            with self.subTest(exc=type(exc).__name__):
                self.assertFalse(is_out_of_memory(exc))

    def test_cause_chain_is_followed(self):
        try:
            try:
                raise MemoryError()
            except MemoryError as inner:
                raise RuntimeError("wrapper") from inner
        except RuntimeError as outer:
            self.assertTrue(is_out_of_memory(outer))


class ModelCatalogTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app, raise_server_exceptions=False)

    def test_default_model_is_light_and_all_models_are_offered(self):
        response = self.client.get("/api/models")
        self.assertEqual(response.status_code, 200)
        models = {item["key"]: item for item in response.json()["models"]}
        defaults = [item for item in models.values() if item["is_default"]]
        self.assertEqual([item["key"] for item in defaults], ["isnet-general-use"])
        self.assertFalse(defaults[0]["heavy"])
        self.assertEqual(
            set(models),
            {"isnet-general-use", "birefnet-general-lite", "birefnet-general", "u2net", "birefnet-portrait", "u2net_human_seg", "sam"},
        )
        self.assertEqual(models["birefnet-general"]["label"], "BiRefNet (qualidade máxima)")
        self.assertTrue(models["birefnet-general"]["heavy"])
        self.assertTrue(all(item["detail"] for item in models.values()))

    def test_capabilities_report_the_default_model(self):
        response = self.client.get("/api/capabilities")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["default_model"], "isnet-general-use")

    def test_memory_message_suggests_lighter_models(self):
        heavy = processor.memory_message("birefnet-general", alpha_matting=True)
        self.assertIn("BiRefNet (qualidade máxima)", heavy)
        self.assertIn("ISNet (rápido) ou BiRefNet Lite (detalhado)", heavy)
        self.assertIn("Alpha matting", heavy)
        self.assertIn("use uma imagem menor", processor.memory_message("u2net"))


class UploadValidationTests(PatchedProcessorCase):
    def test_unknown_model_is_rejected(self):
        response = self.post_image("/api/clean", model="nao-existe")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Modelo desconhecido", response.json()["detail"])

    def test_invalid_image_has_clear_message(self):
        response = self.client.post("/api/clean", files={"file": ("imagem.png", b"nao e imagem", "image/png")})
        self.assertEqual(response.status_code, 400)
        self.assertIn("Imagem inválida", response.json()["detail"])
        self.assertNotIn("BytesIO", response.text)

    def test_empty_file_has_clear_message(self):
        response = self.client.post("/api/clean", files={"file": ("imagem.png", b"", "image/png")})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Arquivo vazio.")


class MemoryResponseTests(PatchedProcessorCase):
    def assert_memory_response(self, response, needle):
        self.assertEqual(response.status_code, 503, response.text)
        body = response.json()
        self.assertEqual(body["code"], "memoria_insuficiente")
        self.assertIn(needle, body["detail"])

    def test_model_out_of_memory_returns_clear_503(self):
        processor._get_session = lambda model: DummySession()
        for error in (ORT_ARENA, ORT_BAD_ALLOCATION):
            processor.remove = raising(error)
            for route in ("/api/clean", "/api/pipeline"):
                with self.subTest(route=route, error=str(error)[-20:]):
                    response = self.post_image(route, method="ai", model="birefnet-general")
                    self.assert_memory_response(response, "BiRefNet (qualidade máxima)")
                    self.assertIn("ISNet (rápido)", response.json()["detail"])
                    self.assertFalse(processor._session_cache)

    def test_generic_out_of_memory_returns_clear_503(self):
        for error in (MemoryError(), PAGING_FILE):
            processor._luma_key = raising(error)
            for route in ("/api/clean", "/api/pipeline"):
                with self.subTest(route=route, error=type(error).__name__):
                    response = self.post_image(route, method="luma_dark")
                    self.assert_memory_response(response, "Memória insuficiente para concluir a operação")

    def test_unexpected_error_returns_json_500(self):
        processor._luma_key = raising(RuntimeError("falhou feio"))
        response = self.post_image("/api/clean", method="luma_dark")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["detail"], "Erro inesperado no servidor: falhou feio")

    def test_non_memory_model_error_is_not_reported_as_memory(self):
        processor._get_session = lambda model: DummySession()
        processor.remove = raising(ValueError("outro erro"))
        response = self.post_image("/api/clean", method="ai", model="u2net")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["code"], "erro_interno")

    def test_server_stays_responsive_while_another_inference_holds_the_lock(self):
        lock_taken = threading.Event()

        def hold_lock():
            with processor._session_lock:
                lock_taken.set()
                time.sleep(4)

        holder = threading.Thread(target=hold_lock)
        holder.start()
        lock_taken.wait()
        processor._luma_key = raising(MemoryError())
        result = {}
        request = threading.Thread(target=lambda: result.setdefault("response", self.post_image("/api/clean", method="luma_dark")))
        request.start()
        time.sleep(0.8)
        started = time.perf_counter()
        health = self.client.get("/api/health")
        elapsed = time.perf_counter() - started
        request.join()
        holder.join()
        self.assertEqual(health.status_code, 200)
        self.assertLess(elapsed, 2.0)
        self.assertEqual(result["response"].status_code, 503)


class RealProcessingTests(PatchedProcessorCase):
    def test_clean_with_luma(self):
        response = self.post_image("/api/clean", method="luma_dark", alpha_matting="false")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["method_used"], "luma_dark")

    def test_pipeline_with_luma_generates_svgs(self):
        response = self.post_image("/api/pipeline", method="luma_dark", alpha_matting="false")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertIn("<svg", body["svg_clean"])
        self.assertIn("<svg", body["svg_with_bg"])

    def test_svg(self):
        response = self.post_image("/api/svg")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("<svg", response.json()["svg_with_bg"])

    def test_alpha_matting_uses_sized_preconditioner(self):
        self.assertIs(rembg_bg.estimate_alpha_cf, processor._estimate_alpha_cf)
        image = Image.new("RGB", (120, 90), (30, 30, 30))
        ImageDraw.Draw(image).ellipse((20, 10, 100, 80), fill=(250, 210, 40))
        mask = Image.new("L", (120, 90), 0)
        ImageDraw.Draw(mask).ellipse((20, 10, 100, 80), fill=255)
        cutout = rembg_bg.alpha_matting_cutout(image, mask.filter(ImageFilter.GaussianBlur(3)), 240, 10, 10)
        self.assertEqual(cutout.mode, "RGBA")
        self.assertEqual(cutout.size, (120, 90))


class BatchTests(PatchedProcessorCase):
    def test_batch_stops_at_first_out_of_memory(self):
        processor._get_session = lambda model: DummySession()
        calls = []

        def fake_remove(image, **kwargs):
            calls.append(1)
            if len(calls) == 2:
                raise ORT_ARENA
            return image.convert("RGBA")

        processor.remove = fake_remove
        with tempfile.TemporaryDirectory() as folder:
            for name in ("a.png", "b.png", "c.png", "d.png"):
                Path(folder, name).write_bytes(png_bytes(background=(90, 140, 30)))
            response = self.client.post(
                "/api/batch/pipeline",
                data={"input_path": folder, "output_dir": str(Path(folder, "saida")), "method": "ai", "model": "birefnet-general"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(len(calls), 2)
        self.assertEqual((body["total"], body["success_count"], body["failure_count"]), (4, 1, 3))
        self.assertIn("Lote interrompido por falta de memória: 2 imagem(ns)", body["summary"])
        self.assertIn("qualidade máxima", body["files"][1]["error"])

    def test_batch_reports_missing_folder(self):
        response = self.client.post("/api/batch/pipeline", data={"input_path": str(Path(tempfile.gettempdir(), "nao-existe-sharpz")), "output_dir": "saida"})
        self.assertTrue(response.json()["summary"].startswith("Caminho não encontrado"))


class SessionTests(PatchedProcessorCase):
    def test_idle_session_is_released(self):
        processor._session_cache["modelo"] = DummySession()
        processor.SESSION_IDLE_SECONDS = 0.2
        processor._last_used = time.monotonic()
        processor._schedule_idle_release()
        self.assertTrue(self.wait_until_released())

    def test_early_timer_reschedules_instead_of_keeping_the_session(self):
        processor._session_cache["modelo"] = DummySession()
        processor.SESSION_IDLE_SECONDS = 0.3
        processor._last_used = time.monotonic()
        processor._release_if_idle()
        self.assertIn("modelo", processor._session_cache)
        self.assertTrue(self.wait_until_released())

    def test_recent_session_is_kept(self):
        processor._session_cache["modelo"] = DummySession()
        processor._last_used = time.monotonic() + 100
        processor._release_if_idle()
        self.assertIn("modelo", processor._session_cache)

    def test_unknown_model_is_not_downloaded(self):
        self.assertFalse(processor.model_downloaded("nao-existe"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
