from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import server_r22 as r221

core = r221.core
APP_ID = "8ito-a4-studio-r22-production"
REVISION = "R22.2"


def _asset_exists(ref: Any) -> bool:
    value = str(ref or "").strip().replace("\\", "/")
    if not value:
        return False
    if value.startswith("data:") or value.startswith("http://") or value.startswith("https://"):
        return True
    if value.startswith("./"):
        value = value[2:]
    if value.startswith("/"):
        value = value[1:]
    if not value.startswith("assets/"):
        return True
    path = (core.ROOT / Path(value)).resolve()
    try:
        path.relative_to(core.ROOT.resolve())
    except ValueError:
        return False
    return path.is_file()


def server_preflight(project: dict[str, Any] | None = None) -> dict[str, Any]:
    if project is None:
        loaded = core.load_project()
        project = loaded if isinstance(loaded, dict) else {}
    products = project.get("products", []) if isinstance(project.get("products"), list) else []
    active = [p for p in products if isinstance(p, dict) and p.get("active") is not False]

    missing_names = [str(p.get("id") or "?") for p in active if not str(p.get("name") or "").strip()]
    invalid_prices = [str(p.get("name") or p.get("id") or "?") for p in active if not isinstance(p.get("price"), (int, float)) or float(p.get("price")) < 0]
    missing_images = [str(p.get("name") or p.get("id") or "?") for p in active if not str(p.get("image") or "").strip()]
    missing_files = [str(p.get("name") or p.get("id") or "?") for p in active if str(p.get("image") or "").strip() and not _asset_exists(p.get("image"))]

    presentation = []
    for p in active:
        fit = str(p.get("imageFit") or "contain")
        mask = str(p.get("imageMask") or "none")
        try:
            scale = float(p.get("imageScale", 1) if p.get("imageScale") is not None else 1)
            ox = float(p.get("imageOffsetX", 0) if p.get("imageOffsetX") is not None else 0)
            oy = float(p.get("imageOffsetY", 0) if p.get("imageOffsetY") is not None else 0)
        except (TypeError, ValueError):
            scale, ox, oy = 999, 999, 999
        if fit != "contain" or mask != "none" or abs(scale - 1) > 0.001 or abs(ox) > 0.001 or abs(oy) > 0.001:
            presentation.append(str(p.get("name") or p.get("id") or "?"))

    refs: dict[str, list[str]] = {}
    for p in active:
        ref = str(p.get("image") or "").strip()
        if ref:
            refs.setdefault(ref, []).append(str(p.get("name") or p.get("id") or "?"))
    duplicates = [names for names in refs.values() if len(names) > 1]

    blockers = []
    warnings = []
    if not active:
        blockers.append("nenhum produto ativo")
    if missing_names:
        blockers.append(f"{len(missing_names)} produto(s) sem nome")
    if invalid_prices:
        blockers.append(f"{len(invalid_prices)} preço(s) inválido(s)")
    if missing_images:
        blockers.append(f"{len(missing_images)} produto(s) sem imagem")
    if missing_files:
        blockers.append(f"{len(missing_files)} asset(s) ativo(s) ausente(s) no disco")
    if presentation:
        warnings.append(f"{len(presentation)} produto(s) fora do enquadramento baseline")
    if duplicates:
        warnings.append(f"{len(duplicates)} imagem(ns) ativa(s) usada(s) por mais de um produto")

    return {
        "revision": REVISION,
        "ok": not blockers,
        "blockers": blockers,
        "warnings": warnings,
        "counts": {
            "products": len(products),
            "active": len(active),
            "images": len(active) - len(missing_images),
            "missingFiles": len(missing_files),
        },
        "details": {
            "missingNames": missing_names,
            "invalidPrices": invalid_prices,
            "missingImages": missing_images,
            "missingFiles": missing_files,
            "presentation": presentation,
            "duplicates": duplicates,
        },
        "exportPolicy": {
            "requiresClientA4Check": True,
            "requiresExplicitUserAction": True,
            "baselineRequiresZeroBlockers": True,
        },
    }


def list_baselines() -> list[dict[str, Any]]:
    return [item for item in r221.list_snapshots() if str(item.get("kind") or "") == "baseline"]


class Handler(r221.Handler):
    server_version = "8itoA4Studio/R22.2"

    def do_GET(self) -> None:  # noqa: N802
        parsed = r221.r4.r3.urllib.parse.urlparse(self.path)
        route = parsed.path
        try:
            if route == "/api/r222/preflight":
                return self.send_json(server_preflight())
            if route == "/api/baselines":
                return self.send_json({"revision": REVISION, "baselines": list_baselines()})
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 500)
        return super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        route = r221.r4.r3.urllib.parse.urlparse(self.path).path
        try:
            if route == "/api/r222/preflight":
                payload = self.read_payload()
                project = payload.get("project")
                if project is not None and not isinstance(project, dict):
                    raise ValueError("project inválido")
                return self.send_json(server_preflight(project))

            if route == "/api/baseline/freeze":
                payload = self.read_payload()
                if str(payload.get("confirm") or "") != "FREEZE BASELINE":
                    return self.send_json({"error": "confirmação de baseline ausente"}, 409)
                project = payload.get("project")
                if project is None:
                    project = core.load_project()
                if not isinstance(project, dict):
                    raise ValueError("project inválido")
                preflight = server_preflight(project)
                if not preflight.get("ok"):
                    return self.send_json({"error": "preflight bloqueou baseline", "preflight": preflight}, 409)
                name = str(payload.get("name") or "R22.2 Production Baseline").strip() or "R22.2 Production Baseline"
                note = str(payload.get("note") or "Baseline congelada após pre-flight de produção.")
                snap = r221.create_snapshot(project, name, note, "baseline")
                return self.send_json({"ok": True, "baseline": snap, "preflight": preflight})
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
    print(f"8ITO A4 Studio R22.2 Production -> http://{args.host}:{args.port}/")
    print("Pre-flight export + baseline freeze + R22.1 safety stack")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
