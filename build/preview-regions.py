"""
预览转换结果（真实合成）
------------------------------------------------------------------
把可填色区域上色，再叠上轮廓线 PNG，
模拟浏览器里看到的真实效果，用眼睛检查有没有白缝。

用法：python build/preview-regions.py downloads/out/4253244
"""

import sys
import json
import random
import re
from pathlib import Path

from PIL import Image, ImageDraw

PALETTE = [
    "#ff6b6b", "#ffa552", "#ffd54a", "#7ed957", "#5fd3c0",
    "#6cb8f2", "#b394f0", "#ffa1c4", "#c08b5c", "#c3c9d4",
    "#4a4038", "#ff9aa2", "#8ecae6", "#b5e48c", "#ffd6a5",
]


def parse_path(d):
    nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", d)]
    return [(nums[i], nums[i + 1]) for i in range(0, len(nums) - 1, 2)]


def render(stem, out_path=None, seed=7):
    stem = Path(stem)
    data = json.loads(
        (stem.parent / f"{stem.name}.regions.json").read_text(encoding="utf-8")
    )
    vx, vy, vw, vh = data["viewBox"]
    W, H = int(vw), int(vh)

    img = Image.new("RGB", (W, H), "white")
    draw = ImageDraw.Draw(img)
    rng = random.Random(seed)

    for d in data["regions"]:
        pts = parse_path(d)
        if len(pts) < 3:
            continue
        color = PALETTE[rng.randrange(len(PALETTE))]
        draw.polygon(pts, fill=color)

    # 叠上轮廓线
    ink_path = stem.parent / f"{stem.name}.ink.png"
    if ink_path.exists():
        ink = Image.open(ink_path).convert("RGBA")
        if ink.size != (W, H):
            ink = ink.resize((W, H), Image.LANCZOS)
        img = Image.alpha_composite(img.convert("RGBA"), ink).convert("RGB")

    out_path = out_path or (stem.parent / f"{stem.name}.preview.png")
    img.save(out_path)
    print(f"{out_path}  ({len(data['regions'])} regions)")
    return out_path


if __name__ == "__main__":
    for a in sys.argv[1:]:
        render(a)
