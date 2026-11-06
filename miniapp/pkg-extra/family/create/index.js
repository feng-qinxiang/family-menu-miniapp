// pages/family/create · 创建家庭
const { createFamily } = require('../../../utils/api');
const { uploadFile } = require('../../../utils/upload');
const { ensurePrivacy } = require('../../../utils/privacy');

Page({
  data: {
    statusBarHeight: 0,
    avatar: '',
    familyName: '',
    region: [],
    regionText: '',
    focusName: false,
    nameError: false,
    submitting: false,
  },

  onLoad() {
    // 大字模式档位：onShow 读取，设置页改完回来立即生效
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
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

  // 选择家庭头像：先本地预览，提交时才上传换真实 URL
  chooseAvatar() {
    ensurePrivacy(() => {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success: (res) => {
          const file = res.tempFiles && res.tempFiles[0];
          if (file && file.tempFilePath) {
            this.setData({ avatar: file.tempFilePath });
          }
        },
        fail: () => {},
      });
    });
  },

  onNameInput(e) {
    const val = e.detail.value;
    // 边输入边清空错误
    this.setData({ familyName: val, nameError: !val || !val.trim() ? this.data.nameError : false });
  },
  onNameFocus() {
    this.setData({ focusName: true });
  },
  onNameBlur() {
    this.setData({ focusName: false });
  },

  onRegionChange(e) {
    const region = e.detail.value || [];
    this.setData({
      region,
      regionText: region.filter(Boolean).join(' '),
    });
  },

  async onCreate() {
    const name = (this.data.familyName || '').trim();
    if (!name) {
      // inline 错误 + toast 兜底
      this.setData({ nameError: true });
      wx.showToast({ title: '请先填写家庭名称', icon: 'none' });
      return;
    }
    this.setData({ nameError: false });
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    wx.showLoading({ title: '创建中...', mask: true });
    // 本地临时路径会过期，先上传拿真实 URL 再提交
    let avatarUrl = '';
    if (this.data.avatar) {
      avatarUrl = await uploadFile(this.data.avatar).catch(() => '');
    }
    // 选了合影却没传上去（uploadFile 返回 ''）：家庭照建，但要说清楚，别让人以为合影也存好了
    const avatarFailed = !!this.data.avatar && !avatarUrl;
    createFamily({
      name,
      avatarUrl: avatarUrl || '',
      region: this.data.regionText || ''
    })
      .then(() => {
        wx.hideLoading();
        wx.showToast(avatarFailed
          ? { title: '家庭已创建，合影没传上去', icon: 'none' }
          : { title: '家庭创建成功', icon: 'success' });
        // 成功后不复位 submitting，并用 redirectTo 替换本页（同 payment/checkout）：
        // 600ms 内再点不会重发、不会多推一层，返回也回不到已提交的表单
        this._navTimer = setTimeout(() => {
          wx.redirectTo({
            url: '/pkg-extra/family/invite/index',
            fail: () => wx.redirectTo({
              url: '/pkg-extra/family/members/index',
              fail: () => this.setData({ submitting: false }),
            }),
          });
        }, 600);
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: err.message || '创建失败', icon: 'none' });
      });
  },

  onUnload() {
    if (this._navTimer) {
      clearTimeout(this._navTimer);
      this._navTimer = null;
    }
  },

  goJoin() {
    wx.navigateTo({
      url: '/pkg-extra/family/join/index',
      fail: () => {
        wx.showToast({ title: '页面打开失败，请重试', icon: 'none' });
      },
    });
  },
});
