from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "data" / "menu.8ito.local.json"

APPLY = {
    "pizza-portuguesa": "assets/generated/r15b-pizza-portuguesa-1788037687-640f682a.png",
    "pizza-calabresa": "assets/generated/r15-pizza-calabresa-1788037242-67b5f335.png",
    "pizza-frango": "assets/generated/r15-pizza-frango-1788037269-fa716df2.png",
    "pizza-queijo": "assets/generated/r15-pizza-queijo-1788037296-f874168f.png",
    "alfajor-chocolate": "assets/generated/r15b-alfajor-chocolate-1788037714-a232bab2.png",
    "croissant-chocolate": "assets/generated/r15b-croissant-chocolate-1788037740-eeb3bc3b.png",
    "bolo-laranja": "assets/generated/r15-bolo-laranja-1788037372-af8d55e7.png",
    "promo-manha": "assets/products/original/promo-manha.png",
    "promo-almoco": "assets/products/original/promo-almoco.png",
    "promo-tarde-doce": "assets/products/original/promo-tarde-doce.png",
}


def main() -> None:
    project = json.loads(PROJECT.read_text(encoding="utf-8"))
    for product in project.get("products") or []:
        pid = str(product.get("id") or "")
        if pid not in APPLY:
            continue
        rel = APPLY[pid]
        if not (ROOT / rel).is_file():
            raise SystemExit(f"missing {rel}")
        product["image"] = rel
        product["imageOrigin"] = "generated" if "/generated/" in rel else "local-original"
        product["imageFit"] = "contain"
        product["imageMask"] = "none"
        product["imageScale"] = 1
        product["imageOffsetX"] = 0
        product["imageOffsetY"] = 0
        history = product.setdefault("candidates", [])
        if not any(isinstance(item, dict) and item.get("url") == rel for item in history):
            history.insert(0, {"url": rel, "origin": product["imageOrigin"], "selected": True})
    PROJECT.write_text(json.dumps(project, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("updated", PROJECT)


if __name__ == "__main__":
    main()
