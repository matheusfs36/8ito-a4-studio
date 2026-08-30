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
ASSET_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def _safe_slug(value: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip("-._")
    return text[:64] or "snapshot"


def _project_hash(project: dict[str, Any]) -> str:
    raw = json.dumps(project, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _snapshot_paths(snapshot_id: str) -> tuple[Path, Path]:
    folder = SNAPSHOT_DIR / snapshot_id
    return folder / "project.json", folder / "meta.json"


def _normalise_asset_ref(value: Any) -> str:
    ref = str(value or "").strip().replace("\\", "/")
    if ref.startswith("./"):
        ref = ref[2:]
    if ref.startswith("/"):
        ref = ref[1:]
    return ref


def _product_asset_refs(product: dict[str, Any]) -> set[str]:
    refs: set[str] = set()

    def add(value: Any) -> None:
        ref = _normalise_asset_ref(value)
        if ref.startswith("assets/"):
            refs.add(ref)

    add(product.get("image"))
    for value in product.get("imageHistory") or []:
        add(value)
    for item in product.get("candidates") or []:
        if isinstance(item, dict):
            add(item.get("url"))
    ai = product.get("ai")
    if isinstance(ai, dict):
        for item in ai.get("candidatesR22") or []:
            if isinstance(item, dict):
                add(item.get("url"))
    return refs


def asset_inventory(project: dict[str, Any] | None = None, limit: int = 600) -> dict[str, Any]:
    if project is None:
        loaded = core.load_project()
        project = loaded if isinstance(loaded, dict) else {}
    products = project.get("products", []) if isinstance(project.get("products"), list) else []
    usage: dict[str, list[dict[str, str]]] = {}
    for product in products:
        if not isinstance(product, dict):
            continue
        marker = {"id": str(product.get("id") or ""), "name": str(product.get("name") or "Produto")}
        for ref in _product_asset_refs(product):
            usage.setdefault(ref, []).append(marker)

    items: list[dict[str, Any]] = []
    if core.ASSET_DIR.exists():
        for path in core.ASSET_DIR.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in ASSET_EXTENSIONS:
                continue
            try:
                rel = path.relative_to(ROOT).as_posix()
                stat = path.stat()
            except (OSError, ValueError):
                continue
            parts = Path(rel).parts
            group = parts[1] if len(parts) > 2 and parts[0] == "assets" else "assets"
            used_by = usage.get(rel, [])
            items.append({
                "url": rel,
                "name": path.name,
                "group": group,
                "bytes": stat.st_size,
                "modifiedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(stat.st_mtime)),
                "usageCount": len(used_by),
                "usedBy": used_by,
                "orphan": not bool(used_by),
                "mtime": stat.st_mtime,
            })
    items.sort(key=lambda item: (item["orphan"], -float(item["mtime"])))
    total = len(items)
    used = sum(1 for item in items if not item["orphan"])
    orphan = total - used
    visible = items[: max(1, min(2000, int(limit or 600)))]
    for item in visible:
        item.pop("mtime", None)
    return {
        "assets": visible,
        "summary": {"total": total, "used": used, "orphan": orphan, "returned": len(visible)},
        "policy": {"deleteEnabled": False, "applyRequiresExplicitChoice": True},
    }


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


def compare_projects(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    fields = ("name", "price", "category", "active", "image", "description")
    before_products = {
        str(p.get("id")): p for p in before.get("products", []) if isinstance(p, dict) and p.get("id") is not None
    }
    after_products = {
        str(p.get("id")): p for p in after.get("products", []) if isinstance(p, dict) and p.get("id") is not None
    }
    added: list[dict[str, Any]] = []
    removed: list[dict[str, Any]] = []
    changed: list[dict[str, Any]] = []

    for product_id in sorted(after_products.keys() - before_products.keys()):
        product = after_products[product_id]
        added.append({"id": product_id, "name": str(product.get("name") or product_id)})
    for product_id in sorted(before_products.keys() - after_products.keys()):
        product = before_products[product_id]
        removed.append({"id": product_id, "name": str(product.get("name") or product_id)})
    for product_id in sorted(before_products.keys() & after_products.keys()):
        old = before_products[product_id]
        new = after_products[product_id]
        delta: dict[str, Any] = {}
        for field in fields:
            if old.get(field) != new.get(field):
                delta[field] = {"before": old.get(field), "after": new.get(field)}
        old_present = {
            key: old.get(key) for key in ("imageFit", "imageMask", "imageScale", "imageOffsetX", "imageOffsetY")
        }
        new_present = {
            key: new.get(key) for key in ("imageFit", "imageMask", "imageScale", "imageOffsetX", "imageOffsetY")
        }
        if old_present != new_present:
            delta["imagePresentation"] = {"before": old_present, "after": new_present}
        if delta:
            changed.append({
                "id": product_id,
                "name": str(new.get("name") or old.get("name") or product_id),
                "fields": list(delta.keys()),
                "changes": delta,
            })

    document_changes: list[str] = []
    for key in ("brand", "categories", "categoryOrder", "textStyles"):
        if before.get(key) != after.get(key):
            document_changes.append(key)

    return {
        "summary": {
            "added": len(added),
            "removed": len(removed),
            "changed": len(changed),
            "documentChanged": bool(document_changes),
            "same": not (added or removed or changed or document_changes),
        },
        "added": added,
        "removed": removed,
        "changed": changed,
        "documentChanges": document_changes,
        "beforeHash": _project_hash(before),
        "afterHash": _project_hash(after),
    }


def production_state() -> dict[str, Any]:
    project = core.load_project()
    products = project.get("products", []) if isinstance(project, dict) and isinstance(project.get("products"), list) else []
    snaps = list_snapshots()
    return {
        "app": APP_ID,
        "revision": "R22.1",
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
        "assetPolicy": {"inventoryReadOnly": True, "deleteEnabled": False},
    }


class Handler(r4.Handler):
    server_version = "8itoA4Studio/R22.1"

    def do_GET(self) -> None:  # noqa: N802
        parsed = r4.r3.urllib.parse.urlparse(self.path)
        route = parsed.path
        try:
            if route == "/api/r22/state":
                return self.send_json(production_state())
            if route == "/api/snapshots":
                return self.send_json({"snapshots": list_snapshots()})
            if route == "/api/assets":
                query = r4.r3.urllib.parse.parse_qs(parsed.query)
                try:
                    limit = int((query.get("limit") or ["600"])[0])
                except ValueError:
                    limit = 600
                return self.send_json(asset_inventory(limit=limit))
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

            if route == "/api/snapshot/compare":
                payload = self.read_payload()
                snapshot_id = str(payload.get("id") or "")
                before = load_snapshot(snapshot_id)
                after = payload.get("project")
                if after is None:
                    after = core.load_project()
                if not isinstance(after, dict):
                    raise ValueError("project atual inválido")
                return self.send_json({"ok": True, "id": snapshot_id, "diff": compare_projects(before, after)})

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
    print(f"8ITO A4 Studio R22.1 Production -> http://{args.host}:{args.port}/")
    print("State safety: snapshots + compare + asset inventory + explicit restore")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
