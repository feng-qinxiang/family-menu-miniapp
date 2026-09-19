// 意见反馈页 · 二级页
// 真实接口：submitFeedback（POST /api/feedback，支持 images 字段）。游客直进，不拦登录。
const { submitFeedback, getMyFeedbacks } = require('../../../utils/api');
const { uploadFile } = require('../../../utils/upload');
const { ensurePrivacy } = require('../../../utils/privacy');

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
    // 我的历史反馈（含运营回复）——让"提交出去的话"有下文
    history: [],
    historyLoading: true,
    historyFailed: false,
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
    this.loadHistory();
  },

  onShow() {
    // 从别处回来（如设置页）也刷新一次
    if (this._hasLoaded) this.loadHistory();
  },

  // 历史反馈：OPEN=处理中，其余（RESOLVED/REJECTED 等）=已回复
  async loadHistory() {
    try {
      const list = await getMyFeedbacks();
      const history = (list || []).map((it) => ({
        ...it,
        replied: it.status !== 'OPEN',
        replyText: it.reply || '',
        timeText: (it.handledAt || it.createdAt || '').slice(0, 10)
      }));
      this.setData({ history, historyLoading: false, historyFailed: false });
    } catch (err) {
      // 失败不能说成「还没有反馈记录」——那是另一回事，用户会以为自己的反馈被删了
      this.setData({ history: [], historyLoading: false, historyFailed: true });
    }
    this._hasLoaded = true;
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
    ensurePrivacy(() => {
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
    });
  },

  onRemoveImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images.slice();
    images.splice(index, 1);
    this.setData({ images });
  },

  // 提交：图片先真上传，URL 随 payload 一起落库
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
    const finish = (images) => {
      const payload = {
        types: picked.map((t) => t.key),
        content: that.data.content.trim(),
        contact: that.data.contact.trim(),
        images,
      };
      return submitFeedback(payload)
        .then(function () {
          that.setData({
            submitting: false,
            toast: { visible: true, type: 'center', text: '已收到，感谢反馈' },
          });
          // 提交成功后留在本页刷新历史，用户能看到自己刚提的那条
          that.loadHistory();
        })
        .catch(function () {
          that.setData({ submitting: false });
          that.showToast('提交失败，请稍后重试');
        });
    };
    // 无图直接提交；有图先上传（失败项返回空串，过滤掉并提示）
    if (!this.data.images.length) {
      finish([]);
      return;
    }
    wx.showLoading({ title: '上传图片中', mask: true });
    Promise.all(this.data.images.map((p) => uploadFile(p)))
      .then((urls) => {
        wx.hideLoading();
        const ok = urls.filter(Boolean);
        if (urls.length && !ok.length) {
          that.showToast('图片上传失败，已不带图提交');
        }
        return finish(ok);
      })
      .catch(() => {
        wx.hideLoading();
        that.setData({ submitting: false });
        that.showToast('图片上传失败，请重试');
      });
  },

  onToastClose() {
    this.setData({ 'toast.visible': false });
    // 提交成功留在本页（历史列表已刷新，能看到刚提交的）；其余错误提示不跳转
  },

  showToast(text) {
    this.setData({ toast: { visible: true, type: 'center', text: text } });
  },
});
