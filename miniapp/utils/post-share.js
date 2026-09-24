/**
 * utils/post-share.js · 「晒这道菜」的跨 tab 交接
 *
 * 做菜页（厨房总控 / 菜谱详情）里点到「晒一晒」时，要跳到社区 tab 的发帖层，
 * 并把「晒的是哪道菜」带过去 —— 帖子带 recipeId 之后，别人就能在帖子里点进菜谱、
 * 也能在那道菜的详情页看到这帖（服务端 /api/community/posts?recipeId=N）。
 *
 * 为什么走 storage 而不是 query：社区是 tabBar 页，wx.switchTab **不接受 query 参数**
 * （带了会被忽略）。所以只能用一次性 storage 交接。
 *
 * ⚠ 交接必须"取一次就清"（takePendingRecipe）：社区页 onShow 会反复触发
 * （从帖子详情返回、切 tab 回来都算），不清掉就会反复弹出发帖层。
 */

const PENDING_KEY = 'pending_post_recipe';

/**
 * 带着一道菜去社区发帖。
 * @param {number|string} recipeId 菜谱 id（必填，没有就别跳）
 * @param {string} title 菜名，用于预填标题与发帖层里的「关联」提示
 */
function composePostWithRecipe(recipeId, title) {
  // COMMUNITY 关闭（个人主体）时社区不可达：这里是所有「晒一晒」动线的唯一出口，
  // 挡在这里，任何漏改的入口最坏只是一次失败调用，不会把用户送进发帖层。
  if (!require('./features').COMMUNITY) {
    return Promise.reject(new Error('composePostWithRecipe: community disabled'));
  }
  const id = Number(recipeId);
  if (!id) {
    return Promise.reject(new Error('composePostWithRecipe: recipeId required'));
  }
  try {
    wx.setStorageSync(PENDING_KEY, { recipeId: id, title: String(title || '') });
  } catch (e) {
    // 存不上就别跳：过去也是空手发帖，不如留在原地
    return Promise.reject(e);
  }
  return new Promise((resolve, reject) => {
    wx.switchTab({
      url: '/pages/community/index',
      success: resolve,
      fail(err) {
        // 没跳成就当场把交接单撕掉：留着它，等用户下次自己点开社区 tab 时
        // 会凭空弹出发帖层，还带着一道他早就不记得的菜
        clearPending();
        reject(err);
      }
    });
  });
}

/** 撕掉交接单（取用或跳转失败时都要清）。 */
function clearPending() {
  try {
    wx.removeStorageSync(PENDING_KEY);
  } catch (e) {
    // 清不掉无碍：最坏是下次多弹一次发帖层
  }
}

/** 取出并清空待发帖的菜（只生效一次）。没有交接时返回 null。 */
function takePendingRecipe() {
  let pending = null;
  try {
    pending = wx.getStorageSync(PENDING_KEY);
  } catch (e) {
    pending = null;
  }
  clearPending();
  if (!pending || !pending.recipeId) return null;
  return { recipeId: Number(pending.recipeId), title: String(pending.title || '') };
}

module.exports = { composePostWithRecipe, takePendingRecipe };
