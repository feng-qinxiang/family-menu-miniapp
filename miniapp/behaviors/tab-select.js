/**
 * TabBar 选中态统一 behavior
 * 使用方式：在 tabBar 页面的 js 中引入并注册：
 *   const tabSelect = require('../../behaviors/tab-select');
 *   Page({ behaviors: [tabSelect(0)], ... })
 * 
 * 注意：小程序 Page 不支持 behaviors，改用 mixin 函数包装 onShow
 */

/**
 * 创建一个 onShow 包装器，自动设置 tabBar 选中态
 * @param {number} index - 当前页面对应的 tab 索引 (0-based)
 * @returns {Function} 可作为 mixin 使用的 onShow 增强函数
 * 
 * 用法：
 *   const { withTabSelect } = require('../../behaviors/tab-select');
 *   Page({
 *     onShow() {
 *       withTabSelect(this, 0);
 *       // ...其他 onShow 逻辑
 *     }
 *   })
 */
function withTabSelect(pageCtx, index) {
  if (typeof pageCtx.getTabBar === 'function') {
    const tabBar = pageCtx.getTabBar();
    if (tabBar) {
      tabBar.setData({ selected: index });
    }
  }
}

module.exports = { withTabSelect };
