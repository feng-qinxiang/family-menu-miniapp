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

/**
 * 从社区帖子列表提取关联菜谱（按 recipeId 去重）。
 * 收藏接口 GET /api/me/favorites 返回的是 CommunityPost[]，不是 RecipeCard[]，
 * 直接当菜谱解析会拿到帖子 id → 详情 404 / 加菜失败。必须先映射 p.recipe。
 * @param {Array} posts
 * @returns {Array} 去重后的菜谱数组
 */
function recipesFromPosts(posts) {
  if (!Array.isArray(posts)) return [];
  const seen = {};
  const out = [];
  posts.forEach((p) => {
    const r = p && p.recipe;
    if (r && r.id != null && !seen[r.id]) {
      seen[r.id] = true;
      out.push(r);
    }
  });
  return out;
}

/**
 * 本地时区的 YYYY-MM-DD。禁止用 toISOString().slice(0,10)：
 * 那是 UTC 日期，东八区凌晨会算成前一天。
 * @param {Date} [date]
 * @returns {string}
 */
function todayDateKey(date) {
  const d = date instanceof Date ? date : new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * 解析 'YYYY-MM-DD' 为本地时区日期。
 * new Date('2026-09-10') 按 UTC 解析，东八区下会少一天，必须手写。
 * @param {string} value
 * @returns {Date|null}
 */
function parseLocalDate(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

module.exports = { decorateHero, filterBySlot, recipesFromPosts, todayDateKey, parseLocalDate };
