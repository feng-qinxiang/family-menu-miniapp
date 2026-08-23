// settings · 二级页（游客直进，无强制登录拦截）
// 视觉对标 artifacts/settings.html，配色全部走 app.wxss 全局 token
const api = require('../../../utils/api');

// 通知开关本地持久化 key（杀进程重进保持）
const NOTIFY_STORAGE_KEY = 'notify_settings_v1';

function loadNotifySettings() {
  try {
    const saved = wx.getStorageSync(NOTIFY_STORAGE_KEY);
    if (saved && typeof saved === 'object') return saved;
  } catch (e) { /* 读失败走默认 */ }
  return null;
}

Page({
  data: {
    statusBarHeight: 0,
    version: 'v1.0.0',
    year: 2026,
    // 账号安全分组（手机号/微信绑定，登录后拉真实数据）
    accountList: [
      { key: 'phone', name: '手机号', icon: 'phone', value: '未绑定' },
      { key: 'wechat', name: '微信绑定', icon: 'wechat', value: '未知' },
    ],
    // 通知开关（3 个）
    notifyList: [
      { key: 'family', name: '家庭动态提醒', desc: '家人加菜、排菜时通知我', icon: 'bell', on: true },
      { key: 'community', name: '社区互动提醒', desc: '评论、点赞、收藏', icon: 'chat', on: true },
      { key: 'marketing', name: '营销推送', desc: '', icon: 'send', on: false },
    ],
    // 通用分组
    generalList: [
      { key: 'font', name: '字体大小', icon: 'font', value: '标准' },
      { key: 'cache', name: '清除缓存', icon: 'cache', value: '23.6 MB' },
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
    this._loadNotifySettings();
  },

  // 通知开关：从 storage 回填上次状态（未存过则用默认值）
  _loadNotifySettings() {
    const saved = loadNotifySettings();
    if (!saved) return;
    const list = this.data.notifyList.map((it) =>
      typeof saved[it.key] === 'boolean' ? { ...it, on: saved[it.key] } : it
    );
    this.setData({ notifyList: list });
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
        const list = this.data.accountList.map((it) =>
          it.key === 'phone' ? { ...it, value: masked } : it
        );
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

  // 通知开关切换：写 storage 持久化，杀进程重进保持
  onSwitchTap(e) {
    const key = e.currentTarget.dataset.key;
    const list = this.data.notifyList.map((it) =>
      it.key === key ? { ...it, on: !it.on } : it
    );
    this.setData({ notifyList: list });
    const saved = {};
    list.forEach((it) => { saved[it.key] = it.on; });
    try {
      wx.setStorageSync(NOTIFY_STORAGE_KEY, saved);
    } catch (err) {
      // 存储失败仅影响持久化，不影响本次会话生效
    }
    const cur = list.find((it) => it.key === key);
    this._toast(`${cur.name}已${cur.on ? '开启' : '关闭'}`);
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

  // 清除缓存：只清业务缓存，保留游客身份锚点（device_id）与登录态，避免"数据全丢"
  _clearCache() {
    try {
      const deviceId = wx.getStorageSync('device_id');
      const token = wx.getStorageSync('auth_token');
      let fontScale = '';
      try { fontScale = wx.getStorageSync('font_scale') || ''; } catch (e) { fontScale = ''; }
      if (typeof wx.clearStorageSync === 'function') {
        wx.clearStorageSync();
      }
      if (deviceId) wx.setStorageSync('device_id', deviceId);
      if (token) wx.setStorageSync('auth_token', token);
      if (fontScale) wx.setStorageSync('font_scale', fontScale);
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
    this.setData({ logoutVisible: false });
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
  },
});
