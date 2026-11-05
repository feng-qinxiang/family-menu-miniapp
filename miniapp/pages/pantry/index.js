const {
  addPantryItem,
  deletePantryItem,
  getPantryItems,
  getPantryMatch,
  updatePantryItem
} = require('../../utils/api');
const { getIngredientPhotos } = require('../../utils/api');
const { editIngredientPhoto } = require('../../utils/ingredient-photo');
const { getCapsule } = require('../../utils/capsule');
const { runGuarded } = require('../../utils/interaction');
const { categoryOf: sharedCategoryOf } = require('../../utils/ingredients');
const { daysLeft, expiryText, pantrySummary, normalizeMatches } = require('../../utils/pantry-match');
const { ingredientImage } = require('../../utils/image');
const subscribe = require('../../utils/subscribe');

Page({
  data: {
    capsuleTop: 'calc(env(safe-area-inset-top) + 90rpx)',
    capsuleRight: '96px',
    categories: [],
    pantryItems: [],
    ingredientPhotos: {},
    ingredientPhotosFailed: false,
    pantryFilter: 'all',
    matchResults: [],
    matchReadyCount: 0,
    pantrySummary: { count: 0, expiringCount: 0, expiredCount: 0, undatedCount: 0, priorityText: '' },
    newItem: { ingredientName: '', amount: '', unit: '', expiresAt: '' },
    showAddForm: false,
    showMatch: false,
    loaded: false,
    loading: true,
    loadError: false,
    adding: false,
    reminderSettingsLoaded: false,
    reminderTemplateReady: false,
    reminderSubscribed: false,
    reminderBusy: false,
    reminderExpanded: false,
    // 编辑弹层：editingId 为 null 时弹层不显示
    editingId: null,
    editDraft: { ingredientName: '', amount: '', unit: '', expiresAt: '' },
    editing: false
  },

  onLoad() {
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    const capsule = getCapsule();
    this.setData({ fontScale, capsuleTop: capsule.top, capsuleRight: capsule.right });
  },

  onShow() {
    this.loadReminderSetting();
    Promise.resolve(this.loadPantry(this._hasLoaded === true)).then(() => { this._hasLoaded = true; });
  },

  loadReminderSetting() {
    return subscribe.preload(true).then(setting => this.setData({
      reminderSettingsLoaded: true,
      reminderTemplateReady: !!(setting && setting.available && setting.templates && setting.templates.pantry)
    }));
  },

  goNotifications() {
    wx.navigateTo({ url: '/pkg-extra/me/notifications/index' });
  },

  toggleReminder() {
    this.setData({ reminderExpanded: !this.data.reminderExpanded });
  },

  async subscribeReminder() {
    if (this.data.reminderBusy || !this.data.reminderSettingsLoaded) return;
    if (!this.data.reminderTemplateReady) {
      wx.showModal({ title: '临期提醒', content: '有到期日的食材会提前 3 天进入临期提醒，每天汇总一次。微信提醒暂未开放，可到消息中心查看临期消息。', showCancel: false, confirmText: '知道了' });
      return;
    }
    this.setData({ reminderBusy: true });
    try {
      // 在手势中同步发起授权；不能先等待请求。
      const accepted = await subscribe.apply('pantry', true);
      if (!accepted) {
        wx.showToast({ title: '未订阅，仍可查看站内消息', icon: 'none' });
        return;
      }
      await subscribe.setEnabled(true);
      this.setData({ reminderSubscribed: true });
      wx.showToast({ title: '已订阅一次临期提醒', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: '设置没保存，请再试一次', icon: 'none' });
    } finally {
      this.setData({ reminderBusy: false });
    }
  },

  onPullDownRefresh() {
    Promise.resolve(this.loadPantry()).catch(() => {}).then(() => setTimeout(() => wx.stopPullDownRefresh(), 300));
  },

  retryLoad() {
    this.setData({ loadError: false, loaded: false });
    this.loadPantry();
  },

    // silent=true：已有数据时的「回页刷新」，不显示整页骨架（避免切 tab 闪一下）
  async loadPantry(silent) {
    if (!silent) this.setData({ loading: true });
    this.setData({ loadError: false });
    let pantryItems = [];
    let failed = false;
    try {
      const loaded = await Promise.all([getPantryItems(), getIngredientPhotos().catch(() => null)]);
      pantryItems = loaded[0];
      this.setData({ ingredientPhotos: loaded[1] || {}, ingredientPhotosFailed: loaded[1] === null });
    } catch (e) {
      pantryItems = [];
      failed = true;
    }
    if (failed) {
      this.setData({
        loaded: true,
        loading: false,
        loadError: true,
        categories: [],
        pantryItems: [],
        matchResults: [],
        showMatch: false,
        pantrySummary: pantrySummary([])
      });
      return;
    }
    const enriched = this.enrichPantryItems(pantryItems || []);
    this.setData({
      pantryItems: enriched,
      pantrySummary: pantrySummary(pantryItems),
      loaded: true,
      loading: false,
      loadError: false
    });
    this.applyPantryFilter();
    // 库存变化后自动刷新匹配
    this.matchRecipes(true);
  },

  onNewInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`newItem.${field}`]: e.detail.value });
  },

  toggleAddForm() {
    this.setData({ showAddForm: !this.data.showAddForm });
  },

  selectPantryFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    if (!['all', 'expiring', 'expired'].includes(filter)) return;
    this.setData({ pantryFilter: filter });
    this.applyPantryFilter();
  },

  applyPantryFilter() {
    const filter = this.data.pantryFilter;
    const items = this.data.pantryItems.filter(item => filter === 'all' || (filter === 'expiring' ? item.expiringSoon : item.expired));
    this.setData({ categories: this.groupByCategory(items) });
  },

  goRandomPick() {
    wx.navigateTo({ url: '/pages/recipes/index?pick=pantry' });
  },

  clearExpiry() {
    this.setData({ 'editDraft.expiresAt': '' });
  },

  async editIngredientPhoto(e) {
    const name = e.currentTarget.dataset.name;
    const photos = await runGuarded(this, 'ingredientPhoto', () => editIngredientPhoto(name, this.data.ingredientPhotos[name]), {
      success: result => result ? '食材图片已保存' : '', fail: err => err.message || '保存失败，原图片已保留'
    });
    if (photos === undefined) return;
    this.setData({ ingredientPhotos: photos, ingredientPhotosFailed: false });
    this.setData({ pantryItems: this.enrichPantryItems(this.data.pantryItems) });
    this.applyPantryFilter();
  },

  async openItemActions(e) {
    let result;
    try { result = await wx.showActionSheet({ itemList: ['编辑数量与到期日', '删除食材'] }); }
    catch (err) { return; }
    if (result.tapIndex === 0) this.openEditSheet(e);
    else if (result.tapIndex === 1) await this.removeItem(e);
  },

  async addItem() {
    if (this.data.adding) return;
    const { ingredientName, amount, unit, expiresAt } = this.data.newItem;
    if (!ingredientName.trim()) {
      wx.showToast({ title: '请输入食材名', icon: 'none' });
      return;
    }
    this.setData({ adding: true });
    try {
      await addPantryItem({ ingredientName: ingredientName.trim(), amount, unit, expiresAt });
    } catch (e) {
      this.setData({ adding: false });
      wx.showToast({ title: '添加失败', icon: 'none' });
      return;
    }
    this.setData({
      newItem: { ingredientName: '', amount: '', unit: '', expiresAt: '' },
      showAddForm: false
    });
    await this.loadPantry();
    this.setData({ adding: false });
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  async removeItem(e) {
    const { id } = e.currentTarget.dataset;
    // 二次确认（仿 menu 撤菜弹窗），防误触
    const res = await wx.showModal({
      title: '删除这个食材？',
      confirmText: '删除',
      cancelText: '取消'
    });
    if (!res.confirm) return;
    try {
      await deletePantryItem(id);
    } catch (err) {
      wx.showToast({ title: '删除失败', icon: 'none' });
      return;
    }
    await this.loadPantry();
    // 删除走的是二次确认弹窗，确认后没有任何回执——列表少一行是唯一线索，
    // 而它和"这一行本来就折叠了"很难区分。添加有「已添加」，删除给同一条。
    wx.showToast({ title: '已删除', icon: 'success' });
  },

  retryMatch() {
    // 静默重算：不滚到页尾（用户就站在失败态那一屏），也失败时不再叠一条 toast
    this.matchRecipes(true);
  },

  // —— 编辑库存条目 ——
  // 打开时从列表里取原值拷进 editDraft：直接改 it.* 会让「取消」失去意义
  openEditSheet(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    let found = null;
    (this.data.categories || []).some((cat) => {
      found = (cat.items || []).find((it) => it.id === id);
      return !!found;
    });
    if (!found) return;
    this.setData({
      editingId: id,
      editDraft: {
        ingredientName: found.ingredientName || '',
        amount: found.amount || '',
        unit: found.unit || '',
        expiresAt: found.expiresAt || ''
      }
    });
  },

  onEditInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`editDraft.${field}`]: e.detail.value });
  },

  closeEditSheet() {
    // 保存中不许关：请求已经发出去了，关掉弹层会让用户以为没保存
    if (this.data.editing) return;
    this.setData({ editingId: null });
  },

  async saveEdit() {
    const id = this.data.editingId;
    if (!id) return;
    const { ingredientName, amount, unit, expiresAt } = this.data.editDraft;
    if (!String(ingredientName || '').trim()) {
      wx.showToast({ title: '请输入食材名', icon: 'none' });
      return;
    }
    // 保质期留空 = 清空到期日（后端写 NULL）；不要传 undefined，
    // 那会让整条替换把这一格当"没提"，用户就永远删不掉填错的日期
    const ok = await runGuarded(this, 'pantryEdit', () => updatePantryItem(id, {
      ingredientName: String(ingredientName).trim(),
      amount: amount || '',
      unit: unit || '',
      expiresAt: (expiresAt || '').trim()
    }), {
      loading: '保存中',
      success: '已保存',
      fail: (err) => (err && err.message) || '保存失败，请重试',
      onBusyChange: (busy) => this.setData({ editing: busy })
    });
    // undefined = 被防重拦住或失败（runGuarded 已经弹过提示），别把弹层关掉让用户重来
    if (ok === undefined) return;
    this.setData({ editingId: null });
    await this.loadPantry(true);
  },

  async matchRecipes(silent) {
    const seq = (this._matchSeq || 0) + 1;
    this._matchSeq = seq;
    this.setData({ matchLoading: true });
    let matchResults = [];
    let failed = false;
    try {
      matchResults = (await getPantryMatch()) || [];
    } catch (e) {
      // 匹配接口失败时置空会让用户以为"家里什么都做不了"，必须区分失败与真空
      matchResults = [];
      failed = true;
    }
    if (seq !== this._matchSeq) return;
    const matches = this.normalizeMatches(matchResults);
    this.setData({
      matchResults: matches,
      matchReadyCount: matches.filter(item => item.full).length,
      matchLoading: false,
      showMatch: true,
      matchFailed: failed
    });
    if (failed && !silent) {
      wx.showToast({ title: '匹配失败，下拉可重试', icon: 'none' });
    }
    if (!silent) {
      wx.pageScrollTo && wx.pageScrollTo({ scrollTop: 99999, duration: 300 });
    }
  },

  // —— 数据加工 ——
  onPhotoError(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ pantryItems: this.data.pantryItems.map(item => item.id === id ? { ...item, coverBroken: true } : item) });
    this.applyPantryFilter();
  },

  enrichPantryItems(pantryItems) {
    return pantryItems.map((item) => {
      const days = this.daysLeft(item.expiresAt);
      const expiringSoon = days !== null && days >= 0 && days <= 3;
      return {
        ...item,
        id: item.id || item.itemId || item.pantryItemId || item.ingredientName,
        amountText: this.buildAmountText(item),
        cover: ingredientImage(item, this.data.ingredientPhotos),
        coverBroken: false,
        expiresText: this.buildExpiresText(days),
        expiringSoon,
        expired: days !== null && days < 0,
        daysLeft: days
      };
    }).sort((a, b) => (a.daysLeft === null ? Infinity : a.daysLeft) - (b.daysLeft === null ? Infinity : b.daysLeft));
  },

  groupByCategory(items) {
    const buckets = {};
    items.forEach((item) => {
      const cat = this.categoryOf(item.ingredientName);
      if (!buckets[cat.key]) {
        buckets[cat.key] = { key: cat.key, label: cat.label, icon: cat.icon, items: [] };
      }
      buckets[cat.key].items.push(item);
    });
    // 固定顺序：蔬菜 → 肉蛋 → 调料 → 其他
    const order = ['veg', 'meat', 'seasoning', 'other'];
    return order
      .map((k) => buckets[k])
      .filter(Boolean)
      .map((b) => ({ ...b, qty: b.items.length }));
  },

  categoryOf(name) {
    // 交给 utils/ingredients 统一判定：这里曾自己遍历 CATEGORY_RULES，
    // 少了「花椒/胡椒」这类强特征词前置，同一个食材在冰箱和买菜清单会分到不同组
    return sharedCategoryOf(name);
  },

  // 「现在就能做」匹配卡 → 菜谱详情
  onMatchTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/pkg-extra/recipe-detail/index?id=${id}`,
      fail: () => wx.showToast({ title: '页面打开失败', icon: 'none' })
    });
  },

  normalizeMatches(matches) {
    return normalizeMatches(matches);
  },


  daysLeft(expiresAt) {
    return daysLeft(expiresAt);
  },

  buildAmountText(item) {
    const text = `${item.amount || ''}${item.unit || ''}`.trim();
    return text || '未记录';
  },

  buildExpiresText(days) {
    return expiryText(days);
  }
});
