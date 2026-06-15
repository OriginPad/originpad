#!/usr/bin/env python3
# Generate 3D landing assets via OpenAI gpt-image-1 (transparent PNG).
# Usage:
#   export OPENAI_API_KEY="sk-..."
#   python3 gen-assets.py portal              # one asset (test)
#   python3 gen-assets.py all                 # everything
import requests, base64, os, sys

KEY = os.environ.get("OPENAI_API_KEY")
if not KEY and os.path.exists("/root/openai.key"):
    KEY = open("/root/openai.key").read().strip()
if not KEY:
    print("ERROR: set OPENAI_API_KEY or write the key to /root/openai.key"); sys.exit(1)

OUT = "frontend/public/landing"
os.makedirs(OUT, exist_ok=True)

STYLE = ("3D render, fantasy game asset, dreamy lavender and violet palette, "
         "soft cinematic studio lighting, high detail, single isolated object, "
         "centered, clean transparent background, no text, no words")

ASSETS = {
  "portal":   ("a glowing magical portal archway of ornate stone and metal on a small floating fantasy island base, a glowing hexagonal violet crystal in the center, violet energy", "1024x1536"),
  "vault":    ("a round armored metallic vault door with a glowing hexagonal emblem in the center, violet glow accents", "1024x1024"),
  "orb":      ("a glowing hexagonal energy orb of violet and purple light, floating, on a small metal pedestal", "1024x1024"),
  "book":     ("an ancient glowing spellbook lying open flat with a magnifying glass resting on it and small violet crystals beside it", "1024x1024"),
  "island":   ("a small floating fantasy island with a grassy top, purple flowers, glowing violet crystals, and a rocky underside", "1536x1024"),
  "logo_hex": ("a glowing violet hexagonal crystal emblem with a plus symbol in the center, polished premium logo mark", "1024x1024"),
  "coin":     ("a stack of glowing violet crypto token coins with a hexagon motif, floating, metallic, with a small clock or calendar element suggesting a schedule", "1024x1024"),
}

def gen(name):
    desc, size = ASSETS[name]
    path = f"{OUT}/{name}.png"
    if os.path.exists(path):
        print("skip (sudah ada):", name); return True
    print("generating", name, "...")
    r = requests.post("https://api.openai.com/v1/images/generations",
        headers={"Authorization": f"Bearer {KEY}"},
        json={"model": "gpt-image-1", "prompt": f"{desc}. {STYLE}",
              "size": size, "quality": "high", "background": "transparent",
              "output_format": "png", "n": 1}, timeout=300)
    d = r.json()
    if "data" not in d:
        print(name, "ERROR:", d); return False
    open(path, "wb").write(base64.b64decode(d["data"][0]["b64_json"]))
    print("  saved", path)
    return True

which = sys.argv[1] if len(sys.argv) > 1 else "portal"
names = list(ASSETS) if which == "all" else [which]
for n in names:
    if n in ASSETS:
        gen(n)
print("DONE")
