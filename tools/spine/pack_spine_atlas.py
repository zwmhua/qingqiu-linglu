"""Pack Stretchy's 24 full-canvas images into one Spine 4.2 atlas page."""

import shutil
import sys
from pathlib import Path
from PIL import Image

SIZE = 1024
PADDING = 4


def pack(source, destination):
    images = []
    for path in sorted((source / "images").glob("*.png")):
        image = Image.open(path).convert("RGBA")
        if image.size != (768, 768):
            raise ValueError(f"wrong canvas: {path}")
        box = image.getbbox()
        if not box:
            raise ValueError(f"empty layer: {path}")
        images.append((path.stem, image, box))
    if len(images) != 24:
        raise ValueError(f"expected 24 layers, got {len(images)}")

    # Height-sorted shelf packing, no rotation. Four transparent pixels separate
    # regions so linear sampling cannot reach an adjacent part.
    images.sort(key=lambda entry: entry[2][3] - entry[2][1], reverse=True)
    placement = {}
    x = y = row_height = 0
    for name, image, (left, top, right, bottom) in images:
        width, height = right - left, bottom - top
        padded_width, padded_height = width + 2 * PADDING, height + 2 * PADDING
        if x + padded_width > SIZE:
            x = 0
            y += row_height
            row_height = 0
        if y + padded_height > SIZE:
            raise ValueError(f"atlas exceeds {SIZE}x{SIZE} at {name}")
        placement[name] = (x + PADDING, y + PADDING, width, height,
                           left, 768 - bottom, top, right, bottom)
        x += padded_width
        row_height = max(row_height, padded_height)

    atlas_image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    for name, image, box in images:
        px, py, width, height, *_ = placement[name]
        atlas_image.alpha_composite(image.crop(box), (px, py))

    # New 4.x atlas syntax: bounds are page coordinates; offsets restore the
    # 768x768 attachment frame after transparent trimming.
    lines = ["skeleton.png", f"size: {SIZE}, {SIZE}", "format: RGBA8888",
             "filter: Linear, Linear", "repeat: none", "pma: false"]
    for name, _, _ in images:
        px, py, width, height, left, offset_bottom, *_ = placement[name]
        lines += [name, f"  bounds: {px}, {py}, {width}, {height}",
                  f"  offsets: {left}, {offset_bottom}, 768, 768",
                  "  rotate: false", "  index: -1"]

    destination.mkdir(parents=True, exist_ok=False)
    atlas_image.save(destination / "skeleton.png", optimize=True, compress_level=9)
    (destination / "skeleton.atlas").write_text("\n".join(lines) + "\n", encoding="utf-8")
    shutil.copyfile(source / "skeleton.42b.json", destination / "skeleton.json")

    # Reconstruct each attachment from packed pixels and offsets, pixel exact.
    for name, image, _ in images:
        px, py, width, height, left, _, top, _, _ = placement[name]
        reconstructed = Image.new("RGBA", (768, 768), (0, 0, 0, 0))
        reconstructed.alpha_composite(atlas_image.crop((px, py, px + width, py + height)),
                                      (left, top))
        a = image.copy()
        a.putdata([(0, 0, 0, 0) if pixel[3] == 0 else pixel for pixel in a.getdata()])
        if reconstructed.tobytes() != a.tobytes():
            raise ValueError(f"packed pixels differ: {name}")
    print(f"packed 24 layers into {SIZE}x{SIZE}; occupied height {y + row_height}")
    for name in ("skeleton.json", "skeleton.atlas", "skeleton.png"):
        path = destination / name
        print(f"{name}: {path.stat().st_size} bytes")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: pack_spine_atlas.py SOURCE_DIRECTORY OUTPUT_DIRECTORY")
    pack(Path(sys.argv[1]), Path(sys.argv[2]))
