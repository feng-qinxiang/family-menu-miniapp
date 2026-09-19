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

/**
 * 页面级守卫：开关关闭时把直连/历史栈进来的用户送回首页。
 * 入口隐藏只挡住正常动线，提审时审核员可通过分享卡片或页面路径直达，
 * 所以受资质限制的页面必须在 onLoad 里自查。首页是 tabBar 页，只能 switchTab。
 */
function leaveToHome() {
  wx.switchTab({ url: '/pages/home/index' });
}

module.exports = {
  PAYMENT: false,
  COMMUNITY: true,
  PHONE_LOGIN: false,
  leaveToHome
};
