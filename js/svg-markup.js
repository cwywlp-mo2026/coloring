/**
 * 线稿 → SVG 字符串（纯函数，不碰 DOM）
 * ---------------------------------------------------------------
 * 浏览器端和构建脚本（生成静态页面）共用这一份逻辑，
 * 保证"搜索引擎看到的静态页"和"用户玩到的动态页"永远是同一张图。
 */

/** HTML 属性值转义 */
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 分类对应的纸张底色 */
export const PAPER_COLORS = {
  animal: "#fff7f2",
  flower: "#f4fbf7",
  vehicle: "#f3f8fd",
  fruit: "#fffbf0",
  dino: "#f7f4fe",
  princess: "#fff5fa",
  truck: "#fff6f1",
};

export function paperColor(categoryId) {
  return PAPER_COLORS[categoryId] || "#ffffff";
}

/** viewBox：四边各留 24 单位的余量 */
export const VIEW_BOX = "-24 -24 248 248";

/**
 * 把一张线稿渲染成 SVG 的字符串
 * @param art  线稿对象
 * @param opts
 *   - mode: "paint" | "thumb"
 *   - assetBase: 图片线稿的相对路径前缀（静态页在 /paint/ 下一层，需要 "../"）
 */
export function artToSvgMarkup(art, opts = {}) {
  const { mode = "thumb", assetBase = "", inkAbs = "" } = opts;
  const blushes = art.blush || [];
  const isPaint = mode === "paint";

  const parts = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" ` +
      `preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(art.name)}"` +
      (isPaint
        ? ` class="paper__art" data-art-id="${esc(art.id)}"`
        : ` aria-hidden="true"`) +
      `>`
  );

  // 底色（缩略图是分类色，画布是纯白）
  parts.push(
    `<rect x="-24" y="-24" width="248" height="248" fill="${
      isPaint ? "#ffffff" : paperColor(art.category)
    }"/>`
  );

  // ---- 图片线稿：走另一条渲染路径 ----
  if (art.regions && art.ink) {
    parts.push(imageArtMarkup(art, isPaint, assetBase, inkAbs));
    parts.push(`</svg>`);
    return parts.join("");
  }

  // 整体放进一个组，方便统一做自适应缩放
  const tf = art.transform;
  const transform = tf
    ? ` transform="translate(${(100 - tf.cx * tf.scale).toFixed(2)} ${
        (100 - tf.cy * tf.scale).toFixed(2)
      }) scale(${tf.scale.toFixed(3)})"`
    : "";
  parts.push(`<g${transform}>`);

  const regionIndex = { n: 0 };
  const fills = [];
  const inks = [];

  for (const shape of art.shapes) {
    const d = shapeToDLocal(shape);
    if (!d) continue;

    if (shape.t === "f") {
      // 只填色（腮红），不可点击
      fills.push(
        `<path d="${esc(d)}" fill="#ffb3c7" class="ink--fill"/>`
      );
      continue;
    }

    if (shape.t === "l") {
      // 纯线条细节
      inks.push(`<path d="${esc(d)}" class="ink"/>`);
      continue;
    }

    // 可填色区域
    const r = String(regionIndex.n++);
    fills.push(
      `<path d="${esc(d)}" class="region" fill="#ffffff" data-r="${r}"/>`
    );
    inks.push(`<path d="${esc(d)}" class="ink"/>`);
  }

  parts.push(`<g class="fills">${fills.join("")}</g>`);
  parts.push(`<g class="inks">${inks.join("")}</g>`);

  // 腮红单独一层，永远在最上面
  if (blushes.length) {
    const bl = blushes
      .map((shape) => {
        const d = shapeToDLocal(shape);
        if (!d) return "";
        return `<path d="${esc(d)}" fill="#ffb3c7" opacity="0.75"/>`;
      })
      .join("");
    parts.push(`<g class="blush">${bl}</g>`);
  }

  parts.push(`</g>`);

  // 描边宽度：缩略图粗一点才好看
  const sw = isPaint ? 3 : 4;
  parts.push(
    `<style>.ink{stroke-width:${sw}px;vector-effect:non-scaling-stroke}` +
      `.ink--fill{pointer-events:none}</style>`
  );

  parts.push(`</svg>`);

  return parts.join("");
}

/* ------------------------------------------------------------------
   图片线稿（从 PNG 转来的）
   ------------------------------------------------------------------ */

/**
 * 渲染一张"图片线稿"
 * ---------------------------------------------------------------
 * 结构：
 *   <g class="fills">  <path class="region"> ...  ← 可填色
 *   <g class="inks">   <image href="...ink.png">  ← 黑色轮廓线
 *
 * 图片线稿用的是自己的 viewBox（像素坐标），不是统一的 200x200，
 * 所以这里要单独套一层 transform 把它缩放到画布中间。
 */
function imageArtMarkup(art, isPaint, assetBase = "", inkAbs = "") {
  const [vx, vy, vw, vh] = art.viewBox;
  // 缩放到 200x200 画布里（留 8 单位边距）
  const pad = 8;
  const scale = Math.min((200 - pad * 2) / vw, (200 - pad * 2) / vh);
  const tx = 100 - (vx + vw / 2) * scale;
  const ty = 100 - (vy + vh / 2) * scale;

  const parts = [];
  parts.push(
    `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">`
  );

  // 可填色区域
  const fills = art.regions
    .map(
      (d, i) =>
        `<path d="${esc(d)}" class="region" fill="#ffffff" data-r="${i}"/>`
    )
    .join("");
  parts.push(`<g class="fills">${fills}</g>`);

  // 轮廓线（图片）：描边宽度要跟着缩放走，所以用 vector-effect
  // inkAbs：生成 OG 配图时传的绝对 URL
  // assetBase：静态页在 /paint/ 下一层，要加 "../"
  const inkSrc = inkAbs || `${assetBase}${art.ink}`;
  parts.push(
    `<g class="inks">` +
      `<image href="${esc(inkSrc)}" x="${vx}" y="${vy}" width="${vw}" height="${vh}" ` +
      `preserveAspectRatio="none" style="pointer-events:none"/>` +
      `</g>`
  );

  parts.push(`</g>`);

  // 缩略图里轮廓线是原图颜色，画布里也是原图颜色，不用额外处理
  return parts.join("");
}

/* ------------------------------------------------------------------
   局部副本：避免为了一个函数而把整个 art.js 拉进构建脚本
   （art.js 在导入时会执行 fitToCanvas 副作用，这里保持行为一致即可）
   ------------------------------------------------------------------ */

function shapeToDLocal(s) {
  if (s.d) return s.d;
  if (s.t === "c") return ellipsePathLocal(s.cx, s.cy, s.rx, s.ry);
  if (s.t === "r") return rectPathLocal(s.x, s.y, s.w, s.h, s.rad);
  return "";
}

function ellipsePathLocal(cx, cy, rx, ry) {
  ry = ry == null ? rx : ry;
  return `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${
    -rx * 2
  },0 Z`;
}

function rectPathLocal(x, y, w, h, rad = 0) {
  rad = Math.min(rad, w / 2, h / 2);
  if (!rad) {
    return `M${x},${y} H${x + w} V${y + h} H${x} Z`;
  }
  return (
    `M${x + rad},${y} H${x + w - rad} A${rad},${rad} 0 0 1 ${x + w},${y + rad} ` +
    `V${y + h - rad} A${rad},${rad} 0 0 1 ${x + w - rad},${y + h} ` +
    `H${x + rad} A${rad},${rad} 0 0 1 ${x},${y + h - rad} ` +
    `V${y + rad} A${rad},${rad} 0 0 1 ${x + rad},${y} Z`
  );
}
