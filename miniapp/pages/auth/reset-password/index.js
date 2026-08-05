// pages/auth/reset-password · 验证码找回并重新登录
// 后端为无密码体系：此页通过手机验证码完成重新登录，无密码字段
const api = require('../../../utils/api');

Page({
  data: {
    phone: '138 8888 6666', // 注册手机号，readonly 展示
    code: '',
    focusKey: '',
    // 验证码倒计时
    counting: false,
    countdown: 60,
    sendLabel: '发送验证码',
    // 校验态
    canSubmit: false,
  },

  _timer: null,

  onLoad(options) {
    // 容错：允许从登录页带手机号进入
    if (options && options.phone) {
      const raw = String(options.phone).replace(/\D/g, '');
      if (raw) {
        this.setData({ phone: this._formatPhone(raw) });
      }
    }
  },

  onUnload() {
    this._clearTimer();
  },

  _formatPhone(raw) {
    const s = raw.slice(0, 11);
    if (s.length <= 3) return s;
    if (s.length <= 7) return s.slice(0, 3) + ' ' + s.slice(3);
    return s.slice(0, 3) + ' ' + s.slice(3, 7) + ' ' + s.slice(7);
  },

  _clearTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  onFocus(e) {
    this.setData({ focusKey: (e.currentTarget.dataset.key) || '' });
  },

  onBlur() {
    this.setData({ focusKey: '' });
  },

  onCodeInput(e) {
    const code = (e.detail.value || '').replace(/\D/g, '').slice(0, 6);
    this.setData({ code, canSubmit: code.length === 6 });
  },

  // 下发验证码：调用后端真实 OTP 接口
  onSendCode() {
    if (this.data.counting) return;
    const rawPhone = (this.data.phone || '').replace(/\D/g, '');
    if (!/^1\d{10}$/.test(rawPhone)) {
      wx.showToast({ title: '手机号不正确', icon: 'none' });
      return;
    }
    api.requestPhoneOtp(rawPhone)
      .then((res) => {
        wx.showToast({
          title: res && res.devCode ? `验证码 ${res.devCode}（调试）` : '验证码已发送',
          icon: 'none',
        });
        this.setData({ counting: true, countdown: 60 });
        this._clearTimer();
        this._timer = setInterval(() => {
          const next = this.data.countdown - 1;
          if (next <= 0) {
            this._clearTimer();
            this.setData({ counting: false, countdown: 60, sendLabel: '重新发送' });
          } else {
            this.setData({ countdown: next });
          }
        }, 1000);
      })
      .catch((err) => {
        wx.showToast({ title: err && err.message ? err.message : '发送失败', icon: 'none' });
      });
  },

  onReset() {
    const { code } = this.data;
    const rawPhone = (this.data.phone || '').replace(/\D/g, '');
    if (code.length !== 6) {
      wx.showToast({ title: '请输入 6 位验证码', icon: 'none' });
      return;
    }
    // 后端为无密码体系：验证码校验通过即重新登录
    wx.showLoading({ title: '验证中', mask: true });
    api.loginWithOtp({ phone: rawPhone, code })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '验证成功，已登录', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({
            url: '/pages/home/index',
            fail: () => this.goLogin(),
          });
        }, 900);
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err && err.message ? err.message : '验证码错误或已过期', icon: 'none' });
      });
  },

  goLogin() {
    // 二级页：优先返回上一页（多为登录页），无则跳转登录
    const pages = getCurrentPages();
    if (pages && pages.length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.navigateTo({
        url: '/pages/auth/login/index',
        fail() {
          wx.switchTab({ url: '/pages/home/index', fail() {} });
        },
      });
    }
  },
});
