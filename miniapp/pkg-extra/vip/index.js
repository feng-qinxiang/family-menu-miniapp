const { getVipStatus, getFamilyProfile } = require('../../utils/api');
const { loadPlans, FALLBACK } = require('../../utils/plans');

// _plans 尚未返回时的同步兜底（仅本地默认值，不发起请求）
function loadPlansFallback() {
  return FALLBACK;
}

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
    // 套餐展示由 utils/plans.js 统一注入（后端权威价），此处仅占位避免首屏空白
    plans: [
      { key: 'monthly', name: '月卡', price: '¥--', per: '每月，随时可停', recommend: false },
      { key: 'yearly', name: '年卡', price: '¥--', unit: '/年', per: '', save: '', recommend: true }
    ],
    // 真实家庭成员头像（最多 3 个 + 剩余人数）
    familyAvatars: [],
    familyMore: '',
    navPad: '51px'
  },

  onLoad() {
    try {
      const mb = wx.getMenuButtonBoundingClientRect();
      if (mb && mb.top) this.setData({ navPad: mb.top + 'px' });
    } catch (e) {}
    this.loadPlans();
    this.loadFamily();
  },

  // 套餐与价格一律来自后端（改价只改后端 PlanCatalog）
  async loadPlans() {
    const plans = await loadPlans();
    const monthly = plans.monthly;
    const yearly = plans.yearly;
    this._plans = plans;
    // 年卡折合月价与省幅：由后端价格算出，避免写死营销数字
    const monthsOfYear = 12;
    const perMonth = yearly.priceNumber ? (yearly.priceNumber / monthsOfYear) : 0;
    const saveRate = (yearly.original && yearly.priceNumber)
      ? Math.round((1 - yearly.priceNumber / Number(yearly.original)) * 100)
      : 0;
    this.setData({
      plans: [
        {
          key: 'monthly',
          name: '月卡',
          price: '¥' + monthly.priceNumber,
          per: '每月，随时可停',
          recommend: false
        },
        {
          key: 'yearly',
          name: '年卡',
          price: '¥' + yearly.priceNumber,
          unit: '/年',
          per: perMonth ? `折合每月 ¥${Math.round(perMonth * 10) / 10}` : '',
          save: saveRate > 0 ? `省 ${saveRate}%` : '',
          recommend: true
        }
      ]
    });
  },

  // 家人头像用真实成员（此前写死「张/妈/爸 +2」）
  async loadFamily() {
    try {
      const family = await getFamilyProfile();
      const members = (family && Array.isArray(family.members)) ? family.members : [];
      const tones = ['#e8472a', '#b08949', '#2f4a3a', '#3a2e23'];
      const shown = members.slice(0, 3).map((m, i) => ({
        initial: String(m.nickname || '家').slice(0, 1),
        tone: tones[i % tones.length]
      }));
      const rest = members.length - shown.length;
      this.setData({
        familyAvatars: shown,
        familyMore: rest > 0 ? `+${rest}` : ''
      });
    } catch (e) {
      // 拿不到家庭成员时保持空数组（不展示假头像）
    }
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
      wx.showToast({ title: '会员状态加载失败，请下拉重试', icon: 'none' });
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
    // 套餐名与金额取后端权威值（loadPlans 未回来时由 utils/plans 本地兜底）
    const plans = this._plans || loadPlansFallback();
    const plan = plans[planKey] || plans.yearly;
    wx.navigateTo({
      url: `/pkg-extra/payment/checkout/index?plan=${planKey}&planName=${encodeURIComponent(plan.planName)}&amount=${plan.priceFull}`,
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
