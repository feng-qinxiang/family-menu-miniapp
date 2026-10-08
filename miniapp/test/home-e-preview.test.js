// node miniapp/test/home-e-preview.test.js · 首页预览 E：推荐几排怎么排、点菜后下锅序号怎么标。真实 Page 方法，无网络。
const assert = require('assert');
let definition;
global.Page = (page) => { definition = page; };
require('../pkg-preview/home-e/index');
delete global.Page;
global.wx = { vibrateShort() {} };

const R = (id, title, timeCost, extra) => Object.assign({ id, title, timeCost, level: '', cookCount: 0, tags: [], summary: '', rating: 4, dishImg: '' }, extra);
const page = () => Object.assign({}, definition, {
  data: structuredClone(definition.data),
  _me: '我',
  _members: [],
  setData(patch) { Object.assign(this.data, patch); }
});
const ids = (shelf) => shelf.items.map((r) => r.id);

// 顺序：新手 → 常做 → 当季；当季不重复前两排出现过的菜，按命中的时令词个数排
{
  const recipes = [
    R(1, '番茄炒蛋', 10, { cookCount: 5 }),
    R(2, '紫菜蛋花汤', 8),
    R(3, '红烧肉', 60, { tags: ['浓香'] }),
    R(4, '糖醋排骨', 40, { rating: 4.9 }),
    R(5, '可乐鸡翅', 30, { cookCount: 2 }),
    R(6, '排骨莲藕汤', 90, { cookCount: 1 }),
    R(7, '香菇滑鸡', 28)
  ];
  const shelves = page().buildShelves(recipes, 10);
  assert.deepStrictEqual(shelves.map((s) => s.key), ['easy', 'often', 'season']);
  assert.deepStrictEqual(ids(shelves[0]), [2, 1]);
  assert.deepStrictEqual(ids(shelves[1]), [1, 5, 6]);
  assert.deepStrictEqual(shelves[1].items.map((r) => r.meta), ['做过5次 · 10分钟', '做过2次 · 30分钟', '做过1次 · 90分钟']);
  assert.strictEqual(shelves[2].title, '秋天吃这些');
  assert.deepStrictEqual(ids(shelves[2]), [3, 4]);
}

// 每个月都有季节；春天不因口味标签「鲜香」把麻婆豆腐算进来；没菜的排不出现
{
  const p = page();
  const title = (month, recipe) => (p.buildShelves([recipe], month).find((s) => s.key === 'season') || {}).title;
  assert.strictEqual(title(4, R(1, '油焖春笋', 25)), '春天吃这些');
  assert.strictEqual(title(7, R(1, '凉拌黄瓜', 25)), '夏天吃这些');
  assert.strictEqual(title(1, R(1, '萝卜炖牛腩', 90)), '冬天吃这些');
  assert.strictEqual(title(12, R(1, '萝卜炖牛腩', 90)), '冬天吃这些');
  assert.strictEqual(title(4, R(1, '麻婆豆腐', 25, { tags: ['鲜香'] })), undefined);
  for (let m = 1; m <= 12; m += 1) assert.ok(Array.isArray(p.buildShelves([], m)));
  assert.deepStrictEqual(p.buildShelves([], 10), []);
}

// 点菜：任意一排的「+」都能点进单子，同一道菜在每一排都打勾；再点取消
{
  const p = page();
  p._shelves = p.buildShelves([R(1, '番茄炒蛋', 10, { cookCount: 5 }), R(3, '红烧肉', 60, { tags: ['浓香'] })], 10);
  p._menu = [];
  p.onPick({ currentTarget: { dataset: { id: 1 } } });
  assert.deepStrictEqual(p.data.shelves.map((s) => s.items.find((r) => r.id === 1)).map((r) => r && r.picked), [true, true, undefined]);
  p.onPick({ currentTarget: { dataset: { id: 3 } } });
  assert.deepStrictEqual(p.data.orders.map((o) => [o.title, o.seq]), [['红烧肉', 1], ['番茄炒蛋', 2]]);
  assert.strictEqual(p.data.seqOn, true);
  p.onPick({ currentTarget: { dataset: { id: 3 } } });
  assert.deepStrictEqual(p.data.orders.map((o) => o.title), ['番茄炒蛋']);
  assert.strictEqual(p.data.seqOn, false);
}

// 下锅序号：慢的先、没填用时排在有序号的后面、做好了沉底；用时全一样不标序号
{
  const p = page();
  const order = (key, timeCost, status) => p.toOrder({ key, recipeId: key, mealType: 'dinner', title: key, who: '我', timeCost, status: status || 'todo' });
  p._shelves = [];
  p._menu = [order('快', 8), order('做好', 30, 'done'), order('没填', 0), order('慢', 60)];
  p.applySlot();
  assert.deepStrictEqual(p.data.orders.map((o) => [o.title, o.seq]), [['慢', 1], ['快', 2], ['没填', 0], ['做好', 0]]);
  p._menu = [order('甲', 8), order('乙', 8)];
  p.applySlot();
  assert.strictEqual(p.data.seqOn, false);
  assert.deepStrictEqual(p.data.orders.map((o) => o.seq), [0, 0]);
}

// 标题下一行只说家人进度；存根上的时长：做好了的不算，一道都没填用时就不报
{
  const p = page();
  const order = (key, timeCost, who, status) => p.toOrder({ key, recipeId: key, mealType: 'dinner', title: key, who, timeCost, status: status || 'todo' });
  p._shelves = [];
  p._members = [{ key: '1', name: '我', initial: '我', tone: 'tone-0' }, { key: '2', name: '妈妈', initial: '妈', tone: 'tone-1' }];
  p._menu = [order('慢', 60, '我'), order('快', 8, '我'), order('做好', 90, '我', 'done')];
  p.applySlot();
  assert.strictEqual(p.data.headNote, '还差 1 人没点');
  assert.strictEqual(p.data.totalMin, 65);
  p._menu.push(order('汤', 0, '妈妈'));
  p.applySlot();
  assert.strictEqual(p.data.headNote, '全家都点好了');
  p._menu = [order('甲', 0, '我'), order('乙', 0, '我')];
  p.applySlot();
  assert.strictEqual(p.data.totalMin, 0);
  p._members = [];
  p.applySlot();
  assert.strictEqual(p.data.headNote, '家里就你一个，点 + 拉家人进来');
  // 加载中餐次分段就已经排好三段
  assert.deepStrictEqual(definition.data.slots.map((s) => s.label), ['早饭', '午饭', '晚饭']);
}

console.log('home-e-preview.test ok');
