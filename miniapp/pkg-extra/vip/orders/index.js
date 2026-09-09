// pages/vip/orders · 我的订单（真实订单流水）
const { getPaymentOrders } = require('../../../utils/api');

function fmtDate(value) {
  if (!value) return '';
  return String(value).slice(0, 10).replace(/-/g, '.');
}

// 后端 OrderView 没有 expireAt，到期日 = 支付时间 + 套餐时长
function expiryFrom(raw) {
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

function mapOrder(raw) {
  const amountFen = Number(raw.amountFen) || 0;
  const yuan = Math.floor(amountFen / 100);
  const cents = '.' + String(amountFen % 100).padStart(2, '0');
  // 后端字段是 planCode（不是 planId）
  const planCode = raw.planCode || '';
  const isPaid = (raw.status || '').toUpperCase() === 'PAID';
  return {
    orderId: raw.orderId,
    orderNo: raw.outTradeNo || String(raw.orderId),
    productName: raw.planName || (planCode === 'annual' ? '家庭年卡' : planCode === 'monthly' ? '家庭月卡' : '会员'),
    productTag: '全家共享菜单 · 实时同步',
    amount: String(yuan),
    cents,
    startDate: fmtDate(raw.createdAt) || '已开通',
    endDate: expiryFrom(raw),
    status: isPaid ? 'live' : 'pending',
    statusText: isPaid ? '生效中' : '待支付',
    iconGold: isPaid,
    // 内联 SVG data-uri 的描边色（URL 编码）。原先写在 wxml 里的 \" 转义
    // 会被预览/上传编译器判为非法字符（模拟器编译宽松未暴露），故移到 js 侧算好
    iconColor: isPaid ? '%23b08949' : '%23e8472a',
  };
}

Page({
  data: {
    statusBarHeight: 0,
    loading: true,
    loadError: false,
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
    this.setData({ loading: true, loadError: false });
    let orders = [];
    try {
      const raw = await getPaymentOrders();
      orders = raw.map(mapOrder);
    } catch (err) {
      console.error('orders load failed', err);
      // 加载失败进错误态，不伪装成"0 笔订单"
      this.setData({ orders: [], loading: false, loadError: true });
      return;
    }
    const totalFen = orders.reduce((sum, o) => {
      const fen = (parseInt(o.amount, 10) || 0) * 100 + parseInt((o.cents || '.00').slice(1), 10);
      return sum + fen;
    }, 0);
    const totalYuan = Math.floor(totalFen / 100);
    const totalCents = '.' + String(totalFen % 100).padStart(2, '0');
    this.setData({ orders, totalCount: orders.length, totalSpent: String(totalYuan), totalCents, loading: false });
  },

  retryLoad() {
    this.setData({ loading: true, loadError: false });
    this.loadOrders();
  },

  // 续费 → 跳转 vip/upgrade
  onRenew() {
    wx.navigateTo({
      url: '/pkg-extra/vip/upgrade/index',
      fail() {
        wx.navigateTo({
          url: '/pkg-extra/vip/index',
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
