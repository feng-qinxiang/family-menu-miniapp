// pages/payment/success · 开通成功页
// orderId 由 checkout 传入，查真实订单流水展示
const api = require('../../../utils/api');

// 后端 OrderView 无 expireAt，到期日由 paidAt/createdAt + durationDays 推算
function expiryFromOrder(raw) {
  const base = raw.paidAt || raw.createdAt;
  const days = Number(raw.durationDays) || 0;
  if (!base || !days) return '';
  const t = new Date(String(base).replace(/-/g, '/')).getTime();
  if (Number.isNaN(t)) return '';
  const d = new Date(t + days * 86400000);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${m}.${day}`;
}

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
  // 大字模式档位：进页读取（设置页改完回来重进生效）
  let fontScale = 'normal';
  try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
  if (fontScale !== this.data.fontScale) this.setData({ fontScale });
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
        // OrderView 无 expireAt：到期日 = 支付时间 + durationDays
        expireAt: matched ? expiryFromOrder(matched) : '',
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
      url: '/pkg-extra/vip/orders/index',
      fail: () => this.setData({ toastVisible: true, toastText: '请在"我的→会员"查看记录' }),
    });
  },

  onInviteFamily() {
    wx.navigateTo({
      url: '/pkg-extra/vip/upgrade/index',
      fail: () => this.setData({ toastVisible: true, toastText: '请在"我的→会员"开启共享' }),
    });
  },

  onToastClose() {
    this.setData({ toastVisible: false });
  },
});