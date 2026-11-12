// nav-bar · 二级页顶部导航组件
const { LEAVE_TEXT } = require('../../utils/interaction');

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
    // 表单页有没保存的修改时传 true：点返回先弹确认（配合 utils/interaction 的 setLeaveGuard）
    leaveConfirm: {
      type: Boolean,
      value: false,
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
      // 防连点：返回动画期间第二次点击会再退一层（多退到上上页）
      if (this._backing) return;
      this._backing = true;
      if (!this.data.leaveConfirm) {
        this.doBack();
        return;
      }
      // 表单有没保存的修改：先确认。确认框开着时锁一直拿着，取消才放
      wx.showModal({
        title: LEAVE_TEXT,
        confirmText: '放弃',
        cancelText: '取消',
        success: (res) => {
          if (!res.confirm) { this._backing = false; return; }
          // 已经确认过一次，关掉页面开的系统拦截，免得 navigateBack 再弹一遍
          if (typeof wx.disableAlertBeforeUnload === 'function') wx.disableAlertBeforeUnload();
          this.doBack();
        },
        fail: () => { this._backing = false; }
      });
    },

    doBack() {
      setTimeout(() => { this._backing = false; }, 600);
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
