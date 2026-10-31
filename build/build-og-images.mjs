/**
 * 生成社交分享配图 og:image（1200×630 PNG）
 * ---------------------------------------------------------------
 * 为什么需要：
 *   微信、微博、Facebook、Twitter 等平台在分享链接时，
 *   没有 og:image 就只会显示一个光秃秃的链接。
 *
 * 做法：
 *   用无头浏览器把每张线稿渲染成 PNG（复用了 svg-markup.js，
 *   所以图片和网页上的线稿是同一份，绝不会对不上）。
 *
 * 用法：node build/build-og-images.mjs
 */

import { writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

const { ARTWORKS } = await load("js/art.js");
const { CATEGORY_MAP } = await load("js/data.js");
const { artToSvgMarkup } = await load("js/svg-markup.js");

const W = 1200;
const H = 630;

/* ------------------------------------------------------------------
   找浏览器
   ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------
   拼一个临时的 HTML（用于截图）
   ------------------------------------------------------------------ */

function buildOgHtml(art) {
  const cat = CATEGORY_MAP[art.category] || { name: "", emoji: "" };
  const svg = artToSvgMarkup(art, { mode: "thumb" });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden}
  body{
    font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;
    background:linear-gradient(135deg,#fdf8f3 0%,#fdf8f3 55%,#f6efe7 100%);
    display:flex;align-items:center;gap:56px;padding:70px;
  }
  .art{
    flex:0 0 400px;width:400px;height:400px;
    background:#fff;border-radius:36px;
    box-shadow:0 18px 44px rgba(180,155,135,.26);
    display:grid;place-items:center;overflow:hidden;
  }
  .art svg{width:88%;height:88%;display:block}
  .art .ink{fill:none;stroke:#2f2b28;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
  .art .ink--fill{fill:#2f2b28;stroke:none}
  .text{flex:1 1 auto;min-width:0}
  .badge{
    display:inline-block;padding:9px 20px;border-radius:999px;
    background:#ffb3c7;color:#5a3b47;font-size:24px;font-weight:800;
    margin-bottom:22px;
  }
  h1{font-size:60px;font-weight:900;color:#4a4038;line-height:1.16;letter-spacing:1px}
  h1 em{font-style:normal;color:#ff95b4}
  .sub{margin-top:20px;font-size:26px;font-weight:700;color:#9b8f84;line-height:1.5}
  .logo{
    position:absolute;right:70px;bottom:44px;
    font-size:24px;font-weight:800;color:#b5a89b;
  }
</style></head>
<body>
  <div class="art">${svg}</div>
  <div class="text">
    <div class="badge">${cat.emoji} ${cat.name}</div>
    <h1>${art.name}<br />涂色</h1>
    <div class="sub">点一下就能上色<br />免费儿童在线填色</div>
  </div>
  <div class="logo">🎨 快乐涂色本</div>
</body></html>`;
}

/* ------------------------------------------------------------------
   调用无头浏览器截图
   ------------------------------------------------------------------ */

function screenshot(browser, htmlPath, outPath) {
  return new Promise((resolve, reject) => {
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      `--window-size=${W},${H}`,
      `--screenshot=${outPath}`,
      `--default-background-color=00000000`,
      `file:///${htmlPath.replace(/\\/g, "/")}`,
    ];
    const p = spawn(browser, args, { stdio: "ignore" });
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`exit ${code}`))
    );
  });
}

/* ------------------------------------------------------------------
   主流程
   ------------------------------------------------------------------ */

async function main() {
  const browser = await findBrowser();
  if (!browser) {
    console.error("找不到 Chrome / Edge，跳过 og:image 生成。");
    console.error("装一个 Chrome 或 Edge 后重新运行即可。");
    process.exit(1);
  }
  console.log(`使用浏览器: ${browser}`);

  const imgDir = join(ROOT, "img");
  const tmpDir = join(ROOT, "build", ".tmp");
  await mkdir(imgDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  for (const art of ARTWORKS) {
    const htmlPath = join(tmpDir, `${art.id}.html`);
    const outPath = join(imgDir, `${art.id}.png`);
    await writeFile(htmlPath, buildOgHtml(art), "utf8");
    try {
      await screenshot(browser, htmlPath, outPath);
    } catch (e) {
      console.error(`  ✗ ${art.id}: ${e.message}`);
      continue;
    }
    console.log(`  ✓ ${art.id}.png`);
  }

  // 清理临时文件
  for (const f of await readdir(tmpDir)) {
    await writeFile(join(tmpDir, f), "", "utf8");
  }

  console.log(`\n完成，共生成 ${ARTWORKS.length} 张配图。`);
}

await main();
