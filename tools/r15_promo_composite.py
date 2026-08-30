from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "products" / "original"
BG = (3, 38, 31, 255)
SIZE = 896


def load(rel: str) -> Image.Image:
    img = Image.open(ROOT / rel).convert("RGBA")
    return img


def fit(img: Image.Image, box: int) -> Image.Image:
    img = img.copy()
    img.thumbnail((box, box), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    x = (box - img.width) // 2
    y = (box - img.height) // 2
    canvas.paste(img, (x, y), img)
    return canvas


def compose(left: str, right: str, name: str) -> str:
    canvas = Image.new("RGBA", (SIZE, SIZE), BG)
    a = fit(load(left), 400)
    b = fit(load(right), 400)
    canvas.alpha_composite(a, (48, 248))
    canvas.alpha_composite(b, (448, 248))
    dest = OUT / name
    canvas.convert("RGB").save(dest, "PNG")
    return dest.relative_to(ROOT).as_posix()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    print(compose(
        "assets/products/original/pao-de-queijo.png",
        "assets/products/original/cafe-espresso.png",
        "promo-manha.png",
    ))
    soda = "assets/uploads/separated/_refrigerante.png"
    if not (ROOT / soda).is_file():
        soda = "assets/products/original/cafes-especiais.png"
    print(compose(
        "assets/products/original/empanadas.png",
        soda,
        "promo-almoco.png",
    ))
    print(compose(
        "assets/products/original/cookies.png",
        "assets/products/original/cafes-especiais.png",
        "promo-tarde-doce.png",
    ))


if __name__ == "__main__":
    main()
