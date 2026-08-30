from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "data" / "menu.8ito.local.json"
GENERATED = ROOT / "assets" / "generated"

ORIGINALS = {
    "empanadas": "assets/products/original/empanadas.png",
    "coxinhas": "assets/products/original/coxinhas.png",
    "pao-de-batata": "assets/products/original/pao-de-batata.png",
    "pao-de-queijo": "assets/products/original/pao-de-queijo.png",
    "croissant-presunto-queijo": "assets/products/original/croissant-presunto-queijo.png",
    "cookies": "assets/products/original/cookies.png",
    "tarteletes": "assets/products/original/tarteletes.png",
    "croissant-doce-leite": "assets/products/original/croissant-doce-leite.png",
    "alfajor-maicena": "assets/products/original/alfajor-maicena.png",
    "cafe-espresso": "assets/products/original/cafe-espresso.png",
    "cafes-especiais": "assets/products/original/cafes-especiais.png",
}

KEEP_GENERATED = {
    "cafe-passado": "assets/generated/8ito-ai-1788020090-0fbb29e8.png",
    "cafe-passado-leite": "assets/generated/8ito-ai-1788020229-c5c89fa9.png",
    "promo-manha": "assets/generated/r11-promo-manha-1788031869.png",
    "promo-almoco": "assets/generated/8ito-ai-1788017034-7721acd9.png",
    "promo-tarde-doce": "assets/generated/8ito-ai-1788017059-5fc68a86.png",
}

CANDIDATE_PREFIX = {
    "pizza-portuguesa": "r11-pizza-portuguesa-",
    "pizza-calabresa": "r11-pizza-calabresa-",
    "pizza-frango": "r11-pizza-frango-",
    "pizza-queijo": "r11-pizza-queijo-",
    "alfajor-chocolate": "r11-alfajor-chocolate-",
    "croissant-chocolate": "r11-croissant-chocolate-",
    "bolo-laranja": "r11-bolo-laranja-",
}


def existing(rel: str) -> str:
    return rel if (ROOT / rel).is_file() else ""


def candidates_for(prefix: str, limit: int = 4) -> list[dict]:
    files = sorted(GENERATED.glob(f"{prefix}*.png"), key=lambda p: p.stat().st_mtime, reverse=True)
    out = []
    for path in files[:limit]:
        out.append({
            "url": path.relative_to(ROOT).as_posix(),
            "origin": "generated-r11",
            "selected": False,
        })
    return out


def main() -> None:
    project = json.loads(PROJECT.read_text(encoding="utf-8"))
    for product in project.get("products") or []:
        if not isinstance(product, dict):
            continue
        pid = str(product.get("id") or "")
        product["imageFit"] = "contain"
        product["imageMask"] = "none"
        product["imageScale"] = 1
        product["imageOffsetX"] = 0
        product["imageOffsetY"] = 0
        product["imageX"] = 50
        product["imageY"] = 50

        if pid in ORIGINALS:
            rel = existing(ORIGINALS[pid])
            if rel:
                product["image"] = rel
                product["imageOrigin"] = "local-original"
        elif pid in KEEP_GENERATED:
            rel = existing(KEEP_GENERATED[pid])
            if rel:
                product["image"] = rel
                product["imageOrigin"] = "generated"

        seeded = candidates_for(CANDIDATE_PREFIX.get(pid, "___none___"))
        if seeded:
            current = [item for item in (product.get("candidates") or []) if isinstance(item, dict) and item.get("url")]
            seen = {str(item.get("url")) for item in current}
            for item in seeded:
                if item["url"] not in seen:
                    current.append(item)
            product["candidates"] = current[:8]

    PROJECT.write_text(json.dumps(project, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"updated {PROJECT}")


if __name__ == "__main__":
    main()
