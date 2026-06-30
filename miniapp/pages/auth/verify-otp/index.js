// pages/auth/verify-otp · 短信验证码校验
const api = require('../../../utils/api');

Page({
  data: {
    statusBarHeight: 0,
    phone: '',
    maskedPhone: '138****6666',
    code: '',
    cells: ['', '', '', '', '', ''],
    focused: false,
    countdown: 60,
    submitting: false,
    toast: { visible: false, type: 'top', text: '' },
  },

  onLoad(query) {
    // 兼容上一页传入的手机号，做脱敏展示。
    let masked = this.data.maskedPhone;
    const phone = query && query.phone ? String(query.phone) : '';
    if (phone && phone.length >= 7) {
      masked = phone.slice(0, 3) + '****' + phone.slice(-4);
    }

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

    this.setData({ statusBarHeight: sbh, phone, maskedPhone: masked });
    this.startCountdown();
  },

  onReady() {
    // 自动聚焦隐藏 input，唤起数字键盘
    this.setData({ focused: true });
  },

  onUnload() {
    this.clearTimer();
  },

  clearTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  startCountdown() {
    this.clearTimer();
    this.setData({ countdown: 60 });
    this._timer = setInterval(() => {
      const next = this.data.countdown - 1;
      if (next <= 0) {
        this.clearTimer();
        this.setData({ countdown: 0 });
      } else {
        this.setData({ countdown: next });
      }
    }, 1000);
  },

  // 点击 otp 区域聚焦
  focusInput() {
    this.setData({ focused: true });
  },

  onFocus() {
    this.setData({ focused: true });
  },

  onBlur() {
    this.setData({ focused: false });
  },

  // 输入同步到 6 格 + 满 6 位自动提交
  onInput(e) {
    let val = (e.detail.value || '').replace(/\D/g, '').slice(0, 6);
    const cells = ['', '', '', '', '', ''];
    for (let i = 0; i < val.length; i++) {
      cells[i] = val[i];
    }
    this.setData({ code: val, cells });

    if (val.length === 6) {
      this.onSubmit();
    }
  },

  // 重新获取验证码
  onResend() {
    if (this.data.countdown > 0) {
      return;
    }
    if (!/^1\d{10}$/.test(this.data.phone)) {
      this.showToast('error', '手机号无效，请返回重试');
      return;
    }
    api.requestPhoneOtp(this.data.phone)
      .then((res) => {
        this.showToast('top', res.devCode ? `验证码 ${res.devCode}` : '验证码已重新发送');
        this.startCountdown();
      })
      .catch((err) => {
        this.showToast('error', err.message || '验证码发送失败');
      });
  },

  // 验证并登录
  onSubmit() {
    if (this.data.code.length !== 6) {
      this.showToast('error', '请输入完整的 6 位验证码');
      return;
    }
    if (this.data.submitting) {
      return;
    }
    this.setData({ submitting: true });

    api.loginWithOtp({ phone: this.data.phone, code: this.data.code })
      .then((res) => {
        try {
          if (res && res.user) wx.setStorageSync('user', res.user);
        } catch (e) {}
        this.setData({ submitting: false });
        wx.showToast({ title: '登录成功', icon: 'success', duration: 800 });
        setTimeout(() => {
          wx.switchTab({
            url: '/pages/home/index',
            fail: () => {
              wx.navigateBack({ delta: 1 });
            },
          });
        }, 820);
      })
      .catch((err) => {
        this.setData({ submitting: false });
        this.showToast('error', err.message || '验证码错误或已过期');
      });
  },

  // 换用其他方式登录
  onOther() {
    wx.navigateBack({ delta: 1 });
  },

  showToast(type, text) {
    this.setData({ toast: { visible: true, type: type || 'top', text } });
  },

  onToastClose() {
    this.setData({ 'toast.visible': false });
  },
});
