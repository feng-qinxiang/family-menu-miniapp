// 意见反馈页 · 二级页
// 真实接口：submitFeedback（POST /api/feedback）。游客直进，不拦登录。
const { submitFeedback } = require('../../../utils/api');

Page({
  data: {
    statusBarHeight: 0,
    types: [
      { key: 'feature', label: '功能建议' },
      { key: 'bug', label: '问题反馈' },
      { key: 'experience', label: '体验问题' },
      { key: 'other', label: '其他' },
    ],
    selectedTypes: { feature: true },
    content: '',
    contentLen: 0,
    images: [],
    contact: '',
    submitting: false,
    toast: { visible: false, type: 'center', text: '' },
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

  // 类型多选切换
  onToggleType(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const selectedTypes = Object.assign({}, this.data.selectedTypes);
    selectedTypes[key] = !selectedTypes[key];
    this.setData({ selectedTypes });
  },

  onContentInput(e) {
    const v = e.detail.value || '';
    this.setData({ content: v, contentLen: v.length });
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value || '' });
  },

  // 选图：最多 3 张
  onChooseImage() {
    const remain = 3 - this.data.images.length;
    if (remain <= 0) {
      this.showToast('最多上传 3 张图片');
      return;
    }
    const that = this;
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success(res) {
        const paths = (res.tempFiles || []).map((f) => f.tempFilePath).filter(Boolean);
        if (!paths.length) return;
        const images = that.data.images.concat(paths).slice(0, 3);
        that.setData({ images });
      },
      fail(err) {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') !== -1) return;
        that.showToast('选择图片失败');
      },
    });
  },

  onRemoveImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images.slice();
    images.splice(index, 1);
    this.setData({ images });
  },

  // 提交：真调 submitFeedback
  onSubmit() {
    if (this.data.submitting) return;

    const picked = this.data.types.filter((t) => this.data.selectedTypes[t.key]);
    if (!picked.length) {
      this.showToast('请选择反馈类型');
      return;
    }
    if (!this.data.content.trim()) {
      this.showToast('请填写详细描述');
      return;
    }

    this.setData({ submitting: true });
    const that = this;
    const payload = {
      types: picked.map((t) => t.key),
      content: this.data.content.trim(),
      contact: this.data.contact.trim(),
    };
    submitFeedback(payload)
      .then(function () {
        that.setData({
          submitting: false,
          toast: { visible: true, type: 'center', text: '已收到，感谢反馈' },
        });
      })
      .catch(function () {
        that.setData({ submitting: false });
        that.showToast('提交失败，请稍后重试');
      });
  },

  onToastClose() {
    this.setData({ 'toast.visible': false });
    // 中心提示关闭后返回上一页
    if (this.data.toast.text === '已收到，感谢反馈') {
      wx.navigateBack({
        delta: 1,
        fail() {
          wx.switchTab({ url: '/pages/me/index' });
        },
      });
    }
  },

  showToast(text) {
    this.setData({ toast: { visible: true, type: 'center', text: text } });
  },
});
