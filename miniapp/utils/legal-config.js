// utils/legal-config.js · 运营者信息单一来源
//
// 隐私政策、用户协议里都要写明运营者主体与联系方式，提审时微信会核对。
// 之前这些值散落在各页面的 data 里，改名要改多处、还容易漏一处留占位符被驳回。
// 现在只改这里一处。
//
// ⚠️ 上线前必须替换为真实信息（提审要求，占位符会被驳回）。
//    主体可以是个人真实姓名，也可以是营业执照上的公司名称。

const LEGAL_CONFIG = {
  // 运营者主体名称（个人开发者填本人姓名；企业填公司全称）
  operatorName: '【请填写运营者名称】',
  // 对外联系邮箱或电话（用户行使数据权利的联系方式）
  operatorContact: '【请填写联系方式】',
  // 隐私政策 / 用户协议的生效日期
  effectiveDate: '2026-09-01'
};

/** 是否为未填写的占位符（用于在控制台给出上线提醒） */
function hasPlaceholder() {
  return /【.*】/.test(LEGAL_CONFIG.operatorName) || /【.*】/.test(LEGAL_CONFIG.operatorContact);
}

/** 页面用：取运营者信息；未填写时返回占位符原文，避免页面空白 */
function getOperatorInfo() {
  if (hasPlaceholder()) {
    console.warn('[legal] 运营者信息仍为占位符，提审前请在 utils/legal-config.js 填写真实信息');
  }
  return {
    operatorName: LEGAL_CONFIG.operatorName,
    operatorContact: LEGAL_CONFIG.operatorContact,
    effectiveDate: LEGAL_CONFIG.effectiveDate
  };
}

module.exports = { LEGAL_CONFIG, getOperatorInfo, hasPlaceholder };
