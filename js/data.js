/**
 * 分类 & 调色板配置
 */
export const CATEGORIES = [
  { id: "animal", name: "小动物", emoji: "🐱", accent: "#ffb3c7" },
  { id: "flower", name: "花朵", emoji: "🌷", accent: "#a8e6cf" },
  { id: "vehicle", name: "交通工具", emoji: "🚌", accent: "#a9d4f5" },
  { id: "fruit", name: "水果", emoji: "🍎", accent: "#ffd98e" },
  { id: "dino", name: "恐龙", emoji: "🦕", accent: "#cdbdf6" },
  { id: "princess", name: "公主", emoji: "👑", accent: "#ffc2e2" },
  { id: "truck", name: "小汽车", emoji: "🚗", accent: "#ffb99a" },
];

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c])
);

/**
 * 调色板：12 色，纯净但不刺眼
 * white 用来"涂白"（相当于把区域擦回空白）
 */
export const PALETTE = [
  { id: "white", value: "#ffffff", name: "白色", tick: "#c9bdb2" },
  { id: "gray", value: "#c3c9d4", name: "灰色", tick: "#ffffff" },
  { id: "black", value: "#4a4038", name: "深棕", tick: "#ffffff" },
  { id: "red", value: "#ff6b6b", name: "红色", tick: "#ffffff" },
  { id: "orange", value: "#ffa552", name: "橙色", tick: "#ffffff" },
  { id: "yellow", value: "#ffd54a", name: "黄色", tick: "#8a6a00" },
  { id: "green", value: "#7ed957", name: "绿色", tick: "#ffffff" },
  { id: "mint", value: "#5fd3c0", name: "青色", tick: "#ffffff" },
  { id: "blue", value: "#6cb8f2", name: "蓝色", tick: "#ffffff" },
  { id: "purple", value: "#b394f0", name: "紫色", tick: "#ffffff" },
  { id: "pink", value: "#ffa1c4", name: "粉色", tick: "#ffffff" },
  { id: "brown", value: "#c08b5c", name: "棕色", tick: "#ffffff" },
];

export const TOOLS = [
  { id: "bucket", name: "油漆桶", icon: "🪣" },
  { id: "brush", name: "画笔", icon: "🖌️" },
  { id: "eraser", name: "橡皮", icon: "🧽" },
];

export const STORAGE_KEYS = {
  favorites: "cf_favorites_v1",
  progress: "cf_progress_v1",
  pref: "cf_pref_v1",
};

