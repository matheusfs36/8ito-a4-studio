from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CAND = json.loads((ROOT / "logs" / "r18-candidates.json").read_text(encoding="utf-8"))

CURRENT = {
    "portuguesa": "assets/generated/r15b-pizza-portuguesa-1788037687-640f682a.png",
    "calabresa": "assets/generated/r15-pizza-calabresa-1788037242-67b5f335.png",
}
# Obvious fails removed from the shown set (still on disk).
KEEP = {
    "portuguesa": [1, 3, 4, 5, 6],  # drop 2 cropped
    "calabresa": [1, 2, 5, 6],  # drop 3 onion-only, 4 not sausage
}


def thumb(path: Path, size: int = 260) -> Image.Image:
    img = Image.open(path).convert("RGB")
    img.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (size, size), (3, 38, 31))
    canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2))
    return canvas


def sheet(flavor: str, dest: Path) -> None:
    urls = [CURRENT[flavor]] + [CAND[flavor][i - 1]["url"] for i in KEEP[flavor]]
    labels = ["ATUAL"] + [f"R18 #{i}" for i in KEEP[flavor]]
    cell, gap = 260, 16
    cols = len(urls)
    sheet_img = Image.new("RGB", (gap + cols * (cell + gap), cell + 70), (2, 22, 19))
    draw = ImageDraw.Draw(sheet_img)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/georgia.ttf", 18)
        small = ImageFont.truetype("C:/Windows/Fonts/georgia.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
        small = font
    draw.text((gap, 12), f"R18 {flavor} · atual + curadoria (sem ref. local)", fill=(226, 190, 120), font=font)
    for col, (rel, lab) in enumerate(zip(urls, labels)):
        x = gap + col * (cell + gap)
        draw.text((x, 38), lab, fill=(210, 176, 110), font=small)
        sheet_img.paste(thumb(ROOT / rel, cell), (x, 58))
    dest.parent.mkdir(parents=True, exist_ok=True)
    sheet_img.save(dest, "PNG")
    print("sheet", dest)


if __name__ == "__main__":
    sheet("portuguesa", ROOT / "logs" / "r18-portuguesa-contact-sheet.png")
    sheet("calabresa", ROOT / "logs" / "r18-calabresa-contact-sheet.png")
