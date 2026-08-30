from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "data" / "menu.8ito.local.json"
CANDIDATES = json.loads((ROOT / "logs" / "r17-candidates.json").read_text(encoding="utf-8"))

CURRENT = {
    "pizza-portuguesa": "assets/generated/r15b-pizza-portuguesa-1788037687-640f682a.png",
    "pizza-calabresa": "assets/generated/r15-pizza-calabresa-1788037242-67b5f335.png",
    "pizza-frango": "assets/generated/r16-pizza-frango-2-1788039384-04124449.png",
    "pizza-queijo": "assets/generated/r16-pizza-queijo-1-1788039443-70803636.png",
    "bolo-laranja": "assets/generated/r15-bolo-laranja-1788037372-af8d55e7.png",
}
WINNERS = {
    "pizza-portuguesa": None,
    "pizza-calabresa": None,
    "pizza-frango": None,
    "pizza-queijo": None,
    "bolo-laranja": "assets/generated/r17-bolo-laranja-4-1788040842-51a39e92.png",
}
LABELS = {
    "pizza-portuguesa": "Portuguesa",
    "pizza-calabresa": "Calabresa",
    "pizza-frango": "Frango",
    "pizza-queijo": "Queijo",
    "bolo-laranja": "Bolo de Laranja",
}


def thumb(path: Path, size: int = 240) -> Image.Image:
    img = Image.open(path).convert("RGB")
    img.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (size, size), (3, 38, 31))
    canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2))
    return canvas


def sheet_for(ids: list[str], dest: Path, title: str) -> None:
    cell, gap, header = 240, 14, 38
    cols, rows = 5, len(ids)
    width = gap + cols * (cell + gap)
    height = 52 + rows * (header + cell + gap)
    sheet = Image.new("RGB", (width, height), (2, 22, 19))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/georgia.ttf", 18)
        small = ImageFont.truetype("C:/Windows/Fonts/georgia.ttf", 13)
    except OSError:
        font = ImageFont.load_default()
        small = font
    draw.text((gap, 12), title, fill=(226, 190, 120), font=font)
    for row, pid in enumerate(ids):
        y = 50 + row * (header + cell + gap)
        draw.text((gap, y), LABELS[pid], fill=(243, 234, 217), font=font)
        urls = [CURRENT[pid]] + [item["url"] for item in CANDIDATES[pid]]
        winner = WINNERS[pid] or CURRENT[pid]
        for col, rel in enumerate(urls):
            x = gap + col * (cell + gap)
            label_y = y + 20
            cap = "ATUAL" if col == 0 else f"#{col}"
            if rel == winner:
                cap += "  ✓"
                draw.rectangle((x - 3, label_y + 16, x + cell + 3, label_y + 20 + cell + 3), outline=(212, 168, 90), width=3)
            draw.text((x, label_y), cap, fill=(210, 176, 110), font=small)
            sheet.paste(thumb(ROOT / rel, cell), (x, label_y + 20))
    dest.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dest, "PNG")
    print("sheet", dest)


def html_gallery() -> None:
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
            figs.append(f'<figure class="cell{mark}"><img src="/{rel}" alt="{label}"><figcaption>{cap}</figcaption></figure>')
        blocks.append(f"<section><h2>{label}</h2><div class='row'>{''.join(figs)}</div></section>")
    html = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>R17 candidates</title>
<style>
body{{margin:0;background:#021613;color:#f3ead9;font:16px Georgia,serif;padding:24px}}
h1{{color:#e1bd77}} h2{{color:#d4a85a;letter-spacing:.12em;font-size:18px}}
.row{{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:28px}}
.cell{{margin:0;padding:8px;border:1px solid rgba(212,168,90,.28);border-radius:10px;background:#04221c}}
.cell.winner{{border-color:#d4a85a}}
img{{width:100%;aspect-ratio:1;object-fit:contain;background:#03261f;border-radius:6px}}
figcaption{{text-align:center;margin-top:8px;font-size:13px;color:#e6c790}}
</style></head>
<body>
<h1>R17 · atual + 4 candidatos</h1>
<p>Só o Bolo de Laranja foi substituído. Pizzas mantêm a imagem activa da R14/R16.</p>
{''.join(blocks)}
</body></html>
"""
    path = ROOT / "logs" / "r17-gallery.html"
    path.write_text(html, encoding="utf-8")
    print("html", path)


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
        history = product.setdefault("candidates", [])
        incoming = [{"url": CURRENT[pid], "origin": "generated", "selected": CURRENT[pid] == winner}]
        for item in CANDIDATES[pid]:
            incoming.append({"url": item["url"], "origin": "generated-r17", "selected": item["url"] == winner})
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
    project["baseline"] = "R17 PRINT POLISH CANDIDATE"
    PROJECT.write_text(json.dumps(project, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("updated", PROJECT)


if __name__ == "__main__":
    html_gallery()
    sheet_for(list(LABELS), ROOT / "logs" / "r17-all-contact-sheet.png", "R17 all doubtful items  ·  gold = keep/winner")
    changed = [pid for pid, win in WINNERS.items() if win]
    sheet_for(changed, ROOT / "logs" / "r17-changed-contact-sheet.png", "R17 altered only · Bolo de Laranja")
    apply_json()
