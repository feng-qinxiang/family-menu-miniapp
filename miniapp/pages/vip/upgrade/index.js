const { getVipStatus, activateVip } = require('../../../utils/api');

const PLAN_MAP = {
  yearly: { planName: '家庭年卡', price: '68', priceFull: '68.00', original: '118.00', discount: '50.00', off: '5.8' },
  monthly: { planName: '家庭月卡', price: '9.9', priceFull: '9.90', original: '', discount: '', off: '' }
};

Page({
  data: {
    statusBarHeight: 0,
    isVip: false,
    planName: '',
    selectedPlan: 'yearly',
    plan: PLAN_MAP.yearly,
    benefits: [
      { icon: '👨‍👩‍👧‍👦', title: '最多 8 位家人共享', desc: '邀请全家加入，菜单清单实时同步' },
      { icon: '📖', title: '无限收藏菜谱', desc: '家庭菜谱库不限数量，随时回看' },
      { icon: '🛒', title: '一键生成买菜清单', desc: '按菜单自动合并食材，去重算量' },
      { icon: '✨', title: '智能口味推荐', desc: '记住全家偏好，每天推荐合口味的菜' }
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
      const status = await activateVip(this.data.plan.planName);
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
