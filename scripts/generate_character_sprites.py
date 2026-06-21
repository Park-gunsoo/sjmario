from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "img"
OUTPUT_DIR = ROOT / "public" / "assets" / "characters"
CANVAS_SIZE = (72, 88)
GRID = (5, 4)

SHEETS = {
    "dad": "dad.png",
    "mom": "mom.png",
    "kid-seojin": "seojin.png",
    "kid-seojun": "seojun.png",
}

FRAMES = {
    "idle": 0,
    "walk-0": 5,
    "walk-1": 6,
    "walk-2": 7,
    "walk-3": 8,
    "walk-4": 9,
    "jump": 12,
}


def is_background(pixel: tuple[int, int, int]) -> bool:
    r, g, b = pixel
    mean = (r + g + b) // 3
    spread = max(r, g, b) - min(r, g, b)

    near_white = r > 235 and g > 235 and b > 235 and spread < 35
    neutral_grid = spread < 10 and 165 < mean < 245
    return near_white or neutral_grid


def flood_background_alpha(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    rgb = image.convert("RGB")
    width, height = rgba.size
    pixels = rgb.load()
    alpha = rgba.load()
    visited = set()
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
      queue.append((x, 0))
      queue.append((x, height - 1))
    for y in range(height):
      queue.append((0, y))
      queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if (x, y) in visited or x < 0 or y < 0 or x >= width or y >= height:
            continue

        visited.add((x, y))
        if not is_background(pixels[x, y]):
            continue

        r, g, b, _ = alpha[x, y]
        alpha[x, y] = (r, g, b, 0)
        queue.append((x + 1, y))
        queue.append((x - 1, y))
        queue.append((x, y + 1))
        queue.append((x, y - 1))

    return rgba


def crop_frame(sheet: Image.Image, frame_index: int) -> Image.Image:
    cols, rows = GRID
    col = frame_index % cols
    row = frame_index // cols
    width, height = sheet.size
    x0 = round(width * col / cols)
    x1 = round(width * (col + 1) / cols)
    y0 = round(height * row / rows)
    y1 = round(height * (row + 1) / rows)

    cell = flood_background_alpha(sheet.crop((x0, y0, x1, y1)))
    bbox = cell.getbbox()
    if bbox is None:
        return Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))

    left, top, right, bottom = bbox
    pad = 6
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(cell.width, right + pad)
    bottom = min(cell.height, bottom + pad)
    trimmed = cell.crop((left, top, right, bottom))

    max_width = CANVAS_SIZE[0] - 6
    max_height = CANVAS_SIZE[1] - 4
    scale = min(max_width / trimmed.width, max_height / trimmed.height)
    resized = trimmed.resize(
        (max(1, round(trimmed.width * scale)), max(1, round(trimmed.height * scale))),
        Image.Resampling.LANCZOS,
    )

    canvas = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    x = (CANVAS_SIZE[0] - resized.width) // 2
    y = CANVAS_SIZE[1] - resized.height - 2
    canvas.alpha_composite(resized, (x, y))
    return canvas


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for character, filename in SHEETS.items():
        sheet = Image.open(SOURCE_DIR / filename).convert("RGB")
        character_dir = OUTPUT_DIR / character
        character_dir.mkdir(parents=True, exist_ok=True)

        for output_name, frame_index in FRAMES.items():
            frame = crop_frame(sheet, frame_index)
            frame.save(character_dir / f"{output_name}.png")

    print(f"Generated character sprites in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
