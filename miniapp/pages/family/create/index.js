// pages/family/create · 创建家庭
const { createFamily } = require('../../../utils/api');
const { uploadFile } = require('../../../utils/upload');

Page({
  data: {
    statusBarHeight: 0,
    avatar: '',
    familyName: '',
    region: [],
    regionText: '',
    focusName: false,
    submitting: false,
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
    this.setData({ statusBarHeight: sbh });
  },

  // 选择家庭头像（演示：本地选图预览）
  chooseAvatar() {
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
  },

  onNameInput(e) {
    this.setData({ familyName: e.detail.value });
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
      wx.showToast({ title: '请先填写家庭名称', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    wx.showLoading({ title: '创建中...', mask: true });
    // 本地临时路径会过期，先上传拿真实 URL 再提交
    let avatarUrl = '';
    if (this.data.avatar) {
      avatarUrl = await uploadFile(this.data.avatar).catch(() => '');
    }
    createFamily({
      name,
      avatarUrl: avatarUrl || '',
      region: this.data.regionText || ''
    })
      .then(() => {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: '家庭创建成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateTo({
            url: '/pages/family/invite/index',
            fail: () => wx.navigateTo({ url: '/pages/family/members/index' }),
          });
        }, 600);
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: err.message || '创建失败', icon: 'none' });
      });
  },

  goJoin() {
    wx.navigateTo({
      url: '/pages/family/join/index',
      fail: () => {
        wx.showToast({ title: '加入页开发中', icon: 'none' });
      },
    });
  },
});
