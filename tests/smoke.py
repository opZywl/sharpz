import io
import json
import os
import sys
import time
import uuid
import urllib.error
import urllib.request

from PIL import Image, ImageDraw

TIMEOUT = 120


def base_url() -> str:
    if len(sys.argv) > 1 and sys.argv[1].strip():
        return sys.argv[1].strip().rstrip("/")
    return os.environ.get("SHARPZ_API", "http://127.0.0.1:8000").rstrip("/")


def make_png() -> bytes:
    img = Image.new("RGB", (16, 16), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.ellipse((3, 3, 12, 12), fill=(220, 30, 60))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def multipart(fields, file_field, filename, file_bytes, content_type):
    boundary = "----SharpzSmoke" + uuid.uuid4().hex
    crlf = "\r\n"
    parts = []
    for name, value in (fields or {}).items():
        parts.append("--" + boundary + crlf)
        parts.append('Content-Disposition: form-data; name="%s"%s%s' % (name, crlf, crlf))
        parts.append(str(value) + crlf)
    head = (
        "--" + boundary + crlf
        + 'Content-Disposition: form-data; name="%s"; filename="%s"%s' % (file_field, filename, crlf)
        + "Content-Type: %s%s%s" % (content_type, crlf, crlf)
    )
    body = b"".join(p.encode("utf-8") for p in parts)
    body += head.encode("utf-8")
    body += file_bytes
    body += crlf.encode("utf-8")
    body += ("--" + boundary + "--" + crlf).encode("utf-8")
    return body, boundary


def http_get(url):
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.status, resp.read()


def http_post_multipart(url, fields, file_bytes):
    body, boundary = multipart(fields, "file", "smoke.png", file_bytes, "image/png")
    headers = {"Content-Type": "multipart/form-data; boundary=" + boundary}
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.status, resp.read()


def as_json(raw):
    return json.loads(raw.decode("utf-8"))


def http_detail(exc):
    try:
        return as_json(exc.read()).get("detail") or ""
    except Exception:
        return ""


def check_health(base, png):
    status, raw = http_get(base + "/api/health")
    assert status == 200, "status %s" % status
    data = as_json(raw)
    assert data.get("status") == "ok", "json inesperado: %r" % data


def check_capabilities(base, png):
    status, raw = http_get(base + "/api/capabilities")
    assert status == 200, "status %s" % status
    data = as_json(raw)
    endpoints = data.get("endpoints")
    assert isinstance(endpoints, list) and endpoints, "'endpoints' ausente ou vazio"


def check_models(base, png):
    status, raw = http_get(base + "/api/models")
    assert status == 200, "status %s" % status
    data = as_json(raw)
    models = data.get("models")
    assert models, "'models' ausente ou vazio"
    default = next((m for m in models if m.get("is_default")), None)
    assert default, "nenhum modelo marcado como padrao"
    assert not default.get("heavy"), "modelo padrao e pesado: %s" % default.get("key")
    print("       padrao: %s" % default.get("label"))


def check_ktx_presets(base, png):
    status, raw = http_get(base + "/api/ktx/presets")
    assert status == 200, "status %s" % status
    data = as_json(raw)
    assert "presets" in data, "'presets' ausente"


def check_packages(base, png):
    status, raw = http_get(base + "/api/packages")
    assert status == 200, "status %s" % status
    data = as_json(raw)
    packages = data.get("packages")
    assert packages, "'packages' ausente ou vazio"
    installed = sum(1 for p in packages if p.get("installed"))
    print("       %d/%d pacotes instalados" % (installed, len(packages)))


def check_clean(base, png):
    status, raw = http_post_multipart(
        base + "/api/clean",
        {"output_format": "png", "method": "auto"},
        png,
    )
    assert status == 200, "status %s" % status
    data = as_json(raw)
    assert data.get("cleaned_png_b64"), "'cleaned_png_b64' ausente ou vazio"


def check_svg(base, png):
    status, raw = http_post_multipart(base + "/api/svg", {}, png)
    assert status == 200, "status %s" % status
    data = as_json(raw)
    has_svg = any(
        isinstance(data.get(k), str) and data.get(k).strip()
        for k in ("svg_with_bg", "svg_clean")
    )
    assert has_svg, "nenhum svg na resposta"


def check_pipeline(base, png):
    status, raw = http_post_multipart(base + "/api/pipeline", {}, png)
    assert status == 200, "status %s" % status
    data = as_json(raw)
    assert data.get("cleaned_png_b64"), "'cleaned_png_b64' ausente ou vazio"


def check_image_to_pdf(base, png):
    status, raw = http_post_multipart(
        base + "/api/image-to-pdf",
        {"ocr_engine": "auto", "page_mode": "a4", "verify": "false"},
        png,
    )
    assert status == 200, "status %s" % status
    job_id = as_json(raw).get("job_id")
    assert job_id, "'job_id' ausente"

    deadline = time.perf_counter() + 60
    state = None
    while time.perf_counter() < deadline:
        _, body = http_get(base + "/api/image-to-pdf/jobs/" + job_id)
        state = as_json(body)
        if state.get("status") in ("done", "error"):
            break
        time.sleep(0.3)
    assert state and state.get("status") == "done", "job nao concluiu: %r" % (state and state.get("status"))

    report = (state.get("manifest") or {}).get("report") or {}
    assert report.get("glitch_total") == 0, "camada de texto com glitches: %r" % report.get("glitches")

    pstatus, pdf = http_get(base + "/api/image-to-pdf/jobs/" + job_id + "/download")
    assert pstatus == 200 and pdf[:4] == b"%PDF", "download nao retornou um PDF valido"


CHECKS = [
    ("GET /api/health", check_health),
    ("GET /api/capabilities", check_capabilities),
    ("GET /api/models", check_models),
    ("GET /api/ktx/presets", check_ktx_presets),
    ("GET /api/packages", check_packages),
    ("POST /api/clean", check_clean),
    ("POST /api/svg", check_svg),
    ("POST /api/pipeline", check_pipeline),
    ("POST /api/image-to-pdf", check_image_to_pdf),
]


def run():
    base = base_url()
    png = make_png()
    print("Sharpz smoke test -> %s" % base)
    print("-" * 50)

    passed = 0
    for name, fn in CHECKS:
        t0 = time.perf_counter()
        try:
            fn(base, png)
            ms = int((time.perf_counter() - t0) * 1000)
            print("[PASS] %s (%dms)" % (name, ms))
            passed += 1
        except (urllib.error.URLError, ConnectionError) as exc:
            reason = getattr(exc, "reason", exc)
            if isinstance(exc, urllib.error.HTTPError):
                print("[FAIL] %s: HTTP %s %s" % (name, exc.code, http_detail(exc)))
            else:
                print("[FAIL] %s: backend offline em %s? (%s)" % (name, base, reason))
        except Exception as exc:
            print("[FAIL] %s: %s" % (name, exc))

    total = len(CHECKS)
    print("-" * 50)
    print("%d/%d passaram" % (passed, total))
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    run()
