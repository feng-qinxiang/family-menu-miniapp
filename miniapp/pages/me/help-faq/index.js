// 帮助中心 · 静态 FAQ 手风琴 + 本地搜索过滤 + 反馈入口
const FAQ_LIST = [
  {
    num: '01',
    question: '怎么邀请家人一起点菜？',
    answer: '在「我的」里打开家庭组，把邀请链接或 8 位邀请码发给家人即可。',
    steps: [
      '进入「我的 → 我的家庭 → 成员管理」',
      '点底部「邀请新成员」，选微信分享或复制邀请码',
      '对方接受后，就能共用同一份菜单',
    ],
  },
  {
    num: '02',
    question: '小红书菜谱怎么导入？',
    answer: '复制小红书笔记链接，在「菜谱 → 导入」里粘贴，自动识别食材与步骤。',
    steps: [],
  },
  {
    num: '03',
    question: '云同步是什么？',
    answer: '开启后，你的菜谱、菜单和家庭组会实时保存在云端，换手机或多人协作也不会丢数据。',
    steps: [],
  },
  {
    num: '04',
    question: '忘记密码怎么办？',
    answer: '本应用用微信一键登录，无需记密码。换设备直接微信授权即可恢复全部数据。',
    steps: [],
  },
  {
    num: '05',
    question: '买菜清单可以分享吗？',
    answer: '当然可以。在「菜单 → 买菜清单」点右上分享，发给去买菜的家人，勾选状态会实时同步。',
    steps: [],
  },
];

Page({
  data: {
    statusBarHeight: 0,
    keyword: '',
    visibleList: [],
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
    // 默认首项展开，与设计稿一致
    const list = FAQ_LIST.map((it, i) => ({ ...it, open: i === 0 }));
    this.setData({ statusBarHeight: sbh, visibleList: list });
  },

  // 手风琴：点击切换展开，同时收起其它项
  onToggle(e) {
    const num = e.currentTarget.dataset.num;
    const visibleList = this.data.visibleList.map((it) => ({
      ...it,
      open: it.num === num ? !it.open : false,
    }));
    this.setData({ visibleList });
  },

  onSearchInput(e) {
    const keyword = (e.detail.value || '').trim();
    this.setData({ keyword });
    this.applyFilter(keyword);
  },

  onSearch(e) {
    const keyword = (e.detail.value || '').trim();
    this.setData({ keyword });
    this.applyFilter(keyword);
  },

  // 本地过滤：匹配问题/答案/步骤，命中首项默认展开
  applyFilter(keyword) {
    const kw = (keyword || '').toLowerCase();
    let matched = FAQ_LIST;
    if (kw) {
      matched = FAQ_LIST.filter((it) => {
        const hay = (it.question + it.answer + (it.steps || []).join('')).toLowerCase();
        return hay.indexOf(kw) >= 0;
      });
    }
    const visibleList = matched.map((it, i) => ({ ...it, open: i === 0 }));
    this.setData({ visibleList });
  },

  onContact() {
    wx.navigateTo({
      url: '/pages/me/feedback/index',
      fail() {
        wx.setClipboardData({
          data: 'support@jiating-dingcai.com',
          success() { wx.showToast({ title: '客服邮箱已复制', icon: 'none' }); },
          fail() { wx.showToast({ title: '请稍后再试', icon: 'none' }); }
        });
      }
    });
  },
});
