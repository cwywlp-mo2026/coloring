/**
 * 渲染线稿
 * ---------------------------------------------------------------
 * 每张线稿生成如下结构：
 *   <svg viewBox="-24 -24 248 248">
 *     <g class="fills">   ← 每个可填色区域一个 <path class="region">
 *     <g class="inks">    ← 描边线，永远在上面
 *   </svg>
 * 这样小朋友点区域只会改 fill，黑色轮廓线永远不会被盖掉。
 *
 * 注意：真正的 SVG 结构由 svg-markup.js 生成（纯字符串），
 * 本文件只负责把字符串变成 DOM 元素。
 * 这样构建脚本生成的静态页面和浏览器里画的线稿永远是同一份结果。
 */

import { artToSvgMarkup } from "./svg-markup.js";

export { paperColor } from "./svg-markup.js";

/* ------------------------------------------------------------------
   把一张线稿渲染成 SVG 元素
   @param art     线稿对象
   @param opts
     - mode: "paint" | "thumb"
   ------------------------------------------------------------------ */

export function renderArt(art, opts = {}) {
  const markup = artToSvgMarkup(art, opts);
  const tpl = document.createElement("div");
  tpl.innerHTML = markup;
  const svg = tpl.firstElementChild;
  if (!svg) return svg;

  // 描边宽度和 non-scaling-stroke 已经在 markup 的 <style> 里，
  // 这里只需要把内联样式补上（SVG 内嵌 <style> 在某些浏览器里
  // 对外链 CSS 的优先级更高，这里统一成内联，保证导出 PNG 也一致）
  const sw = opts.mode === "paint" ? 3 : 4;
  svg.querySelectorAll(".ink").forEach((el) => {
    el.style.strokeWidth = sw;
    el.style.vectorEffect = "non-scaling-stroke";
  });

  return svg;
}

/** 缩略图用：默认所有区域填白，加一层淡淡的分类色底 */
export function renderThumb(art, accent) {
  const svg = renderArt(art, { mode: "thumb" });
  svg.style.setProperty("--accent", accent || "#ffb3c7");
  return svg;
}
