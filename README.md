# 快乐涂色本 · 儿童在线填色小游戏

面向 3–8 岁小朋友的在线填色游戏。纯静态前端（HTML + CSS + 原生 JS），双击 `index.html` 就能玩。

已做 SEO 静态化：35 张线稿各自有独立的可收录页面（`paint/<id>.html`），页面里内联了 SVG 线稿，关掉 JS 也能看到图，搜索引擎能直接读到内容。

---

## 一、本地预览

**方式一：直接打开**

双击 `index.html`。

**方式二：本地服务器**（推荐，避免个别浏览器对 `type="module"` 的本地文件限制）

```bash
python -m http.server 8000
# 或
npx serve .
```

然后浏览器打开 <http://localhost:8000>。

---

## 二、发布到互联网（让人人都能搜到）

整个网站是纯静态文件，**不需要服务器、不需要数据库**，丢到任何静态托管都能跑。

### 第 1 步：填上你的域名

打开 `site.config.json`，把 `siteUrl` 改成你最终的网站地址：

```json
{
  "siteUrl": "https://happy-coloring.example.com"
}
```

改完后运行一次：

```bash
npm run build
```

这一步会把域名同步到所有页面的 `canonical`、`og:url`、`og:image`、`sitemap.xml`、`robots.txt`。

> **注意**：如果网站要放在子目录（比如 GitHub Pages 的 `https://用户名.github.io/仓库名/`），
> `siteUrl` 要写**带路径的完整地址**，比如 `https://myuser.github.io/my-coloring`（末尾不要加 `/`）。

### 第 2 步：选一个托管平台（三选一，全部免费）

#### 方案 A：Netlify（最省事，推荐新手）

1. 打开 <https://app.netlify.com/drop>
2. **直接把整个项目文件夹拖进去**
3. 几十秒后就能拿到一个网址：`https://随机名字.netlify.app`
4. 想要好记的域名：Netlify 后台 → Domain settings → Add custom domain

`netlify.toml` 已经写好了，不用改。

#### 方案 B：Cloudflare Pages（国内访问更快）

1. 打开 <https://dash.cloudflare.com> → Workers & Pages → Create → Pages
2. 连接你的 GitHub 仓库
3. 构建命令填 `npm run build`，输出目录填 `.`
4. 部署完会得到 `https://项目名.pages.dev`

#### 方案 C：GitHub Pages（最长期稳定）

1. 在 GitHub 上新建一个 **Public** 仓库（名字随意，比如 `coloring`）
2. 把本项目推上去：

```bash
git remote add origin https://github.com/你的用户名/coloring.git
git push -u origin main
```

3. 仓库 → Settings → Pages → Source 选 **GitHub Actions**
4. 等 1–2 分钟，网站就上线了：`https://你的用户名.github.io/coloring/`

`.github/workflows/deploy.yml` 已经配好，推代码就会自动重新构建并发布。

#### 方案 D：Vercel

```bash
npm i -g vercel
vercel
```

`vercel.json` 已配好。

### 第 3 步：改完域名后重新部署

如果你中途换了域名，记得重新跑一次 `npm run build` 再推上去，否则 `canonical` 指向的还是旧域名，搜索引擎会认为是重复内容。

---

## 三、让搜索引擎收录

网站上线后，**搜索引擎不会自动找上门**，需要主动提交。

### Google

1. 打开 <https://search.google.com/search-console>
2. 用你的 Google 账号登录 → 添加资源 → 选「网址」→ 填你的域名
3. 验证方式选「HTML 标签」→ 把网站提供的 `<meta>` 标签贴到 `index.html` 的 `<head>` 里
4. 验证通过后，左边菜单 **站点地图（Sitemaps）** → 填 `sitemap.xml` 的完整地址 → 提交
5. 打开 **网址检查** → 输入 `https://你的域名/paint/cat-01.html` → 点「请求索引」

### 百度 / 中文搜索

1. 打开 <https://ziyuan.baidu.com>
2. 添加并验证网站
3. **普通收录** → 提交 `sitemap.xml`
4. 百度对新站收录较慢，一般几天到几周。可以先在 `https://www.baidu.com/s?wd=site:你的域名` 看看有没有收录。

### 微信 / 社交平台分享

`img/og-home.png` 和 `img/<id>.png` 是提前生成好的分享配图（1200×630），
分享到微信、微博、Twitter 时会显示大图而不是光秃秃的链接。

---

## 四、目录结构

```
index.html            画册分类页（首页）
paint.html            填色画布页（?id=xxx，兼容旧链接）
paint/                ← 构建生成：35 个可收录的静态页面
  cat-01.html ...
sitemap.xml           ← 构建生成：给搜索引擎的页面清单
robots.txt            ← 构建生成
site.config.json      ← 站点配置（域名、站名、描述）
css/
  style.css           设计变量、按钮、动画等基础样式
  home.css            首页样式
  paint.css           画布页样式（含横屏 / 打印）
  seo.css             静态页面的文字内容区样式
js/
  art.js              35 张线稿的数据（纯 SVG 路径，手写）
  data.js             分类、调色板、工具配置
  svg-markup.js       线稿 → SVG 字符串（浏览器和构建脚本共用）
  render.js           把线稿数据渲染成 SVG
  home.js             首页逻辑（筛选、收藏、继续画、随机）
  paint.js            画布核心（填色、撤销、清空、保存、打印）
  storage.js          本地存储（收藏 / 进度 / 偏好）
build/
  build-static.mjs    生成静态页面 + sitemap + robots
  build-og-images.mjs 生成 35 张分享配图
  build-og-home.mjs   生成首页分享配图
img/                  ← 构建生成：分享配图
```

---

## 五、功能一览

### 画册分类页
- 7 个分类：小动物 8 · 花朵 5 · 交通工具 5 · 水果 6 · 恐龙 4 · 公主 3 · 小汽车 4，共 35 张线稿
- 顶部横向滑动的分类胶囊（移动端可左右滑动，选中后自动滚到中间）
- "我的收藏"筛选、"继续画"（自动恢复上次未完成的作品）、"随便画一张"
- 卡片右上角 ★ 收藏，有未完成的作品会显示"画到一半"角标

### 填色页
- **油漆桶**：点一下区域就填满（默认工具，小朋友最爱）
- **画笔**：按住拖动，经过的区域连续上色
- **橡皮**：把区域擦回白色
- **调色板**：12 种颜色，圆点色块，选中的会放大并打勾
- **撤销**（↶，最多 400 步）/ **清空**（带可爱确认弹窗）/ **保存 PNG** / **打印**
- 涂色时区域会轻微弹一下，并冒出一个颜色气泡
- 每次操作自动保存进度，下次打开自动接着画
- 快捷键：`1–9` `0` 选颜色，`Ctrl/Cmd + Z` 撤销

### SEO
- 每张线稿独立页面，标题 / 描述 / canonical / OG / Twitter 卡片齐全
- JSON-LD 结构化数据（`WebSite`、`WebPage`、`BreadcrumbList`）
- `sitemap.xml` + `robots.txt` 自动生成
- 静态页里的 SVG 是内联的，零 JS 也能显示（对 SEO 和分享预览都友好）

### 适配
- 手机竖屏：工具栏在底部（拇指可及）
- 平板 / 桌面横屏：工具栏自动移到右侧
- 支持刘海屏安全区（`env(safe-area-inset-*)`）、`100dvh`、禁止双击缩放与长按选中
- 触控目标 ≥ 48px；尊重 `prefers-reduced-motion`

---

## 六、想加 / 改东西

**加一张线稿**：在 `js/art.js` 里照着已有写法新增一个对象，再把它加进文件末尾的 `ARTWORKS` 数组即可。形状支持：

```js
C(cx, cy, rx, ry)        // 椭圆
R(x, y, w, h, rad)       // 圆角矩形
P("M... Z")              // 任意路径（会成为可填色区域）
L("M...")                // 只描线不填色（眼睛、纹理）
blush: [cheek(72, 92)]   // 腮红
```

坐标系是 200×200，`fitToCanvas` 会自动把超出画布的图形缩放进安全区。

加完之后跑 `npm run build`，新页面和 sitemap 会自动生成。

**换配色**：调色板在 `js/data.js` 的 `PALETTE`；整体主题色在 `css/style.css` 的 `:root` 变量里。

**换站名 / 描述**：改 `site.config.json` 里的 `siteName`、`description`、`keywords`，然后 `npm run build`。

---

## 七、常见问题

**Q：提交到 Google 后多久能搜到？**
A：新站一般几天到两周。小站多发点外链（分享到论坛、社交媒体）能加快收录。

**Q：百度搜不到？**
A：百度对新域名审核较严，需要先在百度站长平台验证站点，并且确认网站没有跳转劫持。可以先在 `https://www.baidu.com/s?wd=site:你的域名` 看看有没有收录。

**Q：能加更多线稿吗？**
A：可以，`js/art.js` 里加就行，数量没有限制。

**Q：用户的画会上传吗？**
A：不会。所有进度都存在用户自己浏览器的 localStorage 里，服务器完全不知道有谁画了什么。
