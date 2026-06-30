// payment/checkout · 会员开通结算页
// 流程：createPaymentOrder → prepayOrder → wx.requestPayment（真实支付）
//        若后端返回 mockMode=true（商户未配置），提示后走 mock-pay 联调开通
const api = require('../../../utils/api');

const PLAN_MAP = {
  yearly:  { planId: 'annual',  planName: '家庭年卡',  priceFull: '68.00', priceFen: 6800 },
  monthly: { planId: 'monthly', planName: '家庭月卡', priceFull: '9.90',  priceFen: 990  },
};

Page({
  data: {
    merchantName: '家庭点菜',
    planKey: 'yearly',
    planName: '家庭云同步年卡',
    planId: 'annual',
    payAmount: '68.00',
    paying: false,
    orderId: null,
    toast: { visible: false, type: 'center', text: '' }
  },

  onLoad(query) {
    const key = (query && query.plan && PLAN_MAP[query.plan]) ? query.plan : 'yearly';
    const plan = PLAN_MAP[key];
    const patch = {
      planKey: key,
      planId: plan.planId,
      planName: plan.planName,
      payAmount: plan.priceFull,
    };
    // 允许 upgrade 页传入 planName/amount 覆盖
    if (query && query.planName) patch.planName = decodeURIComponent(query.planName);
    if (query && query.amount) {
      const amt = Number(query.amount);
      if (!isNaN(amt) && amt > 0) patch.payAmount = Number(amt).toFixed(2);
    }
    this.setData(patch);
  },

  async onPay() {
    if (this.data.paying) return;
    this.setData({ paying: true });
    wx.showLoading({ title: '生成订单', mask: true });

    try {
      // 第一步：创建订单
      const order = await api.createPaymentOrder(this.data.planId);
      const orderId = order && order.orderId;
      if (!orderId) throw new Error('订单创建失败');
      this.setData({ orderId });

      // 第二步：获取预支付参数
      wx.showLoading({ title: '唤起支付', mask: true });
      const prepay = await api.prepayOrder(orderId);
      wx.hideLoading();
      this.setData({ paying: false });

      if (prepay && prepay.mockMode === true) {
        // 商户未配置 → 明确告知用户，确认后走 mock-pay 联调
        const confirmed = await new Promise((resolve) => {
          wx.showModal({
            title: '联调开通',
            content: '支付通道尚未配置（生产部署后自动生效）。当前为本地联调开通，不产生真实扣款。确认继续？',
            confirmText: '确认开通',
            cancelText: '取消',
            success: (res) => resolve(res.confirm),
            fail: () => resolve(false),
          });
        });
        if (!confirmed) return;
        wx.showLoading({ title: '开通中', mask: true });
        await api.mockPayOrder(orderId);
        wx.hideLoading();
      } else if (prepay && !prepay.mockMode) {
        // 真实微信支付
        await new Promise((resolve, reject) => {
          wx.requestPayment({
            timeStamp: prepay.timeStamp,
            nonceStr: prepay.nonceStr,
            package: prepay.package,
            signType: prepay.signType || 'RSA',
            paySign: prepay.paySign,
            success: resolve,
            fail: (err) => reject(new Error((err && err.errMsg) || '用户取消支付')),
          });
        });
        // 真实支付成功：订单状态由后端 notify 写入，这里直接跳成功页
      } else {
        throw new Error('预支付参数异常');
      }

      // 跳成功页
      const planName = encodeURIComponent(this.data.planName);
      wx.navigateTo({
        url: `/pages/payment/success/index?orderId=${orderId}&amount=${this.data.payAmount}&planName=${planName}`,
        fail: () => this.showToast('已开通，请在"我的"查看会员状态'),
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ paying: false });
      const msg = (err && err.message) || '支付失败，请重试';
      // 用户主动取消不弹错误
      if (msg.indexOf('取消') === -1) {
        this.showToast(msg);
      }
    }
  },

  showToast(text) {
    this.setData({ toast: { visible: true, type: 'center', text } });
  },
  onToastClose() {
    this.setData({ 'toast.visible': false });
  },
});