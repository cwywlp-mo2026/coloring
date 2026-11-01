"""
线稿 PNG → 可填色区域 + 轮廓线
==================================================================
把一张黑白线稿 PNG，转成网站能用的两层结构：
    1. 可填色区域：把画面里被线条分割出来的白块找出来，每块一个 path
    2. 轮廓线：原始黑线，单独存成带透明通道的 PNG

输出（默认写到 downloads/out/）：
    <name>.regions.json   区域路径 + viewBox
    <name>.ink.png        轮廓线（透明底，黑线）

用法：
    python build/png-to-regions.py downloads/4253244.png downloads/OIP-C.webp
"""

import sys
import json
from pathlib import Path

import numpy as np
import cv2
from PIL import Image


def to_svg_path(mask):
    """布尔掩膜 → SVG path 的 d（只输出 M/L/Z，浏览器和 Python 都能解析）"""
    contours, _ = cv2.findContours(
        mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    parts = []
    for c in contours:
        if cv2.contourArea(c) < 40:
            continue
        eps = 0.0025 * cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, eps, True)
        if len(approx) < 3:
            continue
        pts = approx.reshape(-1, 2)
        d = f"M{pts[0][0]:.1f},{pts[0][1]:.1f}"
        for x, y in pts[1:]:
            d += f"L{x:.1f},{y:.1f}"
        d += "Z"
        parts.append(d)
    return " ".join(parts)


def convert(src, out_dir=None, min_area=260, target_w=1000, ink_dir=None):
    src = Path(src)
    out_dir = Path(out_dir) if out_dir else src.parent / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    ink_dir = Path(ink_dir) if ink_dir else out_dir
    ink_dir.mkdir(parents=True, exist_ok=True)

    # ---------- 读图（透明底先铺白） ----------
    img = Image.open(src).convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    img = Image.alpha_composite(bg, img).convert("RGB")

    W, H = img.size
    scale = target_w / W
    if scale > 1:
        img = img.resize((target_w, int(round(H * scale))), Image.LANCZOS)
    W, H = img.size

    gray = np.array(img.convert("L"))

    # ---------- 提取线条 ----------
    lines = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 15, 8
    )
    lines = cv2.morphologyEx(lines, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))

    # ---------- 找闭合区域 ----------
    # 膨胀线条，让线之间的小缝隙闭合，形成独立的"白色块"
    k = max(3, int(min(W, H) * 0.006) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    closed = cv2.dilate(lines, kernel, iterations=1)
    regions = cv2.bitwise_not(closed)

    # 去掉贴边的（那是背景）
    border = max(2, int(min(W, H) * 0.004))
    regions[:border, :] = 0
    regions[-border:, :] = 0
    regions[:, :border] = 0
    regions[:, -border:] = 0

    # 去掉碎块
    n, labels, stats, _ = cv2.connectedComponentsWithStats(regions, 8)
    clean = np.zeros_like(regions)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            clean[labels == i] = 255

    # ---------- 逐个区域提取路径 ----------
    n2, labels2, stats2, _ = cv2.connectedComponentsWithStats(clean, 8)
    order = sorted(
        range(1, n2), key=lambda i: stats2[i, cv2.CC_STAT_AREA], reverse=True
    )
    paths = []
    for i in order:
        d = to_svg_path((labels2 == i).astype(np.uint8) * 255)
        if d:
            paths.append(d)

    # ---------- 轮廓线 PNG（透明底 + 黑线） ----------
    ink = np.array(img.convert("L"))
    ink = 255 - ink  # 线条=255，其他=0
    # 加粗：线宽要按图片尺寸算，保证缩略图（约 120px）和画布（约 600px）
    # 里看起来一样清楚。基础线宽是 1024px 图上的 9px。
    lw = max(3, int(round(W * 0.009)) | 1)
    ink = cv2.dilate(
        ink, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (lw, lw)), iterations=1
    )
    ink_rgba = np.zeros((H, W, 4), np.uint8)
    ink_rgba[..., 0] = 40  # 深棕黑，和手写线稿一致
    ink_rgba[..., 1] = 36
    ink_rgba[..., 2] = 32
    ink_rgba[..., 3] = ink

    ink_path = ink_dir / f"{src.stem}.ink.png"
    Image.fromarray(ink_rgba, "RGBA").save(ink_path)

    # ---------- 写 JSON ----------
    out_json = out_dir / f"{src.stem}.regions.json"
    data = {
        "source": src.name,
        "viewBox": [0, 0, W, H],
        "ink": f"img/ink/{src.stem}.ink.png",
        "regions": paths,
    }
    out_json.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    return out_json, ink_path, len(paths)


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)

    # 支持 --min-area N 调整"多小的碎块要丢掉"
    min_area = 260
    if "--min-area" in args:
        i = args.index("--min-area")
        min_area = int(args[i + 1])
        del args[i : i + 2]

    for a in args:
        j, ink, count = convert(a, min_area=min_area)
        print(f"{Path(a).name}")
        print(f"  regions -> {j}  ({count} areas)")
        print(f"  ink     -> {ink}")
