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

// 合并窗口：16ms ≈ 一帧。慢滚时一次回调只有一两项，跨线程开销本来就不大；
// 快速滑过 20 条时原来会连打 20 次 setData，合并后集中在同一次里，只差一帧观感。
const BATCH_MS = 16;

function withScrollReveal(pageCtx, opts) {
  if (!pageCtx || typeof pageCtx.createIntersectionObserver !== 'function') return;
  dispose(pageCtx);
  const conf = Object.assign({}, DEFAULTS, opts);

  // revealOn 与列表同帧开启，避免「先闪现再潜藏」的抖动
  if (!pageCtx.data.revealOn) pageCtx.setData({ revealOn: true, reveal: {} });

  // 每轮 attach 各自的「代」：observer 与本轮待合并队列绑定，
  // 旧一轮若还有回调在飞，看不懂新一轮的队列，也不会把数据写进去。
  const gen = (pageCtx._rvGen = (pageCtx._rvGen || 0) + 1);
  const pending = [];      // 本窗口内待写进 reveal 的下标
  let timer = null;

  // 一帧内攒下的下标一次 setData：路径用 'reveal.x' 而不是整体替换 reveal，
  // 否则会把已经浮现的项一起清掉（整块替换等于让全列表重新潜藏）。
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!pending.length) return;
    if (pageCtx._rvGen !== gen) { pending.length = 0; return; }   // 已换轮/已卸载，丢弃
    const patch = {};
    // splice 边走边清空，避免 flush 之间残留已处理下标
    while (pending.length) patch['reveal.' + pending.pop()] = true;
    try { pageCtx.setData(patch); }
    catch (e) { /* 页面已销毁，忽略 */ }
  };

  // attach 前先清掉上一轮可能没落地的定时器，否则它会在旧代上下文里补一次 setData
  if (pageCtx._rvTimer) { clearTimeout(pageCtx._rvTimer); pageCtx._rvTimer = null; }

  // setData 回调 ≠ 渲染完成（wx:if 门控的节点可能还没挂载），
  // 下一帧再 observe，否则首屏节点会漏掉初始相交事件
  const attach = () => {
    if (pageCtx._rvGen !== gen) return;   // dispose 已跑过，别再挂 observer
    const io = pageCtx.createIntersectionObserver({ observeAll: true, thresholds: [conf.threshold] });
    if (conf.scope) io.relativeTo(conf.scope, { bottom: conf.bottom });
    else io.relativeToViewport({ bottom: conf.bottom });

    const seen = {};
    io.observe(conf.item, (res) => {
      const idx = res.dataset && res.dataset.rv;
      if (idx === undefined) return;
      if (res.intersectionRatio <= 0) return;           // 只处理进入视口
      if (seen[idx]) return;                            // 同一轮内已入过队，不重复攒
      seen[idx] = true;
      pending.push(idx);                                // 先攒着，flush 时一并写
      if (!timer) timer = setTimeout(() => { timer = null; flush(); }, BATCH_MS);
    });

    pageCtx._rvObserver = io;
    pageCtx._rvTimer = timer;                           // 计时器留给 dispose 清
  };
  if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') wx.nextTick(attach);
  else attach();
}

function dispose(pageCtx) {
  if (!pageCtx) return;
  // 先停表再摘 observer：定时器不清会在页面卸载后仍 setData（开发者工具里报 warning）
  if (pageCtx._rvTimer) { clearTimeout(pageCtx._rvTimer); pageCtx._rvTimer = null; }
  pageCtx._rvGen = (pageCtx._rvGen || 0) + 1;           // 作废在飞的回调与待 flush 的批次
  if (pageCtx._rvObserver) {
    try { pageCtx._rvObserver.disconnect(); } catch (e) { /* 页面已在卸载，忽略 */ }
    pageCtx._rvObserver = null;
  }
}

module.exports = { withScrollReveal, dispose };
