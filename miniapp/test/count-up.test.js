/**
 * count-up 合帧检查：每页一个定时器，每帧所有进行中的数字合成一次 setData。
 * 替换全局 setInterval / clearInterval / Date.now，手动推帧，不依赖真实时间。
 */
const assert = require('assert');

let now = 0;
let timers = {};
let nextId = 1;
let cleared = 0;
global.Date.now = () => now;
global.setInterval = (fn, ms) => {
  const id = nextId++;
  timers[id] = { fn, ms };
  return id;
};
global.clearInterval = (id) => {
  if (timers[id]) {
    delete timers[id];
    cleared++;
  }
};

const { animateNumber, stopNumberAnim } = require('../utils/count-up');

function fakePage() {
  return {
    data: {},
    calls: [],
    setData(patch) {
      this.calls.push(patch);
      Object.assign(this.data, patch);
    },
  };
}

function liveTimers() {
  return Object.keys(timers).length;
}

// 推进 ms 毫秒，按每个定时器的间隔触发
function advance(ms) {
  const end = now + ms;
  while (now < end) {
    const ids = Object.keys(timers);
    if (!ids.length) {
      now = end;
      break;
    }
    const step = timers[ids[0]].ms;
    now = Math.min(end, now + step);
    Object.keys(timers).forEach((id) => timers[id] && timers[id].fn());
  }
}

function reset() {
  now = 0;
  timers = {};
  cleared = 0;
}

// 1. 三键并行：每帧只 1 次 setData，600ms 内约 18 次，最终值正确
reset();
{
  const p = fakePage();
  animateNumber(p, 'totalCount', 5);
  animateNumber(p, 'totalTime', 52);
  animateNumber(p, 'totalServings', 4);
  assert.strictEqual(liveTimers(), 1, '三个键应共用一个定时器');
  advance(700);
  assert.ok(p.calls.length >= 17 && p.calls.length <= 20, `600ms 内 setData 应约 18 次，实际 ${p.calls.length}`);
  p.calls.forEach((c) => assert.ok(Object.keys(c).length >= 1));
  // 动画期间每帧都同时带三个键（同时开始同时结束）
  p.calls.forEach((c) => assert.deepStrictEqual(Object.keys(c).sort(), ['totalCount', 'totalServings', 'totalTime']));
  assert.strictEqual(p.data.totalCount, '5');
  assert.strictEqual(p.data.totalTime, '52');
  assert.strictEqual(p.data.totalServings, '4');
  assert.strictEqual(liveTimers(), 0, '全部结束后定时器应自动清掉');
  assert.strictEqual(p._numAnim.timer, null);
}

// 2. 终值 0 落成数字 0（从非 0 动画到 0）
reset();
{
  const p = fakePage();
  animateNumber(p, 'n', 0, { from: 8 });
  advance(700);
  assert.strictEqual(p.data.n, 0, '终值 0 必须是数字 0');
  assert.strictEqual(liveTimers(), 0);
}

// 3. 等值直接落定，不起定时器（含 0 → 0）
reset();
{
  const p = fakePage();
  animateNumber(p, 'a', 0);
  assert.strictEqual(p.data.a, 0);
  animateNumber(p, 'b', 7, { from: 7 });
  assert.strictEqual(p.data.b, '7');
  assert.strictEqual(p.calls.length, 2);
  assert.strictEqual(liveTimers(), 0, '等值不应起定时器');
}

// 4. fmt、from、dur 生效
reset();
{
  const p = fakePage();
  animateNumber(p, 'score', 4.8, { from: 2, fmt: (v) => v.toFixed(1), dur: 300 });
  advance(33);
  const first = Number(p.data.score);
  assert.ok(first > 2 && first < 4.8, `首帧应从 from 起跳，实际 ${p.data.score}`);
  assert.ok(/^\d\.\d$/.test(p.data.score), 'fmt 应生效');
  advance(300);
  assert.strictEqual(p.data.score, '4.8');
  assert.ok(p.calls.length <= 11, `dur=300 应约 10 帧结束，实际 ${p.calls.length}`);
  assert.strictEqual(liveTimers(), 0);
}

// 5. stopNumberAnim(page, key) 只停一个键，其余继续
reset();
{
  const p = fakePage();
  animateNumber(p, 'x', 100);
  animateNumber(p, 'y', 50);
  advance(99);
  stopNumberAnim(p, 'x');
  const xAtStop = p.data.x;
  const before = p.calls.length;
  assert.strictEqual(liveTimers(), 1, '还有键在跑时定时器不能清');
  advance(700);
  assert.ok(p.calls.length > before, '其余键应继续');
  p.calls.slice(before).forEach((c) => assert.ok(!('x' in c), '被停的键不应再写'));
  assert.strictEqual(p.data.x, xAtStop);
  assert.strictEqual(p.data.y, '50');
  assert.strictEqual(liveTimers(), 0);
}

// 6. stopNumberAnim(page) 全停：清定时器、清空 items，不 setData
reset();
{
  const p = fakePage();
  animateNumber(p, 'x', 100);
  animateNumber(p, 'y', 50);
  advance(66);
  const before = p.calls.length;
  stopNumberAnim(p);
  assert.strictEqual(cleared, 1, 'clearInterval 应被调用');
  assert.strictEqual(liveTimers(), 0);
  assert.strictEqual(p._numAnim.timer, null);
  assert.deepStrictEqual(p._numAnim.items, {});
  assert.strictEqual(p.calls.length, before, '停止不应 setData');
  advance(700);
  assert.strictEqual(p.calls.length, before);
  // 未起过动画的页面调 stop 不报错
  stopNumberAnim(fakePage());
  stopNumberAnim(fakePage(), 'k');
}

// 7. 同一个键重复 animate 以新目标重来
reset();
{
  const p = fakePage();
  animateNumber(p, 'k', 100);
  advance(300);
  const mid = Number(p.data.k);
  assert.ok(mid > 0 && mid < 100);
  animateNumber(p, 'k', 10, { from: mid });
  assert.strictEqual(liveTimers(), 1, '重启不应多开定时器');
  advance(33);
  assert.ok(Number(p.data.k) < mid, '应朝新目标走');
  advance(700);
  assert.strictEqual(p.data.k, '10');
  assert.strictEqual(liveTimers(), 0);
}

// 8. 不同页面互不影响
reset();
{
  const a = fakePage();
  const b = fakePage();
  animateNumber(a, 'n', 5);
  animateNumber(b, 'n', 9);
  assert.strictEqual(liveTimers(), 2, '每页各自一个定时器');
  stopNumberAnim(a);
  advance(700);
  assert.strictEqual(b.data.n, '9');
  assert.ok(a.data.n === undefined || a.data.n !== '5');
}

console.log('count-up 合帧检查通过');
