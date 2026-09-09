const { getVipStatus } = require('../../utils/api');

Page({
  data: {
    isVip: false,
    planName: '',
    selectedPlan: 'yearly',
    activating: false,
    benefits: [
      { icon: '云', title: '多设备云同步', desc: '手机平板换着用，数据始终一致' },
      { icon: '筛', title: '高级筛选', desc: '按忌口、口味、时长多维度找菜' },
      { icon: '净', title: '去除广告', desc: '清清爽爽看菜谱，不再被打断' },
      { icon: '周', title: '智能周菜单', desc: '一键排好一周吃什么，省心' },
      { icon: '家', title: '成员无限共享', desc: '爸妈伴侣孩子，想加几个加几个' },
      { icon: '藏', title: '菜谱无限收藏', desc: '看到喜欢的随手存，不限数量' }
    ],
    compareRows: [
      { feat: '家庭云同步', free: false, vip: true },
      { feat: '菜谱收藏', freeText: '20 道', vip: true },
      { feat: '高级筛选', free: false, vip: true },
      { feat: '智能周菜单', free: false, vip: true },
      { feat: '去除广告', free: false, vip: true }
    ],
    plans: [
      { key: 'monthly', name: '月卡', price: '¥19.9', per: '每月，随时可停', recommend: false },
      { key: 'yearly', name: '年卡', price: '¥99', unit: '/年', per: '折合每月 ¥8.3', save: '省 83%', recommend: true }
    ],
    familyAvatars: [
      { initial: '张', tone: '#e8472a' },
      { initial: '妈', tone: '#b08949' },
      { initial: '爸', tone: '#2f4a3a' }
    ],
    familyMore: '+2',
    navPad: '51px'
  },

  onLoad() {
    try {
      const mb = wx.getMenuButtonBoundingClientRect();
      if (mb && mb.top) this.setData({ navPad: mb.top + 'px' });
    } catch (e) {}
  },

  onShow() {
    this.loadVipStatus();
  },

  async loadVipStatus() {
    try {
      const status = await getVipStatus();
      this.applyStatus(status);
    } catch (err) {
      console.error('vip status load failed', err);
      wx.showToast({ title: '会员状态加载失败，当前为演示数据', icon: 'none' });
    }
  },

  selectPlan(e) {
    this.setData({ selectedPlan: e.currentTarget.dataset.plan });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/me/index' });
    }
  },

  // 开通走真实订单流程（checkout → 支付 → 回调开通）。
  // 原先直接调 /api/vip/activate 免费开通，该遗留端点已下线（资损漏洞）。
  goCheckout() {
    if (this.data.activating) return;
    this.setData({ activating: true });
    const planKey = this.data.selectedPlan === 'monthly' ? 'monthly' : 'yearly';
    const amount = planKey === 'monthly' ? '19.90' : '99.00';
    const planName = planKey === 'monthly' ? '家庭同步月卡' : '家庭同步年卡';
    wx.navigateTo({
      url: `/pkg-extra/payment/checkout/index?plan=${planKey}&planName=${encodeURIComponent(planName)}&amount=${amount}`,
      complete: () => this.setData({ activating: false })
    });
  },

  applyStatus(status) {
    const safe = status || {};
    this.setData({
      isVip: !!safe.vip,
      planName: safe.planName || ''
    });
  }
});
