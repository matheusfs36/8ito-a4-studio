from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from pathlib import Path
from typing import Any

import server_r4 as r4

core = r4.r3.core
ROOT = core.ROOT
SNAPSHOT_DIR = ROOT / "snapshots"
SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
APP_ID = "8ito-a4-studio-r22-production"


def _safe_slug(value: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip("-._")
    return text[:64] or "snapshot"


def _project_hash(project: dict[str, Any]) -> str:
    raw = json.dumps(project, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _snapshot_paths(snapshot_id: str) -> tuple[Path, Path]:
    folder = SNAPSHOT_DIR / snapshot_id
    return folder / "project.json", folder / "meta.json"


def list_snapshots() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if not SNAPSHOT_DIR.exists():
        return items
    for folder in SNAPSHOT_DIR.iterdir():
        if not folder.is_dir():
            continue
        project_path = folder / "project.json"
        meta_path = folder / "meta.json"
        if not project_path.is_file():
            continue
        meta: dict[str, Any] = {}
        if meta_path.is_file():
            try:
                value = core.read_json(meta_path)
                if isinstance(value, dict):
                    meta = value
            except Exception:
                meta = {}
        try:
            stat = project_path.stat()
            project = core.read_json(project_path)
            products = project.get("products", []) if isinstance(project, dict) else []
            image_count = sum(1 for p in products if isinstance(p, dict) and str(p.get("image") or "").strip())
        except Exception:
            stat = project_path.stat()
            products = []
            image_count = 0
        items.append({
            "id": folder.name,
            "name": str(meta.get("name") or folder.name),
            "note": str(meta.get("note") or ""),
            "kind": str(meta.get("kind") or "manual"),
            "createdAt": str(meta.get("createdAt") or ""),
            "hash": str(meta.get("hash") or ""),
            "products": len(products),
            "images": image_count,
            "mtime": stat.st_mtime,
        })
    items.sort(key=lambda item: float(item.get("mtime") or 0), reverse=True)
    for item in items:
        item.pop("mtime", None)
    return items


def create_snapshot(
    project: dict[str, Any],
    name: str,
    note: str = "",
    kind: str = "manual",
) -> dict[str, Any]:
    if not isinstance(project, dict):
        raise ValueError("project inválido para snapshot")
    stamp = time.strftime("%Y%m%d-%H%M%S")
    suffix = _project_hash(project)[:8]
    snapshot_id = f"{stamp}-{_safe_slug(name)}-{suffix}"
    folder = SNAPSHOT_DIR / snapshot_id
    counter = 2
    while folder.exists():
        folder = SNAPSHOT_DIR / f"{snapshot_id}-{counter}"
        counter += 1
    folder.mkdir(parents=True, exist_ok=False)
    project_path = folder / "project.json"
    meta_path = folder / "meta.json"
    core.write_json(project_path, project)
    meta = {
        "id": folder.name,
        "name": name.strip() or "Snapshot",
        "note": note.strip(),
        "kind": kind,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "hash": _project_hash(project),
        "projectPath": project_path.relative_to(ROOT).as_posix(),
    }
    core.write_json(meta_path, meta)
    products = project.get("products", []) if isinstance(project.get("products"), list) else []
    meta["products"] = len(products)
    meta["images"] = sum(1 for p in products if isinstance(p, dict) and str(p.get("image") or "").strip())
    return meta


def backup_current(reason: str) -> dict[str, Any] | None:
    try:
        current = core.load_project()
        if isinstance(current, dict):
            return create_snapshot(current, f"backup-{reason}", "Backup automático antes de operação destrutiva.", "automatic")
    except Exception:
        return None
    return None


def load_snapshot(snapshot_id: str) -> dict[str, Any]:
    safe_id = Path(snapshot_id).name
    if not safe_id or safe_id != snapshot_id:
        raise ValueError("snapshot id inválido")
    project_path, _ = _snapshot_paths(safe_id)
    if not project_path.is_file():
        raise FileNotFoundError("snapshot não encontrado")
    project = core.read_json(project_path)
    if not isinstance(project, dict):
        raise ValueError("snapshot corrompido")
    return project


def production_state() -> dict[str, Any]:
    project = core.load_project()
    products = project.get("products", []) if isinstance(project, dict) and isinstance(project.get("products"), list) else []
    snaps = list_snapshots()
    return {
        "app": APP_ID,
        "project": {
            "products": len(products),
            "images": sum(1 for p in products if isinstance(p, dict) and str(p.get("image") or "").strip()),
            "hash": _project_hash(project) if isinstance(project, dict) else "",
            "savedPath": core.SAVED_PROJECT.relative_to(ROOT).as_posix() if core.SAVED_PROJECT.exists() else None,
        },
        "snapshots": {"count": len(snaps), "latest": snaps[0] if snaps else None},
        "restorePolicy": {
            "refreshReadsLiveProject": True,
            "originalRestoreRequiresConfirmation": True,
            "automaticBackupBeforeRestore": True,
            "originalRestorePersistsByDefault": False,
        },
    }


class Handler(r4.Handler):
    server_version = "8itoA4Studio/R22"

    def do_GET(self) -> None:  # noqa: N802
        route = r4.r3.urllib.parse.urlparse(self.path).path
        try:
            if route == "/api/r22/state":
                return self.send_json(production_state())
            if route == "/api/snapshots":
                return self.send_json({"snapshots": list_snapshots()})
        except FileNotFoundError as exc:
            return self.send_json({"error": str(exc)}, 404)
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 500)
        return super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        route = r4.r3.urllib.parse.urlparse(self.path).path
        try:
            if route == "/api/project":
                payload = self.read_payload()
                project = payload.get("project")
                if not isinstance(project, dict):
                    raise ValueError("project ausente")
                previous = core.load_project()
                backup = None
                if isinstance(previous, dict) and _project_hash(previous) != _project_hash(project):
                    backup = create_snapshot(previous, "auto-save-backup", "Estado anterior ao Salvar.", "automatic")
                core.write_json(core.SAVED_PROJECT, project)
                return self.send_json({
                    "ok": True,
                    "path": core.SAVED_PROJECT.relative_to(ROOT).as_posix(),
                    "hash": _project_hash(project),
                    "backup": backup,
                })

            if route == "/api/snapshot":
                payload = self.read_payload()
                project = payload.get("project")
                if project is None:
                    project = core.load_project()
                if not isinstance(project, dict):
                    raise ValueError("project ausente")
                snap = create_snapshot(
                    project,
                    str(payload.get("name") or "Snapshot manual"),
                    str(payload.get("note") or ""),
                    "manual",
                )
                return self.send_json({"ok": True, "snapshot": snap})

            if route == "/api/snapshot/restore":
                payload = self.read_payload()
                if str(payload.get("confirm") or "") != "RESTORE":
                    return self.send_json({"error": "confirmação de restauração ausente"}, 409)
                snapshot_id = str(payload.get("id") or "")
                project = load_snapshot(snapshot_id)
                backup = backup_current("restore-snapshot")
                core.write_json(core.SAVED_PROJECT, project)
                return self.send_json({"ok": True, "project": project, "backup": backup, "restored": snapshot_id})

            if route == "/api/restore-original":
                payload = self.read_payload()
                if str(payload.get("confirm") or "") != "RESTAURAR MODELO ORIGINAL":
                    return self.send_json({"error": "confirmação explícita ausente"}, 409)
                backup = backup_current("restore-original")
                project = core.read_json(core.BASE_PROJECT)
                if not isinstance(project, dict):
                    raise ValueError("modelo original inválido")
                persist = bool(payload.get("persist", False))
                if persist:
                    core.write_json(core.SAVED_PROJECT, project)
                return self.send_json({
                    "ok": True,
                    "project": project,
                    "backup": backup,
                    "persisted": persist,
                    "warning": "Modelo original carregado. Fotos locais podem não fazer parte desta base.",
                })
        except FileNotFoundError as exc:
            return self.send_json({"error": str(exc)}, 404)
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
    print(f"8ITO A4 Studio R22 Production -> http://{args.host}:{args.port}/")
    print("State safety: snapshots + explicit restore + automatic backups")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
