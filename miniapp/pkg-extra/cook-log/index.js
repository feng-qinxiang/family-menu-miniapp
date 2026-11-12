// 兼容旧分享和做菜完成链接；tab 页不能携带 query。
Page({
  data: { fontScale: 'normal' },
  onLoad(options) {
    if (options && options.recipeId) {
      getApp().globalData.pendingCookLogRecipeId = String(options.recipeId);
    }
    this.openLog();
  },
  openLog() {
    wx.switchTab({
      url: '/pages/cook-log/index',
      fail: () => wx.showToast({ title: '记录页没打开，请重试', icon: 'none' })
    });
  }
});
