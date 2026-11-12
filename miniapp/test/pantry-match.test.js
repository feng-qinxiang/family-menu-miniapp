// pantry-match.test · 「冰箱里有没有」唯一口径的断言（零依赖，node 直跑）
// 这套口径必须和服务端 PantryDeduction 一致：页面说"有"、做完菜却一项没扣，就是这里对不上。
const assert = require('assert');
const { normalize, parseAmount, indexPantry, pantryHas, pantryMatches } = require('../utils/pantry-match');

// 归一 / 取数：去空白、转小写；取字符串开头的数字，解析不出或 ≤0 返回 null
assert.strictEqual(normalize(' 紫 菜 '), '紫菜');
assert.strictEqual(normalize(null), '');
assert.strictEqual(parseAmount('8'), 8);
assert.strictEqual(parseAmount('8g'), 8);
assert.strictEqual(parseAmount('1,000'), 1000);
assert.strictEqual(parseAmount('适量'), null);
assert.strictEqual(parseAmount('0'), null);
assert.strictEqual(parseAmount(null), null);
assert.strictEqual(parseAmount('9'.repeat(400)), null, '无限大不是有效库存量');

// 日志里的真实一笔：菜谱要「紫菜 8g」，冰箱里只有「紫菜 1 包」
const pantry = [
  { ingredientName: '鸡蛋', amount: '8', unit: '个' },
  { ingredientName: '紫菜', amount: '1', unit: '包' },
  { ingredientName: '香葱', amount: '适量', unit: '根' }
];
const index = indexPantry(pantry);
assert.strictEqual(pantryHas(index, '鸡蛋', '个', '2'), true);
assert.strictEqual(pantryHas(index, '鸡蛋', '个', '8'), true);
assert.strictEqual(pantryHas(index, '鸡蛋', '个', '9'), false, '同名同单位库存不足时不能算有');
assert.strictEqual(pantryHas(index, '紫菜', 'g', '8'), false, '单位对不上不算有——服务端也不会扣这行');
assert.strictEqual(pantryHas(index, '香葱', '根', '1'), false, '库存写「适量」的不入索引');
assert.strictEqual(pantryHas(index, '鸡蛋', '个', '适量'), false, '菜谱用量解析不出数字就不算有');
assert.strictEqual(pantryHas(index, '土鸡蛋', '个', '2'), false, '只认全等，不再双向子串包含');
assert.strictEqual(pantryHas(index, '鸡蛋', '个', '2'), true);
assert.strictEqual(pantryHas(pantry, '鸡蛋', '个', '2'), true, '直接传原始冰箱列表也能用');

const splitStock = [{ name: '鸡蛋', unit: '个', amount: '1' }, { name: ' 鸡 蛋 ', unit: '个', amount: '2' }];
assert.strictEqual(pantryHas(splitStock, '鸡蛋', '个', '3'), true, '同名同单位库存需要合计');
assert.strictEqual(pantryHas(splitStock, '鸡蛋', '个', '4'), false);
const repeatedNeeds = [{ name: '鸡蛋', unit: '个', amount: '2' }, { name: '鸡蛋', unit: '个', amount: '2' }];
assert.deepStrictEqual(pantryMatches(splitStock, repeatedNeeds), [false, false], '重复配料不能复用同一份库存');
assert.deepStrictEqual(pantryMatches(splitStock, repeatedNeeds, 0.5), [true, true]);

// 真实详情页在更改份数时，数量、够用标记和缺料计数一起刷新。
let pageDefinition;
global.Page = (page) => { pageDefinition = page; };
require('../pkg-extra/recipe-detail/index');
delete global.Page;
const page = {
  ...pageDefinition,
  _pantryIndex: indexPantry(splitStock),
  data: { servings: 2, baseServings: 2,
    recipe: { ingredients: [{ name: '鸡蛋', unit: '个', amount: '2', baseAmount: '2', inStock: true }], haveCount: 1 }, missCount: 0 },
  setData(patch) {
    Object.entries(patch).forEach(([key, value]) => {
      if (key.startsWith('recipe.')) this.data.recipe[key.slice(7)] = value;
      else this.data[key] = value;
    });
  }
};
page.changeServings({ currentTarget: { dataset: { delta: 2 } } });
assert.strictEqual(page.data.recipe.ingredients[0].amountText, '4');
assert.strictEqual(page.data.recipe.ingredients[0].inStock, false);
assert.strictEqual(page.data.recipe.haveCount, 0);
assert.strictEqual(page.data.missCount, 1);
page.changeServings({ currentTarget: { dataset: { delta: -2 } } });
assert.strictEqual(page.data.recipe.ingredients[0].inStock, true);

console.log('pantry-match.test: 全部断言通过 ✔');
