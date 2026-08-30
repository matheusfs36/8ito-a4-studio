from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path
from typing import Any

import server_r222 as r222

core = r222.core
APP_ID = "8ito-a4-studio-r22-production"
REVISION = "R22.3"
PROOF_DIR = core.ROOT / "exports" / "proofs"
PROOF_DIR.mkdir(parents=True, exist_ok=True)
VALID_KINDS = {"png", "jpg", "pdf"}
TARGET_WIDTH = 2480
TARGET_HEIGHT = 3508


def _safe_slug(value: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip("-._")
    return text[:72] or "proof"


def _project_hash(project: dict[str, Any]) -> str:
    return r222.r221._project_hash(project)


def _proof_path(proof_id: str) -> Path:
    return PROOF_DIR / f"{proof_id}.json"


def _proof_from_path(path: Path) -> dict[str, Any] | None:
    try:
        value = core.read_json(path)
        return value if isinstance(value, dict) else None
    except Exception:
        return None


def list_export_proofs(project_hash: str | None = None) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if not PROOF_DIR.exists():
        return items
    for path in PROOF_DIR.glob("*.json"):
        item = _proof_from_path(path)
        if not item:
            continue
        if project_hash and str(item.get("projectHash") or "") != project_hash:
            continue
        try:
            mtime = path.stat().st_mtime
        except OSError:
            mtime = 0
        item = dict(item)
        item["_mtime"] = mtime
        items.append(item)
    items.sort(key=lambda item: float(item.get("_mtime") or 0), reverse=True)
    for item in items:
        item.pop("_mtime", None)
    return items


def _validate_sha256(value: str) -> bool:
    return bool(re.fullmatch(r"[0-9a-fA-F]{64}", value or ""))


def record_export_proof(payload: dict[str, Any]) -> dict[str, Any]:
    kind = str(payload.get("kind") or "").lower().strip()
    if kind not in VALID_KINDS:
        raise ValueError("kind inválido; use png, jpg ou pdf")
    project = payload.get("project")
    if not isinstance(project, dict):
        raise ValueError("project ausente")
    project_hash = _project_hash(project)
    file_name = str(payload.get("fileName") or f"8ito-cardapio.{kind}").strip()
    if not file_name:
        raise ValueError("fileName ausente")

    proof: dict[str, Any] = {
        "kind": kind,
        "fileName": file_name,
        "projectHash": project_hash,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "revision": REVISION,
        "verified": False,
        "verification": "",
    }

    if kind in {"png", "jpg"}:
        width = int(payload.get("width") or 0)
        height = int(payload.get("height") or 0)
        size = int(payload.get("bytes") or 0)
        digest = str(payload.get("sha256") or "").strip().lower()
        if width != TARGET_WIDTH or height != TARGET_HEIGHT:
            raise ValueError(f"raster deve ter {TARGET_WIDTH}x{TARGET_HEIGHT}; recebido {width}x{height}")
        if size < 50_000:
            raise ValueError("raster pequeno demais para prova de produção")
        if not _validate_sha256(digest):
            raise ValueError("sha256 inválido")
        proof.update({
            "width": width,
            "height": height,
            "bytes": size,
            "sha256": digest,
            "verified": True,
            "verification": "client-raster-byte-proof",
        })
    else:
        user_confirmed = bool(payload.get("userConfirmed"))
        if not user_confirmed:
            raise ValueError("PDF exige confirmação explícita do usuário após salvar/inspecionar")
        proof.update({
            "userConfirmed": True,
            "verified": True,
            "verification": "user-confirmed-print-pdf",
            "note": str(payload.get("note") or "PDF salvo/inspecionado manualmente.").strip(),
        })

    stamp = time.strftime("%Y%m%d-%H%M%S")
    proof_id = f"{stamp}-{kind}-{_safe_slug(project_hash[:12])}"
    path = _proof_path(proof_id)
    counter = 2
    while path.exists():
        proof_id = f"{stamp}-{kind}-{_safe_slug(project_hash[:12])}-{counter}"
        path = _proof_path(proof_id)
        counter += 1
    proof["id"] = proof_id
    core.write_json(path, proof)
    return proof


def release_state(project: dict[str, Any] | None = None) -> dict[str, Any]:
    if project is None:
        loaded = core.load_project()
        project = loaded if isinstance(loaded, dict) else {}
    project_hash = _project_hash(project)
    preflight = r222.server_preflight(project)
    proofs = list_export_proofs(project_hash)
    latest: dict[str, dict[str, Any] | None] = {"png": None, "jpg": None, "pdf": None}
    for proof in proofs:
        kind = str(proof.get("kind") or "")
        if kind in latest and latest[kind] is None and proof.get("verified") is True:
            latest[kind] = proof
    ready = bool(preflight.get("ok")) and all(latest.values())
    return {
        "app": APP_ID,
        "revision": REVISION,
        "projectHash": project_hash,
        "preflight": preflight,
        "proofs": {"count": len(proofs), "latest": latest},
        "releaseReady": ready,
        "requirements": {
            "png": f"{TARGET_WIDTH}x{TARGET_HEIGHT} + SHA-256 + bytes",
            "jpg": f"{TARGET_WIDTH}x{TARGET_HEIGHT} + SHA-256 + bytes",
            "pdf": "confirmação explícita após salvar/inspecionar",
            "zeroServerBlockers": True,
        },
    }


def freeze_release_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    if str(payload.get("confirm") or "") != "FREEZE RELEASE CANDIDATE":
        raise PermissionError("confirmação de release candidate ausente")
    project = payload.get("project")
    if project is None:
        project = core.load_project()
    if not isinstance(project, dict):
        raise ValueError("project inválido")
    state = release_state(project)
    if not state.get("releaseReady"):
        raise RuntimeError("provas de export incompletas ou pre-flight com bloqueios")
    name = str(payload.get("name") or "R22.3 Production Candidate").strip() or "R22.3 Production Candidate"
    note = str(payload.get("note") or "PNG/JPG verificados por bytes+SHA-256 e PDF confirmado pelo usuário.").strip()
    snapshot = r222.r221.create_snapshot(project, name, note, "release-candidate")
    return {"ok": True, "release": snapshot, "state": state}


class Handler(r222.Handler):
    server_version = "8itoA4Studio/R22.3"

    def do_GET(self) -> None:  # noqa: N802
        parsed = r222.r221.r4.r3.urllib.parse.urlparse(self.path)
        route = parsed.path
        try:
            if route == "/api/r223/release":
                return self.send_json(release_state())
            if route == "/api/r223/export-proofs":
                query = r222.r221.r4.r3.urllib.parse.parse_qs(parsed.query)
                project_hash = str((query.get("projectHash") or [""])[0]).strip() or None
                return self.send_json({"revision": REVISION, "proofs": list_export_proofs(project_hash)})
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 500)
        return super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        route = r222.r221.r4.r3.urllib.parse.urlparse(self.path).path
        try:
            if route == "/api/r223/release":
                payload = self.read_payload()
                project = payload.get("project")
                if project is not None and not isinstance(project, dict):
                    raise ValueError("project inválido")
                return self.send_json(release_state(project))
            if route == "/api/r223/export-proof":
                payload = self.read_payload()
                proof = record_export_proof(payload)
                return self.send_json({"ok": True, "proof": proof, "state": release_state(payload.get("project"))})
            if route == "/api/r223/release/freeze":
                payload = self.read_payload()
                result = freeze_release_candidate(payload)
                return self.send_json(result)
        except PermissionError as exc:
            return self.send_json({"error": str(exc)}, 409)
        except RuntimeError as exc:
            return self.send_json({"error": str(exc), "state": release_state(payload.get("project") if isinstance(payload, dict) else None)}, 409)
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
    print(f"8ITO A4 Studio R22.3 Production -> http://{args.host}:{args.port}/")
    print("Verified raster proofs + explicit PDF confirmation + release candidate gate")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
