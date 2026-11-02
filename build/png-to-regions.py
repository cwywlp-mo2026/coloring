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


def to_lineart(img):
    """
    把彩色/灰度插画转成"黑白线稿"
    ---------------------------------------------------------------
    有些素材不是纯线稿，而是彩色的扁平插画（棕色身体 + 白色肚皮）。
    直接跑分色算法只会得到"棕色一块、白色一块"，很粗。

    这里先做一步预处理：
      1. 用 Canny 边缘检测找出所有轮廓线
      2. 再把原图的深色部分也加进线条（有些插画没有清晰边缘）
    这样得到的黑白图，算法就能把每个部位分开。

    如果图片本来就是黑白线稿，这一步几乎不改变结果。
    """
    rgb = np.array(img.convert("RGB"))

    # 1. Canny 边缘
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    gray = cv2.bilateralFilter(gray, 7, 50, 50)  # 去噪但保留边缘
    edges = cv2.Canny(gray, 40, 110)

    # 2. 深色区域也当线条（扁平插画里深色的部分通常就是"线"或阴影）
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    dark = cv2.inRange(hsv, (0, 0, 0), (180, 255, 105))  # 低亮度
    saturated = cv2.inRange(hsv, (0, 90, 0), (180, 255, 255))  # 高饱和

    # 线条 = 边缘 ∪ 深色 ∪ 高饱和
    lines = cv2.bitwise_or(edges, dark)
    lines = cv2.bitwise_or(lines, saturated)

    # 3. 闭运算把断裂的线接上
    lines = cv2.morphologyEx(
        lines, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)
    )

    return lines


def find_regions_by_contour(lines, W, H, min_area):
    """
    轮廓层级法找可涂色区域
    ---------------------------------------------------------------
    漫水法的问题：形状叠画在一起时（腿压在身体上），
    内部线条会跟外轮廓连成一片，漫水就从内部漏过去，
    结果所有部位连成一大块。

    轮廓层级法（cv2.RETR_CCOMP）直接找"闭合曲线"：
    一条闭合曲线围出来的就是一个独立区域，
    不管它压没压住别的形状 —— 压住的部分算作"洞"，单独一层。

    返回：[(mask, area), ...] 按面积从大到小
    """
    cnts, hier = cv2.findContours(
        lines, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE
    )
    if hier is None:
        return []

    out = []
    for i, c in enumerate(cnts):
        area = cv2.contourArea(c)
        if area < min_area:
            continue

        # 计算这条曲线在层级里的深度
        # depth=0 最外层（一个完整形状）
        # depth=1 是它里面的洞（比如眼睛在脸里面）
        depth = 0
        parent = hier[0][i][3]
        while parent != -1:
            depth += 1
            parent = hier[0][parent][3]
        if depth > 1:
            continue

        mask = np.zeros((H, W), np.uint8)
        cv2.drawContours(mask, [c], -1, 255, cv2.FILLED)
        # 用实际像素数筛掉太细的碎块
        real = int((mask > 0).sum())
        if real < min_area:
            continue
        out.append((mask, real))

    out.sort(key=lambda t: -t[1])
    return out


def find_background(closed, W, H):
    """
    找出背景区域
    ---------------------------------------------------------------
    坑：很多线稿的笔画会顶到图片边缘，
    这样从四个角漫水根本进不去，背景就找不出来，
    结果整张图被当成一片区域（碎成几百块）。

    解法：先把图片往外补一圈白边，
    保证四个角一定是白的，漫水一定能开始。
    补完再裁回来。

    返回：背景掩膜（255 = 背景）
    """
    pad = max(4, int(min(W, H) * 0.01))
    P = np.pad(closed, pad, constant_values=255)

    h, w = P.shape
    ff_mask = np.zeros((h + 2, w + 2), np.uint8)
    work = np.zeros((h, w), np.uint8)
    work[P == 0] = 255  # 可以走的像素
    for sx, sy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if work[sy, sx]:
            cv2.floodFill(work, ff_mask, (sx, sy), 128)

    background = (work == 128).astype(np.uint8) * 255
    # 裁回原尺寸
    background = background[pad:pad + H, pad:pad + W]
    return background


def convert(src, out_dir=None, min_area=260, target_w=1000, ink_dir=None,
            color_mode="auto", force_solid=False):
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

    # ---------- 判断图片类型 ----------
    rgb_arr = np.array(img)
    saturation = rgb_arr.max(axis=2) - rgb_arr.min(axis=2)
    color_ratio = float((saturation > 30).mean())

    use_color = color_mode == "color" or (
        color_mode == "auto" and color_ratio > 0.06
    )

    # 判断是"线稿"还是"实心块"
    #   线稿：黑色只占很小一部分（<12%），大部分是白的
    #   实心：黑色占比大（>12%），说明图形被填满了
    dark_ratio = float((gray < 128).mean())
    is_solid = force_solid or (
        color_mode == "solid"
        or (color_mode == "auto" and dark_ratio > 0.12)
    )

    # ---------- 提取线条 ----------
    if use_color:
        # 彩色插画：先转成线稿
        lines = to_lineart(img)
    else:
        # 黑白线稿：自适应阈值
        lines = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 15, 8
        )
        lines = cv2.morphologyEx(
            lines, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)
        )

    # ---------- 找闭合区域 ----------
    region_masks = []

    if is_solid:
        # 实心画法（扁平插画）：
        #   图形本身是一大块深色（棕色身体、白色肚皮…），线条只勾外轮廓。
        #   做法：把"同色的连通块"当成可涂色区域。
        solid = (gray < 150).astype(np.uint8) * 255
        solid = cv2.morphologyEx(
            solid, cv2.MORPH_CLOSE,
            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        )
        # 实心画法也要去掉背景：
        # 从四个角出发漫水，把能从边缘到达的白色全标成背景
        bg_closed = cv2.bitwise_not((gray < 150).astype(np.uint8) * 255)
        background = find_background(bg_closed, W, H)
        regions = cv2.bitwise_and(solid, 255 - background)
        lines = cv2.Canny(gray, 40, 120)
    else:
        # 普通线稿。
        #
        # 用"从图片边缘往里漫水"的办法找背景 ——
        # 从四个角出发，凡是能从边缘连通到的白色，都是背景；
        # 被黑线围住的白色，才是可涂色区域。
        #
        # 这个办法比"膨胀线条再找白块"稳得多：
        # 不会把背景当成区域，也不会因为线画得细就漏掉区域。
        k = max(3, int(min(W, H) * 0.004) | 1)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        # 稍微加粗线条，封住抗锯齿造成的缝
        closed = cv2.dilate(lines, kernel, iterations=1)

        background = find_background(closed, W, H)
        # 区域 = 不是背景、也不是线条的像素
        regions = cv2.bitwise_and(255 - closed, 255 - background)

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
    if is_solid:
        # 实心画法：轮廓线 = 深色块的边界（描边）
        # 用 Canny 拿到的边缘，再和深色块边界取交集
        edge = cv2.Canny(gray, 40, 120)
        # 把深色块的边界也加进来（实心图的边界更准）
        solid_edges = cv2.morphologyEx(
            (gray < 150).astype(np.uint8) * 255,
            cv2.MORPH_GRADIENT,
            np.ones((3, 3), np.uint8),
        )
        ink = cv2.bitwise_or(edge, solid_edges)
    else:
        # 黑白线稿：用原图的暗部
        ink = 255 - np.array(img.convert("L"))
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

    # 支持 --color 强制走彩色转线稿的流程
    color_mode = "auto"
    if "--color" in args:
        args.remove("--color")
        color_mode = "color"
    if "--line" in args:
        args.remove("--line")
        color_mode = "line"
    if "--solid" in args:
        args.remove("--solid")
        color_mode = "solid"

    for a in args:
        j, ink, count = convert(
            a,
            min_area=min_area,
            color_mode="solid" if color_mode == "solid" else "auto",
            force_solid=(color_mode == "solid"),
        )
        print(f"{Path(a).name}")
        print(f"  regions -> {j}  ({count} areas)")
        print(f"  ink     -> {ink}")
