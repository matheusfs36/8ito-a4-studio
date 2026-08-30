from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import random
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
BASE_PROJECT = DATA_DIR / "menu.8ito.json"
SAVED_PROJECT = DATA_DIR / "menu.8ito.local.json"
ASSET_DIR = ROOT / "assets"
UPLOAD_DIR = ASSET_DIR / "uploads"
GENERATED_DIR = ASSET_DIR / "generated"
WORKFLOW_DIR = ROOT / "comfy" / "workflows"
ACTIVE_WORKFLOW = WORKFLOW_DIR / "active.json"
BASIC_WORKFLOW = WORKFLOW_DIR / "food-basic.template.json"

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
COMFYUI_HOST = os.environ.get("COMFYUI_HOST", "http://127.0.0.1:8188").rstrip("/")
APP_ID = "8ito-a4-studio-0001"

for directory in (DATA_DIR, UPLOAD_DIR, GENERATED_DIR, WORKFLOW_DIR):
    directory.mkdir(parents=True, exist_ok=True)


def json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def http_json(url: str, payload: Any | None = None, timeout: int = 30) -> Any:
    headers = {"User-Agent": f"{APP_ID}/1.0"}
    data = None
    method = "GET"
    if payload is not None:
        data = json_bytes(payload)
        headers["Content-Type"] = "application/json"
        method = "POST"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def http_bytes(url: str, timeout: int = 60) -> tuple[bytes, str]:
    req = urllib.request.Request(url, headers={"User-Agent": f"{APP_ID}/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read(), response.headers.get("Content-Type", "application/octet-stream")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_project() -> Any:
    return read_json(SAVED_PROJECT if SAVED_PROJECT.exists() else BASE_PROJECT)


def ollama_models() -> list[str]:
    try:
        payload = http_json(f"{OLLAMA_HOST}/api/tags", timeout=3)
        return [str(m.get("name", "")) for m in payload.get("models", []) if m.get("name")]
    except Exception:
        return []


def choose_ollama_model(models: list[str]) -> str | None:
    preferred = ["qwen3:8b", "qwen3.6:latest", "qwen3:4b", "qwen2.5-coder:7b"]
    by_lower = {m.lower(): m for m in models}
    for candidate in preferred:
        if candidate.lower() in by_lower:
            return by_lower[candidate.lower()]
    for model in models:
        if "qwen" in model.lower():
            return model
    return models[0] if models else None


def extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
    text = re.sub(r"\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    value = json.loads(text)
    if not isinstance(value, dict):
        raise ValueError("JSON do modelo não é objeto")
    return value


def comfy_node_info(node: str) -> dict[str, Any] | None:
    try:
        return http_json(f"{COMFYUI_HOST}/object_info/{urllib.parse.quote(node)}", timeout=4)
    except Exception:
        return None


def first_option(info: dict[str, Any] | None, node: str, field: str) -> str | None:
    if not info:
        return None
    try:
        required = info[node]["input"]["required"][field]
        options = required[0]
        if isinstance(options, list) and options:
            return str(options[0])
    except Exception:
        return None
    return None


def comfy_capabilities() -> dict[str, Any]:
    checkpoint_info = comfy_node_info("CheckpointLoaderSimple")
    sampler_info = comfy_node_info("KSampler")
    online = bool(checkpoint_info or sampler_info)
    checkpoint = first_option(checkpoint_info, "CheckpointLoaderSimple", "ckpt_name")
    sampler = first_option(sampler_info, "KSampler", "sampler_name") or "euler"
    scheduler = first_option(sampler_info, "KSampler", "scheduler") or "normal"
    workflow = "active.json" if ACTIVE_WORKFLOW.exists() else "food-basic.template.json"
    hint = checkpoint or workflow
    return {
        "online": online,
        "host": COMFYUI_HOST,
        "workflow": workflow,
        "checkpoint": checkpoint,
        "sampler": sampler,
        "scheduler": scheduler,
        "modelHint": hint,
    }


def fallback_image_prompt(product: dict[str, Any], request: str, model_hint: str) -> dict[str, Any]:
    name = str(product.get("name") or "produto gastronômico").strip()
    extra = request.strip() or "foto de produto para cardápio premium"
    prompt = (
        f"Premium commercial food photography of {name}, {extra}. "
        "Single hero product, realistic appetizing texture, fresh ingredients, natural proportions, "
        "warm controlled studio lighting, subtle dark emerald restaurant atmosphere, elegant gold-toned highlights, "
        "clean composition, isolated visual focus, enough negative space, high detail, no typography, no logo, no watermark."
    )
    negative = (
        "text, letters, logo, watermark, menu design, UI, deformed food, duplicate food, plastic texture, "
        "burned highlights, oversaturated colors, messy background, hands, people"
    )
    return {
        "engine": "deterministic-fallback",
        "modelHint": model_hint,
        "prompt": prompt,
        "negativePrompt": negative,
        "width": 768,
        "height": 768,
        "reasoningSummary": "Prompt gastronômico seguro para slot quadrado do cardápio; texto fica fora da imagem.",
    }


def refine_image_prompt(payload: dict[str, Any]) -> dict[str, Any]:
    product = payload.get("product") or {}
    request_text = str(payload.get("request") or "").strip()
    brand = payload.get("brand") or {}
    comfy = comfy_capabilities()
    model_hint = str(comfy.get("modelHint") or "ComfyUI local")
    models = ollama_models()
    model = choose_ollama_model(models)
    if not model:
        return fallback_image_prompt(product, request_text, model_hint)

    system = """Você é o refinador técnico de prompts de imagem do 8ito A4 Studio.
Sua função é converter um pedido humano curto em um prompt ótimo para o gerador LOCAL indicado no contexto.
A imagem será usada como fotografia/ilustração de produto dentro de um cardápio A4 premium.

REGRAS:
- preserve fielmente o produto pedido; não invente ingredientes específicos quando não foram informados;
- priorize fotografia gastronômica realista, apetitosa e comercial;
- adapte linguagem e densidade do prompt ao modelHint/workflow informado;
- a identidade 8ito usa verde-esmeralda escuro, dourado quente e atmosfera elegante;
- NUNCA peça texto, preço, letras, logotipo, rótulo, cardápio pronto, UI ou watermark dentro da imagem;
- deixe o renderer aplicar nome, preço, molduras e tipografia;
- composição com assunto principal claro e recorte robusto para card de produto;
- escolha resolução segura entre 640 e 1024, múltipla de 64;
- responda SOMENTE JSON válido.

Formato exato:
{"prompt":"english image prompt","negativePrompt":"english negative prompt","width":768,"height":768,"reasoningSummary":"resumo curto em pt-BR"}
"""
    user = {
        "product": product,
        "humanRequest": request_text,
        "brand": brand,
        "modelHint": model_hint,
        "target": "A4 printed menu product image; typography rendered separately",
    }
    request = {
        "model": model,
        "stream": False,
        "format": "json",
        "think": False,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
        ],
        "options": {"temperature": 0.48, "top_p": 0.9, "num_predict": 1200},
    }
    try:
        result = http_json(f"{OLLAMA_HOST}/api/chat", request, timeout=120)
        parsed = extract_json(str((result.get("message") or {}).get("content") or ""))
        width = max(640, min(1024, int(parsed.get("width") or 768)))
        height = max(640, min(1024, int(parsed.get("height") or 768)))
        width = max(640, round(width / 64) * 64)
        height = max(640, round(height / 64) * 64)
        return {
            "engine": f"ollama:{model}",
            "modelHint": model_hint,
            "prompt": str(parsed.get("prompt") or "").strip(),
            "negativePrompt": str(parsed.get("negativePrompt") or "").strip(),
            "width": width,
            "height": height,
            "reasoningSummary": str(parsed.get("reasoningSummary") or "").strip(),
        }
    except Exception as exc:
        fallback = fallback_image_prompt(product, request_text, model_hint)
        fallback["warning"] = f"Ollama falhou; fallback usado: {exc}"
        return fallback


def replace_placeholders(value: Any, replacements: dict[str, Any]) -> Any:
    if isinstance(value, dict):
        return {key: replace_placeholders(item, replacements) for key, item in value.items()}
    if isinstance(value, list):
        return [replace_placeholders(item, replacements) for item in value]
    if isinstance(value, str) and value in replacements:
        return replacements[value]
    return value


def load_comfy_workflow() -> dict[str, Any]:
    path = ACTIVE_WORKFLOW if ACTIVE_WORKFLOW.exists() else BASIC_WORKFLOW
    if not path.exists():
        raise RuntimeError(f"Workflow ComfyUI ausente: {path}")
    workflow = read_json(path)
    if not isinstance(workflow, dict):
        raise RuntimeError("Workflow ComfyUI inválido")
    return workflow


def save_asset(raw: bytes, content_type: str, folder: Path, prefix: str) -> str:
    ext = mimetypes.guess_extension(content_type.split(";", 1)[0].strip()) or ".png"
    if ext == ".jpe":
        ext = ".jpg"
    name = f"{prefix}-{int(time.time())}-{uuid.uuid4().hex[:8]}{ext}"
    path = folder / name
    path.write_bytes(raw)
    return path.relative_to(ROOT).as_posix()


def generate_comfy_image(payload: dict[str, Any]) -> dict[str, Any]:
    prompt = str(payload.get("prompt") or "").strip()
    negative = str(payload.get("negativePrompt") or "").strip()
    if not prompt:
        raise ValueError("Prompt vazio")
    width = max(512, min(1024, int(payload.get("width") or 896)))
    height = max(512, min(1024, int(payload.get("height") or 896)))
    width = max(512, round(width / 64) * 64)
    height = max(512, round(height / 64) * 64)
    seed = int(payload.get("seed") or random.randint(1, 2_000_000_000))
    steps = max(12, min(50, int(payload.get("steps") or 34)))
    cfg = float(payload.get("cfg") or 4.5)
    prefix = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(payload.get("prefix") or "8ito-ai"))[:48] or "8ito-ai"

    comfy = comfy_capabilities()
    if not comfy.get("online"):
        raise RuntimeError(f"ComfyUI offline em {COMFYUI_HOST}")

    replacements = {
        "__PROMPT__": prompt,
        "__NEGATIVE_PROMPT__": negative,
        "__WIDTH__": width,
        "__HEIGHT__": height,
        "__SEED__": seed,
        "__STEPS__": steps,
        "__CFG__": cfg,
        "__CHECKPOINT__": str(payload.get("checkpoint") or comfy.get("checkpoint") or ""),
        "__SAMPLER__": str(payload.get("sampler") or "dpmpp_2m"),
        "__SCHEDULER__": str(payload.get("scheduler") or "karras"),
    }
    workflow = replace_placeholders(load_comfy_workflow(), replacements)
    client_id = uuid.uuid4().hex
    queued = http_json(f"{COMFYUI_HOST}/prompt", {"prompt": workflow, "client_id": client_id}, timeout=30)
    prompt_id = str(queued.get("prompt_id") or "")
    if not prompt_id:
        raise RuntimeError(f"ComfyUI não retornou prompt_id: {queued}")

    deadline = time.time() + 300
    while time.time() < deadline:
        try:
            history = http_json(f"{COMFYUI_HOST}/history/{urllib.parse.quote(prompt_id)}", timeout=10)
            record = history.get(prompt_id) if isinstance(history, dict) else None
            outputs = (record or {}).get("outputs") or {}
            for output in outputs.values():
                images = output.get("images") if isinstance(output, dict) else None
                if not images:
                    continue
                image = images[0]
                params = urllib.parse.urlencode({
                    "filename": image.get("filename", ""),
                    "subfolder": image.get("subfolder", ""),
                    "type": image.get("type", "output"),
                })
                raw, content_type = http_bytes(f"{COMFYUI_HOST}/view?{params}", timeout=60)
                local_url = save_asset(raw, content_type, GENERATED_DIR, prefix)
                return {
                    "provider": "comfyui-local",
                    "workflow": comfy.get("workflow"),
                    "checkpoint": replacements["__CHECKPOINT__"],
                    "sampler": replacements["__SAMPLER__"],
                    "scheduler": replacements["__SCHEDULER__"],
                    "seed": seed,
                    "steps": steps,
                    "cfg": cfg,
                    "url": local_url,
                    "width": width,
                    "height": height,
                    "autoApplied": False,
                }
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
                raise
        time.sleep(1.25)
    raise TimeoutError("ComfyUI não concluiu a imagem em 300 segundos")


def decode_data_url(data_url: str) -> tuple[bytes, str]:
    match = re.match(r"^data:([^;,]+);base64,(.+)$", data_url, flags=re.S)
    if not match:
        raise ValueError("dataUrl inválida")
    content_type = match.group(1).strip().lower()
    if not content_type.startswith("image/"):
        raise ValueError("Somente imagens são aceitas")
    raw = base64.b64decode(match.group(2), validate=False)
    if len(raw) > 20 * 1024 * 1024:
        raise ValueError("Imagem excede 20 MB")
    return raw, content_type


def health_payload() -> dict[str, Any]:
    models = ollama_models()
    return {
        "app": APP_ID,
        "ollama": {"online": bool(models), "host": OLLAMA_HOST, "model": choose_ollama_model(models), "models": models[:20]},
        "comfyui": comfy_capabilities(),
        "project": {"saved": SAVED_PROJECT.exists(), "source": SAVED_PROJECT.name if SAVED_PROJECT.exists() else BASE_PROJECT.name},
    }


class Handler(SimpleHTTPRequestHandler):
    server_version = "8itoA4Studio/0001"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, payload: Any, status: int = 200) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def read_payload(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0 or length > 30 * 1024 * 1024:
            raise ValueError("Payload vazio ou grande demais")
        value = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("Payload precisa ser objeto JSON")
        return value

    def do_GET(self) -> None:  # noqa: N802
        route = urllib.parse.urlparse(self.path).path
        try:
            if route == "/api/health":
                return self.send_json(health_payload())
            if route == "/api/project":
                return self.send_json(load_project())
            if route == "/api/base":
                return self.send_json(read_json(BASE_PROJECT))
            return super().do_GET()
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)

    def do_POST(self) -> None:  # noqa: N802
        route = urllib.parse.urlparse(self.path).path
        try:
            payload = self.read_payload()
            if route == "/api/project":
                project = payload.get("project")
                if not isinstance(project, dict):
                    raise ValueError("project ausente")
                write_json(SAVED_PROJECT, project)
                return self.send_json({"ok": True, "path": SAVED_PROJECT.relative_to(ROOT).as_posix()})
            if route == "/api/refine-image-prompt":
                return self.send_json(refine_image_prompt(payload))
            if route == "/api/image":
                return self.send_json(generate_comfy_image(payload))
            if route == "/api/asset":
                raw, content_type = decode_data_url(str(payload.get("dataUrl") or ""))
                url = save_asset(raw, content_type, UPLOAD_DIR, "upload")
                return self.send_json({"ok": True, "url": url})
            self.send_json({"error": "Rota não encontrada"}, 404)
        except ValueError as exc:
            self.send_json({"error": str(exc)}, 400)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[8ito] {self.address_string()} - {fmt % args}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8794)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"8ITO A4 Studio 0001 -> http://{args.host}:{args.port}/")
    print(f"Ollama: {OLLAMA_HOST}")
    print(f"ComfyUI: {COMFYUI_HOST}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
