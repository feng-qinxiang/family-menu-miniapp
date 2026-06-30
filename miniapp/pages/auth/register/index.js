// pages/auth/register · 注册账号(二级页)
// 手机验证码即注册登录。真实短信暂不接入，开发环境返回调试码。
const api = require('../../../utils/api');

Page({
  data: {
    phone: '',
    code: '',
    pwd: '',
    pwd2: '',
    phoneFocus: false,
    codeFocus: false,
    pwdFocus: false,
    pwd2Focus: false,
    pwdShow: false,
    pwd2Show: false,
    agreed: false,
    counting: false,
    countdown: 60,
    toast: { visible: false, type: 'top', text: '' },
  },

  onLoad() {
    this._timer = null;
  },

  onUnload() {
    this._clearTimer();
  },

  _clearTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  _toast(text, type) {
    this.setData({ toast: { visible: true, type: type || 'center', text: text } });
  },

  onToastClose() {
    this.setData({ 'toast.visible': false });
  },

  // —— 输入 ——
  onPhoneInput(e) { this.setData({ phone: e.detail.value }); },
  onCodeInput(e) { this.setData({ code: e.detail.value }); },
  onPwdInput(e) { this.setData({ pwd: e.detail.value }); },
  onPwd2Input(e) { this.setData({ pwd2: e.detail.value }); },

  // —— 焦点 ——
  onPhoneFocus() { this.setData({ phoneFocus: true }); },
  onPhoneBlur() { this.setData({ phoneFocus: false }); },
  onCodeFocus() { this.setData({ codeFocus: true }); },
  onCodeBlur() { this.setData({ codeFocus: false }); },
  onPwdFocus() { this.setData({ pwdFocus: true }); },
  onPwdBlur() { this.setData({ pwdFocus: false }); },
  onPwd2Focus() { this.setData({ pwd2Focus: true }); },
  onPwd2Blur() { this.setData({ pwd2Focus: false }); },

  // —— 眼睛切换 ——
  onTogglePwd() { this.setData({ pwdShow: !this.data.pwdShow }); },
  onTogglePwd2() { this.setData({ pwd2Show: !this.data.pwd2Show }); },

  // —— 协议 ——
  onToggleAgree() { this.setData({ agreed: !this.data.agreed }); },
  onProtocol() {
    wx.navigateTo({
      url: '/pages/legal/terms/index',
      fail: () => this._toast('请先阅读并同意用户协议', 'top')
    });
  },

  // —— 验证码倒计时（真实 OTP 下发）——
  onSendCode() {
    if (this.data.counting) return;
    const phone = (this.data.phone || '').trim();
    if (!/^1\d{10}$/.test(phone)) {
      this._toast('请输入正确的手机号', 'error');
      return;
    }
    api.requestPhoneOtp(phone)
      .then((res) => {
        this.setData({ counting: true, countdown: 60 });
        this._toast(res && res.devCode ? `验证码已发送（调试码 ${res.devCode}）` : '验证码已发送', 'top');
        this._clearTimer();
        this._timer = setInterval(() => {
          const left = this.data.countdown - 1;
          if (left <= 0) {
            this._clearTimer();
            this.setData({ counting: false, countdown: 60 });
          } else {
            this.setData({ countdown: left });
          }
        }, 1000);
      })
      .catch((err) => {
        this._toast(err && err.message ? err.message : '发送失败，请重试', 'error');
      });
  },

  // —— 注册：手机验证码即注册登录（后端为无密码体系，密码仅前端体验）——
  onRegister() {
    const { phone, code, pwd, pwd2, agreed } = this.data;
    if (!/^1\d{10}$/.test((phone || '').trim())) {
      this._toast('请输入正确的手机号', 'error');
      return;
    }
    if (!/^\d{6}$/.test((code || '').trim())) {
      this._toast('请输入 6 位验证码', 'error');
      return;
    }
    if (!pwd || pwd.length < 6) {
      this._toast('密码至少 6 位', 'error');
      return;
    }
    if (pwd !== pwd2) {
      this._toast('两次输入的密码不一致', 'error');
      return;
    }
    if (!agreed) {
      this._toast('请先阅读并同意用户协议', 'error');
      return;
    }

    wx.showLoading({ title: '注册中', mask: true });
    api.loginWithOtp({ phone: phone.trim(), code: code.trim() })
      .then((res) => {
        try {
          if (res && res.user) wx.setStorageSync('user', res.user);
        } catch (e) {}
        wx.hideLoading();
        wx.showToast({ title: '注册成功', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({
            url: '/pages/home/index',
            fail() { wx.navigateBack({ delta: 1 }); },
          });
        }, 800);
      })
      .catch((err) => {
        wx.hideLoading();
        this._toast(err && err.message ? err.message : '验证码错误或已过期', 'error');
      });
  },

  // —— 去登录 ——
  onGoLogin() {
    wx.navigateTo({
      url: '/pages/auth/login-phone/index',
      fail() { wx.navigateBack({ delta: 1 }); },
    });
  },
});
