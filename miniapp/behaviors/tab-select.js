/**
 * TabBar 选中态统一 behavior
 * 用法：在 tabBar 页面的 onShow 里调用 `withTabSelect(this)`。
 * （小程序 Page 不支持 behaviors，所以是普通函数而非真正的 behavior，文件名沿用历史。）
 */

/**
 * 在 tabBar 页面 onShow 中调用，同步底栏选中态。
 * 选中项由 custom-tab-bar 按当前路由自动匹配（_syncSelected），
 * 不接受也不需要一个索引参数 —— tab 增删（如社区随开关显隐）时无需全局改数字。
 */
function withTabSelect(pageCtx) {
  if (typeof pageCtx.getTabBar === 'function') {
    const tabBar = pageCtx.getTabBar();
    if (tabBar && typeof tabBar._syncSelected === 'function') {
      tabBar._syncSelected();
    }
  }
}

module.exports = { withTabSelect };
