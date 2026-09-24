// utils/kitchen.js · 厨房总控纯逻辑（计时格式化 / 做菜顺序 / 主灶挑选 / 进度与计时存储键）
// 抽成纯函数：方便 node 直跑断言（miniapp/test/kitchen-logic.test.js），页面里只留 setData 与事件。

// 秒 → mm:ss（负数按 0 计）
function fmtClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m < 10 ? '0' + m : m}:${r < 10 ? '0' + r : r}`;
}

// 做菜顺序（轻量统筹）：只排未上桌的菜，按耗时倒排——先开工最耗时的（炖煮类），
// 空档做快手菜，尽量同时上桌（与菜单页 buildCookOrder 同思路的列表版）。
// 返回原数组元素的引用顺序，不修改入参。
function buildKitchenOrder(items) {
  return (items || [])
    .filter((it) => it && it.status !== 'done')
    .slice()
    .sort((a, b) => (Number(b.timeCost) || 0) - (Number(a.timeCost) || 0));
}

// 主灶挑选：有计时在跑的菜最优先（人正守着它），否则按做菜顺序的首位；全做完返回 null
function pickMainStove(items, order) {
  const list = items || [];
  const running = list.find((it) => it && it.timer && it.timer.running && it.status !== 'done');
  if (running) return running;
  const ordered = order || buildKitchenOrder(list);
  return ordered[0] || null;
}

// 步骤进度文案：cook-mode 存 {i,total}（新）或数字 i（旧）；无进度返回 ''
function stepProgressText(raw) {
  if (raw == null || raw === '') return '';
  const idx = typeof raw === 'object' ? Number(raw.i) : Number(raw);
  if (!isFinite(idx) || idx <= 0) return '';
  const total = typeof raw === 'object' ? Number(raw.total) : 0;
  return total > 0 ? `第 ${idx + 1}/${total} 步` : `第 ${idx + 1} 步`;
}

// 剩余秒数：按真实时间差追算（切走页面/后台的时间也算在内）
function secondsLeft(baseAt, baseLeft) {
  if (!baseAt) return Number(baseLeft) || 0;
  const elapsed = (Date.now() - baseAt) / 1000;
  return Math.ceil((Number(baseLeft) || 0) - elapsed);
}

// 做菜模式「每步一个计时槽」的恢复算法。厨房页按菜单项存一份、做菜页按菜谱存一份，
// 四元组形状一致（{total, baseAt, baseLeft, running}），所以"离开期间时间照样走"这件事只写一遍。
// now 由调用方传入（不传用 Date.now()），这样测试能钉住时钟、把跨重进的读数算准。
function restoreTimerSlots(saved, stepCount, now) {
  const out = {};
  if (!saved || typeof saved !== 'object') return out;
  const t = now || Date.now();
  Object.keys(saved).forEach((k) => {
    const i = Number(k);
    const v = saved[k] || {};
    if (!(Number(v.total) > 0) || !Number.isFinite(i) || i < 0 || i >= stepCount) return;
    if (!v.running) {
      out[i] = { total: Number(v.total), baseAt: 0, baseLeft: Number(v.baseLeft) || 0, running: false };
      return;
    }
    const left = Math.max(0, Math.ceil((Number(v.baseLeft) || 0) - (t - (Number(v.baseAt) || t)) / 1000));
    // 离开期间跑到点了：留在 00:00 的「到点」状态而不是删掉——
    // 用户回来要知道那 20 分钟已经过了，而不是「我刚才设的计时呢？」
    out[i] = left > 0
      ? { total: Number(v.total), baseAt: Number(v.baseAt), baseLeft: Number(v.baseLeft), running: true }
      : { total: Number(v.total), baseAt: 0, baseLeft: 0, running: false };
  });
  return out;
}

/**
 * 买菜清单为空的原因：''（有东西要买/已买齐）| 'no-menu' | 'no-ingredients'。
 *
 * 为什么值得单独一个函数：清单原来只有一句空态文案「今晚的菜都在库存里」，
 * 而那是**编的**——`TodayService#rebuildShoppingList` 只把菜单里各道菜的用料聚合起来，
 * 全程不看冰箱库存，所以"清单为空"永远不可能是"菜都在库存里"。
 * 两种原因对应两条完全不同的出路（去点菜 vs 去补用料），糊成一句就把人堵在死路上。
 *
 * 'no-ingredients' 是防御分支，不是常见路径：菜谱编辑器与 `CreateRecipeRequest.ingredients`
 * 的 `@NotEmpty` 都拦住了"零用料菜谱"，所以正常动线走不到它。留着是因为一旦走到
 * （老数据、直连 API、将来放宽校验），原来的文案会把"没录用料"说成"都买齐了"。
 */
function shoppingEmptyReason(menuItemCount, totalCount) {
  if ((Number(totalCount) || 0) > 0) return '';
  return (Number(menuItemCount) || 0) > 0 ? 'no-ingredients' : 'no-menu';
}

// 存储键：进度按菜谱（跟 cook-mode 共用），计时按菜单项（每道菜各自一个灶）
function progressKey(recipeId) {
  return `cook_progress_${recipeId}`;
}
function timerKey(menuItemId) {
  return `kitchen_timer_${menuItemId}`;
}

module.exports = { fmtClock, buildKitchenOrder, pickMainStove, stepProgressText, secondsLeft, restoreTimerSlots, progressKey, timerKey, shoppingEmptyReason };
