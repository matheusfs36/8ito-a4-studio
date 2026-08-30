from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "http://127.0.0.1:8794/api/image"
NEGATIVE = (
    "text, letters, price, logo, watermark, QR code, menu card, flyer, collage, package, "
    "pedestal, display stand, plate, cutlery, tablecloth, wooden table, teapot, extra cup, "
    "3d render, CGI, plastic food, unreal engine, octane, surreal, distorted food, "
    "cropped object, close-up crop, cut off edges, missing slice, lifted slice, "
    "duplicate product, clutter, people, hands, studio backdrop paper roll visible"
)
STYLE = (
    "Professional isolated cafe menu product photo matching the 8ito Infinito Cafe catalog: "
    "subject fully visible and centered on a seamless matte dark emerald teal studio backdrop, "
    "about 20 percent empty margin all around, soft diffused daylight from upper left, "
    "gentle natural contact shadow on the green surface, realistic bakery texture with small "
    "real imperfections, appetizing, photograph not CGI, no plate, no tableware, no graphics."
)

JOBS = [
    {
        "id": "pizza-portuguesa",
        "prompt": (
            f"{STYLE} ONE whole individual round Portuguese pizza, complete circular crust, "
            "no missing slice, no lifted slice, camera slightly above, toppings of ham cubes, "
            "sliced hard-boiled egg, green peas, black olives and onion on melted mozzarella "
            "and tomato sauce, golden cornicione."
        ),
    },
    {
        "id": "pizza-calabresa",
        "prompt": (
            f"{STYLE} ONE whole individual round Calabresa pizza, complete circular crust, "
            "no missing slice, no lifted slice, camera slightly above, sliced Brazilian "
            "calabresa sausage, onion rings, oregano, melted mozzarella, golden cornicione."
        ),
    },
    {
        "id": "pizza-frango",
        "prompt": (
            f"{STYLE} ONE whole individual round chicken pizza, complete circular crust, "
            "no missing slice, no lifted slice, camera slightly above, shredded roasted chicken, "
            "creamy catupiry cheese, corn kernels, melted mozzarella, golden cornicione."
        ),
    },
    {
        "id": "pizza-queijo",
        "prompt": (
            f"{STYLE} ONE whole individual round cheese pizza, complete circular crust, "
            "no missing slice, no lifted slice, camera slightly above, bubbling mozzarella "
            "and mild yellow cheese, light oregano, tomato sauce edge, golden cornicione."
        ),
    },
    {
        "id": "alfajor-chocolate",
        "prompt": (
            f"{STYLE} Two Argentine chocolate-covered alfajores, one whole and one halved to "
            "show dulce de leche filling inside dark chocolate coating, cocoa dust, "
            "no powdered sugar mountain, no sandwich cookie branding."
        ),
    },
    {
        "id": "croissant-chocolate",
        "prompt": (
            f"{STYLE} One butter croissant torn open to show thick dark chocolate filling, "
            "flaky laminated layers, light powdered sugar, isolated, no extra coffee cup, "
            "no plate, no second pastry."
        ),
    },
    {
        "id": "bolo-laranja",
        "prompt": (
            f"{STYLE} One whole small orange bundt or loaf cake with glossy orange glaze, "
            "a thin slice beside it showing orange crumb, isolated, no teapot, no extra dishes."
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
        "cfg": 4.5,
        "sampler": "dpmpp_2m",
        "scheduler": "karras",
        "prefix": f"r15-{job['id']}",
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
        try:
            result = post(job)
            result["productId"] = job["id"]
            result["elapsed"] = round(time.time() - started, 1)
            print(f"OK  {job['id']} {result.get('url')} seed={result.get('seed')} {result['elapsed']}s", flush=True)
            out.append(result)
        except Exception as exc:
            print(f"FAIL {job['id']}: {exc}", flush=True)
            out.append({"productId": job["id"], "error": str(exc)})
    manifest = ROOT / "logs" / "r15-generate-manifest.json"
    manifest.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"WROTE {manifest}", flush=True)


if __name__ == "__main__":
    main()
