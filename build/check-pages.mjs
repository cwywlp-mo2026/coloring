/**
 * 静态页面体检
 * ---------------------------------------------------------------
 * 检查 build 生成的 35 个页面是否结构完整、标签齐全。
 * 目的：上线前把问题一次性找出来，不要上线后才发现搜索引擎读不到内容。
 *
 * 用法：node build/check-pages.mjs
 */

import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const REQUIRED = [
  ["<title>", "标题"],
  ['name="description"', "页面描述"],
  ['rel="canonical"', "canonical 链接"],
  ['property="og:title"', "OG 标题"],
  ['property="og:image"', "OG 配图"],
  ['name="twitter:card"', "Twitter 卡片"],
  ['application/ld+json', "JSON-LD 结构化数据"],
  ['id="paper"', "画布容器"],
  ['id="palette"', "调色板"],
  ['id="toolRow"', "工具栏"],
  ['id="clearModal"', "清空弹窗"],
  ['js/paint.js', "交互脚本"],
  ['class="region"', "可填色区域"],
  ['class="seo-content"', "SEO 文字区"],
];

const problems = [];
let placeholderDomain = false;

const files = (await readdir(join(ROOT, "paint"))).filter((f) =>
  f.endsWith(".html")
);

console.log(`检查 ${files.length} 个静态页面...\n`);

for (const f of files) {
  const html = await readFile(join(ROOT, "paint", f), "utf8");
  const missing = REQUIRED.filter(([needle]) => !html.includes(needle)).map(
    ([, label]) => label
  );

  // 标签闭合检查
  const appOpen = (html.match(/<div class="app">/g) || []).length;
  const appClose = (html.match(/<\/div><!-- \/\.app -->/g) || []).length;
  if (appOpen !== 1) missing.push(`app 容器数量=${appOpen}`);
  if (appClose !== 1) missing.push(`app 闭合数量=${appClose}`);

  // JSON-LD 能不能解析
  const ld = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
  );
  if (ld) {
    try {
      JSON.parse(ld[1]);
    } catch (e) {
      missing.push(`JSON-LD 解析失败: ${e.message}`);
    }
  }

  // 域名是不是还在占位符（这不算结构问题，只是提醒）
  if (html.includes("example.com")) {
    placeholderDomain = true;
  }

  // 内部链接检查
  if (!html.includes("../index.html")) missing.push("缺少返回首页链接");

  if (missing.length) {
    problems.push({ file: f, missing });
  }
}

if (problems.length) {
  console.log("发现问题：\n");
  for (const p of problems) {
    console.log(`  ✗ ${p.file}`);
    p.missing.forEach((m) => console.log(`      - ${m}`));
  }
  console.log(`\n${problems.length} / ${files.length} 个页面有问题`);
  process.exitCode = 1;
} else {
  console.log(`✓ ${files.length} 个页面全部通过`);
}

if (placeholderDomain) {
  console.log(
    "\n⚠ 提醒：域名还是占位符 example.com。\n" +
      "  上线前请打开 site.config.json 改成真实地址，再运行 npm run build。"
  );
}

// 顺便检查 sitemap 和 robots
const sitemap = await readFile(join(ROOT, "sitemap.xml"), "utf8");
const urls = (sitemap.match(/<loc>/g) || []).length;
console.log(`✓ sitemap.xml 包含 ${urls} 个地址`);

const robots = await readFile(join(ROOT, "robots.txt"), "utf8");
console.log(
  robots.includes("Sitemap:")
    ? "✓ robots.txt 已声明 sitemap"
    : "✗ robots.txt 缺少 Sitemap 声明"
);
