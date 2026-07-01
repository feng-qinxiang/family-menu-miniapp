// pages/community/audit · 社区举报审核队列（二级页）
const {
  getCurrentUser,
  getCommunityReports,
  reviewCommunityReport
} = require('../../../utils/api');

// 本地兜底缩图（接口无 coverImage 时按序轮播演示）
const FALLBACK_DISHES = [
  'sichuan-eggplant', 'kungpao-chicken', 'fried-rice', 'sweet-sour-chicken',
  'hongshao-pork', 'mapo-tofu', 'tomato-egg', 'beef-broccoli'
];

// 举报原因 → 展示标签兜底（接口已给 reason 文案时直接用）
const REASON_LABELS = {
  AD: '垃圾广告 / 引流',
  SPAM: '重复刷屏',
  ABUSE: '辱骂攻击 / 不友善',
  PIRACY: '疑似盗图 / 侵权',
  FAKE: '内容不实',
  OTHER: '其他'
};

Page({
  data: {
    statusBarHeight: 0,
    activeTab: 'PENDING', // PENDING | REVIEWED
    pending: [],
    reviewed: [],
    loading: true,
    // 确认弹窗
    dialogVisible: false,
    dialogVariant: 'danger',
    dialogTitle: '',
    dialogContent: '',
    dialogConfirmText: '确定',
    // toast
    toastVisible: false,
    toastText: '',
    // 暂存待确认的操作
    _pendingAction: null,
    // 权限：非管理员显示无权限态
    noPermission: false
  },

  onLoad() {
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
    this.guardAndLoad();
  },

  // 先校验管理员身份，非管理员直接显示无权限态，不打无谓的 403
  async guardAndLoad() {
    let user = null;
    try {
      user = await getCurrentUser();
    } catch (e) {
      user = null;
    }
    if (!user || !user.admin) {
      this.setData({ loading: false, noPermission: true });
      return;
    }
    this.loadReports();
  },

  // 拉取待处理 + 已处理两份数据，并容错
  async loadReports() {
    this.setData({ loading: true });
    try {
      const [pendingRaw, reviewedRaw] = await Promise.all([
        getCommunityReports('PENDING'),
        getCommunityReports('REVIEWED')
      ]);
      this.setData({
        pending: this.normalize(pendingRaw, 'PENDING'),
        reviewed: this.normalize(reviewedRaw, 'REVIEWED'),
        loading: false
      });
    } catch (e) {
      this.setData({ pending: [], reviewed: [], loading: false });
      this.showToast('举报列表加载失败');
    }
  },

  // 归一化举报记录，补齐展示字段
  normalize(list, scope) {
    return (Array.isArray(list) ? list : []).map((item, idx) => {
      const post = item.post || item.recipe || {};
      const reportId = item.reportId || item.id || `r-${scope}-${idx}`;
      const cover = post.coverImage || item.coverImage || '';
      const reasonKey = (item.reasonCode || item.reasonType || '').toUpperCase();
      const reasonLabel = item.reason || REASON_LABELS[reasonKey] || '违规举报';
      const status = (item.status || scope).toUpperCase();
      const isDeleted = status === 'REVIEWED' || status === 'DELETED' || status === 'RESOLVED';
      const isIgnored = status === 'IGNORED';
      return {
        reportId,
        title: post.title || item.title || '未命名内容',
        excerpt: item.description || item.note || post.summary || post.content || '举报人未填写补充说明',
        cover,
        fallbackDish: FALLBACK_DISHES[idx % FALLBACK_DISHES.length],
        reasonLabel,
        reporter: item.reporter || item.reporterName || '匿名用户',
        timeText: item.createdAtText || item.timeText || this.formatTime(item.createdAt),
        resolved: scope === 'REVIEWED',
        resultIgnored: isIgnored,
        resultText: isIgnored ? '已忽略 · 内容正常保留' : (isDeleted ? '已删除 · 内容下架处理' : '已处理')
      };
    });
  },

  // 时间戳 → 相对时间文案
  formatTime(ts) {
    if (!ts) return '';
    const t = typeof ts === 'number' ? ts : Date.parse(ts);
    if (!t || Number.isNaN(t)) return '';
    const diff = Date.now() - t;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return `${Math.floor(diff / 86400000)} 天前`;
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab && tab !== this.data.activeTab) {
      this.setData({ activeTab: tab });
    }
  },

  // 点「通过删除」→ 弹危险确认
  onDelete(e) {
    const { id, title } = e.currentTarget.dataset;
    this.setData({
      dialogVisible: true,
      dialogVariant: 'danger',
      dialogTitle: '通过删除举报',
      dialogContent: `将下架《${title}》并标记举报已处理，操作不可撤销。`,
      dialogConfirmText: '确认删除',
      _pendingAction: { reportId: id, status: 'REVIEWED', note: '违规属实，内容已删除' }
    });
  },

  // 点「忽略」→ 弹温和确认
  onIgnore(e) {
    const { id } = e.currentTarget.dataset;
    this.setData({
      dialogVisible: true,
      dialogVariant: 'warn',
      dialogTitle: '忽略本条举报',
      dialogContent: '核实后内容正常保留，举报将归档至已处理。',
      dialogConfirmText: '确认忽略',
      _pendingAction: { reportId: id, status: 'IGNORED', note: '核实无违规，保留内容' }
    });
  },

  onDialogCancel() {
    this.setData({ dialogVisible: false, _pendingAction: null });
  },

  async onDialogConfirm() {
    const action = this.data._pendingAction;
    this.setData({ dialogVisible: false });
    if (!action) return;
    try {
      await reviewCommunityReport(action.reportId, {
        status: action.status,
        note: action.note
      });
      this.showToast(action.status === 'IGNORED' ? '已忽略' : '已删除');
      this.setData({ _pendingAction: null });
      await this.loadReports();
    } catch (e) {
      this.setData({ _pendingAction: null });
      this.showToast('操作失败，请重试');
    }
  },

  showToast(text) {
    this.setData({ toastVisible: true, toastText: text });
  },

  onToastClose() {
    this.setData({ toastVisible: false });
  }
});
