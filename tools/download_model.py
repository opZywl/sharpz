import os
import sys
import time

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "120")

from faster_whisper.utils import download_model

model = sys.argv[1] if len(sys.argv) > 1 else "large-v3"

for attempt in range(1, 13):
    try:
        print(f"[download {model}] tentativa {attempt}...", flush=True)
        path = download_model(model)
        print(f"[ok] modelo pronto em {path}", flush=True)
        sys.exit(0)
    except Exception as exc:
        print(f"[retry] falha: {type(exc).__name__}: {str(exc)[:140]}", flush=True)
        time.sleep(4)

print("[falha] nao consegui baixar o modelo apos varias tentativas", flush=True)
sys.exit(1)
