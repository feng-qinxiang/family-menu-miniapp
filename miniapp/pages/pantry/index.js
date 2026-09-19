const {
  addPantryItem,
  deletePantryItem,
  getPantryItems,
  getPantryMatch,
  getWeeklyMenu
} = require('../../utils/api');
const { withTabSelect } = require('../../behaviors/tab-select');
const { recipeDishImg } = require('../../utils/image');
const { parseLocalDate } = require('../../utils/dish-logic');
const { INGREDIENT_CATEGORIES, categoryOf: sharedCategoryOf } = require('../../utils/ingredients');

// 分类规则统一在 utils/ingredients（冰箱与买菜清单必须同一套，否则两页对不上账）
const CATEGORY_RULES = INGREDIENT_CATEGORIES;

Page({
  data: {
    statusBarHeight: 0,
    categories: [],
    matchResults: [],
    pantrySummary: { count: 0, expiringCount: 0, categoryCount: 0 },
    newItem: { ingredientName: '', amount: '', unit: '', expiresAt: '' },
    showAddForm: false,
    showMatch: false,
    loaded: false,
    loading: true,
    loadError: false,
    adding: false
  },

  onLoad() {
    let sbh = 0;
    try {
      sbh = (wx.getWindowInfo ? wx.getWindowInfo().statusBarHeight : wx.getSystemInfoSync().statusBarHeight) || 0;
    } catch (e) {
      sbh = 0;
    }
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    this.setData({ statusBarHeight: sbh, fontScale });
  },

  onShow() {
    withTabSelect(this, 2);
    Promise.resolve(this.loadPantry(this._hasLoaded === true)).then(() => { this._hasLoaded = true; });
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
    let weeklyMenu = null;
    let failed = false;
    try {
      // 禁用数组解构：该语法编译后依赖 @babel/runtime 辅助模块，未打包进小程序会整页白屏
      const loaded = await Promise.all([getPantryItems(), getWeeklyMenu()]);
      pantryItems = loaded[0];
      weeklyMenu = loaded[1];
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
        pantrySummary: { count: 0, expiringCount: 0, categoryCount: 0 }
      });
      return;
    }
    const enriched = this.enrichPantryItems(pantryItems || [], weeklyMenu);
    const categories = this.groupByCategory(enriched);
    this.setData({
      categories,
      pantrySummary: {
        count: enriched.length,
        expiringCount: enriched.filter((it) => it.expiringSoon).length,
        categoryCount: categories.length
      },
      loaded: true,
      loading: false,
      loadError: false
    });
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
  },

  async matchRecipes(silent) {
    let matchResults = [];
    let failed = false;
    try {
      matchResults = (await getPantryMatch()) || [];
    } catch (e) {
      // 匹配接口失败时置空会让用户以为"家里什么都做不了"，必须区分失败与真空
      matchResults = [];
      failed = true;
    }
    this.setData({
      matchResults: this.normalizeMatches(matchResults),
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
  enrichPantryItems(pantryItems) {
    return pantryItems.map((item) => {
      const days = this.daysLeft(item.expiresAt);
      const expiringSoon = days !== null && days >= 0 && days <= 3;
      return {
        ...item,
        id: item.id || item.itemId || item.pantryItemId || item.ingredientName,
        amountText: this.buildAmountText(item),
        expiresText: this.buildExpiresText(days),
        expiringSoon
      };
    });
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
    const order = ['veg', 'meat', 'season', 'other'];
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
    return (matches || []).map((item) => {
      const recipe = item.recipe || {};
      // 后端已返回权威 matchedCount/totalCount，直接采用；
      // 仅旧响应缺字段时才退回 recipe.ingredients 估算
      const rate = item.matchRate || 0;
      let total = Number(item.totalCount) || 0;
      let have = Number(item.matchedCount) || 0;
      if (!total) {
        const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
        total = ingredients.length || 0;
        have = total ? Math.round(rate * total) : 0;
      }
      const full = total > 0 && have >= total;
      const missingList = item.missingIngredients && item.missingIngredients.length
        ? item.missingIngredients
        : [];
      return {
        id: item.id || recipe.id || item.recipeId,
        title: recipe.title || '未命名',
        metaText: `${recipe.cuisine || '家常'} · ${recipe.timeCost || '--'} 分钟`,
        coverImage: recipeDishImg(recipe),
        haveText: total ? `${have}/${total}` : `${Math.round(rate * 100)}%`,
        percentWidth: Math.max(6, Math.round(rate * 100)),
        full,
        missingText: full
          ? '食材都有，直接开火'
          : (missingList.length ? `还差 ${missingList.join('、')}` : '还差一点配料')
      };
    });
  },


  daysLeft(expiresAt) {
    if (!expiresAt) return null;
    // 用本地解析：new Date('2026-09-10') 按 UTC 算，东八区会少一天
    const target = parseLocalDate(expiresAt);
    if (!target) return null;
    // 必须按「日历日」算：拿到期日的 0 点去减当前时刻，会把一天切成两种结果——
    // 同一天上午算出 0、下午算出 -1。实测（2026-09-19 16:35）：
    //   到期=今天 → -1 → 显示「已过期，尽快处理」（今天其实还能吃）
    //   到期=明天 → 0 → 显示「还剩 0 天」；此后每个数都少一天
    // 而且「临期待用」的判据是 days>=0，所以到期当天的食材根本不计入临期。
    // 两边都归到当天 0 点再相减，才是用户理解的那个数。
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  },

  buildAmountText(item) {
    const text = `${item.amount || ''}${item.unit || ''}`.trim();
    return text || '未记录';
  },

  buildExpiresText(days) {
    if (days === null) return '未填到期日';
    if (days < 0) return '已过期，尽快处理';
    // 到期当天说「还剩 0 天」读起来像已经没了；这一天恰恰是最该提醒的一天
    if (days === 0) return '今天就到期，先用';
    if (days <= 3) return `还剩 ${days} 天，先用`;
    return `保质期 还剩 ${days} 天`;
  }
});
