// payment/checkout · 会员开通结算页
// 流程：createPaymentOrder → prepayOrder → wx.requestPayment（真实支付）
//        若后端返回 mockMode=true（商户未配置），提示后走 mock-pay 联调开通
// 套餐名与金额一律来自 utils/plans（后端权威），页面内不再写死价格。
const api = require('../../../utils/api');
const { loadPlans, FALLBACK } = require('../../../utils/plans');

// UI key（yearly/monthly）→ 兜底套餐；真实值由 loadPlans 覆盖
function fallbackPlans() {
  return FALLBACK;
}

Page({
  data: {
    merchantName: '家庭点菜',
    coverImage: 'kungpao-chicken.jpg',
    productName: FALLBACK.yearly.planName,
    payAmount: FALLBACK.yearly.priceFull,
    originAmount: FALLBACK.yearly.original,
    payMethod: { name: '微信支付', balance: '0.00' },
    bankText: '未绑定银行卡',
    couponText: '暂无可用优惠',
    mockMode: false,
    paying: false,
    orderId: null,
    toast: { visible: false, type: 'center', text: '' }
  },

  async onLoad(query) {
  // 大字模式档位：进页读取（设置页改完回来重进生效）
  let fontScale = 'normal';
  try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
  if (fontScale !== this.data.fontScale) this.setData({ fontScale });
    const key = (query && query.plan === 'monthly') ? 'monthly' : 'yearly';
    // 先用本地兜底出首屏，再用后端权威套餐覆盖
    this._plans = fallbackPlans();
    this._applyPlan(key, query);
    const plans = await loadPlans();
    this._plans = plans;
    this._applyPlan(key, query);
  },

  // query 显式传入的 planName/amount 优先（来自上一页已确认的展示值），其次取套餐目录
  _applyPlan(key, query) {
    const plan = (this._plans && this._plans[key]) || FALLBACK[key] || FALLBACK.yearly;
    const patch = {
      planKey: key,
      planId: plan.planCode,
      productName: plan.planName,
      payAmount: plan.priceFull,
      originAmount: plan.original || plan.priceFull,
    };
    if (query && query.planName) patch.productName = decodeURIComponent(query.planName);
    if (query && query.amount) {
      const amt = Number(query.amount);
      if (!isNaN(amt) && amt > 0) patch.payAmount = Number(amt).toFixed(2);
    }
    this.setData(patch);
  },

  onProductTap() {
    this.showToast('当前套餐：' + this.data.productName);
  },
  onPayMethodTap() {
    this.showToast('当前使用微信支付');
  },
  onBankTap() {
    this.showToast('未绑定银行卡');
  },
  onCouponTap() {
    this.showToast('暂无可用优惠');
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
        this.setData({ mockMode: true });
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
            fail: (err) => {
              // 微信 errMsg 为英文 "requestPayment:fail cancel"，标记取消供 catch 静默处理
              const errMsg = (err && err.errMsg) || '';
              const cancelled = errMsg.indexOf('cancel') >= 0;
              const error = new Error(cancelled ? '用户取消支付' : (errMsg || '支付未完成'));
              error.cancelled = cancelled;
              reject(error);
            },
          });
        });
        // 真实支付成功：订单状态由后端 notify 写入，这里直接跳成功页
      } else {
        throw new Error('预支付参数异常');
      }

      // 跳成功页：redirectTo 替换当前页，防返回栈回到 checkout 重复下单
      const planName = encodeURIComponent(this.data.productName);
      wx.redirectTo({
        url: `/pkg-extra/payment/success/index?orderId=${orderId}&amount=${this.data.payAmount}&planName=${planName}`,
        fail: () => this.showToast('已开通，请在"我的"查看会员状态'),
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ paying: false });
      const msg = (err && err.message) || '支付失败，请重试';
      // 用户主动取消（cancel/取消）静默返回，不弹任何错误
      if (!err || (!err.cancelled && msg.indexOf('cancel') === -1 && msg.indexOf('取消') === -1)) {
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