/**
 * 填色画布
 * ---------------------------------------------------------------
 * 状态：
 *   fills   { [regionIndex]: color }  当前每个区域的颜色
 *   history 操作栈，每项是 { idx, prev, next }，撤销时回退 prev
 * 所有状态持久化到 localStorage，下次打开自动恢复
 */

import { ARTWORKS } from "./art.js";
import { CATEGORY_MAP, PALETTE, TOOLS } from "./data.js";
import { renderArt } from "./render.js";
import {
  getProgress,
  saveProgress,
  clearProgress,
  getPrefs,
  savePrefs,
} from "./storage.js";

/* ==================================================================
   初始化
   ---------------------------------------------------------------
   两种打开方式：
   1. paint.html?id=cat-01     —— 旧的动态页，JS 现场画线稿
   2. /paint/cat-01.html       —— 静态页，线稿已经写进 HTML 里
      （静态页能被搜索引擎收录，所以线上主推这一种）
   两种方式共用下面这一套交互逻辑。
   ================================================================== */

const params = new URLSearchParams(location.search);

// 静态页把线稿预先渲染好放在页面里了，这里先找一下
const prerenderedSvg = document.querySelector("#paper svg");

// 画稿 id 的三种来源，按优先级排
const artId =
  params.get("id") ||
  document.body.dataset.artId ||
  prerenderedSvg?.dataset.artId ||
  null;

const art = ARTWORKS.find((a) => a.id === artId);

const els = {
  paper: document.getElementById("paper"),
  artName: document.getElementById("artName"),
  artMeta: document.getElementById("artMeta"),
  backBtn: document.getElementById("backBtn"),
  undoBtn: document.getElementById("undoBtn"),
  printBtn: document.getElementById("printBtn"),
  saveBtn: document.getElementById("saveBtn"),
  clearBtn: document.getElementById("clearBtn"),
  toolRow: document.getElementById("toolRow"),
  palette: document.getElementById("palette"),
  toast: document.getElementById("toast"),
  clearModal: document.getElementById("clearModal"),
  clearOk: document.getElementById("clearOk"),
  clearCancel: document.getElementById("clearCancel"),
};

/* 静态页在 /paint/ 下一层，动态页在根目录，返回路径不一样 */
const isStaticPage = Boolean(prerenderedSvg);
const homeHref = isStaticPage ? "../index.html" : "index.html";

if (!art) {
  document.body.innerHTML =
    '<main style="padding:60px 24px;text-align:center;font-weight:800">' +
    `找不到这张图，<a href='${homeHref}'>回画册看看</a> 吧</main>`;
  throw new Error("artwork not found");
}

const cat = CATEGORY_MAP[art.category] || { name: "", accent: "#ff95b4" };
// 静态页已经有更详细的标题了（带分类和网站名，更利于搜索），
// 只有动态页才需要在这里重设标题。
if (!document.title.includes(art.name)) {
  document.title = `${art.name}涂色 · ${cat.name}线稿 · 快乐涂色本`;
}
// 标题里带上「涂色」两个字，是用户真正会搜的词
if (els.artName) els.artName.textContent = `${art.name}涂色`;
if (els.artMeta)
  els.artMeta.textContent = `${cat.emoji || ""} ${cat.name} · 点色块，再点图案上色`;
const prefs = getPrefs();
const state = {
  /** @type {Record<string,string>} */
  fills: {},
  /** @type {{idx:number, prev:string|undefined, next:string}[]} */
  history: [],
  color: PALETTE.find((c) => c.id === prefs.color)?.value || PALETTE[3].value,
  colorId: PALETTE.find((c) => c.id === prefs.color)?.id || PALETTE[3].id,
  tool: TOOLS.find((t) => t.id === prefs.tool)?.id || "bucket",
  /** 拖动上色时，避免重复记录同一笔 */
  strokeSeen: new Set(),
  dirty: false,
};

/* ==================================================================
   渲染画布
   ---------------------------------------------------------------
   静态页里线稿已经写进 HTML 了，直接拿来用；
   动态页里没有，就现场画一个。
   ================================================================== */

// 静态页的 SVG 带着 <style>，但描边宽度要跟 render.js 一致，
// 否则导出的 PNG 和屏幕上不一样粗
let svg = prerenderedSvg;
if (!svg) {
  svg = renderArt(art, { mode: "paint" });
  els.paper.appendChild(svg);
} else {
  // 补上和动态页一致的内联描边样式（导 PNG 时靠它换算线宽）
  svg.querySelectorAll(".ink").forEach((el) => {
    el.style.strokeWidth = 3;
    el.style.vectorEffect = "non-scaling-stroke";
  });
  // 静态页的 .paper 里可能没有 class="paper__art"，补上
  svg.classList.add("paper__art");
  if (!svg.dataset.artId) svg.dataset.artId = art.id;
}

/** region 元素索引 → 元素 */
const regions = [...svg.querySelectorAll(".region")];

// 按 data-r 建立索引映射：data-r 才是真正稳定的区域编号，
// 不能再用数组下标（形状里有"只描线"的元素时下标会错位）
const regionByIndex = new Map();
regions.forEach((el) => regionByIndex.set(Number(el.dataset.r), el));

/** 取某个编号对应的区域元素 */
function regionEl(idx) {
  return regionByIndex.get(Number(idx)) || null;
}

/* ---------------- 恢复进度 ---------------- */

const saved = getProgress(art.id);
if (saved) {
  Object.entries(saved.fills).forEach(([idx, color]) => {
    const el = regionEl(idx);
    // 白色/空白不算已涂色
    if (el && typeof color === "string" && color !== "#ffffff") {
      el.setAttribute("fill", color);
      state.fills[idx] = color;
    }
  });
  if (Object.keys(state.fills).length) {
    state.dirty = true;
    toast(`继续上次的画`);
  }
}

/* ==================================================================
   调色板
   ================================================================== */

function buildPalette() {
  els.palette.replaceChildren(
    ...PALETTE.map((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch";
      btn.style.setProperty("--sw", c.value);
      btn.style.setProperty("--tick", c.tick);
      btn.dataset.colorId = c.id;
      btn.dataset.color = c.value;
      btn.setAttribute("aria-label", c.name);
      btn.setAttribute("aria-pressed", String(c.id === state.colorId));

      const tick = document.createElement("span");
      tick.className = "swatch__tick";
      tick.textContent = c.id === state.colorId ? "✓" : "";
      tick.setAttribute("aria-hidden", "true");
      btn.appendChild(tick);

      btn.addEventListener("click", () => {
        setColor(c);
        // 选颜色时如果当前是橡皮，自动切回油漆桶，符合直觉
        if (state.tool === "eraser") setTool("bucket");
      });

      return btn;
    })
  );
}

function setColor(c) {
  state.color = c.value;
  state.colorId = c.id;
  savePrefs({ color: c.id });
  els.palette.querySelectorAll(".swatch").forEach((b) => {
    const on = b.dataset.colorId === c.id;
    b.setAttribute("aria-pressed", String(on));
    const tick = b.querySelector(".swatch__tick");
    if (tick) tick.textContent = on ? "✓" : "";
  });
}

/* ==================================================================
   工具
   ================================================================== */

function buildTools() {
  const frag = document.createDocumentFragment();
  TOOLS.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tool";
    btn.dataset.tool = t.id;
    btn.setAttribute("aria-pressed", String(t.id === state.tool));

    const icon = document.createElement("span");
    icon.className = "tool__icon";
    icon.textContent = t.icon;
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.textContent = t.name;

    btn.append(icon, label);
    btn.addEventListener("click", () => setTool(t.id));
    frag.appendChild(btn);
  });
  // 插到"清空"按钮前面
  els.toolRow.prepend(frag);
}

function setTool(id) {
  state.tool = id;
  savePrefs({ tool: id });
  els.toolRow.querySelectorAll(".tool").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.tool === id));
  });
  els.paper.style.cursor = id === "eraser" ? "cell" : "pointer";
  const hints = {
    bucket: "点一下图案，整块上色",
    brush: "按住拖过去，经过的地方都会变颜色",
    eraser: "按住拖过去，把颜色擦掉",
  };
  els.artMeta.textContent = `${cat.name} · ${hints[id]}`;
}

/* ==================================================================
   上色核心
   ================================================================== */

function colorForTool() {
  if (state.tool === "eraser") return "#ffffff";
  return state.color;
}

/** 白色 = 空白，状态里不留记录 */
const BLANK = "#ffffff";

/**
 * 记录一次操作（用于撤销 + 自动保存）
 * 白色视为"未涂色"，不写进 state.fills，
 * 否则擦干净后首页还会显示"画到一半"，清空按钮也会误判画布非空。
 */
function commit(idx, el, nextColor) {
  const key = String(idx);
  const prev = state.fills[key];
  // 目标颜色和当前一样，什么都没变
  if (prev === nextColor) return false;
  // 擦一块本来就是空白的区域：没变化，不该产生一条撤销记录
  if (nextColor === BLANK && prev === undefined) return false;

  el.setAttribute("fill", nextColor);
  if (nextColor === BLANK) {
    delete state.fills[key];
  } else {
    state.fills[key] = nextColor;
  }
  state.history.push({ idx: key, prev, next: nextColor });
  if (state.history.length > 400) state.history.shift();

  state.dirty = true;
  els.undoBtn.disabled = false;
  scheduleSave();
  return true;
}

let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (Object.keys(state.fills).length === 0) clearProgress(art.id);
    else saveProgress(art.id, state.fills);
  }, 350);
}

/** 从 svg 坐标换算成区域索引（用于拖动上色） */
function regionIndexFromPoint(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el || !el.dataset || el.dataset.r == null) return -1;
  if (!svg.contains(el)) return -1;
  return Number(el.dataset.r);
}

/** 气泡反馈 */
function ripple(clientX, clientY, color) {
  const rect = els.paper.getBoundingClientRect();
  const dot = document.createElement("span");
  dot.className = "ripple";
  dot.style.left = `${clientX - rect.left}px`;
  dot.style.top = `${clientY - rect.top}px`;
  dot.style.background = color;
  els.paper.appendChild(dot);
  dot.addEventListener("animationend", () => dot.remove());
}

function popRegion(el) {
  el.classList.remove("region--pop");
  // 强制重排，让动画能重复触发
  void el.getBoundingClientRect();
  el.classList.add("region--pop");
}

/* ---------------- 指针事件 ---------------- */

let painting = false;

function handlePaint(clientX, clientY, isFirst) {
  const idx = regionIndexFromPoint(clientX, clientY);
  if (idx < 0) return;

  // 拖动时同一笔只算一次，避免反复记录
  if (!isFirst) {
    if (state.strokeSeen.has(idx)) return;
  } else {
    state.strokeSeen.clear();
  }
  state.strokeSeen.add(idx);

  const el = regionEl(idx);
  if (!el) return;

  const color = colorForTool();
  // 油漆桶：点了就已经是同一个颜色，不要闪
  const changed = commit(idx, el, color);

  if (changed) {
    if (state.tool === "bucket" || isFirst) {
      popRegion(el);
      ripple(clientX, clientY, state.tool === "eraser" ? "#ffffff" : color);
    }
  }
}

svg.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  painting = true;
  svg.setPointerCapture?.(e.pointerId);
  handlePaint(e.clientX, e.clientY, true);
  e.preventDefault();
});

svg.addEventListener("pointermove", (e) => {
  if (!painting) return;
  if (state.tool === "bucket") return; // 油漆桶不支持拖动
  handlePaint(e.clientX, e.clientY, false);
});

function endStroke(e) {
  if (!painting) return;
  painting = false;
  state.strokeSeen.clear();
  try {
    svg.releasePointerCapture?.(e.pointerId);
  } catch {}
}

svg.addEventListener("pointerup", endStroke);
svg.addEventListener("pointercancel", endStroke);
svg.addEventListener("pointerleave", (e) => {
  if (e.pointerType === "mouse") endStroke(e);
});

// 防止长按弹出菜单 / 双指缩放
svg.addEventListener("contextmenu", (e) => e.preventDefault());
svg.addEventListener("touchstart", (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

/* ==================================================================
   撤销
   ================================================================== */

els.undoBtn.addEventListener("click", () => {
  const step = state.history.pop();
  if (!step) return;
  const el = regionEl(step.idx);
  // 区域元素找不到时，把这一步放回栈里，否则这一步就凭空丢了
  if (!el) {
    state.history.push(step);
    return;
  }

  if (step.prev == null) {
    el.setAttribute("fill", "#ffffff");
    delete state.fills[step.idx];
  } else {
    el.setAttribute("fill", step.prev);
    state.fills[step.idx] = step.prev;
  }
  popRegion(el);
  els.undoBtn.disabled = state.history.length === 0;
  scheduleSave();
});
/* ==================================================================
   清空
   ================================================================== */

let lastFocus = null;

function openClearModal() {
  lastFocus = document.activeElement;
  els.clearModal.hidden = false;
  els.clearCancel.focus();
}

function closeClearModal() {
  els.clearModal.hidden = true;
  lastFocus?.focus?.();
}

els.clearBtn.addEventListener("click", () => {
  if (Object.keys(state.fills).length === 0) {
    toast("画布已经是空的啦");
    return;
  }
  openClearModal();
});

els.clearCancel.addEventListener("click", closeClearModal);
els.clearModal.addEventListener("click", (e) => {
  if (e.target === els.clearModal) closeClearModal();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.clearModal.hidden) closeClearModal();
});

els.clearOk.addEventListener("click", () => {
  regions.forEach((el) => el.setAttribute("fill", "#ffffff"));
  state.fills = {};
  state.history = [];
  els.undoBtn.disabled = true;
  clearProgress(art.id);
  closeClearModal();
  toast("画布擦干净啦 🧼");
});

/* ==================================================================
   保存 PNG
   ================================================================== */

async function serializeSvg() {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // viewBox 的宽高，用来算出画布比例
  const vb = (svg.getAttribute("viewBox") || "0 0 200 200")
    .trim()
    .split(/\s+/)
    .map(Number);
  const vbW = vb[2] > 0 ? vb[2] : 200;
  const vbH = vb[3] > 0 ? vb[3] : 200;

  // 屏幕上 1 个 viewBox 单位对应多少 CSS 像素
  // （preserveAspectRatio="xMidYMid meet"：取宽高比例里较小的那个）
  const box = svg.getBoundingClientRect();
  const unit = Math.min(
    box.width ? box.width / vbW : vbW,
    box.height ? box.height / vbH : vbH
  ) || 1;

  // 把内联样式（描边宽度）转成属性，保证在 canvas 里也生效
  clone.querySelectorAll(".ink").forEach((el) => {
    const sw = parseFloat(el.style.strokeWidth) || 3;
    el.setAttribute("stroke", "#2f2b28");
    // 屏幕上用的是 non-scaling-stroke（线宽固定 3px，不随缩放变化）。
    // 导出时线宽会随画布一起放大，所以要换算成图形坐标系的宽度，
    // 这样导出的图片和屏幕上看起来一样粗。
    el.setAttribute("stroke-width", (sw / unit).toFixed(3));
    el.setAttribute("fill", "none");
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    el.removeAttribute("style");
  });
  clone.querySelectorAll(".region--pop").forEach((el) =>
    el.classList.remove("region--pop")
  );
  clone.querySelectorAll("path.ink--fill").forEach((el) => {
    el.removeAttribute("style");
  });

  // 图片线稿的轮廓线是 <image>，导出 PNG 时浏览器不会去加载相对路径的图片，
  // 所以必须提前把它转成 base64 内嵌进去，否则导出的图会没有线条。
  await inlineImages(clone);

  // 尺寸严格按 viewBox 比例，导出时不会被拉伸
  clone.setAttribute("width", String(vbW));
  clone.setAttribute("height", String(vbH));

  return new XMLSerializer().serializeToString(clone);
}

/**
 * 把 SVG 里的 <image href="相对路径"> 换成 base64 内嵌
 * ---------------------------------------------------------------
 * 浏览器的 canvas 绘制 SVG 时处于"沙箱"状态，不会去加载外部图片，
 * 所以导出 PNG 前必须把图片转成 data URI。
 */
async function inlineImages(clone) {
  const images = [...clone.querySelectorAll("image")];
  for (const img of images) {
    const href = img.getAttribute("href") || img.getAttribute("xlink:href");
    if (!href || href.startsWith("data:")) continue;

    try {
      const abs = new URL(href, location.href).href;
      const res = await fetch(abs);
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
      img.setAttribute("href", dataUrl);
      img.removeAttribute("xlink:href");
    } catch (err) {
      console.warn("图片内联失败：", href, err);
    }
  }
}

/**
 * 导出 PNG
 * 画布尺寸按 viewBox 的真实比例算，避免把画作压扁成正方形。
 */
async function exportPng(scale = 3) {
  const svgStr = await serializeSvg();
  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    // 从 viewBox 拿到画布的宽高比（形如 "-24 -24 248 248"）
    const vb = (svg.getAttribute("viewBox") || "0 0 200 200")
      .trim()
      .split(/\s+/)
      .map(Number);
    const vbW = vb[2] > 0 ? vb[2] : 200;
    const vbH = vb[3] > 0 ? vb[3] : 200;

    // 短边至少 600px，长边按比例，画作不会被拉伸变形
    const base = 600;
    const canvas = document.createElement("canvas");
    if (vbW >= vbH) {
      canvas.width = Math.round(base * scale);
      canvas.height = Math.round(((base * vbH) / vbW) * scale);
    } else {
      canvas.height = Math.round(base * scale);
      canvas.width = Math.round(((base * vbW) / vbH) * scale);
    }

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!pngBlob) throw new Error("导出失败");

    const a = document.createElement("a");
    const filename = `${art.name}-涂色作品-${new Date()
      .toISOString()
      .slice(0, 10)}.png`;
    a.href = URL.createObjectURL(pngBlob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("图片已保存到下载文件夹 ⬇️");
  } finally {
    URL.revokeObjectURL(url);
  }
}

els.saveBtn.addEventListener("click", async () => {
  els.saveBtn.disabled = true;
  try {
    await exportPng(3);
  } catch (err) {
    console.error(err);
    toast("保存失败，换个浏览器试试");
  } finally {
    els.saveBtn.disabled = false;
  }
});

/* ==================================================================
   打印
   ================================================================== */

els.printBtn.addEventListener("click", () => {
  window.print();
});

/* ==================================================================
   返回
   ---------------------------------------------------------------
   动态页的返回键是 <button>，静态页的是 <a href="../index.html">。
   两种都支持：按钮才接管跳转，链接只负责存进度。
   ================================================================== */

if (els.backBtn) {
  els.backBtn.addEventListener("click", () => {
    // 进度已经自动保存了，直接回去
    if (Object.keys(state.fills).length > 0) {
      saveProgress(art.id, state.fills);
    }
    // 是 <a> 就让它自己跳转，别拦
    if (els.backBtn.tagName === "A") return;
    if (history.length > 1) history.back();
    else location.href = homeHref;
  });
}

// 离开页面前把最后 350ms 内的改动也存下来
window.addEventListener("pagehide", () => {
  if (Object.keys(state.fills).length > 0) saveProgress(art.id, state.fills);
});

/* ==================================================================
   轻提示（函数声明会提升，所以能在初始化阶段就用）
   ================================================================== */

var toastTimer = 0;
function toast(msg, ms = 1800) {
  els.toast.textContent = msg;
  els.toast.classList.add("toast--show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("toast--show");
  }, ms);
}

/* ==================================================================
   键盘快捷键（给大一点的孩子 / 家长用）
   ================================================================== */

window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "z") {
      e.preventDefault();
      els.undoBtn.click();
    }
    return;
  }
  if (e.target instanceof HTMLInputElement) return;
  if (e.key >= "1" && e.key <= "9") {
    const c = PALETTE[Number(e.key) - 1];
    if (c) setColor(c);
  }
  if (e.key === "0" && PALETTE[9]) setColor(PALETTE[9]);
});

/* ==================================================================
   启动
   ================================================================== */

buildTools();
buildPalette();
setTool(state.tool);
