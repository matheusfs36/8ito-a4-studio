from __future__ import annotations

import json
import shutil
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "http://127.0.0.1:8794/api/image"
OUT = ROOT / "assets" / "generated" / "r18-reference-hunt"

NEGATIVE = (
    "text, letters, logo, watermark, QR, price, white plate, ceramic plate, saucer, dish, "
    "wooden board, cutting board, marble, tray, parchment, cup, fork, knife, hands, people, "
    "pepperoni, American pepperoni, Italian salami, meatballs, basil leaves, pesto, "
    "fried egg, sunny-side-up, giant egg yolk, too many eggs, overloaded toppings, "
    "missing slice, lifted slice, cut pizza, sliced pizza, close-up crop, CGI, 3D render, "
    "plastic food, extra objects, gourmet plating, theatrical garnish"
)
BASE = (
    "Photoreal Brazilian neighborhood pizzeria catalog photo of ONE whole uncut individual "
    "round pizza, complete circular crust visible, camera slightly above, centered on seamless "
    "matte dark emerald teal background, 18 percent empty margin, soft studio daylight, "
    "gentle contact shadow, natural cheese texture, artisan dough, not CGI, no plate, no board, "
    "no marble, no props, no text."
)

JOBS = {
    "portuguesa": {
        "n": 6,
        "prompt": (
            f"{BASE} Brazilian Pizza Portuguesa identity: melted mozzarella and tomato sauce, "
            "scattered cubes of ham, sliced white onion, three slices of hard-boiled egg with "
            "visible yolk, a few black olives, a small optional scatter of green peas. "
            "Toppings moderate and naturally distributed. Must read as Brazilian portuguesa, "
            "not American pizza, not fried-egg breakfast pizza."
        ),
    },
    "calabresa": {
        "n": 6,
        "prompt": (
            f"{BASE} Brazilian Calabresa pizza identity: thick coins of smoked Brazilian "
            "calabresa sausage, orange-red pork sausage about 3 to 4 centimeters wide with "
            "slightly curled cooked edges, mixed with sliced white onion and modest mozzarella, "
            "light dried oregano only. Must look like Brazilian calabresa from a pizzeria, "
            "not pepperoni, not salami, no basil, no meatballs, no fruit."
        ),
    },
}


def post(flavor: str, n: int, prompt: str) -> dict:
    payload = {
        "prompt": prompt,
        "negativePrompt": NEGATIVE,
        "width": 896,
        "height": 896,
        "steps": 34,
        "cfg": 4.2,
        "sampler": "dpmpp_2m",
        "scheduler": "karras",
        "prefix": f"r18-{flavor}-{n}",
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(API, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=360) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    log: dict[str, list] = {}
    for flavor, spec in JOBS.items():
        dest = OUT / flavor
        dest.mkdir(parents=True, exist_ok=True)
        log[flavor] = []
        for n in range(1, spec["n"] + 1):
            print(f"GEN {flavor} #{n} ...", flush=True)
            started = time.time()
            result = post(flavor, n, spec["prompt"])
            result["elapsed"] = round(time.time() - started, 1)
            src = ROOT / result["url"]
            copy = dest / f"{flavor}-{n:02d}{src.suffix}"
            if src.is_file():
                shutil.copy2(src, copy)
                result["organized"] = copy.relative_to(ROOT).as_posix()
            print(f"OK  {flavor} #{n} {result.get('url')} {result['elapsed']}s", flush=True)
            log[flavor].append(result)
    path = ROOT / "logs" / "r18-candidates.json"
    path.write_text(json.dumps(log, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"WROTE {path}", flush=True)


if __name__ == "__main__":
    main()
