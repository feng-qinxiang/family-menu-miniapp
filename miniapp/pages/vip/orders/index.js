// pages/vip/orders · 我的订单（开通记录）
// 当前无专用订单表，页面根据 getVipStatus 展示当前会员开通记录。
const { getVipStatus } = require('../../../utils/api');

function fmtDate(value) {
  if (!value) return '';
  return String(value).slice(0, 10).replace(/-/g, '.');
}

function buildOrder(status) {
  if (!status || !status.vip) return null;
  const planName = status.planName || '家庭云同步年卡';
  const amount = planName.indexOf('月') >= 0 ? '9' : '68';
  const endDate = fmtDate(status.expireAt) || '以服务端为准';
  const source = `${planName}|${endDate}`;
  let hash = 0;
  for (let i = 0; i < source.length; i++) hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  return {
    orderNo: `VIP.${hash.toString(16).toUpperCase()}`,
    productName: planName,
    productTag: '全家共享菜单 · 实时同步',
    amount,
    cents: planName.indexOf('月') >= 0 ? '.90' : '.00',
    startDate: '当前账号',
    endDate,
    status: 'live',
    statusText: '生效中',
    iconGold: true
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
      const status = await getVipStatus();
      const current = buildOrder(status);
      orders = current ? [current] : [];
    } catch (err) {
      console.error('orders load failed', err);
      orders = [];
    }

    // 汇总累计支付
    const total = orders.reduce((sum, o) => sum + (parseInt(o.amount, 10) || 0), 0);
    this.setData({
      orders,
      totalCount: orders.length,
      totalSpent: String(total),
      totalCents: '.00',
      loading: false
    });
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
