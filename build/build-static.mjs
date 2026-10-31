/**
 * 构建脚本：生成可被搜索引擎收录的静态页面
 * ---------------------------------------------------------------
 * 为什么要这一步：
 *   原来的涂色页是 paint.html?id=cat-01，内容全部靠 JS 运行时生成。
 *   搜索引擎能抓到 URL，但抓不到内容，也不会为 35 张图分别建索引。
 *
 * 这个脚本会生成：
 *   paint/<id>.html          每张线稿一个独立页面（内联 SVG，零 JS 也能看到图）
 *   sitemap.xml              告诉搜索引擎有哪些页面、怎么重要
 *   robots.txt               放行搜索引擎
 *
 * 用法：node build/build-static.mjs
 */

import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Windows 上动态 import 必须用 file:// URL，不能直接给绝对路径
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

const { ARTWORKS } = await load("js/art.js");
const { CATEGORIES, CATEGORY_MAP } = await load("js/data.js");
const { artToSvgMarkup } = await load("js/svg-markup.js");

const config = JSON.parse(
  await readFile(join(ROOT, "site.config.json"), "utf8")
);

const SITE = config.siteUrl.replace(/\/+$/, "");
const OUT_DIR = join(ROOT, "paint");

/* ------------------------------------------------------------------
   小工具
   ------------------------------------------------------------------ */

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** 生成 canonical / OG / Twitter 等 SEO 标签 */
function seoTags({
  title,
  description,
  url,
  image,
  type = "website",
  jsonLd = null,
}) {
  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:site_name" content="${esc(config.siteName)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:locale" content="${config.locale}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ];
  if (jsonLd) {
    tags.push(
      `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    );
  }
  return tags.join("\n    ");
}

/* ------------------------------------------------------------------
   单张线稿的静态页面
   ------------------------------------------------------------------ */

function buildArtPage(art) {
  const cat = CATEGORY_MAP[art.category] || { name: "", emoji: "" };
  const url = `${SITE}/paint/${art.id}.html`;
  const title = `${art.name}涂色 - ${cat.name}线稿 - ${config.siteName}`;
  const description =
    `免费给${art.name}涂色。${cat.name}主题的儿童简笔画线稿，` +
    `点一下区域就能上色，可保存成图片或打印。`;

  // 内联 SVG：不用 JS 也能显示，搜索引擎直接读得到
  const svgMarkup = artToSvgMarkup(art, { mode: "paint" });

  // 同分类的其他线稿，做内链
  const siblings = ARTWORKS.filter(
    (a) => a.category === art.category && a.id !== art.id
  )
    .slice(0, 12)
    .map(
      (a) =>
        `<a class="rel" href="./${a.id}.html"><span class="rel__name">${esc(
          a.name
        )}</span></a>`
    )
    .join("\n        ");

  // 分类页链接
  const catLinks = CATEGORIES.map(
    (c) =>
      `<a class="catlink" href="../index.html#cat-${esc(c.id)}">${c.emoji} ${esc(
        c.name
      )}</a>`
  ).join("\n        ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${art.name}涂色`,
    description,
    url,
    inLanguage: "zh-CN",
    isPartOf: {
      "@type": "WebSite",
      name: config.siteName,
      url: SITE,
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: config.siteName,
          item: SITE,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: `${art.name}涂色`,
          item: url,
        },
      ],
    },
  };

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#fdf8f3" />
    ${seoTags({
      title,
      description,
      url,
      image: `${SITE}/img/${art.id}.png`,
      type: "article",
      jsonLd,
    })}
    <link rel="stylesheet" href="../css/style.css" />
    <link rel="stylesheet" href="../css/paint.css" />
    <link rel="stylesheet" href="../css/seo.css" />
    <link
      rel="icon"
      href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎨</text></svg>"
    />
  </head>
  <body class="paint-page seo-page" data-art-id="${esc(art.id)}">
    <!-- 应用区：占满一屏 -->
    <div class="app">
    <!-- 顶部栏 -->
    <header class="topbar">
      <a class="icon-btn" href="../index.html" aria-label="返回画册" title="返回画册">←</a>

      <div class="topbar__title">
        <h1 class="topbar__name" id="artName">${esc(art.name)}涂色</h1>
        <p class="topbar__meta" id="artMeta">${cat.emoji} ${esc(
          cat.name
        )} · 点一下图案就能上色</p>
      </div>

      <div class="topbar__actions">
        <button class="icon-btn" id="undoBtn" type="button" aria-label="撤销上一步" title="撤销上一步" disabled>
          ↶
        </button>
        <button class="icon-btn" id="printBtn" type="button" aria-label="打印这张画" title="打印这张画">
          🖨️
        </button>
        <button class="icon-btn" id="saveBtn" type="button" aria-label="保存图片" title="保存图片">
          ⬇️
        </button>
      </div>
    </header>

    <!-- 画布：线稿已经写死在 HTML 里，搜索引擎能直接读到 -->
    <div class="stage">
      <div class="paper" id="paper">
        ${svgMarkup}
      </div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
    </div>

    <!-- 工具栏 -->
    <div class="tools">
      <div class="tools__inner">
        <div class="tool-row" id="toolRow" role="group" aria-label="工具">
          <button class="tool tool--danger" id="clearBtn" type="button" aria-label="清空画布">
            <span class="tool__icon" aria-hidden="true">🧼</span>
            <span>清空</span>
          </button>
        </div>
        <div class="palette" id="palette" role="group" aria-label="调色板"></div>
      </div>
    </div>

    <!-- 清空确认 -->
    <div class="modal" id="clearModal" hidden>
      <div class="modal__box" role="dialog" aria-modal="true" aria-labelledby="clearTitle">
        <span class="modal__emoji" aria-hidden="true">🧼</span>
        <h2 class="modal__title" id="clearTitle">要把画擦干净吗？</h2>
        <p class="modal__text">擦掉就回不去了哦，要重新涂一遍</p>
        <div class="modal__btns">
          <button class="btn btn--ghost" id="clearCancel" type="button">再想想</button>
          <button class="btn btn--primary" id="clearOk" type="button">擦干净</button>
        </div>
      </div>
    </div>
    </div><!-- /.app -->

    <!-- ===== 以下是给搜索引擎看的文字内容 ===== -->
    <main class="seo-content">
      <section class="seo-intro">
        <h2>${esc(art.name)}怎么涂？</h2>
        <p>
          这是一张${esc(cat.name)}主题的儿童简笔画线稿「${esc(art.name)}」。
          用油漆桶、画笔或橡皮给各个部位上色，涂好之后可以保存成图片或直接打印出来。
        </p>
        <p>
          全部 <strong>${ARTWORKS.length}</strong> 张线稿都可以免费涂，
          按 <kbd>1</kbd>–<kbd>9</kbd> 可以快速切换颜色，
          按 <kbd>Ctrl</kbd> + <kbd>Z</kbd> 可以撤销上一步。
          画到一半会自动保存，下次打开还能接着画。
        </p>
      </section>

      <section class="seo-related">
        <h2>更多${esc(cat.name)}线稿</h2>
        <div class="seo-grid">
        ${siblings}
        </div>
      </section>

      <section class="seo-related">
        <h2>按分类浏览</h2>
        <div class="seo-cats">
        ${catLinks}
        </div>
      </section>

      <footer class="seo-footer">
        <p>
          ${esc(config.siteName)} · 全部作品只保存在你自己的设备上，不会上传到任何服务器。
        </p>
      </footer>
    </main>

    <script type="module" src="../js/paint.js"></script>
  </body>
</html>
`;
}

/* ------------------------------------------------------------------
   首页的 SEO 文本块
   ------------------------------------------------------------------ */

function buildIndexSeo() {
  return `<!--
  下面是给搜索引擎看的文字内容。
  页面上看不见（放在 details 里），但能让搜索引擎理解这个网站是做什么的。
-->
<details class="seo-sr-only">
  <summary>关于${esc(config.siteName)}</summary>
  <h2>免费儿童在线填色游戏</h2>
  <p>${esc(config.description)}</p>
  <p>
    本站提供 ${ARTWORKS.length} 张儿童简笔画线稿，分为
    ${CATEGORIES.map((c) => c.name).join("、")} 等分类。
    每一张都可以在线涂色、撤销、保存成图片和打印。
  </p>
  <ul>
${ARTWORKS.map(
  (a) =>
    `    <li><a href="./paint/${a.id}.html">${esc(a.name)}涂色</a> - ${
      CATEGORY_MAP[a.category]?.name || ""
    }</li>`
).join("\n")}
  </ul>
</details>
`;
}

/* ------------------------------------------------------------------
   sitemap / robots
   ------------------------------------------------------------------ */

function buildSitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE}/`, priority: "1.0", changefreq: "weekly" },
    ...ARTWORKS.map((a) => ({
      loc: `${SITE}/paint/${a.id}.html`,
      priority: "0.8",
      changefreq: "monthly",
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${esc(u.loc)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;
}

function buildRobots() {
  return `User-agent: *
Allow: /

# 静态生成，无需爬取 build 目录
Disallow: /build/

Sitemap: ${SITE}/sitemap.xml
`;
}

/* ------------------------------------------------------------------
   主流程
   ------------------------------------------------------------------ */

async function main() {
  console.log("生成静态页面...");

  // 1. 清理旧的生成结果，避免改名后残留
  await mkdir(OUT_DIR, { recursive: true });
  for (const f of await readdir(OUT_DIR)) {
    if (f.endsWith(".html")) await unlink(join(OUT_DIR, f));
  }

  // 2. 每张线稿一个页面
  for (const art of ARTWORKS) {
    const html = buildArtPage(art);
    await writeFile(join(OUT_DIR, `${art.id}.html`), html, "utf8");
  }
  console.log(`  ✓ ${ARTWORKS.length} 个线稿页面`);

  // 3. sitemap / robots
  await writeFile(join(ROOT, "sitemap.xml"), buildSitemap(), "utf8");
  console.log("  ✓ sitemap.xml");

  await writeFile(join(ROOT, "robots.txt"), buildRobots(), "utf8");
  console.log("  ✓ robots.txt");

  // 4. 平台配置文件
  await writeFile(join(ROOT, ".nojekyll"), "", "utf8");
  await writeFile(
    join(ROOT, "_headers"),
    `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
`,
    "utf8"
  );
  console.log("  ✓ .nojekyll / _headers");

  // 5. 首页的 SEO 文本块
  const indexPath = join(ROOT, "index.html");
  const indexHtml = await readFile(indexPath, "utf8");
  if (!indexHtml.includes("seo-sr-only")) {
    const marker = '    <script type="module" src="js/home.js"></script>';
    const seoBlock = buildIndexSeo();
    const updated = indexHtml.replace(marker, `${seoBlock}\n${marker}`);
    await writeFile(indexPath, updated, "utf8");
    console.log("  ✓ index.html 已注入 SEO 文本");
  } else {
    console.log("  - index.html 已含 SEO 文本，跳过");
  }

  // 6. 把 site.config.json 里的域名同步到 index.html / paint.html
  //    用户只改一个配置文件，不用去 HTML 里到处找
  await syncSeoBlock(indexPath, "index");
  await syncSeoBlock(join(ROOT, "paint.html"), "paint");

  console.log("\n完成。下一步：");
  if (config.siteUrl.includes("example.com")) {
    console.log("  ⚠ 还没改域名！打开 site.config.json，把 siteUrl 改成你的真实地址，例如：");
    console.log('       "siteUrl": "https://你的用户名.github.io/仓库名"');
    console.log("     然后重新运行 npm run build");
  } else {
    console.log(`  ✓ 域名已设为 ${SITE}`);
  }
  console.log("  接下来把整个文件夹部署到公网（见 README.md）");
}

/**
 * 重新生成 HTML 里 <!-- SEO --> ... <!-- /SEO --> 之间的内容
 * ---------------------------------------------------------------
 * 整块重新生成，而不是"找出来替换"，
 * 这样域名改了、改回来了、或者改了无数次，结果都是对的。
 */
async function syncSeoBlock(filePath, kind) {
  const html = await readFile(filePath, "utf8");
  const start = "<!-- ===== SEO：让搜索引擎能理解并收录这个网站 ===== -->";
  const end = "<!-- ===== /SEO ===== -->";

  const s = html.indexOf(start);
  const e = html.indexOf(end);
  if (s === -1 || e === -1) {
    console.log(`  - ${filePath.split(/[\\/]/).pop()} 没有 SEO 标记块，跳过`);
    return;
  }

  // 先把重复的结束标记清掉（多次构建可能留下多个）
  let cleaned = html.slice(0, e + end.length);
  cleaned = cleaned.replace(
    new RegExp(`(${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})+`, "g"),
    end
  );
  cleaned += html.slice(e + end.length);

  // 保留两个标记本身，只替换中间的内容
  const inner = kind === "index" ? buildIndexSeoInner() : buildPaintSeoInner();
  const updated = cleaned.slice(0, s + start.length) + inner + cleaned.slice(e);
  await writeFile(filePath, updated, "utf8");
  console.log(`  ✓ ${filePath.split(/[\\/]/).pop()} 已更新 SEO 标签`);
}

function buildIndexSeoInner() {
  const title = `${config.siteName} · 儿童在线填色`;
  const desc =
    "35 张可爱线稿免费涂：动物、花朵、交通工具、水果、恐龙、公主。" +
    "点一下就上色，可保存图片和打印。";
  const image = `${SITE}/img/og-home.png`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: config.siteName,
    url: `${SITE}/`,
    inLanguage: "zh-CN",
    description: config.description,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return `
    <link rel="canonical" href="${SITE}/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${esc(config.siteName)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${SITE}/" />
    <meta property="og:locale" content="${config.locale}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${image}" />
    <meta name="keywords" content="${esc(config.keywords)}" />
    <meta name="author" content="${esc(config.author)}" />
    <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 6).replace(/\n/g, "\n      ")}
    </script>
`;
}

function buildPaintSeoInner() {
  const image = `${SITE}/img/og-home.png`;
  return `
    <!-- 交互页本身不做收录，画册首页和 /paint/<id>.html 才是被索引的页面。
         但这里也加基础标签，方便分享链接时有标题和描述。 -->
    <meta name="robots" content="noindex,follow" />
    <meta property="og:title" content="免费儿童涂色 · ${esc(
      config.siteName
    )}" />
    <meta property="og:description" content="${esc(
      "35 张可爱线稿，点一下就上色，可保存图片和打印。"
    )}" />
    <meta property="og:image" content="${image}" />
    <meta name="twitter:card" content="summary_large_image" />

    <link rel="canonical" href="${SITE}/" />
`;
}

await main();
