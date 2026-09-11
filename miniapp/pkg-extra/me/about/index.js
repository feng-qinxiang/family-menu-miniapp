// 关于页 · 静态展示页（游客直进，无强制登录）
Page({
  data: {
    statusBarHeight: 0,
    version: 'v1.0.0',
    year: 2026,
    slogan: '一家人围着饭桌点菜，把每顿家常饭都吃成想念的味道。',
    // 产品能力事实（勿写虚构运营数据，审核会按虚假宣传驳回）
    stats: [
      { value: '8', unit: '人', label: '全家共享菜单' },
      { value: '7', unit: '天', label: '周菜单计划' },
      { value: '1', unit: '键', label: '生成买菜清单' },
    ],
    story: [
      '这句话，每个家庭一天要问好几遍。问的人累，答的人烦，最后还是老三样。',
      '我们想把全家的口味、忌口、拿手菜都存在一处，让点菜变成一件一起做的小事——奶奶不吃辣会提醒，爸爸爱吃的会置顶，点完菜买什么也帮你算好。饭桌的事，一家人说了算。',
    ],
    moreList: [
      { key: 'update', name: '检查更新', desc: '查看是否有新版本' },
      { key: 'agreement', name: '用户协议', desc: '使用条款与服务约定' },
      { key: 'privacy', name: '隐私政策', desc: '我们如何保护你的数据' },
      { key: 'rate', name: '给个好评', desc: '喜欢就分享给更多家庭' },
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
    if (key === 'agreement') {
      wx.navigateTo({ url: '/pkg-extra/legal/terms/index' });
      return;
    }
    if (key === 'privacy') {
      wx.navigateTo({ url: '/pkg-extra/legal/privacy/index' });
      return;
    }
    if (key === 'rate') {
      // 小程序没有应用市场评分，引导用「分享」表达喜欢
      wx.showModal({
        title: '给个好评',
        content: '喜欢这道菜谱助手的话，点右上角「···」把它分享给家人朋友，就是对我们最好的鼓励。',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }
    // update：走微信 UpdateManager 真实检查
    if (typeof wx.getUpdateManager !== 'function') {
      wx.showToast({ title: '当前版本已是最新', icon: 'none' });
      return;
    }
    const um = wx.getUpdateManager();
    let settled = false;
    const done = (text) => {
      if (settled) return;
      settled = true;
      wx.showToast({ title: text, icon: 'none' });
    };
    um.onCheckForUpdate((res) => {
      done(res && res.hasUpdate ? '发现新版本，正在下载' : '当前已是最新版本');
    });
    um.onUpdateReady(() => {
      wx.showModal({
        title: '更新就绪',
        content: '新版本已下载完成，重启小程序即可生效。',
        confirmText: '立即重启',
        cancelText: '稍后',
        success: (r) => { if (r.confirm) um.applyUpdate(); }
      });
    });
    um.onUpdateFailed(() => done('更新检查失败，请稍后再试'));
    // onCheckForUpdate 在部分基础库不回调，3 秒兜底
    setTimeout(() => done('当前已是最新版本'), 3000);
  },
});
