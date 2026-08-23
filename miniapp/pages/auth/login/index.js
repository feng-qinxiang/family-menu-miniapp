// pages/auth/login/index · 登录落地页逻辑
const api = require('../../../utils/api');

Page({
  data: {
    agreed: false,
    submitting: false,
    toast: { visible: false, text: '' },
    trustList: [
      { icon: '♡', h: '一家人共享同一份菜单', s: '今晚吃什么，全家一起说了算' },
      { icon: '✚', h: '点完菜自动生成买菜清单', s: '缺什么一键加入，照着买不漏项' },
      { icon: '▤', h: '记下家里每道拿手菜', s: '做过几次、谁掌勺，都帮你存好' }
    ]
  },

  onLoad() {
    // 游客直进策略：此页仅作登录入口，无强制拦截
  },

  // 协议勾选
  onToggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  // 校验协议是否勾选
  ensureAgreed() {
    if (!this.data.agreed) {
      this.toast('请先阅读并勾选用户协议');
      return false;
    }
    return true;
  },

  // 微信一键登录 → wx.login 拿 code → 后端 jscode2session；未开通时降级游客
  onWechatLogin() {
    if (!this.ensureAgreed()) return;
    if (this.data.submitting) return;
    this.setData({ submitting: true });

    wx.login({
      success: (loginRes) => {
        const code = loginRes && loginRes.code;
        if (!code) {
          this.setData({ submitting: false });
          this.toast('微信登录失败，请重试');
          return;
        }
        api.wechatLogin({ code })
          .then((res) => {
            if (res && res.token) {
              try { wx.setStorageSync('auth_token', res.token); } catch (e) {}
            }
            this.toast('微信登录成功');
            this.goHome();
          })
          .catch((err) => {
            // 后端未配置微信凭据（503）时降级游客登录，不打断体验
            if (err && err.status === 503) {
              this._fallbackGuest('微信登录暂不可用，已用游客身份进入');
            } else {
              this.setData({ submitting: false });
              this.toast(err && err.message ? err.message : '微信登录失败');
            }
          });
      },
      fail: () => {
        this.setData({ submitting: false });
        this.toast('微信登录失败，请重试');
      },
    });
  },

  // 游客逛逛 → guestLogin → 进首页 tab（无需勾选协议）
  onGuest() {
    this.doGuestLogin('');
  },

  // 微信降级到游客：拿到 token 后进首页
  _fallbackGuest(successText) {
    api.guestLogin()
      .then((res) => {
        if (res && res.token) {
          try { wx.setStorageSync('auth_token', res.token); } catch (e) {}
        }
        if (successText) this.toast(successText);
        this.goHome();
      })
      .catch(() => {
        this.setData({ submitting: false });
        this.toast('登录失败，请稍后再试');
      });
  },

  // 复用真实接口 guestLogin()
  doGuestLogin(successText) {
    if (this.data.submitting) return;
    this.setData({ submitting: true });

    api.guestLogin()
      .then((res) => {
        if (res && res.token) {
          try {
            wx.setStorageSync('auth_token', res.token);
          } catch (e) {
            // 存储失败不阻断进入
          }
        }
        if (successText) this.toast(successText);
        this.goHome();
      })
      .catch(() => {
        this.toast('登录失败，请稍后再试');
      })
      .finally(() => {
        this.setData({ submitting: false });
      });
  },

  goHome() {
    setTimeout(() => {
      wx.switchTab({
        url: '/pages/home/index',
        fail() {
          wx.reLaunch({ url: '/pages/home/index' });
        }
      });
    }, 300);
  },

  // 手机号登录 → 二级页
  onPhoneLogin() {
    if (!this.ensureAgreed()) return;
    wx.navigateTo({ url: '/pages/auth/login-phone/index' });
  },

  onRegister() {
    wx.navigateTo({ url: '/pages/auth/register/index' });
  },

  onReset() {
    wx.navigateTo({ url: '/pages/auth/reset-password/index' });
  },

  onTerms() {
    wx.navigateTo({ url: '/pages/legal/terms/index' });
  },

  onPrivacy() {
    wx.navigateTo({ url: '/pages/legal/privacy/index' });
  },

  // 统一轻提示：驱动 state-toast 组件显示
  toast(text) {
    if (!text) return;
    this.setData({ toast: { visible: false, text: '' } });
    // 下一帧重新置 visible，保证连续提示也能触发
    setTimeout(() => {
      this.setData({ toast: { visible: true, text } });
    }, 16);
  },

  onToastClose() {
    this.setData({ 'toast.visible': false });
  }
});
