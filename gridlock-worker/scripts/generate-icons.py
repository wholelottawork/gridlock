#!/usr/bin/env python3
"""Generate build/icon.png and build/icon.ico from the Gridlock chevron mark."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
SIZES = (16, 32, 48, 64, 128, 256)

# viewBox 0 0 100 86 — three stacked chevrons (matches gridlock-web logo)
CHEVRONS = (
    ((14, 4), (50, 40), (86, 4)),
    ((-6, 4), (50, 60), (106, 4)),
    ((-26, 4), (50, 80), (126, 4)),
)


def _scale_point(x: float, y: float, size: int, pad: float) -> tuple[float, float]:
    inner = size - pad * 2
    sx = inner / 100.0
    sy = inner / 86.0
    return pad + x * sx, pad + y * sy


def render(size: int, *, transparent: bool = False) -> Image.Image:
    bg = (0, 0, 0, 0) if transparent else (10, 10, 10, 255)
    img = Image.new("RGBA", (size, size), bg)
    draw = ImageDraw.Draw(img)
    pad = max(2, round(size * 0.12))
    stroke = max(2, round(size * 0.075))
    color = (255, 255, 255, 255)

    for a, b, c in CHEVRONS:
        pts = [_scale_point(x, y, size, pad) for x, y in (a, b, c)]
        draw.line(pts, fill=color, width=stroke, joint="curve")

    return img


def main() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    png_path = BUILD / "icon.png"
    ico_path = BUILD / "icon.ico"

    master = render(512, transparent=True)
    master.save(png_path)

    icons = [render(s, transparent=False) for s in SIZES]
    icons[-1].save(
        ico_path,
        format="ICO",
        sizes=[(s, s) for s in SIZES],
        append_images=icons[:-1],
    )

    print(f"Wrote {png_path}")
    print(f"Wrote {ico_path}")


if __name__ == "__main__":
    main()
