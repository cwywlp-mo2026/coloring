/**
 * 把转换好的图片线稿打包成 js/art-image.js
 * ---------------------------------------------------------------
 * 输入：downloads/out/*.regions.json（由 build/png-to-regions.py 生成）
 * 输出：js/art-image.js  —— 浏览器和构建脚本都能 import
 *
 * 用法：node build/build-image-arts.mjs
 */

import { readFile, writeFile, readdir, mkdir, copyFile } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "downloads", "out");
const INK_DIR = join(ROOT, "img", "ink");

/* 每张图的元信息：id、名字、分类、源文件名 */
const META = {
  "4253244": {
    id: "cat-01",
    name: "小花猫",
    category: "animal",
    source: "downloads/4253244.png",
  },
  "flower-new": {
    id: "flower-01",
    name: "小花朵",
    category: "flower",
    source: "downloads/flower-new.webp",
  },
  "dog-new": {
    id: "dog-01",
    name: "小黄狗",
    category: "animal",
    source: "downloads/dog-new.jpg",
  },
  "rabbit-new": {
    id: "rabbit-01",
    name: "小白兔",
    category: "animal",
    source: "downloads/rabbit-new.webp",
  },
  "pig-new": {
    id: "pig-01",
    name: "小粉猪",
    category: "animal",
    source: "downloads/pig-new.png",
  },
};

async function main() {
  const files = (await readdir(OUT_DIR)).filter((f) =>
    f.endsWith(".regions.json")
  );
  if (!files.length) {
    console.log("没有找到 .regions.json，先跑 python build/png-to-regions.py");
    return;
  }

  await mkdir(INK_DIR, { recursive: true });

  const entries = [];

  for (const f of files) {
    const key = basename(f, ".regions.json");
    const meta = META[key];
    if (!meta) {
      console.log(`  - 跳过 ${key}（META 里没登记）`);
      continue;
    }

    const data = JSON.parse(await readFile(join(OUT_DIR, f), "utf8"));

    // 把轮廓线拷到 img/ink/
    const inkName = `${key}.ink.png`;
    await copyFile(join(OUT_DIR, `${key}.ink.png`), join(INK_DIR, inkName));

    entries.push({
      id: meta.id,
      name: meta.name,
      category: meta.category,
      viewBox: data.viewBox,
      ink: `img/ink/${inkName}`,
      regions: data.regions,
    });

    console.log(`  ✓ ${meta.id} ${meta.name}  ${data.regions.length} 个区域`);
  }

  // 写 js/art-image.js
  const js = `/**
 * 图片线稿数据（自动生成，勿手改）
 * ---------------------------------------------------------------
 * 由 build/build-image-arts.mjs 生成，源头是 downloads/out/*.regions.json。
 * 想换图或加图：
 *   1. 把新 PNG 放进 downloads/
 *   2. python build/png-to-regions.py downloads/新图.png
 *   3. 在 build/build-image-arts.mjs 的 META 里登记 id / 名字 / 分类
 *   4. node build/build-image-arts.mjs
 *   5. npm run build
 *
 * 这些线稿比手写 SVG 更漂亮，但填色区域是算法切出来的，
 * 边缘可能有一点点不完美 —— 对小朋友来说完全看不出来。
 */

export const IMAGE_ARTS = ${JSON.stringify(entries, null, 2)};
`;

  await writeFile(join(ROOT, "js", "art-image.js"), js, "utf8");
  console.log(`\n✓ js/art-image.js 已生成（${entries.length} 张）`);
}

await main();
