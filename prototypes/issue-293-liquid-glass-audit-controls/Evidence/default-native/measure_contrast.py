"""Read retained sRGB screenshots; compare dominant glyph and background pixels."""

from collections import Counter
from pathlib import Path
import re

from PIL import Image

ROOT = Path(__file__).parent
CASES = [
    ("default", "normal/80C13450-5EC0-4E09-86E9-CE28F171EC1D.png",
     "normal/1DDB6788-5C21-48F3-96E8-7A78826AAED6.txt"),
    ("increase-contrast", "increase-contrast/543AD861-3379-4527-906A-232A995ED6BB.png",
     "increase-contrast/0C8EF7D6-C486-41B5-B433-5409498E6272.txt"),
    ("increase-contrast", "increase-contrast/10122CD4-1F5E-4198-8262-FF1A8A91A643.png",
     "increase-contrast/693FDC83-0DB0-4D92-A04D-87B5A8F774C8.txt"),
]


def luminance(rgb):
    channels = [value / 255 for value in rgb]
    linear = [value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4
              for value in channels]
    return sum(weight * value for weight, value in zip((0.2126, 0.7152, 0.0722), linear))


for state, screenshot, inventory in CASES:
    image = Image.open(ROOT / screenshot)
    assert "srgb" in image.info, "Color conversion required for a non-sRGB screenshot"
    image = image.convert("RGB")
    for line in (ROOT / inventory).read_text().splitlines():
        parts = line.split(" | ")
        if len(parts) != 3 or parts[1] not in {"Noun", "ALTERNATIVES", "Add Note", "#115", "Best Matches"}:
            continue
        x, y, width, height = map(float, re.findall(r"-?\d+(?:\.\d+)?", parts[2]))
        if parts[1] == "Add Note" and width > 200:
            continue  # Choose the text label, not its full-width containing button.
        pixels = Counter(image.crop(tuple(round(value * 3) for value in
                                          (x, y, x + width, y + height))).getdata())
        background = pixels.most_common(1)[0][0]
        foreground = next(color for color, _ in pixels.most_common()
                          if luminance(background) - luminance(color) > 0.15)
        ratio = (luminance(background) + 0.05) / (luminance(foreground) + 0.05)
        print(state, parts[1], background, foreground, f"{ratio:.3f}:1")
