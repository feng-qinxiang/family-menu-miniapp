// pages/legal/terms · 用户协议（静态长文，无接口依赖）
const EFFECTIVE = { date: '2026 年 6 月 1 日', version: 'v1.0' };

// 条款数据：type=p 段落 / type=li 圆点列表项（b 内嵌加粗在 wxml 用 rich 拆分，这里保持纯文本）
const CLAUSES = [
  {
    no: '01',
    title: '服务说明',
    blocks: [
      { type: 'p', text: '「家庭点菜」是一款面向家庭场景的菜谱收藏与点菜协作工具，帮助你和家人记录常做的菜、规划今日菜单、生成采买清单。' },
      { type: 'p', text: '本服务为个人及家庭非商业用途提供，我们会持续优化功能，部分功能可能随版本更新而调整或下线。' }
    ]
  },
  {
    no: '02',
    title: '账号与家庭组',
    blocks: [
      { type: 'li', text: '你需通过微信授权登录，并对账号下的全部操作负责。' },
      { type: 'li', text: '创建或加入家庭组后，组内成员可共同查看与编辑菜单、菜谱等共享内容。' },
      { type: 'li', text: '请妥善保管账号，因转借或泄露造成的损失由你自行承担。' }
    ]
  },
  {
    no: '03',
    title: '行为规范',
    blocks: [
      { type: 'p', text: '在使用本服务过程中，你承诺不进行以下行为：' },
      { type: 'li', text: '上传违法、侵权、淫秽或令人反感的文字与图片内容。' },
      { type: 'li', text: '利用技术手段干扰、破坏服务的正常运行或安全。' },
      { type: 'li', text: '未经授权抓取、复制或商用本平台的菜谱数据。' }
    ]
  },
  {
    no: '04',
    title: '内容与版权',
    blocks: [
      { type: 'p', text: '你在小程序内创建或上传的菜谱、备注、图片等内容，其权利归你所有；同时你授权我们在提供服务所必需的范围内进行存储与展示。' },
      { type: 'p', text: '本小程序的界面设计、图标及预置菜谱素材受著作权保护，未经许可不得擅自使用。' }
    ]
  },
  {
    no: '05',
    title: '免责声明',
    blocks: [
      { type: 'p', text: '菜谱中的烹饪时间、份量与口味仅供参考，实际效果因食材与操作而异。涉及食材过敏或健康饮食时，请以专业建议为准。' }
    ]
  },
  {
    no: '06',
    title: '协议变更',
    blocks: [
      { type: 'p', text: '我们可能会适时更新本协议，更新后将在小程序内公示。若你继续使用，即视为接受修订后的条款。' }
    ]
  }
];

Page({
  data: {
    statusBarHeight: 0,
    effective: EFFECTIVE,
    clauses: CLAUSES
  },

  onLoad() {
    // 顶部状态栏高度，兜底容错
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

  // CTA「我已阅读并同意」：提示后返回上一页
  onAgree() {
    wx.showToast({ title: '已同意用户协议', icon: 'success' });
    setTimeout(() => {
      const pages = getCurrentPages();
      if (pages && pages.length > 1) {
        wx.navigateBack({ delta: 1 });
      } else {
        wx.switchTab({
          url: '/pages/home/index',
          fail() {
            wx.navigateBack({ delta: 1 });
          }
        });
      }
    }, 600);
  }
});
