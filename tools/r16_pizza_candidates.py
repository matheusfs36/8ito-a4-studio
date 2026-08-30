from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "http://127.0.0.1:8794/api/image"
NEGATIVE = (
    "text, letters, logo, watermark, QR, price, plate, saucer, wooden board, cup, box, "
    "packaging, pepperoni, jalapeno, basil leaves everywhere, cheese coins on each slice, "
    "missing slice, lifted slice, cut pizza, sliced pizza, CGI, plastic food, extra objects, "
    "overloaded toppings, crowded toppings, people, hands"
)
BASE = (
    "Isolated 8ito cafe catalog photo, ONLY one whole uncut individual round pizza, "
    "complete circular crust visible, no slice removed, no slice lifted, camera slightly above, "
    "centered on seamless matte dark emerald teal background, about 20 percent empty margin, "
    "soft daylight, gentle contact shadow, photoreal food photography, not CGI, no plate, no board."
)

PIZZAS = [
    {
        "id": "pizza-portuguesa",
        "prompt": (
            f"{BASE} Brazilian Pizza Portuguesa with moderate toppings only: a few cubes of ham, "
            "three or four slices of hard-boiled egg with yolk, a small handful of green peas, "
            "a few black olives and onion on mozzarella and tomato sauce. Not overloaded. "
            "Must look clearly like Brazilian portuguesa, not vegetarian pizza."
        ),
    },
    {
        "id": "pizza-calabresa",
        "prompt": (
            f"{BASE} Brazilian Calabresa pizza: sliced Brazilian calabresa sausage, thicker than "
            "pepperoni, orange-red, slightly curled from heat, with sliced white onion and oregano "
            "on melted mozzarella. No pepperoni, no salami discs with cheese on top, no basil."
        ),
    },
    {
        "id": "pizza-frango",
        "prompt": (
            f"{BASE} Brazilian chicken pizza: abundant shredded roasted chicken clearly visible on top, "
            "creamy catupiry cheese, a few corn kernels, mozzarella. Chicken must be obvious. "
            "Whole uncut pizza, no wooden serving board."
        ),
    },
    {
        "id": "pizza-queijo",
        "prompt": (
            f"{BASE} Simple Brazilian cheese pizza, only bubbling mozzarella and light oregano, "
            "golden browned spots, tomato sauce at the edge, intact round pizza, very appetizing. "
            "No extra garnish beside the pizza, no plate."
        ),
    },
]


def post(product_id: str, prompt: str, n: int) -> dict:
    payload = {
        "prompt": prompt,
        "negativePrompt": NEGATIVE,
        "width": 896,
        "height": 896,
        "steps": 34,
        "cfg": 4.2,
        "sampler": "dpmpp_2m",
        "scheduler": "karras",
        "prefix": f"r16-{product_id}-{n}",
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(API, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=360) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    out: dict[str, list] = {}
    for pizza in PIZZAS:
        pid = pizza["id"]
        out[pid] = []
        for n in range(1, 5):
            print(f"GEN {pid} #{n} ...", flush=True)
            started = time.time()
            result = post(pid, pizza["prompt"], n)
            result["elapsed"] = round(time.time() - started, 1)
            print(f"OK  {pid} #{n} {result.get('url')} {result['elapsed']}s", flush=True)
            out[pid].append(result)
    path = ROOT / "logs" / "r16-pizza-candidates.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"WROTE {path}", flush=True)


if __name__ == "__main__":
    main()
