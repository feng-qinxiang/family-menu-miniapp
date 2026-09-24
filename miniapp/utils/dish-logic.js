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

/**
 * 当前步骤用到了哪几样配料（做菜模式：把这一步要下的料挑出来高亮）。
 *
 * 为什么只能靠文本匹配：服务端的 `recipe_step` 只有 text/image/video，步骤与配料之间
 * **没有结构化关联**（对比 Mealie：它的配方编辑器允许把配料直接挂到某一步上，
 * https://docs.mealie.io/documentation/getting-started/faq ），所以这是「提示」不是「断言」——
 * 匹配不到就一条都不高亮（全中性），永远不隐藏任何配料：漏掉的配料在备菜时必须还能看见、还能勾。
 * ponytail: 上限就在这里——同一个名字出现在两步、或步骤只写"下料"不写名字，都只能靠字符包含。
 * 升级路径明确：`recipe_step` 加一列（或一张 step_ingredient 关联表），录入端先支持挂料，
 * 这个函数就从"猜"退回"读"，页面接口不用动。
 *
 * 匹配规则（从简、可预期）：
 * ① 步骤文本里出现配料名即命中（去掉空格再比，中文菜谱里「五花肉 」与「五花肉」是一回事）；
 * ② 命中集合里，被更长命中项包含的短名字去掉——「冰糖」命中时不再把「糖」也算一步的料，
 *    否则一步能点亮半屏（盐/糖/油 这类单字调料尤其明显）；
 * ③ 空步骤 / 空配料 → 空数组。
 *
 * @param {string} stepText 当前步骤正文
 * @param {string[]} names 整份配料的名字（同序返回下标）
 * @returns {number[]} 命中的配料下标
 */
function ingredientsInStep(stepText, names) {
  const text = String(stepText || '').replace(/\s+/g, '');
  if (!text || !Array.isArray(names) || !names.length) return [];
  const hits = [];
  names.forEach((raw, idx) => {
    const name = String(raw || '').replace(/\s+/g, '');
    if (name && text.indexOf(name) !== -1) hits.push({ idx, name });
  });
  if (hits.length < 2) return hits.map((h) => h.idx);
  // 长名字优先：短名字被长名字包含时丢弃（「糖」vs「冰糖」）
  const kept = hits.filter((h) => !hits.some((o) => o !== h && o.name.length > h.name.length
    && o.name.indexOf(h.name) !== -1));
  return kept.map((h) => h.idx);
}

module.exports = {
  decorateHero,
  filterBySlot,
  recipesFromPosts,
  todayDateKey,
  parseLocalDate,
  ingredientsInStep
};
