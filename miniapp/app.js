const { bootstrapSession, getVipStatus, getAuthToken } = require('./utils/api');
const { resolveConfig } = require('./utils/env');
const features = require('./utils/features');

App({
  globalData: {
    appName: '点菜小程序-家庭版',
    apiBaseUrl: resolveConfig().apiBaseUrl,
    isVip: false,
    vipPlanName: '免费版'
  },

  async onLaunch() {
    // 首屏先用本地缓存兜底，避免黑屏切换；最终以服务器返回为准。
    this.globalData.isVip = wx.getStorageSync('vip_status') === true;
    // 已有登录态（手机/微信/游客）时不要再用新会话覆盖，否则会降级为游客
    if (!getAuthToken()) {
      // 首次身份建立：优先微信静默登录，失败才降级游客。
      // 见 utils/api.js#bootstrapSession 的注释：游客 openid 过不了微信内容机审，
      // 社区发帖会全部堆在人工队列里发不出去。
      try {
        await bootstrapSession();
      } catch (error) {
        console.warn('session bootstrap failed', error);
      }
    }
    this.refreshVipStatus();
  },

  async refreshVipStatus() {
    // 支付关闭时无 VIP 概念，跳过请求（权益全员可用）
    if (!features.PAYMENT) return;
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
