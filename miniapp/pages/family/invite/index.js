const { getFamilyInviteCode } = require('../../../utils/api');

// 生成二维码视觉点阵，扫码内容以分享路径中的邀请码为准。
function buildQrCells(seed) {
  const cells = [];
  const size = 21; // 21x21 网格
  const step = 276 / size; // 与 .fi-qr 尺寸对齐（rpx）
  let s = 0;
  for (let i = 0; i < String(seed).length; i++) {
    s += String(seed).charCodeAt(i) * (i + 7);
  }
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const isFinder = (r, c) => {
    const inBox = (br, bc) => r >= br && r < br + 7 && c >= bc && c < bc + 7;
    return inBox(0, 0) || inBox(0, size - 7) || inBox(size - 7, 0);
  };
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isFinder(r, c)) {
        // 定位角：外框 + 内点
        const onEdge = (br, bc) =>
          r === br || r === br + 6 || c === bc || c === bc + 6;
        const core = (br, bc) =>
          r >= br + 2 && r <= br + 4 && c >= bc + 2 && c <= bc + 4;
        const box = [
          [0, 0],
          [0, size - 7],
          [size - 7, 0]
        ].find(([br, bc]) => r >= br && r < br + 7 && c >= bc && c < bc + 7);
        if (box && (onEdge(box[0], box[1]) || core(box[0], box[1]))) {
          cells.push({ x: Math.round(c * step), y: Math.round(r * step) });
        }
      } else if (rand() > 0.55) {
        cells.push({ x: Math.round(c * step), y: Math.round(r * step) });
      }
    }
  }
  return cells;
}

Page({
  data: {
    statusBarHeight: 0,
    inviteCode: '836295',
    codeDigits: ['8', '3', '6', '2', '9', '5'],
    familyName: '',
    qrCells: [],
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

    this.setData({ qrCells: buildQrCells(this.data.inviteCode) });
    this.loadFamily();
  },

  async loadFamily() {
    try {
      const info = await getFamilyInviteCode();
      if (info && info.inviteCode) {
        this.setData({
          inviteCode: info.inviteCode,
          codeDigits: String(info.inviteCode).split(''),
          familyName: info.familyName || '',
          qrCells: buildQrCells(info.inviteCode)
        });
      }
    } catch (e) {
      this.showToast('邀请码加载失败，请稍后重试');
    }
  },

  // 复制邀请码
  onCopyCode() {
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
    const text = `加入「${this.data.familyName || '我们家'}」一起点菜，邀请码 ${this.data.inviteCode}`;
    wx.setClipboardData({
      data: text,
      success: () => this.showToast('邀请信息已复制'),
      fail: () => this.showToast('复制失败，请重试')
    });
  },

  // 分享转发（配合 open-type="share" 按钮）
  onShareAppMessage() {
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
