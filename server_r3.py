from __future__ import annotations

import argparse
import base64
import json
import urllib.parse
import uuid
from pathlib import Path
from typing import Any

import server as core

APP_ID = "8ito-a4-studio-0001-r3"


def checkpoint_options() -> list[str]:
    info = core.comfy_node_info("CheckpointLoaderSimple")
    if not info:
        return []
    try:
        values = info["CheckpointLoaderSimple"]["input"]["required"]["ckpt_name"][0]
        return [str(v) for v in values if v]
    except Exception:
        return []


def checkpoint_score(name: str) -> int:
    n = name.lower()
    reject = ("hunyuan_3d", "hunyuan3d", "wan", "controlnet", "lora", "upscal", "inpaint", "vae")
    if any(x in n for x in reject):
        return -1000
    score = 0
    for token, points in (
        ("juggernaut", 100),
        ("realvis", 95),
        ("epicrealism", 90),
        ("dreamshaper", 85),
        ("photon", 80),
        ("realistic", 75),
        ("sd_xl_base", 72),
        ("sdxl", 70),
        ("stable-diffusion-xl", 68),
        ("flux", 40),
    ):
        if token in n:
            score = max(score, points)
    if n.endswith(".safetensors"):
        score += 2
    return score


def choose_2d_checkpoint() -> str | None:
    ranked = sorted(checkpoint_options(), key=lambda n: checkpoint_score(n), reverse=True)
    if ranked and checkpoint_score(ranked[0]) > 0:
        return ranked[0]
    return None


def comfy_capabilities_r3() -> dict[str, Any]:
    checkpoint_info = core.comfy_node_info("CheckpointLoaderSimple")
    sampler_info = core.comfy_node_info("KSampler")
    online = bool(checkpoint_info or sampler_info)
    checkpoint = choose_2d_checkpoint()
    sampler = core.first_option(sampler_info, "KSampler", "sampler_name") or "euler"
    scheduler = core.first_option(sampler_info, "KSampler", "scheduler") or "normal"
    workflow = "active.json" if core.ACTIVE_WORKFLOW.exists() else "food-basic.template.json"
    options = checkpoint_options()
    return {
        "online": online,
        "host": core.COMFYUI_HOST,
        "workflow": workflow,
        "checkpoint": checkpoint,
        "checkpoints": options,
        "has2DCheckpoint": bool(checkpoint),
        "sampler": sampler,
        "scheduler": scheduler,
        "modelHint": checkpoint or "nenhum checkpoint 2D adequado detectado",
    }


core.comfy_capabilities = comfy_capabilities_r3


def choose_vision_model(models: list[str]) -> str | None:
    preferred = [
        "qwen3-vl:4b-instruct-q4_K_M",
        "qwen3-vl:8b-thinking-q4_K_M",
        "qwen3-vl:4b-thinking-q4_K_M",
        "gemma3:4b",
        "gemma4:e4b",
    ]
    lower = {m.lower(): m for m in models}
    for candidate in preferred:
        if candidate.lower() in lower:
            return lower[candidate.lower()]
    for model in models:
        low = model.lower()
        if "vl" in low or "vision" in low or "gemma3" in low or "gemma4" in low:
            return model
    return None


def read_image_base64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def asset_path(relative: str) -> Path | None:
    if not relative:
        return None
    candidate = (core.ROOT / relative.replace("/", str(Path('/')))).resolve()
    try:
        candidate.relative_to(core.ROOT.resolve())
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def project_reference_images(product: dict[str, Any], limit: int = 3) -> list[Path]:
    project = core.load_project()
    products = project.get("products") if isinstance(project, dict) else None
    if not isinstance(products, list):
        return []
    category = str(product.get("category") or "")
    ordered = []
    for candidate in products:
        if not isinstance(candidate, dict):
            continue
        image = asset_path(str(candidate.get("image") or ""))
        if not image:
            continue
        same_category = str(candidate.get("category") or "") == category
        ordered.append((0 if same_category else 1, image))
    seen: set[str] = set()
    result: list[Path] = []
    for _, image in sorted(ordered, key=lambda item: item[0]):
        key = str(image).lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(image)
        if len(result) >= limit:
            break
    return result


def reference_driven_plan(payload: dict[str, Any]) -> dict[str, Any]:
    product = payload.get("product") or {}
    brand = payload.get("brand") or {}
    request_text = str(payload.get("request") or "").strip()
    name = str(product.get("name") or "Novo produto").strip()
    category = str(product.get("category") or "produto").strip()
    description = str(product.get("description") or "").strip()
    models = core.ollama_models()
    vision_model = choose_vision_model(models)
    references = project_reference_images(product)
    comfy = comfy_capabilities_r3()

    if not request_text:
        request_text = (
            f"Crie automaticamente a melhor foto de cardápio para {name}. "
            "Mantenha a linguagem visual das referências do 8ito e preserve fielmente o tipo de produto."
        )

    if vision_model and references:
        images = [read_image_base64(path) for path in references]
        system = """Você é o diretor de fotografia gastronômica do 8ito A4 Studio.
Analise as imagens de referência do cardápio real do 8ito e transforme o novo produto em uma especificação visual pronta para geração LOCAL.
Responda SOMENTE JSON válido.

REGRAS:
- use as referências para inferir iluminação, enquadramento, escala, fundo, contraste, acabamento e linguagem visual;
- não copie ou invente texto das imagens;
- não invente ingredientes específicos que não estejam no nome/descrição;
- imagem isolada de produto, adequada para recorte dentro de cardápio A4;
- fotografia gastronômica comercial realista e apetitosa;
- sem pessoas, mãos, logos, preço, texto, letras ou watermark;
- o prompt final deve ser em inglês;
- descrição comercial em pt-BR deve ser curta e não afirmar ingredientes não confirmados.

Formato:
{"descriptionPt":"...","visualSummaryPt":"...","prompt":"...","negativePrompt":"...","width":768,"height":768}
"""
        user = {
            "name": name,
            "category": category,
            "existingDescription": description,
            "humanRequest": request_text,
            "brand": brand,
            "generator": comfy.get("modelHint"),
            "referenceCount": len(references),
        }
        request = {
            "model": vision_model,
            "stream": False,
            "format": "json",
            "think": False,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(user, ensure_ascii=False), "images": images},
            ],
            "options": {"temperature": 0.36, "top_p": 0.9, "num_predict": 1400},
        }
        try:
            result = core.http_json(f"{core.OLLAMA_HOST}/api/chat", request, timeout=180)
            parsed = core.extract_json(str((result.get("message") or {}).get("content") or ""))
            width = max(640, min(1024, int(parsed.get("width") or 768)))
            height = max(640, min(1024, int(parsed.get("height") or 768)))
            width = max(640, round(width / 64) * 64)
            height = max(640, round(height / 64) * 64)
            return {
                "engine": f"ollama-vision:{vision_model}",
                "modelHint": comfy.get("modelHint"),
                "request": request_text,
                "description": str(parsed.get("descriptionPt") or description or "").strip(),
                "reasoningSummary": str(parsed.get("visualSummaryPt") or "Referências reais do 8ito analisadas localmente.").strip(),
                "prompt": str(parsed.get("prompt") or "").strip(),
                "negativePrompt": str(parsed.get("negativePrompt") or "").strip(),
                "width": width,
                "height": height,
                "referenceAssets": [p.relative_to(core.ROOT).as_posix() for p in references],
            }
        except Exception:
            pass

    refined = core.refine_image_prompt({"product": product, "request": request_text, "brand": brand})
    refined["request"] = request_text
    refined["description"] = description or f"{name} preparado para o cardápio do 8ito."
    refined["referenceAssets"] = [p.relative_to(core.ROOT).as_posix() for p in references]
    return refined


def autopilot_product(payload: dict[str, Any]) -> dict[str, Any]:
    product = payload.get("product")
    if not isinstance(product, dict):
        raise ValueError("product ausente")
    plan = reference_driven_plan(payload)
    comfy = comfy_capabilities_r3()
    if not comfy.get("online"):
        raise RuntimeError("ComfyUI está offline")
    if not comfy.get("checkpoint"):
        available = ", ".join(comfy.get("checkpoints") or []) or "nenhum"
        raise RuntimeError(
            "Nenhum checkpoint 2D adequado para fotografia foi encontrado. "
            f"Disponíveis: {available}. Instale SDXL/RealVis/Juggernaut e tente novamente."
        )
    generated = core.generate_comfy_image({
        "prompt": plan.get("prompt"),
        "negativePrompt": plan.get("negativePrompt"),
        "width": plan.get("width") or 768,
        "height": plan.get("height") or 768,
    })
    return {
        "ok": True,
        "description": plan.get("description") or "",
        "ai": plan,
        "image": generated,
        "url": generated.get("url"),
    }


class Handler(core.Handler):
    server_version = "8itoA4Studio/0001R3"

    def do_GET(self) -> None:  # noqa: N802
        route = urllib.parse.urlparse(self.path).path
        if route == "/api/health":
            payload = core.health_payload()
            payload["app"] = APP_ID
            payload["comfyui"] = comfy_capabilities_r3()
            return self.send_json(payload)
        return super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        route = urllib.parse.urlparse(self.path).path
        if route == "/api/autopilot-product":
            try:
                payload = self.read_payload()
                return self.send_json(autopilot_product(payload))
            except ValueError as exc:
                return self.send_json({"error": str(exc)}, 400)
            except Exception as exc:
                return self.send_json({"error": str(exc)}, 500)
        return super().do_POST()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8794)
    args = parser.parse_args()
    httpd = core.ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"8ITO A4 Studio 0001 R3 -> http://{args.host}:{args.port}/")
    print(f"Ollama: {core.OLLAMA_HOST}")
    print(f"ComfyUI: {core.COMFYUI_HOST}")
    print(f"Food checkpoint: {choose_2d_checkpoint() or 'NOT FOUND'}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
