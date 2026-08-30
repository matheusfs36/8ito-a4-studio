from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "http://127.0.0.1:8794/api/image"

NEGATIVE_PIZZA = (
    "text, letters, logo, watermark, QR, price, white plate, ceramic plate, saucer, dish, "
    "wooden board, cutting board, marble, tray, parchment, cup, teacup, box, packaging, "
    "pepperoni, American pepperoni, Italian salami, jalapeno, basil leaves, pesto, "
    "meatballs, orange fruit, cheese coins, fried egg, sunny-side-up egg, giant egg, "
    "too many eggs, overloaded toppings, missing slice, lifted slice, cut pizza, sliced pizza, "
    "CGI, 3D render, plastic food, extra objects, people, hands, gourmet plating"
)
NEGATIVE_BOLO = (
    "text, letters, logo, watermark, QR, price, teacup, cup, mug, saucer, tea, coffee, "
    "two cakes, cake and slice together, repeating mini bundt cakes, grid of cakes, "
    "pedestal, cake stand, extra dishes, CGI, plastic, people, hands"
)
ISOLATED = (
    "Isolated 8ito cafe catalog photo on seamless matte dark emerald teal background, "
    "about 20 percent empty margin, product fully visible and centered, soft daylight, "
    "gentle contact shadow, photoreal Brazilian pizzeria food photography, not CGI, "
    "no plate, no wooden board, no marble, no tray."
)

JOBS = [
    {
        "id": "pizza-portuguesa",
        "negative": NEGATIVE_PIZZA,
        "prompt": (
            f"{ISOLATED} One whole uncut individual round Brazilian Pizza Portuguesa. "
            "Golden mozzarella and tomato sauce. Moderate toppings only: cubes of ham, "
            "sliced white onion, three slices of hard-boiled egg with yolk visible, "
            "a few black olives, a small scatter of green peas. Peas optional and sparse. "
            "Looks like a real Brazilian neighborhood pizzeria, not gourmet international. "
            "No fried eggs, no sunny-side-up eggs, no white plate."
        ),
    },
    {
        "id": "pizza-calabresa",
        "negative": NEGATIVE_PIZZA,
        "prompt": (
            f"{ISOLATED} One whole uncut individual round Brazilian Calabresa pizza. "
            "Thick coins of Brazilian smoked calabresa sausage, about 3 to 4 centimeters wide, "
            "orange-red pork sausage with slightly curled cooked edges, mixed with sliced "
            "white onion rings and modest melted mozzarella, light oregano only. "
            "Must look like Brazilian calabresa, not pepperoni, not salami, no basil, "
            "no meatballs, no fruit, no cheese discs on each slice."
        ),
    },
    {
        "id": "pizza-frango",
        "negative": NEGATIVE_PIZZA,
        "prompt": (
            f"{ISOLATED} One whole uncut individual round Brazilian chicken pizza. "
            "Plenty of shredded roasted chicken clearly visible on top, melted mozzarella, "
            "small irregular blobs of creamy catupiry cheese naturally melted, not piped, "
            "not a star pattern, not a geometric design. Optional few corn kernels. "
            "No wooden serving board, no plate, no basil carpet."
        ),
    },
    {
        "id": "pizza-queijo",
        "negative": NEGATIVE_PIZZA,
        "prompt": (
            f"{ISOLATED} One whole uncut individual round simple Brazilian cheese pizza. "
            "Even bubbling mozzarella covering the tomato sauce, a few golden browned spots, "
            "almost no herbs, no basil cross, no garnish beside the pizza. "
            "Plain, appetizing, whole circular crust fully in frame. No plate, no tray."
        ),
    },
    {
        "id": "bolo-laranja",
        "negative": NEGATIVE_BOLO,
        "prompt": (
            "Isolated 8ito cafe catalog photo of ONE homemade Brazilian orange cake, "
            "a single whole round bolo de laranja with glossy orange glaze, moist crumb visible "
            "at a small cut face if needed but still one cake only, centered on seamless matte "
            "dark emerald teal background, 20 percent empty margin, soft natural daylight, "
            "gentle shadow, photoreal, not CGI. No teacup, no second slice on a saucer, "
            "no repeating mini cakes, no pedestal, no extra dishes."
        ),
    },
]


def post(product_id: str, prompt: str, negative: str, n: int) -> dict:
    payload = {
        "prompt": prompt,
        "negativePrompt": negative,
        "width": 896,
        "height": 896,
        "steps": 34,
        "cfg": 4.2,
        "sampler": "dpmpp_2m",
        "scheduler": "karras",
        "prefix": f"r17-{product_id}-{n}",
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(API, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=360) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    out: dict[str, list] = {}
    for job in JOBS:
        pid = job["id"]
        out[pid] = []
        for n in range(1, 5):
            print(f"GEN {pid} #{n} ...", flush=True)
            started = time.time()
            result = post(pid, job["prompt"], job["negative"], n)
            result["elapsed"] = round(time.time() - started, 1)
            print(f"OK  {pid} #{n} {result.get('url')} {result['elapsed']}s", flush=True)
            out[pid].append(result)
    path = ROOT / "logs" / "r17-candidates.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"WROTE {path}", flush=True)


if __name__ == "__main__":
    main()
