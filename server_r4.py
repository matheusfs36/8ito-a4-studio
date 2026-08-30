from __future__ import annotations

import argparse
import json
from typing import Any

import server_r3 as r3

APP_ID = "8ito-a4-studio-0001-r14"


class Handler(r3.Handler):
    server_version = "8itoA4Studio/0001R4"

    def read_payload(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0 or length > 30 * 1024 * 1024:
            raise ValueError("Payload vazio ou grande demais")
        raw = self.rfile.read(length)
        text = None
        for encoding in ("utf-8-sig", "utf-8", "cp1252"):
            try:
                text = raw.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        if text is None:
            raise ValueError("Nao foi possivel decodificar o JSON recebido")
        value = json.loads(text)
        if not isinstance(value, dict):
            raise ValueError("Payload precisa ser objeto JSON")
        return value

    def do_GET(self) -> None:  # noqa: N802
        route = r3.urllib.parse.urlparse(self.path).path
        if route == "/api/health":
            payload = r3.core.health_payload()
            payload["app"] = APP_ID
            payload["comfyui"] = r3.comfy_capabilities_r3()
            payload["transport"] = {"utf8": True, "windowsPowerShellLegacyFallback": True}
            payload["imagePolicy"] = {
                "fit": "contain",
                "mask": "none",
                "scale": 1,
                "autoApplyGenerated": False,
                "recipe": "juggernaut-xl-v9",
            }
            return self.send_json(payload)
        return super().do_GET()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8794)
    args = parser.parse_args()
    httpd = r3.core.ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"8ITO A4 Studio 0001 R4 -> http://{args.host}:{args.port}/")
    print(f"Ollama: {r3.core.OLLAMA_HOST}")
    print(f"ComfyUI: {r3.core.COMFYUI_HOST}")
    print(f"Food checkpoint: {r3.choose_2d_checkpoint() or 'NOT FOUND'}")
    print("Transport: UTF-8 + Windows PowerShell legacy fallback")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
