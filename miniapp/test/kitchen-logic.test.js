// kitchen-logic.test · 厨房总控纯逻辑断言（零依赖，node 直跑）
const assert = require('assert');
const {
  fmtClock, buildKitchenOrder, pickMainStove, stepProgressText, secondsLeft, restoreTimerSlots
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

// restoreTimerSlots：做菜页每步一个槽，关掉页面再进来要按真实时间差续跑
// （原来 _slots 只挂在页面对象上，同一个"炖着 20 分钟"在厨房页能活、在做菜页重进就归零）
const NOW = 1770000000000;
const mins = (n) => NOW - n * 60 * 1000;
const restored = restoreTimerSlots({
  // 20 分钟的炖锅，15 分钟前起跑 → 应剩 5 分钟、仍在跑
  2: { total: 1200, baseAt: mins(15), baseLeft: 1200, running: true },
  // 暂停中的槽：原样保留剩余，不许自己续跑
  3: { total: 300, baseAt: 0, baseLeft: 120, running: false },
  // 离开期间已经到点 → 落在 00:00 的"到点"态，不能整槽消失
  4: { total: 600, baseAt: mins(11), baseLeft: 600, running: true },
  // 越界 / 无时长 / 脏数据一律丢掉
  9: { total: 60, baseAt: NOW, baseLeft: 60, running: true },
  1: { total: 0, baseAt: NOW, baseLeft: 0, running: false },
  0: null
}, 6, NOW);
assert.strictEqual(Object.keys(restored).length, 3, '越界、零时长、null 三条都不该复活');
assert.strictEqual(restored[2].running, true);
assert.strictEqual(restored[2].baseLeft - Math.ceil((NOW - restored[2].baseAt) / 1000), 300, '15 分钟前的 20 分钟计时剩 5 分钟');
assert.deepStrictEqual([restored[3].running, restored[3].baseLeft], [false, 120], '暂停的槽原样回来');
assert.deepStrictEqual([restored[4].running, restored[4].baseLeft], [false, 0], '到点的槽留在 00:00 而不是消失');
assert.deepStrictEqual(restoreTimerSlots(null, 6, NOW), {}, '没存过 = 空槽集');
assert.deepStrictEqual(restoreTimerSlots('脏值', 6, NOW), {}, '存储里是脏值也不炸');

console.log('kitchen-logic.test: 全部断言通过 ✔');
