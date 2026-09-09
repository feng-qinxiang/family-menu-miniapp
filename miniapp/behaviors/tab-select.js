/**
 * TabBar 选中态统一 behavior
 * 使用方式：在 tabBar 页面的 js 中引入并注册：
 *   const tabSelect = require('../../behaviors/tab-select');
 *   Page({ behaviors: [tabSelect(0)], ... })
 * 
 * 注意：小程序 Page 不支持 behaviors，改用 mixin 函数包装 onShow
 */

/**
 * 在 tabBar 页面 onShow 中调用，同步底栏选中态。
 * 选中项由 custom-tab-bar 按当前路由自动匹配（_syncSelected），
 * 不再依赖固定索引 —— tab 增删（如社区随开关显隐）时无需全局改数字。
 * 旧调用形如 withTabSelect(this, 2) 的 index 参数已忽略，保留兼容。
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
