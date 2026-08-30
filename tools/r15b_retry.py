from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "http://127.0.0.1:8794/api/image"
NEGATIVE = (
    "text, letters, words, logo, watermark, QR, price, menu, flyer, collage, package, box, "
    "window, cardboard, label, pedestal, plate, saucer, bowl, cup, mug, teapot, coffee, "
    "cutlery, wooden board, tablecloth, napkin, 3d render, CGI, plastic food, "
    "cropped, missing slice, lifted slice, people, hands, clutter, extra objects"
)
BASE = (
    "Isolated 8ito cafe catalog photo: ONLY the food, nothing else, centered on seamless "
    "matte dark emerald teal background, 20 percent empty margin, soft daylight upper left, "
    "soft contact shadow, photoreal, not CGI, no plate, no cup, no box, no board."
)

JOBS = [
    {
        "id": "pizza-portuguesa",
        "prompt": (
            f"{BASE} One whole uncut individual round Brazilian Portuguesa pizza, intact circular crust. "
            "Toppings must be diced ham, sliced hard-boiled egg with yellow yolk, green peas, "
            "black olives and onion on mozzarella and tomato sauce. Not jalapeno pizza."
        ),
    },
    {
        "id": "alfajor-chocolate",
        "prompt": (
            f"{BASE} Two chocolate-covered Argentine alfajores, one whole, one halved showing "
            "thick dulce de leche caramel filling inside dark chocolate shell. No packaging."
        ),
    },
    {
        "id": "croissant-chocolate",
        "prompt": (
            f"{BASE} One flaky butter croissant torn to show dark chocolate filling, light powdered sugar. "
            "Single pastry only."
        ),
    },
    {
        "id": "bolo-laranja",
        "prompt": (
            f"{BASE} One small whole orange glazed bundt cake and one thin slice of the same cake beside it, "
            "moist orange crumb. Food only."
        ),
    },
]


def post(job: dict) -> dict:
    payload = {
        "prompt": job["prompt"],
        "negativePrompt": NEGATIVE,
        "width": 896,
        "height": 896,
        "steps": 34,
        "cfg": 4.2,
        "sampler": "dpmpp_2m",
        "scheduler": "karras",
        "prefix": f"r15b-{job['id']}",
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(API, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=360) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    out = []
    for job in JOBS:
        print(f"GEN {job['id']} ...", flush=True)
        started = time.time()
        result = post(job)
        result["productId"] = job["id"]
        result["elapsed"] = round(time.time() - started, 1)
        print(f"OK  {job['id']} {result.get('url')} {result['elapsed']}s", flush=True)
        out.append(result)
    path = ROOT / "logs" / "r15b-retry-manifest.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"WROTE {path}", flush=True)


if __name__ == "__main__":
    main()
