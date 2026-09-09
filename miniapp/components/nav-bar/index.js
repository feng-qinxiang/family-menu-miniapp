// nav-bar · 二级页顶部导航组件
Component({
  options: {
    multipleSlots: false,
    addGlobalClass: true, // 允许复用 app.wxss 全局工具类（.tap-scale/.ellipsis）
  },

  properties: {
    // 居中标题
    title: {
      type: String,
      value: '',
    },
    // 是否显示返回按钮
    showBack: {
      type: Boolean,
      value: true,
    },
    // 状态栏高度（px），由页面传入；缺省时组件自取系统值
    statusBarHeight: {
      type: Number,
      value: 0,
    },
  },

  data: {
    capsulePad: 96,
    innerHeight: 44
  },

  lifetimes: {
    attached() {
      const patch = {};
      let sbh = this.data.statusBarHeight || 0;
      try {
        const sys = (typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()) || {};
        if (!sbh) sbh = sys.statusBarHeight || 0;
        const mb = wx.getMenuButtonBoundingClientRect();
        if (mb && mb.height) {
          const gap = Math.max(0, mb.top - sbh);
          patch.innerHeight = mb.height + gap * 2;
          if (sys.windowWidth && mb.left) {
            patch.capsulePad = sys.windowWidth - mb.left + 8;
          }
        }
      } catch (e) {}
      if (sbh) patch.statusBarHeight = sbh;
      if (Object.keys(patch).length) this.setData(patch);
    },
  },

  methods: {
    onBack() {
      // 优先返回上一页；无上一页则回退到首页 tab，避免栈空白屏
      const pages = getCurrentPages();
      if (pages && pages.length > 1) {
        wx.navigateBack({ delta: 1 });
      } else {
        wx.switchTab({
          url: '/pages/home/index',
          fail() {
            wx.navigateBack({ delta: 1 });
          },
        });
      }
      // 透传事件，便于页面自定义拦截
      this.triggerEvent('back');
    },
  },
});
