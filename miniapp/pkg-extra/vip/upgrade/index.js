const { getVipStatus } = require('../../../utils/api');
const { loadPlans, FALLBACK, trimYuan } = require('../../../utils/plans');

const MONTHS_OF_YEAR = 12;

// 后端套餐 → 本页展示结构（价格/折数由后端金额算出，不写死营销数字）
function toViewPlan(plan, unitMonth) {
  const priceNumber = plan.priceNumber;
  const originalNumber = Number(plan.original);
  const hasOriginal = isFinite(originalNumber) && originalNumber > priceNumber;
  // 折合月价：年卡按 12 个月摊，月卡本身即月价
  const perMonth = priceNumber ? priceNumber / unitMonth : 0;
  return {
    planCode: plan.planCode,
    planName: plan.planName,
    price: trimYuan(plan.priceFull),
    priceFull: plan.priceFull,
    original: hasOriginal ? plan.original : '',
    discount: hasOriginal ? (originalNumber - priceNumber).toFixed(2) : '',
    off: hasOriginal ? String(Math.round((priceNumber / originalNumber) * 100) / 10) : '',
    // —— 卡片与价格明细的展示派生值（模板里不再出现任何价格数字）——
    perMonth: perMonth ? String(Math.round(perMonth * 10) / 10) : '',
    unit: unitMonth === MONTHS_OF_YEAR ? '/年' : '/月',
    // 促销句整体在 js 拼：写进模板要靠三元表达式拼字符串，难读且易漂
    offText: hasOriginal
      ? `已为你省下 ¥${(originalNumber - priceNumber).toFixed(2)}，相当于 ${Math.round((priceNumber / originalNumber) * 100) / 10} 折`
      : ''
  };
}

function fallbackPlanMap() {
  return {
    yearly: toViewPlan(FALLBACK.yearly, MONTHS_OF_YEAR),
    monthly: toViewPlan(FALLBACK.monthly, 1)
  };
}

Page({
  data: {
    statusBarHeight: 0,
    isVip: false,
    planName: '',
    selectedPlan: 'yearly',
    // 两张套餐卡同屏渲染，各自要取自己的价格：故按 key 存一份视图模型
    plan: toViewPlan(FALLBACK.yearly, MONTHS_OF_YEAR),
    planMap: fallbackPlanMap(),
    benefits: [
      { icon: '家', title: '最多 8 位家人共享', desc: '邀请全家加入，菜单清单实时同步' },
      { icon: '藏', title: '无限收藏菜谱', desc: '家庭菜谱库不限数量，随时回看' },
      { icon: '买', title: '一键生成买菜清单', desc: '按菜单自动合并食材，去重算量' },
      { icon: '荐', title: '智能口味推荐', desc: '记住全家偏好，每天推荐合口味的菜' }
    ],
    activating: false
  },

  onLoad() {
    const features = require('../../../utils/features');
    if (!features.PAYMENT) { features.leaveToHome(); return; }
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
    this.loadPlanCatalog();
    this.loadVipStatus();
  },

  // 套餐价格走后端权威目录（/api/payment/plans），失败回退本地默认
  async loadPlanCatalog() {
    const plans = await loadPlans();
    const planMap = {
      yearly: toViewPlan(plans.yearly, MONTHS_OF_YEAR),
      monthly: toViewPlan(plans.monthly, 1)
    };
    this.setData({ planMap, plan: planMap[this.data.selectedPlan] || planMap.yearly });
  },

  onShow() {
    // 大字模式档位：onShow 读取，设置页改完回来立即生效
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
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
          const base = this.data.benefits[i] || { icon: '荐', desc: '' };
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
    const map = this.data.planMap || fallbackPlanMap();
    if (!map[key] || key === this.data.selectedPlan) return;
    this.setData({ selectedPlan: key, plan: map[key] });
  },

  goCheckout() {
    if (this.data.activating) return;
    this.setData({ activating: true });
    const plan = this.data.plan;
    wx.navigateTo({
      url: `/pkg-extra/payment/checkout/index?plan=${this.data.selectedPlan}&planName=${encodeURIComponent(plan.planName)}&amount=${plan.priceFull}`,
      fail: () => {
        // 收银台不可用时不静默开通（遗留 /api/vip/activate 已下线），明确提示
        this.setData({ activating: false });
        wx.showToast({ title: '收银台暂不可用，请稍后再试', icon: 'none' });
      },
      complete: () => {
        this.setData({ activating: false });
      }
    });
  }
});
