// kitchen-logic.test · 厨房总控纯逻辑断言（零依赖，node 直跑）
const assert = require('assert');
const {
  fmtClock, buildKitchenOrder, pickMainStove, stepProgressText, secondsLeft
} = require('../utils/kitchen');

// fmtClock
assert.strictEqual(fmtClock(0), '00:00');
assert.strictEqual(fmtClock(65), '01:05');
assert.strictEqual(fmtClock(600), '10:00');
assert.strictEqual(fmtClock(-3), '00:00');
assert.strictEqual(fmtClock(3599), '59:59');

// buildKitchenOrder：只排未上桌、耗时倒排、不改原数组
const items = [
  { id: 'a', status: 'done', timeCost: 40 },
  { id: 'b', status: 'todo', timeCost: 10 },
  { id: 'c', status: 'cooking', timeCost: 30 },
  { id: 'd', status: 'todo', timeCost: 20 }
];
const order = buildKitchenOrder(items);
assert.deepStrictEqual(order.map((i) => i.id), ['c', 'd', 'b']);
assert.strictEqual(items[0].id, 'a', '原数组顺序不变');
assert.strictEqual(buildKitchenOrder(items.filter((i) => i.status === 'done')).length, 0);

// pickMainStove：跑着的计时优先，其次顺序首位，全做完 null
assert.strictEqual(pickMainStove(items, order).id, 'c');
const withRunning = items.map((i) => ({ ...i, timer: { running: i.id === 'b' } }));
assert.strictEqual(pickMainStove(withRunning, order).id, 'b', '跑着计时的快手菜优先于耗时倒排首位');
assert.strictEqual(pickMainStove(items.filter((i) => i.status === 'done')), null, '全做完无主灶');

// stepProgressText：新 {i,total} / 旧数字 / 空值
assert.strictEqual(stepProgressText({ i: 2, total: 8 }), '第 3/8 步');
assert.strictEqual(stepProgressText(2), '第 3 步');
assert.strictEqual(stepProgressText(0), '');
assert.strictEqual(stepProgressText(null), '');
assert.strictEqual(stepProgressText({ i: 0, total: 5 }), '');

// secondsLeft：无基准=剩余值；有基准=按真实时间差追算
assert.strictEqual(secondsLeft(null, 90), 90);
const base = Date.now() - 30 * 1000;
assert.strictEqual(secondsLeft(base, 90), 60, '30 秒前起跑的 90 秒还剩 60');
assert.ok(secondsLeft(Date.now() - 120 * 1000, 90) <= 0, '超时归零以内');

console.log('kitchen-logic.test: 全部断言通过 ✔');
