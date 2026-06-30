// pages/auth/wechat-auth · 微信授权(底部 sheet 弹层)
// 授权后优先走 wx.login + /api/auth/login；后端未配置微信凭据时引导手机验证码登录。
const api = require('../../../utils/api');

const FALLBACK_AVATAR = '/assets/dishes/chicken-congee.jpg';

Page({
  data: {
    statusBarHeight: 20,
    sheetIn: false,        // 控制 sheet 上滑入场动画
    avatarUrl: FALLBACK_AVATAR,
    nickname: '',
    nicknameFocus: false,
    wxFilled: false,       // 昵称是否已由微信填入
    submitting: false,
    toast: { visible: false, type: 'top', text: '' }
  },

  onLoad() {
    // 状态栏高度，刘海屏适配
    let sbh = 20;
    try {
      if (typeof wx.getWindowInfo === 'function') {
        sbh = wx.getWindowInfo().statusBarHeight || sbh;
      } else if (typeof wx.getSystemInfoSync === 'function') {
        sbh = wx.getSystemInfoSync().statusBarHeight || sbh;
      }
    } catch (e) {
      sbh = 20;
    }
    this.setData({ statusBarHeight: sbh });

    // 预填当前用户信息（容错：失败则保留默认占位）
    this._prefillUser();
  },

  onReady() {
    // 下一帧触发上滑入场，sheet 从底部滑入
    setTimeout(() => {
      this.setData({ sheetIn: true });
    }, 60);
  },

  _prefillUser() {
    if (!api || typeof api.getCurrentUser !== 'function') return;
    api.getCurrentUser()
      .then((user) => {
        if (!user) return;
        const patch = {};
        if (user.avatarUrl) patch.avatarUrl = user.avatarUrl;
        if (user.nickname) {
          patch.nickname = user.nickname;
          patch.wxFilled = true;
        }
        if (Object.keys(patch).length) this.setData(patch);
      })
      .catch(() => {
        // 静默兜底，保留默认头像与空昵称
      });
  },

  noop() {
    // 阻止 sheet 内部点击冒泡到遮罩
  },

  // 选择头像（微信头像昵称填写能力 / 兜底相册）
  onChooseAvatar(e) {
    const url = e && e.detail && e.detail.avatarUrl;
    if (url) {
      this.setData({ avatarUrl: url });
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res && res.tempFiles && res.tempFiles[0];
        if (file && file.tempFilePath) {
          this.setData({ avatarUrl: file.tempFilePath });
        }
      },
      fail: () => {
        this._toast('已取消选择', 'top');
      }
    });
  },

  onNicknameInput(e) {
    this.setData({
      nickname: (e.detail.value || '').slice(0, 24),
      wxFilled: false
    });
  },

  onNicknameFocus() {
    this.setData({ nicknameFocus: true });
  },

  onNicknameBlur() {
    this.setData({ nicknameFocus: false });
  },

  _wxLogin() {
    return new Promise((resolve, reject) => {
      wx.login({
        success(res) {
          if (res && res.code) resolve(res.code);
          else reject(new Error('微信登录凭证获取失败'));
        },
        fail() {
          reject(new Error('微信登录凭证获取失败'));
        }
      });
    });
  },

  async onAllow() {
    if (this.data.submitting) return;
    const nickname = (this.data.nickname || '').trim();
    if (!nickname) {
      this._toast('请先填写昵称', 'error');
      return;
    }
    this.setData({ submitting: true });

    wx.showLoading({ title: '授权中…', mask: true });
    try {
      const code = await this._wxLogin();
      const res = await api.wechatLogin({
        code,
        nickname,
        avatarUrl: this.data.avatarUrl || ''
      });
      try {
        if (res && res.user) wx.setStorageSync('user', res.user);
      } catch (e) {}
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: '授权成功', icon: 'success', duration: 900 });
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/home/index',
          fail: () => {
            wx.reLaunch({ url: '/pages/home/index' });
          }
        });
      }, 720);
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      const msg = (err && err.message) || '微信登录暂不可用，请使用手机号登录';
      this._toast(msg.indexOf('WeChat login disabled') >= 0 ? '微信登录未配置，请使用手机号验证码' : msg, 'error');
    }
  },

  // 拒绝 → 返回上一页，无上一页则回首页
  onDeny() {
    if (this.data.submitting) return;
    const pages = getCurrentPages();
    if (pages && pages.length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.navigateTo({
        url: '/pages/auth/login-phone/index',
        fail: () => wx.switchTab({ url: '/pages/home/index', fail() {} })
      });
    }
  },

  _toast(text, type) {
    this.setData({
      toast: { visible: true, type: type || 'top', text: text }
    });
  },

  onToastClose() {
    this.setData({ 'toast.visible': false });
  }
});
