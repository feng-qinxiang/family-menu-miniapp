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
  return value > 0 ? value : null;
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
    if (!name || parseAmount(item && item.amount) == null) return;
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
  if (!name || parseAmount(amount) == null) return false;
  const index = pantry instanceof Map ? pantry : indexPantry(pantry);
  return index.has(stockKey(name, unit));
}

module.exports = {
  normalize,
  parseAmount,
  indexPantry,
  pantryHas
};
