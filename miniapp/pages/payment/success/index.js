// pages/payment/success/index · 开通成功页（二级页）
const api = require('../../../utils/api');

Page({
  data: {
    loading: true,
    toastVisible: false,
    toastText: '',
    planName: '家庭云同步 · 年卡',
    perks: [
      '最多 8 位家人共享',
      '无限收藏菜谱',
      '一键生成买菜清单',
      '智能口味推荐',
    ],
    order: {
      orderNo: 'FM20260606093341',
      payAmount: '¥66.00',
      expireAt: '2027.06.06',
    },
  },

  onLoad(query) {
    // 接收上游传入的开通参数，缺省走兜底文案
    const order = Object.assign({}, this.data.order);
    if (query && query.orderNo) order.orderNo = query.orderNo;
    if (query && query.amount) order.payAmount = `¥${query.amount}`;
    if (query && query.planName) {
      this.setData({ planName: decodeURIComponent(query.planName) });
    }
    this.setData({ order });
    this.activateVip(query && query.planName);
  },

  // 激活 VIP，写入会员状态；失败不阻断成功页展示
  activateVip(planName) {
    api
      .activateVip(planName || this.data.planName)
      .then((res) => {
        const data = res || {};
        const next = { loading: false };
        if (Array.isArray(data.benefits) && data.benefits.length) {
          next.perks = data.benefits;
        }
        if (data.planName) next.planName = data.planName;
        if (data.expireAt) {
          next.order = Object.assign({}, this.data.order, { expireAt: data.expireAt });
        }
        this.setData(next);
      })
      .catch(() => {
        // 容错：接口异常仍展示成功页的兜底内容
        this.setData({ loading: false });
      });
  },

  // 开始使用 → 回到首页 tab
  onStart() {
    wx.switchTab({
      url: '/pages/home/index',
      fail: () => {
        wx.navigateBack({ delta: 1 });
      },
    });
  },

  onViewOrder() {
    wx.navigateTo({
      url: '/pages/vip/orders/index',
      fail: () => this.setData({ toastVisible: true, toastText: '已开通记录可在会员页查看' })
    });
  },

  onToastClose() {
    this.setData({ toastVisible: false });
  },
});
