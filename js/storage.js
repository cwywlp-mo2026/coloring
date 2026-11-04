/**
 * 本地存储：收藏 / 进度 / 偏好
 * 所有操作都做了 try/catch，隐私模式下也不会崩
 * 说明：旧版本的 key 不再使用，统一带 v1 后缀，避免读到旧格式数据。
 */

// 存储的 key 统一在 data.js 里定义，避免两处各写一份、改了一处忘了另一处
import { STORAGE_KEYS } from "./data.js";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* ---------------- 收藏 ---------------- */

const FAV_KEY = STORAGE_KEYS.favorites;

export function getFavorites() {
  const list = read(FAV_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function isFavorite(id) {
  return getFavorites().includes(id);
}

export function toggleFavorite(id) {
  const list = getFavorites();
  const idx = list.indexOf(id);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(id);
  write(FAV_KEY, list);
  return idx < 0; // true = 现在已收藏
}

/* ---------------- 进度（每张画布一份） ---------------- */

// 汇总在一个键里，读写都是同步的，不会互相覆盖
const PROGRESS_KEY = STORAGE_KEYS.progress;

/**
 * fills 形如 { regionIndex: color }
 */
export function getProgress(artId) {
  const all = read(PROGRESS_KEY, {});
  if (!all || typeof all !== "object" || Array.isArray(all)) return null;
  const item = all[artId];
  if (!item || typeof item !== "object") return null;
  return {
    // fills 必须是普通对象，数组 / null 都要挡掉
    fills:
      item.fills && typeof item.fills === "object" && !Array.isArray(item.fills)
        ? item.fills
        : {},
    updatedAt: item.updatedAt || 0,
  };
}

export function saveProgress(artId, fills) {
  const all = read(PROGRESS_KEY, {}) || {};
  if (typeof all !== "object" || Array.isArray(all)) return false;
  all[artId] = { fills, updatedAt: Date.now() };
  // 最多保存 40 张画，防止撑爆 localStorage
  const ids = Object.keys(all);
  if (ids.length > 40) {
    ids
      .sort((a, b) => (all[a].updatedAt || 0) - (all[b].updatedAt || 0))
      .slice(0, ids.length - 40)
      .forEach((id) => delete all[id]);
  }
  return write(PROGRESS_KEY, all);
}

export function clearProgress(artId) {
  const all = read(PROGRESS_KEY, {}) || {};
  if (typeof all !== "object" || Array.isArray(all)) return;
  if (!all[artId]) return;
  delete all[artId];
  write(PROGRESS_KEY, all);
}

/** 有没有"画到一半"的作品，用于首页显示"继续画" */
export function getRecentProgress() {
  const all = read(PROGRESS_KEY, {}) || {};
  if (typeof all !== "object" || Array.isArray(all)) return null;
  const entries = Object.entries(all).filter(
    ([, v]) =>
      v &&
      v.fills &&
      typeof v.fills === "object" &&
      !Array.isArray(v.fills) &&
      Object.keys(v.fills).length > 0
  );
  if (!entries.length) return null;
  entries.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
  return { artId: entries[0][0], ...entries[0][1] };
}

/* ---------------- 偏好（上次用的颜色/工具） ---------------- */

const PREF_KEY = STORAGE_KEYS.pref;

export function getPrefs() {
  const p = read(PREF_KEY, null);
  return p && typeof p === "object" && !Array.isArray(p) ? p : {};
}

export function savePrefs(patch) {
  const next = { ...getPrefs(), ...patch };
  write(PREF_KEY, next);
  return next;
}
