// 关于页 · 静态展示页（游客直进，无强制登录）
Page({
  data: {
    statusBarHeight: 0,
    version: 'v1.0.0',
    year: 2026,
    slogan: '一家人围着饭桌点菜，把每顿家常饭都吃成想念的味道。',
    stats: [
      { value: '12', unit: '万', label: '家庭在用' },
      { value: '86', unit: '万', label: '沉淀菜谱' },
      { value: '1.3', unit: '亿', label: '累计点菜' },
    ],
    story: [
      '这句话，每个家庭一天要问好几遍。问的人累，答的人烦，最后还是老三样。',
      '我们想把全家的口味、忌口、拿手菜都存在一处，让点菜变成一件一起做的小事——奶奶不吃辣会提醒，爸爸爱吃的会置顶，点完菜买什么也帮你算好。饭桌的事，一家人说了算。',
    ],
    moreList: [
      { key: 'update', name: '检查更新', desc: '已是最新版本' },
      { key: 'agreement', name: '用户协议', desc: '使用条款与服务约定' },
      { key: 'privacy', name: '隐私政策', desc: '我们如何保护你的数据' },
      { key: 'rate', name: '给个好评', desc: '喜欢就去应用市场夸夸我们' },
    ],
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
    this.setData({ statusBarHeight: sbh, year: new Date().getFullYear() });
  },

  onMoreTap(e) {
    const key = e.currentTarget.dataset.key;
    const tipMap = {
      update: '已是最新版本',
      agreement: '用户协议（演示）',
      privacy: '隐私政策（演示）',
      rate: '感谢支持，去应用市场夸夸我们吧',
    };
    wx.showToast({
      title: tipMap[key] || '功能演示中',
      icon: 'none',
    });
  },
});
