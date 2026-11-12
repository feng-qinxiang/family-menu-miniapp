/**
 * 「冰箱里有没有」的唯一判定口径。
 *
 * 为什么要有这个文件：同一个问题原来在四个地方各写一套——
 *   菜谱详情：名称去空格后完全相等（不看单位）
 *   买菜页「库存里已有」：双向子串包含
 *   菜单页「N 样能用现有食材」：相等或双向子串
 *   服务端扣库存（server PantryDeduction）：名称+单位归一后完全相等，且两边用量都能解析出数字
 * 结果就是"详情页说冰箱里有、做完菜服务端一项不扣"，用户看到数字不变却没有任何解释。
 * 现在统一按服务端那一套（最严的那套，也是真正会扣的那套）来判定。
 */
const { parseLocalDate } = require('./dish-logic');
const { recipeDishImg } = require('./image');

function daysLeft(expiresAt, now = new Date()) {
  if (!expiresAt) return null;
  const target = parseLocalDate(expiresAt);
  if (!target) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function expiryText(days) {
  if (days === null) return '未填到期日';
  if (days < 0) return `已过期 ${-days} 天`;
  if (days === 0) return '今天到期 · 先用';
  if (days <= 3) return `还剩 ${days} 天 · 先用`;
  return `还剩 ${days} 天`;
}

function pantrySummary(items) {
  const list = Array.isArray(items) ? items : [];
  const dated = list.map(item => ({ name: item.ingredientName || item.name, days: daysLeft(item.expiresAt) }));
  const expiring = dated.filter(item => item.days !== null && item.days >= 0 && item.days <= 3).sort((a, b) => a.days - b.days);
  return {
    count: list.length,
    expiringCount: expiring.length,
    expiredCount: dated.filter(item => item.days !== null && item.days < 0).length,
    undatedCount: dated.filter(item => item.days === null).length,
    priorityText: expiring.slice(0, 3).map(item => item.name).join('、')
  };
}

// 同一份服务端匹配同时用于冰箱与随机挑菜，缺少用料时不能仅凭百分比声称「能做」。
function normalizeMatches(matches) {
  return (Array.isArray(matches) ? matches : []).map(item => {
    const recipe = item.recipe || {};
    const total = Number(item.totalCount) || 0;
    const have = Number(item.matchedCount) || 0;
    const missing = Array.isArray(item.missingIngredients) ? item.missingIngredients.filter(Boolean) : [];
    const expiring = Array.isArray(item.expiringIngredients) ? item.expiringIngredients.filter(Boolean) : [];
    const full = total > 0 && have >= total && missing.length === 0;
    const rate = total > 0 ? Math.min(1, have / total) : 0;
    return {
      ...recipe,
      id: recipe.id || item.recipeId,
      title: recipe.title || '未命名菜谱',
      coverImage: recipeDishImg(recipe),
      metaText: `${recipe.timeCost || '--'} 分钟 · ${recipe.servings || '--'} 人份`,
      haveText: `${have}/${total}`,
      percentWidth: Math.round(rate * 100),
      full,
      expiringIngredients: expiring,
      priorityText: expiring.length ? `先用 ${expiring.join('、')}` : '',
      missingText: full ? '食材齐全 · 按菜谱份量' : (missing.length ? `还差 ${missing.join('、')}` : '用料尚未确认')
    };
  }).filter(item => item.id);
}

/** 归一：去所有空白 + 转小写（与服务端 PantryDeduction.normalize 一致） */
function normalize(text) {
  return String(text == null ? '' : text).replace(/\s+/g, '').toLowerCase();
}

/** 取字符串开头的数字；解析不出或 ≤0 返回 null（与服务端 parseAmount 一致） */
function parseAmount(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(/,/g, '');
  const matched = /^[0-9.]+/.exec(s);
  if (!matched) return null;
  const value = Number(matched[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function stockKey(name, unit) {
  return normalize(name) + '|' + normalize(unit);
}

/**
 * 冰箱列表 → 「名称|单位」索引。
 * 用量写的是「适量/少许」这种解析不出数字的行不入索引：服务端不会扣它们，
 * 前端也就不该说"冰箱里有"。
 */
function indexPantry(pantryItems) {
  const index = new Map();
  (Array.isArray(pantryItems) ? pantryItems : []).forEach((item) => {
    const name = (item && (item.ingredientName || item.name)) || '';
    const expiry = daysLeft(item && item.expiresAt);
    if (!name || parseAmount(item && item.amount) == null || (expiry !== null && expiry < 0)) return;
    const key = stockKey(name, item.unit);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(item);
  });
  return index;
}

/**
 * 这道菜要的这一味，能不能真的从冰箱里扣到。
 * @param {Map|Array} pantry indexPantry 的结果，或原始冰箱列表
 * @param {string} name 食材名
 * @param {string} unit 菜谱里的单位
 * @param {string|number} amount 菜谱里的用量
 */
function pantryHas(pantry, name, unit, amount) {
  const required = parseAmount(amount);
  if (!name || required == null) return false;
  const index = pantry instanceof Map ? pantry : indexPantry(pantry);
  const rows = index.get(stockKey(name, unit));
  if (!rows) return false;
  const available = rows.reduce((sum, item) => sum + (parseAmount(item && item.amount) || 0), 0);
  return available >= required;
}

/** 整道菜先合计同名同单位的需求，再按实际份数判断每行是否够用。 */
function pantryMatches(pantry, ingredients, ratio = 1) {
  const index = pantry instanceof Map ? pantry : indexPantry(pantry);
  const required = new Map();
  ingredients.forEach((item) => {
    const amount = parseAmount(item.amount);
    const key = stockKey(item.name || item.ingredientName, item.unit);
    if (amount != null) required.set(key, (required.get(key) || 0) + amount * ratio);
  });
  return ingredients.map((item) => parseAmount(item.amount) != null
    && pantryHas(index, item.name || item.ingredientName, item.unit,
      required.get(stockKey(item.name || item.ingredientName, item.unit))));
}

module.exports = {
  normalize,
  parseAmount,
  indexPantry,
  pantryHas,
  pantryMatches,
  daysLeft,
  expiryText,
  pantrySummary,
  normalizeMatches
};
