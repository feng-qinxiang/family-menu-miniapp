// pages/launch/splash · 启动页
// 展示 2s 后自动 switchTab 进首页；onUnload 清理定时器
const SPLASH_DURATION = 2000;

Page({
  data: {
    version: '1.0.0',
  },

  onLoad() {
    this._timer = setTimeout(() => {
      this._go();
    }, SPLASH_DURATION);
  },

  onUnload() {
    this._clearTimer();
  },

  onHide() {
    // 退到后台时停止计时，避免回前台后立即跳转
    this._clearTimer();
  },

  _clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  },

  _go() {
    this._clearTimer();
    wx.switchTab({
      url: '/pages/home/index',
      fail: () => {
        // 兜底：switchTab 失败则 reLaunch 到首页
        wx.reLaunch({ url: '/pages/home/index' });
      },
    });
  },
});
