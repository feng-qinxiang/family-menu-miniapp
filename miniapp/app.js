const { guestLogin, getVipStatus } = require('./utils/api');

App({
  globalData: {
    appName: '点菜小程序-家庭版',
    apiBaseUrl: 'http://localhost:9088',
    isVip: false,
    vipPlanName: '免费版'
  },

  async onLaunch() {
    // 首屏先用本地缓存兜底，避免黑屏切换；最终以服务器返回为准。
    this.globalData.isVip = wx.getStorageSync('vip_status') === true;
    try {
      await guestLogin();
    } catch (error) {
      console.warn('guest login failed', error);
    }
    this.refreshVipStatus();
  },

  async refreshVipStatus() {
    try {
      const status = await getVipStatus();
      const vip = !!(status && status.vip);
      this.globalData.isVip = vip;
      this.globalData.vipPlanName = (status && status.planName) || (vip ? '家庭同步' : '免费版');
      wx.setStorageSync('vip_status', vip);
    } catch (err) {
      console.warn('vip status refresh failed', err);
    }
  }
});
