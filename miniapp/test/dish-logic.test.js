/**
 * dish-logic 纯函数自检（无 wx/Page 依赖，直接 node 跑）
 * 运行：node miniapp/test/dish-logic.test.js
 */
const assert = require('assert');
const {
  decorateHero,
  filterBySlot,
  recipesFromPosts,
  todayDateKey,
  parseLocalDate
} = require('../utils/dish-logic');

// decorateHero：按字数分档（<=5 默认，6→t6，7-8→t7，9-10→t9，>=11→t11）
assert.strictEqual(decorateHero('红烧肉'), '');          // 3 字
assert.strictEqual(decorateHero('番茄炒鸡蛋'), '');       // 5 字
assert.strictEqual(decorateHero('番茄炒鸡蛋盖'), 't6');   // 6 字
assert.strictEqual(decorateHero('番茄炒鸡蛋盖饭'), 't7'); // 7 字
assert.strictEqual(decorateHero('一二三四五六七八九十'), 't9');    // 10 字
assert.strictEqual(decorateHero('一二三四五六七八九十一'), 't11'); // 11 字

// filterBySlot：mealType 缺失归 dinner
const items = [
  { id: 1, mealType: 'dinner' },
  { id: 2, mealType: 'breakfast' },
  { id: 3 } // 缺失 → dinner
];
assert.deepStrictEqual(filterBySlot(items, 'dinner').map((i) => i.id), [1, 3]);
assert.deepStrictEqual(filterBySlot(items, 'breakfast').map((i) => i.id), [2]);
assert.deepStrictEqual(filterBySlot(null, 'dinner'), []);

// recipesFromPosts：收藏接口返回帖子数组，须提取 recipe 并按 id 去重
const posts = [
  { id: 10, recipe: { id: 1, title: 'A' } },
  { id: 11, recipe: { id: 1, title: 'A' } }, // 重复 recipe id
  { id: 12, recipe: { id: 2, title: 'B' } },
  { id: 13, recipe: null },                   // 无关联菜谱
  { id: 14 }                                  // 无 recipe 字段
];
const extracted = recipesFromPosts(posts);
assert.strictEqual(extracted.length, 2);
assert.deepStrictEqual(extracted.map((r) => r.id), [1, 2]);
assert.deepStrictEqual(recipesFromPosts(null), []);

// todayDateKey：本地日期，不是 UTC（东八区凌晨不能退回前一天）
const d = new Date(2026, 8, 10, 0, 30); // 2026-09-10 00:30 本地
assert.strictEqual(todayDateKey(d), '2026-09-10');
assert.strictEqual(todayDateKey(new Date(2026, 0, 1)), '2026-01-01');

// parseLocalDate：'YYYY-MM-DD' 按本地解析，避免 UTC 少一天
const parsed = parseLocalDate('2026-09-10');
assert.ok(parsed instanceof Date);
assert.strictEqual(parsed.getFullYear(), 2026);
assert.strictEqual(parsed.getMonth(), 8);
assert.strictEqual(parsed.getDate(), 10);
assert.strictEqual(parseLocalDate(''), null);
assert.strictEqual(parseLocalDate('not-a-date'), null);

console.log('dish-logic.test.js: all assertions passed');
