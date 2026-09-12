// pages/me/notifications · 消息中心
// 真实接口：getNotifications / markNotificationsRead（GET/PATCH /api/notifications）
const { getNotifications, markNotificationsRead } = require('../../../utils/api');
const features = require('../../../utils/features');

// 通知 kind → tab 归属（wish=家人许愿 / meal=开饭提醒，都算家庭事件）
const KIND_TAB = { fam: 'family', com: 'community', sys: 'system', wish: 'family', meal: 'family' };

// kind → 默认图标
const KIND_ICON = { fam: 'home', com: 'heart', sys: 'bell', wish: 'heart', meal: 'bell' };

// actionType → 按钮文案 + 跳转
const ACTION_MAP = {
  menu: { label: '去看看', ghost: false, route: '/pages/menu/index' },
  shopping: { label: '查看清单', ghost: true, route: '/pages/shopping/index' },
  community: { label: '去社区', ghost: true, route: '/pages/community/index' },
  home: { label: '去看看', ghost: false, route: '/pages/home/index' },
  feedback: { label: '查看', ghost: true, route: '/pkg-extra/me/feedback/index' },
};

// 后端扁平 NotificationItem → 前端卡片视图模型
function adapt(item) {
  const kind = item.kind || 'sys';
  // 社区关闭时不渲染"去社区"动作按钮，避免死链
  const action = (!features.COMMUNITY && item.actionType === 'community')
    ? null
    : (ACTION_MAP[item.actionType] || null);
  return {
    id: item.id,
    group: item.group === 'today' ? 'today' : 'earlier',
    kind,
    icon: KIND_ICON[kind] || 'bell',
    title: item.title || '',
    time: item.time || '',
    unread: !!item.unread,
    body: [{ t: 'n', v: item.bodyText || '' }],
    action: action ? { label: action.label, ghost: action.ghost, type: item.actionType } : null,
  };
}

Page({
  data: {
    loading: true,
    all: [],
    tabs: [
      { key: 'all', label: '全部', unread: 0 },
      { key: 'family', label: '家庭', unread: 0 },
      ...(features.COMMUNITY ? [{ key: 'community', label: '社区', unread: 0 }] : []),
      { key: 'system', label: '系统', unread: 0 }
    ],
    activeTab: 'all',
    unreadCount: 0,
    visibleCount: 0,
    groups: [],
    toast: { visible: false, type: 'top', text: '' },
    loadError: false
  },

  onLoad() {
    this.loadData();
  },

  // 从目标页返回后未读数可能已变，重新拉取
  onShow() {
    // 大字模式档位：onShow 读取，设置页改完回来立即生效
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
    if (this._loaded) this.loadData();
    this._loaded = true;
  },

  loadData() {
    getNotifications()
      .then((res) => {
        const items = res && Array.isArray(res.items) ? res.items : [];
        const all = items.map(adapt);
        this.setData({ all, loading: false, loadError: false }, () => this.recompute());
      })
      .catch(() => {
        this.setData({ all: [], loading: false, loadError: true }, () => this.recompute());
      });
  },

  retryLoad() {
    this.setData({ loading: true, loadError: false });
    this.loadData();
  },

  // 根据当前 tab 计算分组、未读数、tab 角标
  recompute() {
    const all = this.data.all || [];
    const active = this.data.activeTab;

    // tab 未读角标统计（基于全部数据）
    const tabUnread = { all: 0, family: 0, community: 0, system: 0 };
    all.forEach((n) => {
      if (!n.unread) return;
      tabUnread.all += 1;
      const tk = KIND_TAB[n.kind];
      if (tk && tabUnread[tk] !== undefined) tabUnread[tk] += 1;
    });

    const tabs = this.data.tabs.map((t) => ({
      ...t,
      unread: tabUnread[t.key] || 0
    }));

    // 过滤当前 tab
    const filtered = all.filter((n) => {
      if (active === 'all') return true;
      return KIND_TAB[n.kind] === active;
    });

    const todayItems = filtered.filter((n) => n.group === 'today');
    const earlierItems = filtered.filter((n) => n.group === 'earlier');

    const groups = [
      { label: '今天', items: todayItems },
      { label: '更早', items: earlierItems }
    ];

    this.setData({
      tabs,
      groups,
      unreadCount: tabUnread.all,
      visibleCount: filtered.length
    });
  },

  onTabChange(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeTab) return;
    this.setData({ activeTab: key }, () => this.recompute());
  },

  // 全部已读：真调接口（空 ids = 全部）
  onReadAll() {
    // 防重：乐观更新 + 请求在途时再点会重复提交
    if (this.__readAllBusy) return;
    this.__readAllBusy = true;
    const all = (this.data.all || []).map((n) => ({ ...n, unread: false }));
    this.setData({ all }, () => this.recompute());
    markNotificationsRead([])
      .then(() => this.showToast('已全部标记为已读'))
      .catch(() => {
        this.showToast('操作失败，请稍后重试');
        this.loadData();
      })
      .then(() => { this.__readAllBusy = false; });
  },

  // 点击卡片 → 标记已读
  // 点卡片 = 标记已读 + 按通知类型跳转（原来只标已读，用户点了「没反应」）
  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    this.markRead(id);
    const n = (this.data.all || []).find((x) => x.id === id);
    const type = n && n.action ? n.action.type : '';
    this.navigateByType(type, n);
  },

  markRead(id) {
    let changed = false;
    const all = (this.data.all || []).map((n) => {
      if (n.id === id && n.unread) {
        changed = true;
        return { ...n, unread: false };
      }
      return n;
    });
    if (!changed) return;
    this.setData({ all }, () => this.recompute());
    markNotificationsRead([id]).catch(() => {
      // 失败要回滚本地状态：此前只在下次进页面时才纠正，
      // 用户会看到"已读"却仍收到未读计数，两处不一致
      const rolled = (this.data.all || []).map((n) => (
        n.id === id ? { ...n, unread: true } : n
      ));
      this.setData({ all: rolled }, () => this.recompute());
    });
  },

  // 卡片按钮 → 标记已读 + 真实跳转
  onAction(e) {
    const id = e.currentTarget.dataset.id;
    const n = (this.data.all || []).find((x) => x.id === id);
    this.markRead(id);
    const type = n && n.action ? n.action.type : '';
    this.navigateByType(type, n);
  },

  // tabBar 页用 switchTab，其余普通页用 navigateTo
  navigateByType(type, n) {
    const tabRoutes = {
      pantry: '/pages/pantry/index',
      community: '/pages/community/index',
      home: '/pages/home/index'
    };
    const navRoutes = {
      menu: '/pages/menu/index',
      shopping: '/pages/shopping/index',
      feedback: '/pkg-extra/me/feedback/index'
    };

    if (tabRoutes[type]) {
      wx.switchTab({ url: tabRoutes[type], fail: () => this.showToast('目标页面暂不可达') });
    } else if (navRoutes[type]) {
      wx.navigateTo({ url: navRoutes[type], fail: () => this.showToast('目标页面暂不可达') });
    } else if (n && n.body && n.body[0] && n.body[0].v) {
      // 无可跳转目标时给出内容反馈，避免「点了没反应」
      this.showToast('已标记为已读');
    }
  },

  showToast(text) {
    this.setData({ toast: { visible: true, type: 'top', text } });
  },

  onToastClose() {
    this.setData({ 'toast.visible': false });
  }
});
