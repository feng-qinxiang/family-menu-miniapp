const { getFamilyInviteCode } = require('../../../utils/api');

Page({
  data: {
    statusBarHeight: 0,
    inviteCode: '',           // 只展示后端下发的真实码；拉取失败为空
    codeDigits: ['', '', '', '', '', '', '', ''],
    codeFailed: false,
    familyName: '',
    toast: { visible: false, type: 'center', text: '' }
  },

  onLoad() {
    // 状态栏高度，供 nav-bar 适配
    try {
      const info =
        typeof wx.getWindowInfo === 'function'
          ? wx.getWindowInfo()
          : wx.getSystemInfoSync();
      this.setData({ statusBarHeight: (info && info.statusBarHeight) || 0 });
    } catch (e) {
      this.setData({ statusBarHeight: 0 });
    }

    this.loadFamily();
  },

  async loadFamily() {
    this.setData({ codeFailed: false });
    try {
      const info = await getFamilyInviteCode();
      if (info && info.inviteCode) {
        this.setData({
          inviteCode: info.inviteCode,
          codeDigits: String(info.inviteCode).split(''),
          familyName: info.familyName || '',
          codeFailed: false
        });
      } else {
        this.setData({ codeFailed: true });
        this.showToast('未拿到邀请码，请重试');
      }
    } catch (e) {
      this.setData({ inviteCode: '', codeDigits: ['', '', '', '', '', '', '', ''], codeFailed: true });
      this.showToast('邀请码加载失败，请重试');
    }
  },

  // 复制邀请码（无真实码时禁止复制，引导重试）
  onCopyCode() {
    if (!this.data.inviteCode) {
      this.showToast('邀请码还没拿到，请先重试');
      return;
    }
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => {
        // 系统已弹复制提示，这里补一个轻量 toast
        this.showToast('邀请码已复制');
      },
      fail: () => {
        this.showToast('复制失败，请重试');
      }
    });
  },

  onSaveImage() {
    if (!this.data.inviteCode) {
      this.showToast('邀请码还没拿到，请先重试');
      return;
    }
    const text = `加入「${this.data.familyName || '我们家'}」一起点菜，邀请码 ${this.data.inviteCode}`;
    wx.setClipboardData({
      data: text,
      success: () => this.showToast('邀请信息已复制'),
      fail: () => this.showToast('复制失败，请重试')
    });
  },

  // 分享转发（配合 open-type="share" 按钮）；无真实码时分享首页，不携带假码
  onShareAppMessage() {
    if (!this.data.inviteCode) {
      return { title: '家庭点菜 · 今天吃什么一起定', path: '/pages/home/index' };
    }
    return {
      title: `加入「${this.data.familyName || '我们家'}」一起点菜，邀请码 ${this.data.inviteCode}`,
      path: `/pages/family/join/index?code=${this.data.inviteCode}`
    };
  },

  showToast(text) {
    this.setData({ toast: { visible: true, type: 'center', text } });
  },

  onToastClose() {
    this.setData({ 'toast.visible': false });
  }
});
