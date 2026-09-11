// utils/plans.js · 会员套餐唯一数据源
//
// 后端 PlanCatalog 是权威（/api/payment/plans），金额以「分」存储。
// 页面只允许通过 loadPlans() 取套餐，禁止在页面里再写一份价格常量——
// 历史上 vip/index、vip/upgrade、payment/checkout 各写了一份，
// 结果同名套餐出现了「家庭同步年卡 / 家庭年卡 / 家庭云同步年卡」三种叫法且价格可能漂移。
//
// 本地 FALLBACK 仅用于接口失败/离线时兜底展示，数值需与后端 PlanCatalog 保持一致。

const api = require('./api');

const FALLBACK = {
  yearly: {
    key: 'yearly',
    planCode: 'annual',
    planName: '家庭年卡',
    amountFen: 9900,
    priceFull: '99.00',
    priceNumber: 99,
    durationDays: 365,
    original: '138.00'
  },
  monthly: {
    key: 'monthly',
    planCode: 'monthly',
    planName: '家庭月卡',
    amountFen: 1990,
    priceFull: '19.90',
    priceNumber: 19.9,
    durationDays: 30,
    original: '29.90'
  }
};

// 后端 code（annual/monthly）→ 前端 UI key（yearly/monthly）
function uiKeyOf(planCode) {
  return String(planCode) === 'monthly' ? 'monthly' : 'yearly';
}

function fenToYuan(fen) {
  const n = Number(fen);
  if (!isFinite(n)) return '';
  return (n / 100).toFixed(2);
}

// 去尾零：99.00 → 99，19.90 → 19.9（页面展示用）
function trimYuan(text) {
  const v = Number(text);
  if (!isFinite(v)) return text;
  return String(Math.round(v * 100) / 100);
}

function normalizeOne(option) {
  const key = uiKeyOf(option.planCode);
  const base = FALLBACK[key];
  const amountFen = Number(option.amountFen);
  const priceFull = isFinite(amountFen) && amountFen > 0 ? fenToYuan(amountFen) : base.priceFull;
  return {
    key,
    planCode: String(option.planCode),
    planName: option.displayName || base.planName,
    amountFen: isFinite(amountFen) ? amountFen : base.amountFen,
    priceFull,
    priceNumber: Number(trimYuan(priceFull)),
    durationDays: Number(option.durationDays) || base.durationDays,
    // 划线价后端未提供，沿用本地营销价（仅供展示，不参与下单）
    original: base.original
  };
}

function normalizeList(list) {
  const result = { yearly: { ...FALLBACK.yearly }, monthly: { ...FALLBACK.monthly } };
  (Array.isArray(list) ? list : []).forEach((option) => {
    if (!option || !option.planCode) return;
    const one = normalizeOne(option);
    result[one.key] = one;
  });
  return result;
}

// 返回 { yearly, monthly }；接口失败回退本地兜底（不抛错，页面无需 try/catch）
function loadPlans() {
  if (!api || typeof api.getPaymentPlans !== 'function') {
    return Promise.resolve(normalizeList(null));
  }
  return api
    .getPaymentPlans()
    .then((list) => normalizeList(list))
    .catch(() => normalizeList(null));
}

module.exports = { loadPlans, FALLBACK, uiKeyOf, trimYuan };
