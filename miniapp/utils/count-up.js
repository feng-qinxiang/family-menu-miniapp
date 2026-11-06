/**
 * 数字 count-up（600ms cubic-out）—— UI设计规范「动效规则」要求，此前仅存在于计划书未落地
 * 用法：animateNumber(this, 'totalTime', 52)               → setData({ totalTime: '0'..'52' })
 *       animateNumber(this, 'score', 4.8, { fmt: v => v.toFixed(1) })
 * 页面 onUnload / 数据重载前调 stopNumberAnim(this) 清定时器（防 setData 打到已卸载页面）。
 * 注意：动画会把目标键写成字符串；模板里的 `{{key || '--'}}`、真值判断不受影响。
 * 合帧：每个页面实例只开一个定时器（page._numAnim = { timer, items }），
 * 每帧把所有进行中的键拼成一次 setData——菜单页三数字并行从 ~54 次降到 ~18 次。
 */
const FPS = 30;
const DURATION = 600;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// 终值：0 必须落成数字 0——写成 '0' 会骗过 `!data.key` 空态守卫
function finalValue(it) {
  return it.to === 0 ? 0 : it.fmt(it.to);
}

function clearTimer(st) {
  if (st.timer) {
    clearInterval(st.timer);
    st.timer = null;
  }
}

function stopNumberAnim(page, key) {
  const st = page._numAnim;
  if (!st) return;
  if (key) {
    delete st.items[key];
    if (!Object.keys(st.items).length) clearTimer(st);
  } else {
    clearTimer(st);
    st.items = {};
  }
}

function tick(page) {
  const st = page._numAnim;
  if (!st) return;
  const now = Date.now();
  const patch = {};
  let any = false;
  Object.keys(st.items).forEach((k) => {
    const it = st.items[k];
    const p = Math.min(1, (now - it.start) / it.dur);
    any = true;
    if (p >= 1) {
      patch[k] = finalValue(it);
      delete st.items[k];
    } else {
      patch[k] = it.fmt(it.from + (it.to - it.from) * easeOutCubic(p));
    }
  });
  // 先改状态再 setData：回调里重入 animateNumber 时看到的是本帧之后的状态
  if (!Object.keys(st.items).length) clearTimer(st);
  if (any) page.setData(patch);
}

function animateNumber(page, key, to, opts) {
  opts = opts || {};
  stopNumberAnim(page, key);
  const toNum = Number(to) || 0;
  const from = Number(opts.from) || 0;
  const fmt = opts.fmt || ((v) => String(Math.round(v)));
  // 0 值/等值直接落定，不起动画
  if (toNum === from) {
    page.setData({ [key]: toNum === 0 ? 0 : fmt(toNum) });
    return;
  }
  const st = page._numAnim || (page._numAnim = { timer: null, items: {} });
  st.items[key] = { from, to: toNum, fmt, start: Date.now(), dur: opts.dur || DURATION };
  if (!st.timer) st.timer = setInterval(() => tick(page), Math.round(1000 / FPS));
}

module.exports = { animateNumber, stopNumberAnim };
