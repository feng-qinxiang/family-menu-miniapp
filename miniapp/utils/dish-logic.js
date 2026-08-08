/**
 * dish-logic.js · 首页/菜单共用纯逻辑（可被 node 直接 require 测试，无 wx/Page 依赖）
 * 测试见 test/dish-logic.test.js，改动后跑 node test/dish-logic.test.js
 */

/**
 * hero 标题按字数分档缩字号，避免长菜名换行挤压 meta 区。
 * 6 字→t6，7-8 字→t7，9-10 字→t9，≥11 字→t11；<=5 字返回 ''（默认大字号）
 * @param {string} title
 * @returns {''|'t6'|'t7'|'t9'|'t11'}
 */
function decorateHero(title) {
  const n = String(title || '').length;
  if (n <= 5) return '';
  if (n <= 6) return 't6';
  if (n <= 8) return 't7';
  if (n <= 10) return 't9';
  return 't11';
}

/**
 * 按餐次过滤今日菜单项。mealType 缺失时按服务端约定归入 'dinner'。
 * 精确匹配语义：snack 菜在 breakfast/lunch/dinner 下不会被匹配到。
 * @param {Array} items
 * @param {string} slot
 * @returns {Array}
 */
function filterBySlot(items, slot) {
  if (!Array.isArray(items) || !slot) return [];
  return items.filter(it => (it && (it.mealType || 'dinner')) === slot);
}

module.exports = { decorateHero, filterBySlot };
