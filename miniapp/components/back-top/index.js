// 通用回顶悬浮键：只负责外观与点击事件，显隐与实际滚动由宿主页面控制
// （scroll-view 页面用 scroll-top 绑定，page 滚动页面用 wx.pageScrollTo）
Component({
  properties: {
    show: { type: Boolean, value: false },
    // 不同页面底部悬浮物（tabbar/FAB/餐盘条）高度不同，位置可覆盖
    bottom: { type: String, value: '240rpx' },
    right: { type: String, value: '24rpx' }
  },
  methods: {
    onTap() {
      this.triggerEvent('totop');
    }
  }
});
