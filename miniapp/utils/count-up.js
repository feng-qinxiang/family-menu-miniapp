/**
 * 数字 count-up（600ms cubic-out）—— UI设计规范「动效规则」要求，此前仅存在于计划书未落地
 * 用法：animateNumber(this, 'totalTime', 52)               → setData({ totalTime: '0'..'52' })
 *       animateNumber(this, 'score', 4.8, { fmt: v => v.toFixed(1) })
 * 页面 onUnload / 数据重载前调 stopNumberAnim(this) 清定时器（防 setData 打到已卸载页面）。
 * 注意：动画会把目标键写成字符串；模板里的 `{{key || '--'}}`、真值判断不受影响。
 */
const FPS = 30;
const DURATION = 600;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function stopNumberAnim(page, key) {
  if (!page._numAnims) return;
  if (key) {
    clearInterval(page._numAnims[key]);
    delete page._numAnims[key];
  } else {
    Object.keys(page._numAnims).forEach((k) => clearInterval(page._numAnims[k]));
    page._numAnims = {};
  }
}

function animateNumber(page, key, to, opts) {
  opts = opts || {};
  stopNumberAnim(page, key);
  const toNum = Number(to) || 0;
  const from = Number(opts.from) || 0;
  const fmt = opts.fmt || ((v) => String(Math.round(v)));
  // 0 值/等值直接落定，不起动画；0 必须落成数字 0——写成 '0' 会骗过 `!data.key` 空态守卫
  if (toNum === from) {
    page.setData({ [key]: toNum === 0 ? 0 : fmt(toNum) });
    return;
  }
  const start = Date.now();
  const dur = opts.dur || DURATION;
  page._numAnims = page._numAnims || {};
  page._numAnims[key] = setInterval(() => {
    const p = Math.min(1, (Date.now() - start) / dur);
    if (p >= 1) {
      page.setData({ [key]: toNum === 0 ? 0 : fmt(toNum) });
      stopNumberAnim(page, key);
    } else {
      page.setData({ [key]: fmt(from + (toNum - from) * easeOutCubic(p)) });
    }
  }, Math.round(1000 / FPS));
}

module.exports = { animateNumber, stopNumberAnim };
