// pages/family/join · 加入家庭逻辑
const { previewJoinFamily, joinFamily } = require('../../../utils/api');

const AV_COLORS = ['var(--gold-deep)', '#2f4a3a', 'var(--ink-deep)', '#826044', '#366d9f'];

Page({
  data: {
    statusBarHeight: 0,
    code: '',
    cells: ['', '', '', '', '', ''],
    focused: false,
    family: null,
    loading: false,
    submitting: false,
  },

  onLoad(options) {
    try {
      if (typeof wx.getWindowInfo === 'function') {
        this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight || 0 });
      } else if (typeof wx.getSystemInfoSync === 'function') {
        this.setData({ statusBarHeight: wx.getSystemInfoSync().statusBarHeight || 0 });
      }
    } catch (e) {
      this.setData({ statusBarHeight: 0 });
    }
    // 从邀请分享链接进入时自动回填邀请码并预览
    const shareCode = options && options.code ? options.code : '';
    if (shareCode) {
      this.applyCode(shareCode);
    }
  },

  applyCode(raw) {
    const code = String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
    const cells = [];
    for (let i = 0; i < 6; i += 1) cells[i] = code[i] || '';
    this.setData({ code, cells });
    if (code.length > 0) {
      this.loadFamily(code);
    } else {
      this.setData({ family: null });
    }
  },

  onCodeInput(e) {
    this.applyCode(e.detail.value);
  },

  onFocusCode() {
    this.setData({ focused: true });
  },

  onCodeBlur() {
    this.setData({ focused: false });
  },

  onPaste() {
    wx.getClipboardData({
      success: (res) => {
        const txt = (res.data || '').trim();
        if (!txt) {
          wx.showToast({ title: '剪贴板为空', icon: 'none' });
          return;
        }
        this.applyCode(txt);
        this.setData({ focused: true });
      },
      fail: () => {
        wx.showToast({ title: '读取剪贴板失败', icon: 'none' });
      },
    });
  },

  onScan() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const result = res.result || '';
        const m = result.match(/[0-9A-Za-z]{1,6}/);
        this.applyCode(m ? m[0] : result);
        this.setData({ focused: false });
        wx.showToast({ title: '已识别邀请码', icon: 'none' });
      },
      fail: () => {
        wx.showToast({ title: '已取消扫码', icon: 'none' });
      },
    });
  },

  async loadFamily(code) {
    this.setData({ loading: true });
    try {
      const preview = await previewJoinFamily(code);
      this.setData({ family: this.buildFamily(preview, code) });
    } catch (e) {
      this.setData({ family: null });
      wx.showToast({ title: e.message || '未找到家庭', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  buildFamily(profile, code) {
    const total = profile && profile.memberCount ? profile.memberCount : 0;
    const display = [{ nickname: '家' }, { nickname: '庭' }, { nickname: '厨' }]
      .slice(0, Math.max(1, Math.min(3, total || 1)));
    const avatars = display.map((m, i) => ({
      text: (m.nickname || '家').slice(0, 1),
      color: AV_COLORS[i % AV_COLORS.length],
    }));
    return {
      familyName: (profile && profile.familyName) || '家庭厨房',
      meta: `邀请码 ${code}`,
      memberCount: total,
      avatars,
      moreCount: Math.max(0, total - avatars.length),
      code,
    };
  },

  onApply() {
    if (!this.data.family) {
      wx.showToast({ title: '请先输入有效邀请码', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    wx.showLoading({ title: '加入中', mask: true });
    joinFamily(this.data.code)
      .then(() => {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: '已加入家庭', icon: 'success' });
        setTimeout(() => {
          wx.navigateTo({
            url: '/pages/family/members/index',
            fail: () => wx.navigateBack({ delta: 1, fail: () => {} }),
          });
        }, 600);
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: err.message || '加入失败', icon: 'none' });
      });
  },

  onCreate() {
    wx.navigateTo({ url: '/pages/family/create/index' });
  },
});
