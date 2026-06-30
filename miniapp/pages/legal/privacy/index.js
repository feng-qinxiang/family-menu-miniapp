// pages/legal/privacy · 隐私政策（静态二级页）
Page({
  data: {
    effectiveDate: '2026 年 6 月 1 日',
    contactMail: 'privacy@jiating-dingcai.com',
    intro:
      '「家庭点菜」尊重并保护每一位用户的个人隐私。本政策说明我们如何收集、使用、存储你的信息，以及你对这些信息所拥有的权利。请你在使用前仔细阅读。',
    sections: [
      {
        no: '01',
        title: '信息收集',
        body:
          '为了向你提供点菜、菜单管理与买菜清单服务，我们会收集你主动填写的内容，包括菜谱、家庭成员昵称、口味偏好；以及在你授权后获取的微信头像与昵称。我们不会收集与服务无关的信息。',
      },
      {
        no: '02',
        title: '信息使用',
        body:
          '收集到的信息仅用于：生成你的个性化菜单、同步家庭成员的点菜记录、推荐常做菜品。我们不会将你的信息用于广告投放，也不会向任何第三方出售。',
      },
      {
        no: '03',
        title: '信息存储',
        body:
          '你的数据存储于境内合规云服务器，并采用加密传输与脱敏处理。我们仅在为你提供服务所必需的期间内保留数据，账号注销后将在 15 个工作日内删除或匿名化。',
      },
      {
        no: '04',
        title: '第三方服务',
        body:
          '本小程序基于微信平台运行，登录与支付环节会调用微信官方接口。这部分数据由微信依其隐私政策处理。除此之外，我们不接入任何额外的第三方数据统计或广告 SDK。',
      },
    ],
    permissions: [
      { icon: 'user', name: '微信资料', desc: '用于显示你的头像与昵称，方便家庭成员互相识别。' },
      { icon: 'camera', name: '相册 / 相机', desc: '仅在你上传自家菜品照片时调用，照片只用于你的菜谱。' },
      { icon: 'bell', name: '通知', desc: '用于提醒今晚菜单与买菜清单，可随时在系统设置中关闭。' },
    ],
  },

  onLoad() {
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
  },

  // 复制联系邮箱
  onCopyMail() {
    const mail = this.data.contactMail;
    wx.setClipboardData({
      data: mail,
      success() {
        wx.showToast({ title: '邮箱已复制', icon: 'none' });
      },
      fail() {
        wx.showToast({ title: '复制失败', icon: 'none' });
      },
    });
  },
});
