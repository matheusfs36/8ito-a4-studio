from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "data" / "menu.8ito.local.json"
CANDIDATES = json.loads((ROOT / "logs" / "r16-pizza-candidates.json").read_text(encoding="utf-8"))
OUT_SHEET = ROOT / "logs" / "r16-pizza-contact-sheet.png"
OUT_HTML = ROOT / "logs" / "r16-pizza-gallery.html"

CURRENT = {
    "pizza-portuguesa": "assets/generated/r15b-pizza-portuguesa-1788037687-640f682a.png",
    "pizza-calabresa": "assets/generated/r15-pizza-calabresa-1788037242-67b5f335.png",
    "pizza-frango": "assets/generated/r15-pizza-frango-1788037269-fa716df2.png",
    "pizza-queijo": "assets/generated/r15-pizza-queijo-1788037296-f874168f.png",
}

# Replace only when a candidate is clearly better than the live image.
WINNERS = {
    "pizza-portuguesa": None,  # keep current
    "pizza-calabresa": None,  # keep current
    "pizza-frango": "assets/generated/r16-pizza-frango-2-1788039384-04124449.png",
    "pizza-queijo": "assets/generated/r16-pizza-queijo-1-1788039443-70803636.png",
}

LABELS = {
    "pizza-portuguesa": "Portuguesa",
    "pizza-calabresa": "Calabresa",
    "pizza-frango": "Frango",
    "pizza-queijo": "Queijo",
}


def thumb(path: Path, size: int = 280) -> Image.Image:
    img = Image.open(path).convert("RGB")
    img.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (size, size), (3, 38, 31))
    canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2))
    return canvas


def build_sheet() -> None:
    cell, gap, header = 280, 18, 42
    cols, rows = 5, 4
    width = gap + cols * (cell + gap)
    height = 56 + rows * (header + cell + gap)
    sheet = Image.new("RGB", (width, height), (2, 22, 19))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/georgia.ttf", 18)
        small = ImageFont.truetype("C:/Windows/Fonts/georgia.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
        small = font
    draw.text((gap, 14), "R16 pizza candidates  ·  current + 4  ·  gold = winner / keep", fill=(226, 190, 120), font=font)
    for row, pid in enumerate(LABELS):
        y = 56 + row * (header + cell + gap)
        draw.text((gap, y), LABELS[pid], fill=(243, 234, 217), font=font)
        urls = [CURRENT[pid]] + [item["url"] for item in CANDIDATES[pid]]
        winner = WINNERS[pid] or CURRENT[pid]
        for col, rel in enumerate(urls):
            x = gap + col * (cell + gap)
            label_y = y + 22
            title = "ATUAL" if col == 0 else f"#{col}"
            if rel == winner:
                title += "  ✓"
                draw.rectangle((x - 4, label_y + 18, x + cell + 4, label_y + 22 + cell + 4), outline=(212, 168, 90), width=3)
            draw.text((x, label_y), title, fill=(210, 176, 110), font=small)
            sheet.paste(thumb(ROOT / rel, cell), (x, label_y + 22))
    OUT_SHEET.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT_SHEET, "PNG")
    print("sheet", OUT_SHEET)


def build_html() -> None:
    blocks = []
    for pid, label in LABELS.items():
        winner = WINNERS[pid] or CURRENT[pid]
        cells = [CURRENT[pid]] + [item["url"] for item in CANDIDATES[pid]]
        figs = []
        for i, rel in enumerate(cells):
            mark = " winner" if rel == winner else ""
            cap = "ATUAL" if i == 0 else f"#{i}"
            if rel == winner:
                cap += " · escolhida"
            figs.append(
                f'<figure class="cell{mark}"><img src="/{rel}" alt="{label} {cap}"><figcaption>{cap}</figcaption></figure>'
            )
        blocks.append(f"<section><h2>{label}</h2><div class='row'>{''.join(figs)}</div></section>")
    html = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>R16 pizzas — contact sheet</title>
<style>
body{{margin:0;background:#021613;color:#f3ead9;font:16px Georgia,serif;padding:24px}}
h1{{color:#e1bd77;font-weight:600}}
h2{{letter-spacing:.12em;color:#d4a85a;font-size:18px}}
.row{{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:28px}}
.cell{{margin:0;padding:8px;border:1px solid rgba(212,168,90,.28);border-radius:10px;background:#04221c}}
.cell.winner{{border-color:#d4a85a;box-shadow:0 0 0 1px #d4a85a}}
img{{width:100%;aspect-ratio:1;object-fit:contain;background:#03261f;border-radius:6px}}
figcaption{{text-align:center;margin-top:8px;font-size:13px;color:#e6c790}}
</style></head>
<body>
<h1>Pizzas · atual + 4 candidatos R16</h1>
<p>Substituição só se o candidato for claramente melhor. Portuguesa e Calabresa mantêm a imagem activa.</p>
{''.join(blocks)}
</body></html>
"""
    OUT_HTML.write_text(html, encoding="utf-8")
    print("html", OUT_HTML)


def apply_json() -> None:
    project = json.loads(PROJECT.read_text(encoding="utf-8"))
    for product in project.get("products") or []:
        pid = str(product.get("id") or "")
        if pid not in CURRENT:
            continue
        winner = WINNERS[pid] or CURRENT[pid]
        product["image"] = winner
        product["imageFit"] = "contain"
        product["imageMask"] = "none"
        product["imageScale"] = 1
        product["imageOffsetX"] = 0
        product["imageOffsetY"] = 0
        product["imageOrigin"] = "generated"
        history = product.setdefault("candidates", [])
        incoming = [{"url": CURRENT[pid], "origin": "generated", "selected": CURRENT[pid] == winner}]
        for item in CANDIDATES[pid]:
            incoming.append({"url": item["url"], "origin": "generated-r16", "selected": item["url"] == winner})
        seen: set[str] = set()
        merged = []
        for item in incoming + history:
            url = item.get("url")
            if not url or url in seen:
                continue
            seen.add(url)
            cloned = dict(item)
            cloned["selected"] = url == winner
            merged.append(cloned)
        product["candidates"] = merged
    project["baseline"] = "R14 FINAL CANDIDATE"
    PROJECT.write_text(json.dumps(project, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("updated", PROJECT)


if __name__ == "__main__":
    build_sheet()
    build_html()
    apply_json()
