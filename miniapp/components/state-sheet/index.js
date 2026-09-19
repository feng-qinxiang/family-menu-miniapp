// components/state-sheet · 底部弹层（mask + 圆角 sheet + 滚动穿透锁）
Component({
  options: {
    multipleSlots: true,
    addGlobalClass: true
  },
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    // tab 页专用：自定义 tabBar 是独立图层，页面里 z-index 再高也盖不住它，
    // 而 wx.hideTabBar() 在 custom tabBar 下直接 fail（实测 errMsg: hideTabBar:fail custom Tabbar），
    // 所以弹层只能自己抬到 tabBar 上沿——否则 80vh 的发帖表单最下面约 100px
    // 被 tabBar 吃掉，「发布」看不见也点不到。
    lift: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: ''
    },
    // 是否显示顶部拖拽条
    showBar: {
      type: Boolean,
      value: true
    }
  },
  methods: {
    onClose() {
      this.triggerEvent('close');
    },
    // catchtouchmove 空实现：阻止背景滚动穿透
    noop() {}
  }
});