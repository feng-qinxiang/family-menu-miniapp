/**
 * dish-logic 单元测试 · 零依赖（node 内置 assert）
 * 运行：node test/dish-logic.test.js   （退出码 0=通过，非 0=失败）
 */
const assert = require('assert');
const { decorateHero, filterBySlot } = require('../miniapp/utils/dish-logic');

let passed = 0;
function eq(actual, expected, label) {
  assert.deepStrictEqual(actual, expected, label);
  passed += 1;
}

// ============ decorateHero：按标题字数分档 ============
const cases = [
  ['', ''],
  ['酸辣汤', ''],                 // 3 字
  ['红烧排骨', ''],               // 4 字
  ['番茄牛腩煲', ''],             // 5 字 → 默认档
  ['糖醋里脊肉丝', 't6'],         // 6 字
  ['西红柿炒鸡蛋饭', 't7'],       // 7 字
  ['胡萝卜玉米排骨汤', 't7'],     // 8 字
  ['胡萝卜玉米炖排骨汤', 't9'],   // 9 字
  ['胡萝卜玉米炖排骨汤面', 't9'], // 10 字
  ['菠萝咕咾肉配杨枝甘露甜品', 't11'], // 11 字
  ['胡萝卜玉米炖排骨汤面一份', 't11'], // 12 字
  ['菠萝咕咾肉配杨枝甘露甜品煲汤', 't11'] // 14 字
];
for (const [input, expected] of cases) {
  eq(decorateHero(input), expected, `decorateHero('${input}')`);
}
eq(decorateHero(undefined), '', 'decorateHero(undefined)');
eq(decorateHero(null), '', 'decorateHero(null)');
eq(decorateHero(12345), '', 'decorateHero(数字 5 位)');

// ============ filterBySlot：按餐次过滤 ============
const menu = [
  { recipeId: 1, mealType: 'breakfast' },
  { recipeId: 2, mealType: 'lunch' },
  { recipeId: 3, mealType: 'dinner' },
  { recipeId: 4, mealType: 'dinner' },
  { recipeId: 5, mealType: 'snack' },
  { recipeId: 6 }                    // mealType 缺失 → 默认 dinner
];
eq(filterBySlot(menu, 'breakfast').map(i => i.recipeId), [1], 'filterBySlot breakfast');
eq(filterBySlot(menu, 'lunch').map(i => i.recipeId), [2], 'filterBySlot lunch');
eq(filterBySlot(menu, 'dinner').map(i => i.recipeId), [3, 4, 6], 'filterBySlot dinner 含默认餐次');
eq(filterBySlot(menu, 'snack').map(i => i.recipeId), [5], 'filterBySlot snack');
eq(filterBySlot([], 'dinner'), [], '空数组');
eq(filterBySlot(menu, ''), [], '空 slot');
eq(filterBySlot(menu, undefined), [], 'undefined slot');
eq(filterBySlot(null, 'dinner'), [], 'null items');
eq(filterBySlot(undefined, 'dinner'), [], 'undefined items');
eq(filterBySlot({ a: 1 }, 'dinner'), [], '非数组 items');

console.log(`dish-logic.test: ${passed} 断言全部通过 ✔`);
