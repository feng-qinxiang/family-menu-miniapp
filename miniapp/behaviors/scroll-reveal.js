/**
 * 滚动浮现 mixin（计划书降级项的落地版）
 *
 * 原理：IntersectionObserver observeAll 监听列表项，进入视口后把该项下标
 * 写进 page.data.reveal，WXML 侧据此把 rv-hold（潜藏态）换成 g-fade-up（浮现）。
 *
 * 用法（长列表页）：
 *   const { withScrollReveal } = require('../../behaviors/scroll-reveal');
 *   // 列表数据渲染完成后：
 *   withScrollReveal(this, { item: '.recipe-card', scope: '.rx-grid' });
 *   // onUnload（可选 onHide）：withScrollReveal.dispose(this);
 *
 * wxml 列表项：
 *   <recipe-card class="{{revealOn ? (reveal[index] ? 'g-fade-up' : 'rv-hold') : ''}}"
 *                data-rv="{{index}}" ... />
 *
 * 防御：revealOn 未开启时项保持普通渲染——脚本挂了内容也不会消失；
 * observer 在列表渲染完成后才创建（规避计划书风险 7），dispose 由页面 onUnload 调。
 */
const DEFAULTS = { item: '.rv-item', scope: null, threshold: 0.12, bottom: 30 };

function withScrollReveal(pageCtx, opts) {
  if (!pageCtx || typeof pageCtx.createIntersectionObserver !== 'function') return;
  dispose(pageCtx);
  const conf = Object.assign({}, DEFAULTS, opts);

  // revealOn 与列表同帧开启，避免「先闪现再潜藏」的抖动
  if (!pageCtx.data.revealOn) pageCtx.setData({ revealOn: true, reveal: {} });

  // setData 回调 ≠ 渲染完成（wx:if 门控的节点可能还没挂载），
  // 下一帧再 observe，否则首屏节点会漏掉初始相交事件
  const attach = () => {
    const io = pageCtx.createIntersectionObserver({ observeAll: true, thresholds: [conf.threshold] });
    if (conf.scope) io.relativeTo(conf.scope, { bottom: conf.bottom });
    else io.relativeToViewport({ bottom: conf.bottom });

    const seen = {};
    io.observe(conf.item, (res) => {
      const idx = res.dataset && res.dataset.rv;
      if (idx === undefined) return;
      if (res.intersectionRatio <= 0) return;           // 只处理进入视口
      if (seen[idx]) return;
      seen[idx] = true;
      pageCtx.setData({ ['reveal.' + idx]: true });     // 逐项即进即现
    });

    pageCtx._rvObserver = io;
  };
  if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') wx.nextTick(attach);
  else attach();
}

function dispose(pageCtx) {
  if (pageCtx && pageCtx._rvObserver) {
    try { pageCtx._rvObserver.disconnect(); } catch (e) { /* 页面已在卸载，忽略 */ }
    pageCtx._rvObserver = null;
  }
}

module.exports = { withScrollReveal, dispose };
