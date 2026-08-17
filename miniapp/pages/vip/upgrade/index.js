const { getVipStatus, activateVip } = require('../../../utils/api');

const PLAN_MAP = {
  yearly: { planCode: 'annual', planName: '家庭年卡', price: '99', priceFull: '99.00', original: '138.00', discount: '39.00', off: '7.2' },
  monthly: { planCode: 'monthly', planName: '家庭月卡', price: '19.9', priceFull: '19.90', original: '', discount: '', off: '' }
};

Page({
  data: {
    statusBarHeight: 0,
    isVip: false,
    planName: '',
    selectedPlan: 'yearly',
    plan: PLAN_MAP.yearly,
    benefits: [
      { icon: '家', title: '最多 8 位家人共享', desc: '邀请全家加入，菜单清单实时同步' },
      { icon: '藏', title: '无限收藏菜谱', desc: '家庭菜谱库不限数量，随时回看' },
      { icon: '买', title: '一键生成买菜清单', desc: '按菜单自动合并食材，去重算量' },
      { icon: '荐', title: '智能口味推荐', desc: '记住全家偏好，每天推荐合口味的菜' }
    ],
    activating: false
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
    this.loadVipStatus();
  },

  onShow() {
    this.loadVipStatus();
  },

  async loadVipStatus() {
    try {
      const status = await getVipStatus();
      const safe = status || {};
      this.setData({
        isVip: !!safe.vip,
        planName: safe.planName || ''
      });
      if (Array.isArray(safe.benefits) && safe.benefits.length) {
        const mapped = safe.benefits.map((b, i) => {
          const base = this.data.benefits[i] || { icon: '✨', desc: '' };
          if (typeof b === 'string') return { icon: base.icon, title: b, desc: base.desc };
          return {
            icon: b.icon || base.icon,
            title: b.title || b.name || base.title,
            desc: b.desc || b.description || base.desc
          };
        });
        this.setData({ benefits: mapped });
      }
    } catch (err) {
      console.error('vip status load failed', err);
      // 状态拉取失败不再静默：明确告知，避免把"未知"当"未开通"
      wx.showToast({ title: '会员状态加载失败，请重试', icon: 'none' });
    }
  },

  selectPlan(e) {
    const key = e.currentTarget.dataset.plan;
    if (!PLAN_MAP[key] || key === this.data.selectedPlan) return;
    this.setData({ selectedPlan: key, plan: PLAN_MAP[key] });
  },

  goCheckout() {
    if (this.data.activating) return;
    this.setData({ activating: true });
    const plan = this.data.plan;
    wx.navigateTo({
      url: `/pages/payment/checkout/index?plan=${this.data.selectedPlan}&planName=${encodeURIComponent(plan.planName)}&amount=${plan.priceFull}`,
      fail: () => {
        this.demoActivate();
      },
      complete: () => {
        this.setData({ activating: false });
      }
    });
  },

  async demoActivate() {
    try {
      const status = await activateVip(this.data.plan.planCode);
      const safe = status || {};
      const app = getApp();
      if (app && app.globalData) {
        app.globalData.isVip = !!safe.vip;
      }
      wx.showToast({ title: safe.vip ? '已开通' : '已记录', icon: 'success' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 800);
    } catch (err) {
      console.error('vip activate failed', err);
      wx.showToast({
        title: (err && err.message) ? err.message : '开通失败',
        icon: 'none'
      });
    }
  }
});
