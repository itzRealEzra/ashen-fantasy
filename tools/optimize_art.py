"""Optimize the game's art: big PNGs become small WebP files.

The art was drawn at 1254x1254 and weighed 2.6 MB a piece -- 60 MB of item
pictures alone, all of them shown in a 40-pixel slot. This rewrites them as
WebP at a size the game actually draws, and leaves the originals out of the
way (git keeps them; the web build only needs the small files).

Usage:
    python tools/optimize_art.py            # every art folder
    python tools/optimize_art.py --check    # report only, change nothing

New art: drop a PNG into the folder (assets/items/<id>.png) and run this
again. WebP is served directly, so nothing else has to change.
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "public", "assets")

# folder -> (max side, keep the png?)
PLAN = {
    "items": (512, False),
    "herb": (512, False),
    "enemies": (640, False),
    "icons": (256, False),
    "rarity": (256, False),
    "character": (1024, True),
    "background": (2048, True),
    "do not remove": (0, True),
}


def convert(path, max_side, keep_png):
    """Rewrite one picture as WebP. Returns (before, after) bytes."""
    before = os.path.getsize(path)
    with Image.open(path) as im:
        im = im.convert("RGBA")
        if max_side and max(im.size) > max_side:
            scale = max_side / float(max(im.size))
            im = im.resize((max(1, int(im.width * scale)),
                            max(1, int(im.height * scale))), Image.LANCZOS)
        out = os.path.splitext(path)[0] + ".webp"
        im.save(out, "WEBP", quality=82, method=4)
    after = os.path.getsize(out)
    if not keep_png:
        os.remove(path)
    return before, after


def main():
    check = "--check" in sys.argv
    total_before = total_after = 0
    for folder, (max_side, keep_png) in PLAN.items():
        d = os.path.join(ASSETS, folder)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if not fn.lower().endswith(".png"):
                continue
            path = os.path.join(d, fn)
            if check:
                try:
                    with Image.open(path) as im:
                        size = im.size
                except Exception:
                    size = "?"
                print("%-12s %-40s %-12s %.1f MB" % (
                    folder, fn, size, os.path.getsize(path) / 1048576.0))
                total_before += os.path.getsize(path)
                continue
            before, after = convert(path, max_side, keep_png)
            total_before += before
            total_after += after
            print("%-12s %-40s %6.2f MB -> %6.2f MB" % (
                folder, fn, before / 1048576.0, after / 1048576.0))
    if not check:
        print("\nTotal: %.1f MB -> %.1f MB" % (
            total_before / 1048576.0, total_after / 1048576.0))


if __name__ == "__main__":
    main()
