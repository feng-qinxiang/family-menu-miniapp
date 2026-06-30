// payment/checkout · 会员开通确认页。真实支付暂不接入，确认后调用 activateVip。
const api = require('../../../utils/api');

const FALLBACK_COVER = 'hongshao-pork.jpg';

Page({
  data: {
    merchantName: '家庭点菜',
    productName: '家庭云同步年卡',
    coverImage: FALLBACK_COVER,
    payAmount: '66.00',
    originAmount: '68.00',
    payMethod: { name: '本地确认', balance: '无需真实扣款' },
    bankText: '生产支付待配置',
    couponText: '当前为开发开通流程',
    paying: false,
    toast: { visible: false, type: 'center', text: '' }
  },

  onLoad(query) {
    this.applyQuery(query || {});
    this.loadOrderContext();
  },

  applyQuery(query) {
    const patch = {};
    if (query.product) patch.productName = decodeURIComponent(query.product);
    if (query.planName) patch.productName = decodeURIComponent(query.planName);
    if (query.amount) {
      const amt = Number(query.amount);
      if (!isNaN(amt) && amt > 0) {
        patch.payAmount = amt.toFixed(2);
        patch.originAmount = (amt + 2).toFixed(2);
      }
    }
    if (query.cover) patch.coverImage = decodeURIComponent(query.cover);
    if (Object.keys(patch).length) this.setData(patch);
  },

  // 拉取当前用户作为商户上下文，失败容错不阻断
  async loadOrderContext() {
    try {
      const status = await api.getVipStatus();
      if (status && status.planName) {
        this.setData({ productName: status.planName });
      }
    } catch (err) {
      console.warn('[checkout] vip status fallback', err);
    }
  },

  onProductTap() {
    this.showToast('家庭云同步年卡 · 全家共享菜谱');
  },

  onPayMethodTap() {
    this.showToast('当前使用开发开通确认');
  },

  onBankTap() {
    this.showToast('真实支付按生产配置接入');
  },

  onCouponTap() {
    this.showToast('本流程不产生真实扣款');
  },

  async onPay() {
    if (this.data.paying) return;
    this.setData({ paying: true });
    wx.showLoading({ title: '开通中', mask: true });
    try {
      const status = await api.activateVip(this.data.productName);
      wx.hideLoading();
      this.setData({ paying: false });
      const planName = encodeURIComponent((status && status.planName) || this.data.productName);
      wx.navigateTo({
        url: `/pages/payment/success/index?amount=${this.data.payAmount}&planName=${planName}`,
        fail: () => {
          this.showToast('会员已开通');
          setTimeout(() => wx.navigateBack({ delta: 1 }), 1200);
        }
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ paying: false });
      this.showToast((err && err.message) || '开通失败，请重试');
    }
  },

  showToast(text) {
    this.setData({ toast: { visible: true, type: 'center', text } });
  },

  onToastClose() {
    this.setData({ 'toast.visible': false });
  }
});
