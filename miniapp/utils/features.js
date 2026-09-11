/**
 * 功能开关 — 个人主体上线裁剪
 *
 * 个人主体小程序资质限制：
 *  - 无法开通微信支付 → PAYMENT 关闭（隐藏 VIP/开通/订单入口，权益视为全员可用）
 *  - 无短信服务资质 → PHONE_LOGIN 关闭（隐藏手机号/账号密码登录，仅微信登录+游客）
 *  - COMMUNITY 开启：社区是核心功能，保留上线。UGC 合规依赖后端内容安全校验
 *    （微信 msgSecCheck/imgSecCheck）+ 举报队列人工处置。
 *    举报处置只在运营后台（/admin → 举报审核）进行，小程序里没有审核入口。
 *
 * 资质就绪后把对应开关置 true 即可恢复完整功能，代码全部保留。
 */
module.exports = {
  PAYMENT: false,
  COMMUNITY: true,
  PHONE_LOGIN: false
};
