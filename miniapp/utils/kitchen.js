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

// 存储键：进度按菜谱（跟 cook-mode 共用），计时按菜单项（每道菜各自一个灶）
function progressKey(recipeId) {
  return `cook_progress_${recipeId}`;
}
function timerKey(menuItemId) {
  return `kitchen_timer_${menuItemId}`;
}

module.exports = { fmtClock, buildKitchenOrder, pickMainStove, stepProgressText, secondsLeft, progressKey, timerKey };
