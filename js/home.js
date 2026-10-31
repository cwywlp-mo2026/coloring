/**
 * 首页：分类胶囊 + 线稿网格 + 收藏
 */

import { CATEGORIES } from "./data.js";
import { ARTWORKS } from "./art.js";
import { renderThumb } from "./render.js";
import {
  getFavorites,
  toggleFavorite,
  getRecentProgress,
} from "./storage.js";

const els = {
  catBar: document.getElementById("catBar"),
  gallery: document.getElementById("gallery"),
  empty: document.getElementById("empty"),
  emptyTitle: document.getElementById("emptyTitle"),
  emptyText: document.getElementById("emptyText"),
  emptyReset: document.getElementById("emptyReset"),
  favBtn: document.getElementById("favBtn"),
  continueBtn: document.getElementById("continueBtn"),
  popBtn: document.getElementById("popBtn"),
};

/** 当前筛选：all | fav | <categoryId> */
let filter = "all";

/** 按分类分组（保持 CATEGORIES 的顺序） */
const byCategory = CATEGORIES.map((cat) => ({
  cat,
  items: ARTWORKS.filter((a) => a.category === cat.id),
})).filter((g) => g.items.length > 0);

const ALL = { id: "all", name: "全部", emoji: "✨", accent: "#ff95b4" };
const FAV = { id: "fav", name: "我的收藏", emoji: "⭐", accent: "#ffc65c" };

/* ==================================================================
   分类胶囊
   ================================================================== */

function buildCatBar() {
  const pills = [ALL, ...CATEGORIES, FAV].map((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cat-pill";
    btn.dataset.cat = c.id;
    btn.style.setProperty("--pill", c.accent);
    btn.setAttribute("aria-pressed", String(c.id === filter));

    const emoji = document.createElement("span");
    emoji.className = "cat-pill__emoji";
    emoji.textContent = c.emoji;
    emoji.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.textContent = c.name;

    btn.append(emoji, label);
    btn.addEventListener("click", () => {
      setFilter(c.id);
      btn.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    });
    return btn;
  });
  els.catBar.replaceChildren(...pills);
}

function setFilter(id) {
  filter = id;
  els.catBar.querySelectorAll(".cat-pill").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.cat === id));
  });
  els.favBtn.setAttribute("aria-pressed", String(id === "fav"));
  renderGallery();
}

/* ==================================================================
   卡片
   ================================================================== */

/**
 * 线稿详情页地址
 * ---------------------------------------------------------------
 * 指向静态页 /paint/<id>.html，而不是 paint.html?id=<id>。
 * 原因：静态页的内容直接写在 HTML 里，搜索引擎能读到、能收录，
 * 也能给每个页面单独排到搜索结果里。
 * 动态页保留给「直接跳转涂色」的场合。
 */
function artHref(art) {
  return `paint/${encodeURIComponent(art.id)}.html`;
}

function buildCard(art, accent, recentId) {
  const card = document.createElement("a");
  card.className = "card";
  card.href = artHref(art);
  card.style.setProperty("--accent", accent);
  card.setAttribute("aria-label", `给${art.name}涂色`);

  const thumb = document.createElement("div");
  thumb.className = "card__thumb";
  thumb.appendChild(renderThumb(art, accent));

  const name = document.createElement("span");
  name.className = "card__name";
  name.textContent = art.name;

  // 收藏按钮（不能触发卡片跳转）
  const fav = document.createElement("button");
  fav.type = "button";
  fav.className = "card__fav";
  const faved = getFavorites().includes(art.id);
  fav.setAttribute("aria-pressed", String(faved));
  fav.setAttribute("aria-label", `收藏 ${art.name}`);
  const star = document.createElement("span");
  star.textContent = faved ? "★" : "☆";
  fav.appendChild(star);

  fav.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = toggleFavorite(art.id);
    fav.setAttribute("aria-pressed", String(now));
    star.textContent = now ? "★" : "☆";
    star.animate(
      [
        { transform: "scale(0.6) rotate(-20deg)" },
        { transform: "scale(1.3) rotate(8deg)" },
        { transform: "scale(1) rotate(0deg)" },
      ],
      { duration: 320, easing: "ease-out" }
    );
    if (filter === "fav" && !now) {
      card.animate(
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(0.86)" },
        ],
        { duration: 180, easing: "ease-in", fill: "forwards" }
      ).onfinish = renderGallery;
    }
  });

  card.append(thumb, name, fav);

  if (recentId === art.id) {
    const badge = document.createElement("span");
    badge.className = "card__badge";
    badge.textContent = "画到一半";
    card.appendChild(badge);
  }

  return card;
}

/* ==================================================================
   网格
   ================================================================== */

function renderGallery() {
  const favIds = getFavorites();
  const recent = getRecentProgress();
  const frag = document.createDocumentFragment();
  let count = 0;

  byCategory.forEach(({ cat, items }) => {
    let shown = items;
    if (filter === "fav") shown = items.filter((a) => favIds.includes(a.id));
    else if (filter !== "all") shown = cat.id === filter ? items : [];
    if (!shown.length) return;

    count += shown.length;

    const group = document.createElement("section");
    group.className = "group";
    // 锚点：静态页底部的「按分类浏览」会链到这里
    group.id = `cat-${cat.id}`;
    group.style.setProperty("--accent", cat.accent);

    const head = document.createElement("div");
    head.className = "group__head";

    const tag = document.createElement("span");
    tag.className = "group__tag";

    const title = document.createElement("h2");
    title.className = "group__title";
    title.textContent = `${cat.emoji} ${cat.name}`;

    const badge = document.createElement("span");
    badge.className = "group__count";
    badge.textContent = `${shown.length} 张`;

    head.append(tag, title, badge);

    const grid = document.createElement("div");
    grid.className = "grid";
    shown.forEach((art) =>
      grid.appendChild(buildCard(art, cat.accent, recent?.artId))
    );

    group.append(head, grid);
    frag.appendChild(group);
  });

  els.gallery.replaceChildren(frag);
  els.empty.hidden = count > 0;

  if (filter === "fav") {
    els.emptyTitle.textContent = "还没有收藏哦";
    els.emptyText.textContent = "点卡片右上角的小星星，就能把喜欢的图收起来啦";
    els.emptyReset.textContent = "去看看全部图案";
  } else {
    els.emptyTitle.textContent = "这里空空的";
    els.emptyText.textContent = "换个分类看看吧";
    els.emptyReset.textContent = "看全部图案";
  }
}

els.emptyReset.addEventListener("click", () => setFilter("all"));

/* ==================================================================
   顶部按钮
   ================================================================== */

els.favBtn.addEventListener("click", () => {
  const next = filter === "fav" ? "all" : "fav";
  setFilter(next);
  els.catBar
    .querySelector(`.cat-pill[data-cat="${next}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
});

/** "继续画" / 随机一张 */
function setupTopButtons() {
  const recent = getRecentProgress();
  const art = recent ? ARTWORKS.find((a) => a.id === recent.artId) : null;

  if (!art) {
    els.continueBtn.hidden = true;
    els.continueBtn.dataset.artId = "";
    return;
  }

  els.continueBtn.hidden = false;
  // 只在作品真的变了时才改 dataset，事件只有一个监听器，
  // 避免每次 focus 都叠加一个新监听器、导致跳到过期的作品。
  els.continueBtn.dataset.artId = art.id;
}

els.continueBtn.addEventListener("click", () => {
  const id = els.continueBtn.dataset.artId;
  if (!id) return;
  const art = ARTWORKS.find((a) => a.id === id);
  location.href = art ? artHref(art) : `paint.html?id=${encodeURIComponent(id)}`;
});

// 随机一张只绑定一次
els.popBtn.addEventListener("click", () => {
  const recent = getRecentProgress();
  const pool = ARTWORKS.filter((a) => a.id !== recent?.artId);
  const pick = pool[Math.floor(Math.random() * pool.length)] || ARTWORKS[0];
  location.href = artHref(pick);
});

/* ==================================================================
   启动
   ================================================================== */

buildCatBar();
renderGallery();
setupTopButtons();

// 从画布返回时（包括手机 bfcache）刷新一下
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    renderGallery();
    setupTopButtons();
  }
});
window.addEventListener("focus", () => {
  if (!document.hidden) renderGallery();
});
