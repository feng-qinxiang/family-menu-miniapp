// utils/legal-config.js · 运营者信息与协议版本的单一来源
//
// 隐私政策、用户协议、帮助页都要写明运营者主体与联系方式，提审时微信会核对，
// 且要求三处说法一致。之前这些值散落在各页面的 data 里，于是出现了
// 「隐私政策写 6 月 1 日、用户协议写 9 月 1 日」这种自相矛盾，
// 还凭空写死了两个域名并不存在的邮箱（privacy@ / support@jiating-dingcai.com）。
// 现在全站只改这里一处。
//
// ⚠️ 上线前必须把下面两个【】占位符换成真实信息，否则会被审核驳回。

const LEGAL_CONFIG = {
  // 运营者主体名称（个人开发者填本人姓名；企业填公司全称）
  operatorName: '【请填写运营者名称】',
  // 对外联系方式（邮箱或手机号）：隐私政策里的数据权利受理入口、帮助页的客服兜底
  operatorContact: '【请填写联系方式】',
  // 两份协议共用的生效日期与版本号；只有改动协议内容时才需要更新
  effectiveDate: '2026 年 9 月 1 日',
  version: 'v1.0'
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
    effectiveDate: LEGAL_CONFIG.effectiveDate,
    version: LEGAL_CONFIG.version
  };
}

module.exports = { LEGAL_CONFIG, getOperatorInfo, hasPlaceholder };
