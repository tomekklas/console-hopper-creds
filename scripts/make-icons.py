#!/usr/bin/env python3
"""Draw the extension icons: a brass tile with a white key.

Usage: python3 scripts/make-icons.py   (needs Pillow)
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
BRASS = (181, 112, 28, 255)
WHITE = (255, 250, 241, 255)


def draw(size: int) -> Image.Image:
    s = 8  # supersample
    n = size * s
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = n * 0.22
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=r, fill=BRASS)
    # Key: a ring at bottom-left, a shaft to the top-right, two teeth.
    w = max(2, int(n * 0.11))
    ring_c = (n * 0.34, n * 0.66)
    ring_r = n * 0.17
    d.ellipse([ring_c[0] - ring_r, ring_c[1] - ring_r, ring_c[0] + ring_r, ring_c[1] + ring_r], outline=WHITE, width=w)
    a = (ring_c[0] + ring_r * 0.72, ring_c[1] - ring_r * 0.72)
    b = (n * 0.82, n * 0.18)
    d.line([a, b], fill=WHITE, width=w)
    # teeth: perpendicular-ish short strokes near the tip
    for t, length in ((0.70, 0.13), (0.84, 0.10)):
        px = a[0] + (b[0] - a[0]) * t
        py = a[1] + (b[1] - a[1]) * t
        d.line([(px, py), (px + n * length, py + n * length)], fill=WHITE, width=w)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        draw(size).save(OUT / f"icon{size}.png")
        print("wrote", OUT / f"icon{size}.png")
