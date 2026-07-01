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

  lifetimes: {
    attached() {
      // 若页面未传 statusBarHeight，则从系统信息读取，保证刘海屏适配
      if (!this.data.statusBarHeight) {
        let sbh = 0;
        try {
          if (typeof wx.getWindowInfo === 'function') {
            sbh = wx.getWindowInfo().statusBarHeight || 0;
          } else if (typeof wx.getSystemInfoSync === 'function') {
            sbh = wx.getSystemInfoSync().statusBarHeight || 0;
          }
        } catch (e) {
          sbh = 0;
        }
        this.setData({ statusBarHeight: sbh });
      }
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
