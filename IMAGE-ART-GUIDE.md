# 线稿图片接入指南
> 简单说：**把 PNG 丢进 `downloads/`，跑两条命令，它就变成能涂色的线稿了。**

---

## 一、准备图片

放到 `downloads/` 目录，命名随意（建议用有意义的英文名）：

```
downloads/
  4253244.png      ← 小花猫
  flower-new.webp  ← 小花朵
  dog-new.jpg      ← 小黄狗
  rabbit-new.webp  ← 小白兔
  pig-new.png      ← 小粉猪
  我的新图.png      ← 也可以，脚本会自己处理
```

**图片要求**（很重要，不符合会导致分色失败）：

| 要求 | 为什么 |
|---|---|
| 黑白线稿（不是彩色） | 算法靠"明暗"找线条边界 |
| 背景纯白 | 灰色/米色背景会被当成一个色块 |
| 线条闭合 | 区域是"线围出来的白块"，线没闭合就找不到边界 |
| 主体居中、单个 | 背景里的零散物件会变成奇怪的色块 |
| 500×500 以上 | 太小的图放大后线条会毛糙 |

**支持三种画法**（脚本自动判断，也可以手动指定）：

| 画法 | 长什么样 | 参数 |
|---|---|---|
| 普通线稿 | 白底黑线，图形内部是空白 | 默认 / `--line` |
| 彩色插画 | 彩色扁平插画（棕色身体+白肚皮） | `--color` |
| 实心填色 | 图形被涂成一整块深色 | `--solid` |

**不支持**：直接用 SVG（纯线条图标没有色块可涂）、水彩、照片。

---

## 二、跑转换

```powershell
python build/png-to-regions.py downloads/你的新图.png
```

输出：

```
downloads/out/你的新图.regions.json   ← 区域路径数据
downloads/out/你的新图.ink.png        ← 轮廓线（透明底黑线）
```

### 检查效果（重要！）

```powershell
python build/preview-regions.py downloads/out/你的新图
```

会生成 `downloads/out/你的新图.preview.png` —— 随机上色的效果预览。
**打开看看**，如果分色乱七八糟，就调整图片或调参数：

```powershell
python build/png-to-regions.py downloads/你的新图.png --min-area 500
```

`--min-area` 调大 → 只保留大块（碎块少）；调小 → 保留更多细节。

---

## 三、登记到系统

打开 `build/build-image-arts.mjs`，在 `META` 里加一条：

```js
const META = {
  "4253244":     { id: "cat-01",    name: "小花猫", category: "animal",   ... },
  "flower-new":  { id: "flower-01", name: "小花朵", category: "flower",   ... },
  "dog-new":     { id: "dog-01",    name: "小黄狗", category: "animal",   ... },
  "rabbit-new":  { id: "rabbit-01", name: "小白兔", category: "animal",   ... },
  "pig-new":     { id: "pig-01",    name: "小粉猪", category: "animal",   ... },

  // ↓ 新增
  "我的新图": {
    id: "dog-02",              // 想替换现有线稿就用它的 id
    name: "小黄狗",
    category: "animal",       // animal/flower/vehicle/fruit/dino/princess/truck
    source: "downloads/我的新图.png",
  },
};
```

> **id 决定行为**：
> - 用**新的 id**（如 `dog-02`）→ 变成新增一张图
> - 用**现有的 id**（如 `dog-01`）→ 替换掉那张线稿
>
> **key 必须是文件名**（不含扩展名）。比如 `downloads/dog-new.jpg`
> 对应的 key 就是 `dog-new`。

---

## 四、生成并推送

```powershell
node build/build-image-arts.mjs     # 生成 js/art-image.js + 拷贝轮廓线
npm run build                        # 重新生成 35 个静态页面
npm run build:og                     # 重新生成分享配图（可选，但建议）
git add -A
git commit -m "feat: 新增 xxx 线稿"
git push origin main
```

约 1 分钟后自动上线。

---

## 常见问题

**Q：转换后区域很少（比如只有 1-2 块）？**
A：线条没闭合，或者背景不是纯白。换个图，或者把背景抠成纯白。

**Q：区域碎得厉害，一小块一小块？**
A：图太复杂/线条太细。调大 `--min-area`，或者找线条更粗的图。

**Q：预览图里有大片空白没上色？**
A：那是图里本来就没有被线围起来的区域（比如背景），正常。

**Q：图片笔画顶到边缘，结果整张图碎成几百块？**
A：已经修了 —— 现在会先在图外面补一圈白边再找背景。
如果你自己改了 `build/png-to-regions.py`，注意别把这个补边逻辑删掉。

**Q：小狗只有 6 个区域，能不能再多点？**
A：取决于原图。这张图本身就是画好的成品插画（内部封闭的空白区域少），
不是标准涂色线稿。想要更多区域，得找**纯白填充 + 细黑线**的线稿。

**Q：导出的 PNG 没有黑线？**
A：已经处理过了 —— 导出时会把轮廓线图片转成 base64 内嵌。如果还有问题，
检查 `js/paint.js` 的 `inlineImages` 函数。

**Q：手机上线条看不清？**
A：线条粗细在 `build/png-to-regions.py` 里控制：
```python
lw = max(3, int(round(W * 0.009)) | 1)   # 0.009 就是线宽比例
```
调大到 `0.012` 会更粗。

---

## 技术原理（一句话版）

1. 读图 → 灰度化 → 自适应阈值提取黑色线条
2. 把线条稍微膨胀 → 封住抗锯齿造成的缝
3. **在图外面补一圈白边**，然后从四角漫水 → 找出所有"被线围住的白块"
   （补边这步很关键：很多线稿笔画会顶到图片边缘，
    不补边的话漫水进不去，整张图会被当成一片区域）
4. 每个区域用轮廓追踪转成 SVG path
5. 原图的黑线单独存成透明 PNG，作为"描边层"盖在填色层上面

最终结构：
```html
<g class="fills">
  <path class="region" data-r="0" d="..."/>   ← 点哪涂哪
  <path class="region" data-r="1" d="..."/>
</g>
<g class="inks">
  <image href="img/ink/xxx.ink.png"/>          ← 黑线永远在最上层
</g>
```

## 目前的线稿清单

| id | 名字 | 分类 | 区域数 | 来源 |
|---|---|---|---|---|
| `cat-01` | 小花猫 | 小动物 | 15 | `4253244.png` |
| `dog-01` | 小黄狗 | 小动物 | 6 | `dog-new.jpg` |
| `rabbit-01` | 小白兔 | 小动物 | 9 | `rabbit-new.webp` |
| `pig-01` | 小粉猪 | 小动物 | 16 | `pig-new.png` |
| `flower-01` | 小花朵 | 花朵 | 24 | `flower-new.webp` |

其余 30 张是手写 SVG 参数化图形，在 `js/art.js` 里。
