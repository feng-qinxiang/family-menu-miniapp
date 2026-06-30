// pages/auth/login-phone · 手机号验证码登录
// 真实接口：requestPhoneOtp() 下发验证码，loginWithOtp() 校验登录
// dev 模式后端固定返回验证码 246810，并通过 devCode 回显方便联调
const api = require('../../../utils/api');

const COUNT_FROM = 60;

Page({
  data: {
    phone: '',
    code: '',
    phoneFocus: false,
    codeFocus: false,
    agreed: false,
    counting: false,
    countdown: COUNT_FROM,
    sending: false,
    submitting: false,
    toast: { visible: false, type: 'top', text: '' },
  },

  onLoad() {
    this._timer = null;
  },

  onUnload() {
    this._clearTimer();
  },

  // —— 输入 ——
  onPhoneInput(e) {
    this.setData({ phone: (e.detail.value || '').replace(/\D/g, '') });
  },
  onCodeInput(e) {
    this.setData({ code: (e.detail.value || '').replace(/\D/g, '').slice(0, 6) });
  },
  onPhoneFocus() { this.setData({ phoneFocus: true }); },
  onPhoneBlur() { this.setData({ phoneFocus: false }); },
  onCodeFocus() { this.setData({ codeFocus: true }); },
  onCodeBlur() { this.setData({ codeFocus: false }); },

  // —— 验证码倒计时 ——
  _clearTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  _startCountdown() {
    this.setData({ counting: true, countdown: COUNT_FROM });
    this._clearTimer();
    this._timer = setInterval(() => {
      const next = this.data.countdown - 1;
      if (next <= 0) {
        this._clearTimer();
        this.setData({ counting: false, countdown: COUNT_FROM });
      } else {
        this.setData({ countdown: next });
      }
    }, 1000);
  },

  // 下发验证码：调用后端真实 OTP 接口
  onSendCode() {
    if (this.data.counting || this.data.sending) return;
    if (!/^1\d{10}$/.test(this.data.phone)) {
      this._toast('请输入正确的手机号');
      return;
    }
    this.setData({ sending: true });
    api.requestPhoneOtp(this.data.phone)
      .then((res) => {
        this._startCountdown();
        if (res && res.devCode) {
          this._toast(`验证码已发送（调试码 ${res.devCode}）`);
        } else {
          this._toast('验证码已发送');
        }
      })
      .catch((err) => {
        this._toast(err && err.message ? err.message : '发送失败，请重试');
      })
      .finally(() => {
        this.setData({ sending: false });
      });
  },

  // —— 协议 ——
  onToggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },
  onProtocol() {
    wx.navigateTo({
      url: '/pages/legal/terms/index',
      fail: () => this._toast('协议详情暂不可用'),
    });
  },

  // —— 登录：校验验证码 → 拿 token → 进首页 ——
  onLogin() {
    if (!/^1\d{10}$/.test(this.data.phone)) {
      this._toast('请输入正确的手机号');
      return;
    }
    if (!/^\d{6}$/.test(this.data.code)) {
      this._toast('请输入 6 位短信验证码');
      return;
    }
    if (!this.data.agreed) {
      this._toast('请先勾选用户协议');
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });

    wx.showLoading({ title: '登录中...', mask: true });
    api.loginWithOtp({ phone: this.data.phone, code: this.data.code })
      .then((res) => {
        try {
          if (res && res.user) wx.setStorageSync('user', res.user);
        } catch (e) {}
        wx.hideLoading();
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({
            url: '/pages/home/index',
            fail: () => wx.navigateBack({ delta: 1 }),
          });
        }, 600);
      })
      .catch((err) => {
        wx.hideLoading();
        this._toast(err && err.message ? err.message : '验证码错误或已过期');
      })
      .finally(() => {
        this.setData({ submitting: false });
      });
  },

  // 微信一键登录：小程序端 wx.login 拿 code → 后端 jscode2session
  onWxLogin() {
    if (!this.data.agreed) {
      this._toast('请先勾选用户协议');
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    wx.showLoading({ title: '登录中...', mask: true });

    wx.login({
      success: (loginRes) => {
        const code = loginRes && loginRes.code;
        if (!code) {
          wx.hideLoading();
          this.setData({ submitting: false });
          this._toast('微信登录失败，请重试');
          return;
        }
        api.wechatLogin({ code })
          .then((res) => {
            try {
              if (res && res.user) wx.setStorageSync('user', res.user);
            } catch (e) {}
            wx.hideLoading();
            wx.showToast({ title: '登录成功', icon: 'success' });
            setTimeout(() => {
              wx.switchTab({
                url: '/pages/home/index',
                fail: () => wx.navigateBack({ delta: 1 }),
              });
            }, 600);
          })
          .catch((err) => {
            wx.hideLoading();
            this.setData({ submitting: false });
            // 后端未配置微信凭据时返回 503，引导用验证码登录
            const msg = err && err.status === 503
              ? '微信登录暂未开通，请用验证码登录'
              : (err && err.message ? err.message : '微信登录失败');
            this._toast(msg);
          });
      },
      fail: () => {
        wx.hideLoading();
        this.setData({ submitting: false });
        this._toast('微信登录失败，请重试');
      },
    });
  },

  onRegister() {
    wx.navigateTo({
      url: '/pages/auth/register/index',
      fail: () => this._toast('注册页暂不可用'),
    });
  },

  onHelp() {
    wx.navigateTo({
      url: '/pages/me/help-faq/index',
      fail: () => this._toast('帮助中心暂不可用'),
    });
  },

  // —— toast ——
  _toast(text, type) {
    this.setData({
      toast: { visible: true, type: type || 'top', text: text || '' },
    });
  },
  onToastClose() {
    this.setData({ 'toast.visible': false });
  },
});