// settings · 二级页（游客直进，无强制登录拦截）
// 视觉对标 artifacts/settings.html，配色全部走 app.wxss 全局 token
const api = require('../../../utils/api');
const features = require('../../../utils/features');

Page({
  data: {
    statusBarHeight: 0,
    version: 'v1.0.0',
    year: 2026,
    // 账号安全分组（手机号项随 PHONE_LOGIN 开关裁剪）
    accountList: [
      ...(features.PHONE_LOGIN ? [{ key: 'phone', name: '手机号', icon: 'phone', value: '未绑定' }] : []),
      { key: 'wechat', name: '微信绑定', icon: 'wechat', value: '加载中…' },
    ],
    // ponytail: 消息通知开关已下线（原来只写 storage，没人读也没有 wx.requestSubscribeMessage）；重做需 requestSubscribeMessage + 后端订阅推送
    // 通用分组
    generalList: [
      { key: 'font', name: '字体大小', icon: 'font', value: '标准' },
      { key: 'cache', name: '清除缓存', icon: 'cache', value: '计算中…' },
    ],
    // 关于分组
    aboutList: [
      { key: 'agreement', name: '用户协议', icon: 'doc', value: '' },
      { key: 'privacy', name: '隐私政策', icon: 'shield', value: '' },
      { key: 'about', name: '关于我们', icon: 'info', value: 'v1.0.0' },
      { key: 'feedback', name: '意见反馈', icon: 'msg', value: '' },
    ],
    // 退出确认弹窗
    logoutVisible: false,
    // 轻提示
    toastVisible: false,
    toastText: '',
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
    this.setData({ statusBarHeight: sbh, year: new Date().getFullYear() });
    this._refreshCacheSize();
    this._loadAccount();
    this._loadFontScale();
  },

  // 读取大字模式开关并回填设置项展示
  _loadFontScale() {
    let scale = 'normal';
    try {
      scale = wx.getStorageSync('font_scale') || 'normal';
    } catch (e) {
      scale = 'normal';
    }
    const app = getApp();
    if (app) app.globalData.fontScale = scale;
    const list = this.data.generalList.map((it) =>
      it.key === 'font' ? { ...it, value: scale === 'lg' ? '大' : '标准' } : it
    );
    this.setData({ fontScale: scale, generalList: list });
  },

  _toggleFontScale() {
    const next = this.data.fontScale === 'lg' ? 'normal' : 'lg';
    const app = getApp();
    if (app) app.globalData.fontScale = next;
    try {
      wx.setStorageSync('font_scale', next);
    } catch (e) {
      // 存储失败不影响本次会话内生效
    }
    const list = this.data.generalList.map((it) =>
      it.key === 'font' ? { ...it, value: next === 'lg' ? '大' : '标准' } : it
    );
    this.setData({ fontScale: next, generalList: list });
    this._toast(next === 'lg' ? '已开启大字模式' : '已恢复标准字号');
  },

  // 拉取当前用户，回填手机号/微信绑定状态（失败保留默认）
  _loadAccount() {
    if (!api || typeof api.getCurrentUser !== 'function') return;
    api.getCurrentUser()
      .then((user) => {
        if (!user) return;
        const phone = user.phoneNumber || user.phone || '';
        const masked = phone && phone.length >= 7
          ? phone.slice(0, 3) + '****' + phone.slice(-4)
          : '未绑定';
        // 微信绑定态由后端 wechatBound 给出（游客账号=未绑定）
        const wechatText = user.wechatBound === true ? '已绑定' : (user.wechatBound === false ? '未绑定（游客）' : '未知');
        const list = this.data.accountList.map((it) => {
          if (it.key === 'phone') return { ...it, value: masked };
          if (it.key === 'wechat') return { ...it, value: wechatText };
          return it;
        });
        this.setData({ accountList: list });
      })
      .catch(() => {
        // 静默兜底，保留默认展示
      });
  },

  // 估算本地缓存大小（容错：失败用默认演示值）
  _refreshCacheSize() {
    try {
      if (typeof wx.getStorageInfoSync === 'function') {
        const info = wx.getStorageInfoSync();
        const kb = (info && info.currentSize) || 0; // 单位 KB
        const mb = (kb / 1024).toFixed(1);
        const list = this.data.generalList.map((it) =>
          it.key === 'cache' ? { ...it, value: `${mb} MB` } : it
        );
        this.setData({ generalList: list });
      }
    } catch (e) {
      // 保留默认演示值
    }
  },

  _toast(text) {
    this.setData({ toastVisible: true, toastText: text });
  },
  onToastClose() {
    this.setData({ toastVisible: false });
  },

  // 账号安全项点击：手机号 → 验证码登录页换绑；微信已绑定
  onAccountTap(e) {
    const key = e.currentTarget.dataset.key;
    if (key === 'phone') {
      wx.navigateTo({
        url: '/pages/auth/login-phone/index',
        fail: () => this._toast('换绑入口暂不可用'),
      });
      return;
    }
    if (key === 'wechat') {
      this._toast('账号里还查不到绑定状态，去登录页用微信登录');
      wx.navigateTo({ url: '/pages/auth/login/index', fail: () => {} });
    }
  },

  // 通用项点击
  onGeneralTap(e) {
    const key = e.currentTarget.dataset.key;
    if (key === 'cache') {
      this._clearCache();
    } else if (key === 'font') {
      this._toggleFontScale();
    }
  },

  // 清除缓存：弹确认后再清。此前直接 clearStorageSync() 会把本地口味偏好、
  // 心愿缓存一并清掉（用户会以为"我的设置被重置了"），改为一律保留这些业务键。
  _clearCache() {
    wx.showModal({
      title: '清除缓存？',
      content: '将清理本地缓存数据（图片、列表缓存），你的账号、家庭与菜谱都在云端，不受影响。',
      confirmText: '清除',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) this._doClearCache();
      }
    });
  },

  _doClearCache() {
    // 需要保留的本地键：身份锚点、登录态、显示偏好、口味偏好、心愿缓存
    const KEEP_KEYS = ['device_id', 'auth_token', 'font_scale', 'profile_prefs_v1', 'family_wishes_v1'];
    try {
      const kept = {};
      KEEP_KEYS.forEach((key) => {
        try {
          const v = wx.getStorageSync(key);
          if (v !== '' && v !== null && v !== undefined) kept[key] = v;
        } catch (e) { /* 读不到就跳过 */ }
      });
      if (typeof wx.clearStorageSync === 'function') {
        wx.clearStorageSync();
      }
      Object.keys(kept).forEach((key) => {
        try { wx.setStorageSync(key, kept[key]); } catch (e) { /* 忽略 */ }
      });
    } catch (e) {
      // 忽略清理失败
    }
    const list = this.data.generalList.map((it) =>
      it.key === 'cache' ? { ...it, value: '0 MB' } : it
    );
    this.setData({ generalList: list });
    this._loadFontScale();
    this._toast('缓存已清除');
  },

  // 关于项点击：全部跳真实页
  onAboutTap(e) {
    const key = e.currentTarget.dataset.key;
    const routes = {
      agreement: '/pages/legal/terms/index',
      privacy: '/pages/legal/privacy/index',
      about: '/pages/me/about/index',
      feedback: '/pages/me/feedback/index',
    };
    const url = routes[key];
    if (!url) {
      this._toast('功能暂不可用');
      return;
    }
    wx.navigateTo({
      url,
      fail: () => this._toast('页面暂不可用'),
    });
  },

  // 退出登录 → 弹确认
  onLogoutTap() {
    this.setData({ logoutVisible: true });
  },
  onLogoutCancel() {
    this.setData({ logoutVisible: false });
  },
  // 确认退出：清登录态但保留游客身份锚点 device_id，避免下次进入变成全新游客账号
  onLogoutConfirm() {
    if (this.__logoutBusy) return;
    this.__logoutBusy = true;
    this.setData({ logoutVisible: false });
    // 先吊销服务端会话，再清本地；失败也不阻塞（本地清完用户已无 token 可用）。
    // 接口有 10s 超时，期间必须给反馈，否则像卡死。
    wx.showLoading({ title: '正在退出', mask: true });
    api.logout().catch(() => {}).then(() => {
      wx.hideLoading();
      this.__logoutBusy = false;
      try {
        const deviceId = wx.getStorageSync('device_id');
        let fontScale = '';
        try { fontScale = wx.getStorageSync('font_scale') || ''; } catch (e) { fontScale = ''; }
        if (typeof wx.clearStorageSync === 'function') {
          wx.clearStorageSync();
        }
        if (deviceId) wx.setStorageSync('device_id', deviceId);
        if (fontScale) wx.setStorageSync('font_scale', fontScale);
      } catch (e) {
        // 忽略清理失败
      }
      wx.showToast({ title: '已退出登录', icon: 'none' });
      setTimeout(() => {
        wx.navigateTo({
          url: '/pages/auth/login/index',
          fail: () => {
            wx.navigateBack({ delta: 1 });
          },
        });
      }, 320);
    });
  },
});
