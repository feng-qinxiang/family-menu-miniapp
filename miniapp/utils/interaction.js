/**
 * utils/interaction.js · 点击交互的统一约定
 *
 * 为什么要有这个文件：
 * 全站曾经每个页面各写各的防重与 loading——有的有守卫没 loading，有的连守卫都没有
 * （首页/菜谱页"加入菜单"、社区点赞与举报、收藏切换都出现过连点重复提交）。
 * 这里把「防重 + 立即反馈 + 成功/失败提示 + 释放」收敛成一处，页面只声明意图。
 *
 * 用法：
 *   const { runGuarded } = require('../../utils/interaction');
 *   onAdd() {
 *     runGuarded(this, 'add', () => api.addTodayMenuRecipe(id, slot), {
 *       loading: '加入中',
 *       success: '已加入今日菜单',
 *       fail: '加入失败，请重试'
 *     });
 *   }
 *
 * 约定：
 *  - key 用动作语义命名（'add' / 'like' / 'submit' / 'logout'），同一 key 在途时重复点击被忽略。
 *  - loading 传字符串即自动 showLoading/hideLoading；不需要阻塞的轻操作可不传。
 *  - success / fail 支持字符串或函数（函数入参为结果 / 错误），返回空串则不提示。
 *  - 失败默认提示 err.message（utils/api.js 已把错误统一成中文），不吞异常。
 */

function acquire(ctx, key) {
  if (!ctx) return false;
  if (!ctx.__busy) ctx.__busy = {};
  if (ctx.__busy[key]) return false;
  ctx.__busy[key] = true;
  return true;
}

function release(ctx, key) {
  if (ctx && ctx.__busy && ctx.__busy[key]) {
    ctx.__busy[key] = false;
  }
}

function resolveText(value, arg, fallback) {
  if (typeof value === 'function') {
    const text = value(arg);
    return text == null ? '' : String(text);
  }
  if (value == null) return fallback == null ? '' : String(fallback);
  return String(value);
}

/**
 * 带防重与反馈执行一次异步操作。
 *
 * 返回值契约：操作成功返回其结果；**被防重拦住（同一 key 已在途）或操作失败，都返回 undefined**。
 * 失败信息已由本函数弹给用户，异常不再向上抛——所以调用方不需要 try/catch，
 * 但也不能把 undefined 当作"成功但无返回值"：判 `ok === undefined` 就是"这次什么都没做"。
 * 页面菜单页 `pages/menu/index.js` 的 `if (ok === undefined) return;` 依赖这条契约。
 * （不要改成 throw：四处裸 await 在 wx.showModal 回调里、一处判 undefined 的调用方，
 * 都会变成未处理拒绝或静默失效，见本文件 T1(a) 的取舍记录。）
 *
 * @returns {Promise<any>} 实际操作结果；被防重忽略或失败时返回 undefined
 */
async function runGuarded(ctx, key, task, opts) {
  const options = opts || {};
  if (!acquire(ctx, key)) return undefined;
  if (typeof options.onBusyChange === 'function') options.onBusyChange(true);
  const loadingTitle = options.loading;
  if (loadingTitle) wx.showLoading({ title: loadingTitle, mask: true });
  try {
    const result = await task();
    if (loadingTitle) wx.hideLoading();
    const text = resolveText(options.success, result, '');
    // 全站 toast 都是纯文案提示，统一 icon:'none'。
    // 带 icon 的 toast 文案超过 7 个汉字会被截断（实测「已记录 · 冰箱扣了 1 项」只显示出「已记录 · 冰箱」），
    // icon:'none' 既不截断也不吃图标资源，与设计一致。
    if (text) wx.showToast({ title: text, icon: 'none' });
    return result;
  } catch (err) {
    if (loadingTitle) wx.hideLoading();
    const text = resolveText(options.fail, err, (err && err.message) || '操作失败，请重试');
    if (text) wx.showToast({ title: text, icon: 'none' });
    return undefined;
  } finally {
    release(ctx, key);
    if (typeof options.onBusyChange === 'function') options.onBusyChange(false);
  }
}

/** 只做防重、不接管反馈的场景（例如乐观更新自己控制 UI）。 */
function guard(ctx, key) {
  return acquire(ctx, key);
}

module.exports = {
  runGuarded,
  guard,
  release
};
