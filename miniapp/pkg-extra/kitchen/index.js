// pages/kitchen/index · 厨房总控（多菜并行：状态总览 + 每菜计时 + 一键上桌）
// 定位：做饭时的一屏总览——今天这一餐每道菜做到哪、哪口灶在计时，不用逐个进烹饪模式。
// 纯逻辑在 utils/kitchen.js（有 node 断言），本页只管数据与事件。
const api = require('../../utils/api');
const { recipeDishImg } = require('../../utils/image');
const { mealTypeLabels, mealOrder } = require('../../utils/constants');
const { runGuarded } = require('../../utils/interaction');
const subscribe = require('../../utils/subscribe');
const {
  fmtClock, buildKitchenOrder, pickMainStove, stepProgressText,
  secondsLeft, progressKey, timerKey
} = require('../../utils/kitchen');

// 快捷时长（与 cook-mode 的选时长一致）
const DURATIONS = [
  { label: '1 分钟', seconds: 60 },
  { label: '3 分钟', seconds: 180 },
  { label: '5 分钟', seconds: 300 },
  { label: '10 分钟', seconds: 600 },
  { label: '15 分钟', seconds: 900 },
  { label: '30 分钟', seconds: 1800 }
];

Page({
  data: {
    fontScale: 'normal',
    loading: true,
    loadError: false,
    groups: [],       // [{meal,label,items}]
    activeMeal: '',
    items: [],        // 当前餐次视图模型（含 timer / timerText / main）
    orderText: '',
    doneCount: 0,
    allDone: false
  },

  _timer: null,        // 共享 1s tick（多计时器单一驱动）
  _allDone: undefined, // 开饭广播跳变基线：undefined=首载不弹，false→true 才弹

  onLoad() {
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    this.setData({ fontScale });
    this.loadData();
  },

  // 从 cook-mode / 上桌操作回来：重拉菜单与本地计时，状态自动对齐
  onShow() {
    if (this._hasLoaded) this.loadData();
  },

  onUnload() {
    this.stopTick();
  },

  // —— 数据 ——
  async loadData() {
    this.setData({ loadError: false });
    let items = [];
    try {
      const menu = await api.getTodayMenu();
      items = (menu && Array.isArray(menu.items)) ? menu.items : [];
    } catch (err) {
      this.setData({ loading: false, loadError: true, items: [], groups: [] });
      return;
    }

    const groups = mealOrder
      .map((meal) => ({
        meal,
        label: mealTypeLabels[meal] || '晚餐',
        items: items
          .filter((it) => (it.mealType || 'dinner') === meal)
          .map((it) => this.decorate(it, mealTypeLabels[meal] || '晚餐'))
      }))
      .filter((g) => g.items.length > 0);

    // 默认聚焦第一个还有未上桌菜的餐次，否则第一组
    const pendingGroup = groups.find((g) => g.items.some((it) => it.status !== 'done'));
    const activeMeal = pendingGroup ? pendingGroup.meal : (groups[0] && groups[0].meal) || '';
    // 餐次切换或首次进入：重置开饭广播基线（同餐次重拉时保留，才能检测"全上桌"跳变）
    if (activeMeal !== this.data.activeMeal) this._allDone = undefined;

    this.setData({ loading: false, groups, activeMeal });
    this.applyActive();
    this._hasLoaded = true;
  },

  decorate(it, mealLabel) {
    const recipe = it.recipe || {};
    const recipeId = recipe.id || it.recipeId || '';
    return {
      id: it.id || '',
      recipeId,
      title: recipe.title || '一道菜',
      img: recipeDishImg(recipe),
      status: it.status || 'todo',
      mealType: it.mealType || 'dinner',
      mealLabel,
      timeCost: Number(recipe.timeCost) || 0,
      servings: recipe.servings || 0,
      progressText: stepProgressText(this.readProgress(recipeId)),
      timer: this.restoreTimer(it.id),
      timerText: '',
      main: false
    };
  },

  selectSlot(e) {
    const { meal } = e.currentTarget.dataset;
    if (!meal || meal === this.data.activeMeal) return;
    this._allDone = undefined;
    this.setData({ activeMeal: meal });
    this.applyActive();
  },

  // —— 当前餐次视图：算主灶 / 顺序建议 / 全上桌 ——
  applyActive() {
    const group = this.data.groups.find((g) => g.meal === this.data.activeMeal);
    const items = (group ? group.items : []).map((it) => ({
      ...it,
      timerText: it.timer ? fmtClock(this.timerNowLeft(it.timer)) : ''
    }));

    const order = buildKitchenOrder(items);
    const main = pickMainStove(items, order);
    const decorated = items.map((it) => ({ ...it, main: !!main && main.id === it.id }));

    const doneCount = decorated.filter((it) => it.status === 'done').length;
    const allDone = decorated.length > 0 && doneCount === decorated.length;

    const wasAllDone = this._allDone;
    this._allDone = allDone;

    this.setData({
      items: decorated,
      doneCount,
      allDone,
      orderText: this.buildOrderText(order)
    }, () => {
      if (decorated.some((it) => it.timer && it.timer.running)) this.ensureTick();
    });

    // 全上桌跳变 → 弹开饭广播（同菜单页语义）
    if (allDone && wasAllDone === false) this.promptAnnounce();
  },

  buildOrderText(order) {
    if (!order.length) return '';
    if (order.length === 1) return `就一道 ${order[0].title}，慢慢来`;
    return `先开工最耗时的「${order[0].title}」，空档穿插快手菜，尽量同时上桌`;
  },

  // —— 步骤进度（与 cook-mode 共用存储） ——
  readProgress(recipeId) {
    try {
      return recipeId ? wx.getStorageSync(progressKey(recipeId)) : '';
    } catch (e) {
      return '';
    }
  },

  // —— 计时器（每道菜一个灶，本地持久化，页面重进按真实时间差续跑） ——
  // ponytail: 计时态只存本地（单机单厨场景），跨设备云端化是明确的升级路径
  restoreTimer(menuItemId) {
    if (!menuItemId) return null;
    try {
      const saved = wx.getStorageSync(timerKey(menuItemId));
      if (!saved || !(Number(saved.total) > 0)) return null;
      if (saved.running) {
        const left = secondsLeft(saved.baseAt, saved.baseLeft);
        if (left > 0) {
          return { total: Number(saved.total), left, running: true, baseAt: saved.baseAt, baseLeft: saved.baseLeft };
        }
        // 离开期间走完了：清掉
        wx.removeStorageSync(timerKey(menuItemId));
        return null;
      }
      const left = Number(saved.baseLeft) || 0;
      return left > 0 ? { total: Number(saved.total), left, running: false, baseAt: 0, baseLeft: left } : null;
    } catch (e) {
      return null;
    }
  },

  persistTimer(item) {
    if (!item || !item.id) return;
    try {
      if (!item.timer) {
        wx.removeStorageSync(timerKey(item.id));
      } else {
        wx.setStorageSync(timerKey(item.id), {
          total: item.timer.total,
          baseAt: item.timer.running ? item.timer.baseAt : 0,
          baseLeft: item.timer.running ? item.timer.baseLeft : item.timer.left,
          running: !!item.timer.running
        });
      }
    } catch (e) {
      // 存不上不影响本轮页面内使用
    }
  },

  timerNowLeft(timer) {
    return timer.running ? secondsLeft(timer.baseAt, timer.baseLeft) : (timer.left || 0);
  },

  toggleTimer(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const item = this.data.items[idx];
    if (!item || item.status === 'done') return;
    if (item.timer && item.timer.running) {
      this.pauseAt(idx);
    } else {
      this.startAt(idx);
    }
  },

  startAt(idx) {
    const item = this.data.items[idx];
    if (!item) return;
    const suggested = item.timeCost > 0 ? item.timeCost * 60 : 600;
    const prev = item.timer || { total: suggested, left: suggested };
    const left = prev.left > 0 ? prev.left : prev.total;
    const timer = { total: prev.total || suggested, left, running: true, baseAt: Date.now(), baseLeft: left };
    this.patchTimer(idx, item, timer);
  },

  pauseAt(idx) {
    const item = this.data.items[idx];
    if (!item || !item.timer) return;
    const left = Math.max(0, secondsLeft(item.timer.baseAt, item.timer.baseLeft));
    this.patchTimer(idx, item, { total: item.timer.total, left, running: false, baseAt: 0, baseLeft: left });
  },

  // 换时长：选完立即按新时长开跑（与 cook-mode 一致）
  pickDuration(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const item = this.data.items[idx];
    if (!item || item.status === 'done') return;
    wx.showActionSheet({
      itemList: DURATIONS.map((d) => d.label),
      success: (res) => {
        const seconds = DURATIONS[res.tapIndex] && DURATIONS[res.tapIndex].seconds;
        if (!seconds) return;
        this.patchTimer(idx, item, { total: seconds, left: seconds, running: true, baseAt: Date.now(), baseLeft: seconds });
      },
      fail: () => {}
    });
  },

  patchTimer(idx, item, timer) {
    this.setData({
      [`items[${idx}].timer`]: timer,
      [`items[${idx}].timerText`]: fmtClock(this.timerNowLeft(timer))
    }, () => {
      this.persistTimer({ ...item, timer });
      if (timer.running) this.ensureTick();
      else if (!this.data.items.some((it) => it.timer && it.timer.running)) this.stopTick();
    });
  },

  ensureTick() {
    if (this._timer) return;
    this._timer = setInterval(() => this.tick(), 1000);
  },

  stopTick() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  tick() {
    const running = [];
    const patch = {};
    this.data.items.forEach((it, idx) => {
      if (!it.timer || !it.timer.running || it.status === 'done') return;
      const left = secondsLeft(it.timer.baseAt, it.timer.baseLeft);
      if (left <= 0) {
        // 这道菜时间到：清计时、提醒
        try { wx.removeStorageSync(timerKey(it.id)); } catch (e) { /* 忽略 */ }
        patch[`items[${idx}].timer`] = null;
        patch[`items[${idx}].timerText`] = '';
        wx.vibrateShort && wx.vibrateShort({ type: 'heavy' });
        wx.showToast({ title: `「${it.title}」时间到啦`, icon: 'none' });
        return;
      }
      patch[`items[${idx}].timer.left`] = left;
      patch[`items[${idx}].timerText`] = fmtClock(left);
      running.push(idx);
    });
    if (Object.keys(patch).length) this.setData(patch);
    if (!running.length) this.stopTick();
  },

  // —— 动作 ——
  async startCook(e) {
    const { id, item } = e.currentTarget.dataset;
    if (!id) return;
    // 先写「烧着呢」再跳：与菜单页同一约定，防止回来读到旧状态
    if (item) {
      try {
        await api.updateMenuItemStatus(item, 'cooking');
      } catch (err) {
        console.warn('mark cooking failed', err);
      }
    }
    wx.navigateTo({
      url: `/pkg-extra/cook-mode/index?id=${id}&menuItemId=${item || ''}`,
      fail: () => wx.showToast({ title: '页面打开失败，请重试', icon: 'none' })
    });
  },

  async markCooked(e) {
    const { id, index } = e.currentTarget.dataset;
    const item = this.data.items[Number(index)];
    if (!item || !id) return;
    const res = await wx.showModal({
      title: '这道菜上桌了？',
      content: '标记上桌，并记一笔做菜历史',
      confirmText: '上桌',
      cancelText: '再等等'
    });
    if (!res.confirm) return;
    let ok = false;
    await runGuarded(this, `cooked-${item.id}`, async () => {
      await Promise.all([
        item.id ? api.updateMenuItemStatus(item.id, 'done') : Promise.resolve(),
        api.addCookHistory({ recipeId: id }).catch(() => {})
      ]);
      ok = true;
    }, {
      loading: '处理中',
      success: '已上桌',
      fail: '操作失败'
    });
    if (!ok) return;
    try { if (item.id) wx.removeStorageSync(timerKey(item.id)); } catch (err) { /* 忽略 */ }
    await this.loadData();
  },

  promptAnnounce() {
    wx.showModal({
      title: '这一餐都做好啦！',
      content: '要喊家人来吃饭吗？会给家里每个人发一条开饭通知。',
      confirmText: '喊开饭',
      cancelText: '先不用',
      success: (res) => {
        if (!res.confirm) return;
        subscribe.apply('meal');
        api.announceMeal()
          .then(() => wx.showToast({ title: '已通知家人', icon: 'success' }))
          .catch(() => wx.showToast({ title: '通知没发出去', icon: 'none' }));
      }
    });
  },

  retryLoad() {
    this.setData({ loading: true });
    this.loadData();
  },

  goOrdering() {
    wx.switchTab({ url: '/pages/recipes/index', fail: () => {} });
  },

  noop() {}
});
