// pages/vip/orders · 我的订单（真实订单流水）
const { getPaymentOrders } = require('../../../utils/api');

function fmtDate(value) {
  if (!value) return '';
  return String(value).slice(0, 10).replace(/-/g, '.');
}

function mapOrder(raw) {
  const amountFen = Number(raw.amountFen) || 0;
  const yuan = Math.floor(amountFen / 100);
  const cents = '.' + String(amountFen % 100).padStart(2, '0');
  const planId = raw.planId || '';
  const isPaid = (raw.status || '').toUpperCase() === 'PAID';
  return {
    orderId: raw.orderId,
    orderNo: raw.outTradeNo || String(raw.orderId),
    productName: raw.planName || (planId === 'annual' ? '家庭年卡' : planId === 'monthly' ? '家庭月卡' : '会员'),
    productTag: '全家共享菜单 · 实时同步',
    amount: String(yuan),
    cents,
    startDate: fmtDate(raw.createdAt) || '已开通',
    endDate: fmtDate(raw.expireAt) || '',
    status: isPaid ? 'live' : 'pending',
    statusText: isPaid ? '生效中' : '待支付',
    iconGold: isPaid,
  };
}

Page({
  data: {
    statusBarHeight: 0,
    loading: true,
    orders: [],
    totalCount: 0,
    totalSpent: '0',
    totalCents: '.00'
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
    this.loadOrders();
  },

  async loadOrders() {
    this.setData({ loading: true });
    let orders = [];
    try {
      const raw = await getPaymentOrders();
      orders = Array.isArray(raw) ? raw.map(mapOrder) : [];
    } catch (err) {
      console.error('orders load failed', err);
      orders = [];
    }
    const totalFen = orders.reduce((sum, o) => {
      const fen = (parseInt(o.amount, 10) || 0) * 100 + parseInt((o.cents || '.00').slice(1), 10);
      return sum + fen;
    }, 0);
    const totalYuan = Math.floor(totalFen / 100);
    const totalCents = '.' + String(totalFen % 100).padStart(2, '0');
    this.setData({ orders, totalCount: orders.length, totalSpent: String(totalYuan), totalCents, loading: false });
  },

  // 续费 → 跳转 vip/upgrade
  onRenew() {
    wx.navigateTo({
      url: '/pages/vip/upgrade/index',
      fail() {
        wx.navigateTo({
          url: '/pages/vip/index',
          fail() {
            wx.showToast({ title: '请从会员页开通', icon: 'none' });
          }
        });
      }
    });
  },

  // 空态 CTA：立即开通
  onActivate() {
    this.onRenew();
  }
});
