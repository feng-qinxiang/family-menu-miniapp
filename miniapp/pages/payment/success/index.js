// pages/payment/success · 开通成功页
// orderId 由 checkout 传入，查真实订单流水展示
const api = require('../../../utils/api');

Page({
  data: {
    loading: true,
    planName: '家庭云同步年卡',
    payAmount: '',
    orderId: '',
    perks: [
      '最多 8 位家人共享',
      '无限收藏菜谱',
      '一键生成买菜清单',
      '智能口味推荐',
    ],
    order: {
      orderNo: '',
      payAmount: '',
      expireAt: '',
    },
    toastVisible: false,
    toastText: '',
  },

  async onLoad(query) {
    const orderId = (query && query.orderId) || '';
    const amount  = (query && query.amount)  || '';
    const planName = (query && query.planName) ? decodeURIComponent(query.planName) : this.data.planName;
    this.setData({ orderId, planName });

    // 尝试从真实订单列表找到对应订单
    try {
      const orders = await api.getPaymentOrders();
      const matched = Array.isArray(orders) && orderId
        ? orders.find((o) => String(o.orderId) === String(orderId))
        : null;
      const order = {
        orderNo: (matched && matched.outTradeNo) || orderId || '',
        payAmount: amount ? `¥${Number(amount).toFixed(2)}` : (matched && matched.amountFen ? `¥${(matched.amountFen / 100).toFixed(2)}` : ''),
        expireAt: (matched && matched.expireAt) ? String(matched.expireAt).slice(0, 10).replace(/-/g, '.') : '',
      };
      this.setData({ order, loading: false });
      // 刷新全局 VIP 状态
      const app = getApp();
      if (app && typeof app.refreshVipStatus === 'function') app.refreshVipStatus();
    } catch (err) {
      console.error('[success] load order failed', err);
      this.setData({
        order: { orderNo: orderId || '', payAmount: amount ? `¥${amount}` : '', expireAt: '' },
        loading: false,
      });
    }
  },

  onStart() {
    wx.switchTab({
      url: '/pages/home/index',
      fail: () => wx.navigateBack({ delta: 1 }),
    });
  },

  onViewOrder() {
    wx.navigateTo({
      url: '/pages/vip/orders/index',
      fail: () => this.setData({ toastVisible: true, toastText: '请在"我的→会员"查看记录' }),
    });
  },

  onInviteFamily() {
    wx.navigateTo({
      url: '/pages/vip/upgrade/index',
      fail: () => this.setData({ toastVisible: true, toastText: '请在"我的→会员"开启共享' }),
    });
  },

  onToastClose() {
    this.setData({ toastVisible: false });
  },
});