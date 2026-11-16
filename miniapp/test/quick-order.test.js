/**
 * 一句话点菜（规则版）自检：句子 → 计划 → 确认后要调的接口
 * 运行：node miniapp/test/quick-order.test.js
 */
const assert = require('assert');
const { planMenuCommand, pickCandidate, planActions } = require('../utils/parser');

const recipes = [
  { id: 2, title: '红烧肉' }, { id: 4, title: '番茄炒蛋' }, { id: 3, title: '可乐鸡翅' },
  { id: 9, title: '糖醋排骨' }, { id: 7, title: '酸辣土豆丝' }, { id: 8, title: '青椒土豆丝' },
  { id: 110, title: '测试步骤视频番茄蛋' }, { id: 5, title: '香菇滑鸡' }
];
const menu = [
  { id: 2, title: '红烧肉', mealType: 'dinner' },
  { id: 4, title: '番茄炒蛋', mealType: 'lunch' },
  { id: 2, title: '红烧肉', mealType: 'lunch' }
];
const ctx = { recipes, menu, mealType: 'dinner' };
const plan = (text, extra) => planMenuCommand(text, Object.assign({}, ctx, extra));
const ops = (p) => planActions(p).map((a) => `${a.op} ${a.title} ${a.mealType}`);

// 加菜：说了餐次、菜名完整
let p = plan('早饭加个番茄炒蛋');
assert.strictEqual(p.intent, 'add');
assert.strictEqual(p.mealGuessed, false);
assert.deepStrictEqual(ops(p), ['add 番茄炒蛋 breakfast']);
// 一句加两道；没说餐次用入口带来的默认餐次，并标成「猜的」
p = plan('来个红烧肉和可乐鸡翅', { mealType: 'lunch' });
assert.strictEqual(p.mealGuessed, true);
assert.deepStrictEqual(ops(p), ['add 红烧肉 lunch', 'add 可乐鸡翅 lunch']);
assert.deepStrictEqual(ops(plan('今晚吃糖醋排骨吧')), ['add 糖醋排骨 dinner']);

// 撤菜：只在今天这一餐已点的菜里找
p = plan('晚饭不要红烧肉了');
assert.strictEqual(p.intent, 'remove');
assert.deepStrictEqual(ops(p), ['remove 红烧肉 dinner']);
// 菜单里没有 → 不动作，把这一餐已点的菜列出来让人点
p = plan('午饭把可乐鸡翅去掉');
assert.strictEqual(p.items[0].missing, true);
assert.deepStrictEqual(p.items[0].candidates.map((c) => c.title), ['番茄炒蛋', '红烧肉']);
assert.deepStrictEqual(planActions(p), []);
assert.deepStrictEqual(ops(pickCandidate(p, 0, p.items[0].candidates[1])), ['remove 红烧肉 lunch']);
// 没说餐次、同一道菜点在两餐 → 让人点是哪一餐的
p = plan('红烧肉不吃了');
assert.strictEqual(p.items[0].recipe, null);
assert.deepStrictEqual(p.items[0].candidates.map((c) => c.mealType).sort(), ['dinner', 'lunch']);

// 换菜：先撤后加
p = plan('把晚饭的红烧肉换成糖醋排骨');
assert.strictEqual(p.intent, 'replace');
assert.deepStrictEqual(ops(p), ['remove 红烧肉 dinner', 'add 糖醋排骨 dinner']);
// 没说餐次：加的那道跟着撤掉的那道走
assert.deepStrictEqual(ops(plan('番茄炒蛋换成可乐鸡翅')), ['remove 番茄炒蛋 lunch', 'add 可乐鸡翅 lunch']);
assert.deepStrictEqual(ops(plan('晚饭不要红烧肉了，换个糖醋排骨')), ['remove 红烧肉 dinner', 'add 糖醋排骨 dinner']);

// 认不准：列候选，点了才有动作
p = plan('晚饭加个番茄');
assert.deepStrictEqual(p.items[0].candidates.map((c) => c.title), ['番茄炒蛋', '测试步骤视频番茄蛋']);
assert.deepStrictEqual(planActions(p), [], '没认准不能有动作（确认按钮不可点）');
assert.deepStrictEqual(ops(pickCandidate(p, 0, p.items[0].candidates[0])), ['add 番茄炒蛋 dinner']);
assert.strictEqual(p.items[0].recipe, null, 'pickCandidate 不改原计划');
// 只有一道包含它 → 直接认定；换个叫法也认得
assert.deepStrictEqual(ops(plan('加可乐')), ['add 可乐鸡翅 dinner']);
assert.deepStrictEqual(ops(plan('想吃西红柿炒蛋')), ['add 番茄炒蛋 dinner']);
p = plan('加个土豆丝');
assert.deepStrictEqual(p.items[0].candidates.map((c) => c.title).sort(), ['酸辣土豆丝', '青椒土豆丝'].sort());

// 听不懂 / 不是今天 / 没有这道菜
assert.strictEqual(plan('今天天气不错').intent, '');
assert.strictEqual(plan('').intent, '');
p = plan('明天晚饭加个红烧肉');
assert.strictEqual(p.notToday, true);
assert.deepStrictEqual(planActions(p), []);
p = plan('晚饭加个鱼香肉丝');
assert.strictEqual(p.intent, 'add');
assert.deepStrictEqual(p.items[0].candidates, []);
assert.deepStrictEqual(planActions(p), []);

console.log('quick-order.test.js: all assertions passed');
