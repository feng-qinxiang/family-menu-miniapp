// pages/legal/deletion · 注销账号（静态二级页）
//
// 这个页面存在的理由：隐私政策里承诺了「账号注销后 15 个工作日内删除或匿名化」，
// 但全站原本没有任何注销入口——那句承诺没有可执行的通道，提审会被挑。
//
// 只做「说明 + 申请方式」，**不做自助注销**：自助注销（前端提交 + 后端端点）是产品项，
// 还没拍板。后端目前提供的是人工匿名化流程，所以这里的通道就是联系运营者。
const { getOperatorInfo } = require('../../../utils/legal-config');
const { copyText } = require('../../../utils/privacy');

Page({
  data: {
    intro:
      '「家庭点菜」支持注销账号。注销目前由人工受理，不提供自助操作——这样能避免误删家庭里其他人还在用的菜单。请先阅读下面四段说明，再通过页面底部的联系方式提出申请。',
    sections: [
      {
        no: '01',
        title: '注销后会怎样',
        body:
          '收到申请并核对身份后，你的账号会立即失效、无法再登录，账号本身与其中的个人内容（菜谱、社区帖子与评论、收藏、口味偏好、冰箱库存）会被删除或匿名化。家庭关系、会员与订单等交易记录会保留以符合财税与审计要求，但不再与你的身份关联。',
      },
      {
        no: '02',
        title: '如何申请',
        body:
          '通过页面底部的运营者联系方式提出申请，并在申请里写明你的微信昵称或用户标识，方便我们核对账号归属。若联系方式是邮箱，请用你注册时使用的邮箱发送；用手机号的，请用同一号码来电或短信，核对通过后才会执行注销。',
      },
      {
        no: '03',
        title: '处理时限',
        body:
          '我们会在收到申请后的 15 个工作日内完成删除或匿名化，并通过你申请时使用的渠道回复处理结果。若申请信息不足以核对账号归属，我们会先联系你补充，处理时间从资料补齐之日重新计算。',
      },
      {
        no: '04',
        title: '注销前请确认',
        body:
          '注销不可恢复：结束后无法再登录该账号，其中的菜谱与做菜记录也找不回来。如果你只是暂时不想用了，用「我的 → 设置 → 退出登录」即可——那只会清掉本机的登录状态，账号和数据都还在，下次登录还能继续用。',
      },
    ],
    // 运营者名称与联系方式统一由 utils/legal-config.js 提供（与隐私政策、用户协议同源）
    ...getOperatorInfo(),
    // 先给 Number 初始值，避免首帧绑定 undefined 触发 nav-bar 类型告警
    statusBarHeight: 0,
  },

  onLoad() {
    // 大字模式档位：onShow 读取，设置页改完回来立即生效
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
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
  },

  // 复制联系方式（邮箱或手机号，取自 legal-config 单一来源）
  onCopyContact() {
    copyText(
      this.data.operatorContact,
      () => wx.showToast({ title: '联系方式已复制', icon: 'none' }),
      () => wx.showToast({ title: '复制失败', icon: 'none' })
    );
  },
});
