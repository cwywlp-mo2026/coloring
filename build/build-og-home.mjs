/**
 * 生成首页的分享配图 og-home.png（1200×630）
 * ---------------------------------------------------------------
 * 首页在社交平台分享时显示的那张大图，
 * 内容是网站名 + 几个分类 + 一张示例线稿。
 *
 * 用法：node build/build-og-home.mjs
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

const { ARTWORKS } = await load("js/art.js");
const { artToSvgMarkup } = await load("js/svg-markup.js");

const W = 1200;
const H = 630;

/* ---------- 找浏览器 ---------- */
const CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

async function findBrowser() {
  const { access } = await import("node:fs/promises");
  for (const p of CANDIDATES) {
    try {
      await access(p);
      return p;
    } catch {}
  }
  return null;
}

/* ---------- 拼 HTML ---------- */
function buildHtml() {
  // 挑 3 张不同分类的线稿当示例
  const picks = ["cat-01", "dino-01", "flower-01"]
    .map((id) => ARTWORKS.find((a) => a.id === id))
    .filter(Boolean);

  const cards = picks
    .map(
      (a) => `
      <div class="sample">
        <div class="sample__box">${artToSvgMarkup(a, { mode: "thumb" })}</div>
        <div class="sample__name">${a.name}</div>
      </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden}
  body{
    font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;
    background:linear-gradient(135deg,#fdf8f3 0%,#fff9f4 50%,#f4f8fd 100%);
    padding:64px 72px;position:relative;overflow:hidden;
    display:flex;flex-direction:column;justify-content:center;
  }
  .blob{position:absolute;border-radius:50%;filter:blur(70px);opacity:.5}
  .b1{width:420px;height:420px;background:#ffb3c7;top:-140px;right:-90px}
  .b2{width:360px;height:360px;background:#a9d4f5;bottom:-130px;left:-80px}
  .b3{width:300px;height:300px;background:#cdbdf6;bottom:40px;right:180px;opacity:.35}

  .row{display:flex;align-items:center;gap:56px;position:relative;z-index:2}
  .text{flex:1 1 auto;min-width:0}
  .logo{
    display:inline-flex;align-items:center;gap:12px;
    padding:10px 22px;border-radius:999px;background:#fff;
    box-shadow:0 6px 20px rgba(180,155,135,.2);
    font-size:24px;font-weight:800;color:#8a6a5a;margin-bottom:22px;
  }
  h1{font-size:74px;font-weight:900;color:#4a4038;line-height:1.1;letter-spacing:1px}
  h1 em{font-style:normal;color:#ff95b4}
  .sub{margin-top:20px;font-size:27px;font-weight:700;color:#9b8f84;line-height:1.5}
  .tags{margin-top:26px;display:flex;gap:10px;flex-wrap:wrap}
  .tag{padding:8px 17px;border-radius:999px;background:#fff;font-size:20px;font-weight:800;color:#7d7166;box-shadow:0 3px 0 rgba(232,222,211,.9)}

  .samples{flex:0 0 440px;display:flex;flex-direction:column;gap:14px}
  .sample{display:flex;align-items:center;gap:18px;background:#fff;border-radius:26px;padding:12px 20px 12px 12px;box-shadow:0 12px 30px rgba(180,155,135,.22)}
  .sample__box{width:96px;height:96px;flex:0 0 96px;border-radius:20px;overflow:hidden;display:grid;place-items:center}
  .sample__box svg{width:92%;height:92%;display:block}
  .sample .ink{fill:none;stroke:#2f2b28;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
  .sample__name{font-size:26px;font-weight:800;color:#6b5f54}
</style></head>
<body>
  <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>
  <div class="row">
    <div class="text">
      <div class="logo">🎨 快乐涂色本</div>
      <h1>快乐<em>涂色</em>本</h1>
      <div class="sub">35 张可爱线稿 · 免费在线涂色<br />打开网页就能画，作品自动保存</div>
      <div class="tags">
        <span class="tag">🐱 动物</span>
        <span class="tag">🌷 花朵</span>
        <span class="tag">🦕 恐龙</span>
        <span class="tag">👑 公主</span>
      </div>
    </div>
    <div class="samples">${cards}</div>
  </div>
</body></html>`;
}

/* ---------- 截图 ---------- */
function screenshot(browser, htmlPath, outPath) {
  return new Promise((resolve, reject) => {
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      `--window-size=${W},${H}`,
      `--screenshot=${outPath}`,
      `file:///${htmlPath.replace(/\\/g, "/")}`,
    ];
    const p = spawn(browser, args, { stdio: "ignore" });
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`exit ${code}`))
    );
  });
}

async function main() {
  const browser = await findBrowser();
  if (!browser) {
    console.error("找不到 Chrome / Edge，无法生成 og-home.png");
    process.exit(1);
  }

  const imgDir = join(ROOT, "img");
  const tmpDir = join(ROOT, "build", ".tmp");
  await mkdir(imgDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  const htmlPath = join(tmpDir, "og-home.html");
  const outPath = join(imgDir, "og-home.png");
  await writeFile(htmlPath, buildHtml(), "utf8");
  await screenshot(browser, htmlPath, outPath);
  console.log("  ✓ og-home.png");
}

await main();
