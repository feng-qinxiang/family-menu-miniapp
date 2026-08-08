const {
  addPantryItem,
  deletePantryItem,
  getPantryItems,
  getPantryMatch,
  getWeeklyMenu
} = require('../../utils/api');

// 分类规则：按食材名关键字归类（蔬菜 / 肉蛋 / 调料 / 其他）
const CATEGORY_RULES = [
  { key: 'veg', label: '蔬菜', icon: 'veg', words: ['菜', '番茄', '西红柿', '椒', '土豆', '葱', '蒜', '姜', '瓜', '茄', '萝卜', '豆角', '芹', '菇', '笋', '藕', '兰花', '生菜'] },
  { key: 'meat', label: '肉蛋', icon: 'meat', words: ['肉', '蛋', '鸡', '鸭', '鱼', '虾', '牛', '猪', '羊', '豆腐', '排骨', '虾仁'] },
  { key: 'season', label: '调料', icon: 'season', words: ['生抽', '老抽', '酱', '醋', '油', '盐', '糖', '淀粉', '料酒', '蚝油', '辣', '椒粉', '味精', '鸡精', '豆瓣'] }
];

// 本地菜图兜底映射（无 coverImage 时按标题猜）
const DISH_IMG = {
  麻婆豆腐: 'mapo-tofu', 番茄炒蛋: 'tomato-egg', 西红柿炒鸡蛋: 'tomato-egg',
  宫保鸡丁: 'kungpao-chicken', 红烧肉: 'hongshao-pork', 炒饭: 'fried-rice',
  蛋炒饭: 'fried-rice', 西兰花: 'beef-broccoli', 鱼香茄子: 'sichuan-eggplant',
  酸辣汤: 'hot-sour-soup', 鸡蛋汤: 'egg-drop-soup', 馄饨: 'wontons',
  皮蛋瘦肉粥: 'chicken-congee', 炒面: 'lo-mein', 橙汁鸡: 'orange-chicken',
  糖醋里脊: 'sweet-sour-chicken', 虾仁炒豌豆: 'shrimp-peas', 干煸豆角: 'long-beans'
};
const DEFAULT_DISH_IMG = '/assets/dishes/tomato-egg.jpg';

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
    loadError: false
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
    this.loadPantry();
  },

  onPullDownRefresh() {
    Promise.resolve(this.loadPantry()).catch(() => {}).then(() => setTimeout(() => wx.stopPullDownRefresh(), 300));
  },

  retryLoad() {
    this.setData({ loadError: false, loaded: false });
    this.loadPantry();
  },

  async loadPantry() {
    this.setData({ loading: true, loadError: false });
    let pantryItems = [];
    let weeklyMenu = null;
    let failed = false;
    try {
      [pantryItems, weeklyMenu] = await Promise.all([getPantryItems(), getWeeklyMenu()]);
    } catch (e) {
      pantryItems = [];
      failed = true;
    }
    if (failed) {
      this.setData({ loaded: true, loading: false, loadError: true });
      wx.showToast({ title: '冰箱数据加载失败', icon: 'none' });
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
    const { ingredientName, amount, unit, expiresAt } = this.data.newItem;
    if (!ingredientName.trim()) {
      wx.showToast({ title: '请输入食材名', icon: 'none' });
      return;
    }
    try {
      await addPantryItem({ ingredientName: ingredientName.trim(), amount, unit, expiresAt });
    } catch (e) {
      wx.showToast({ title: '添加失败', icon: 'none' });
      return;
    }
    this.setData({
      newItem: { ingredientName: '', amount: '', unit: '', expiresAt: '' },
      showAddForm: false
    });
    await this.loadPantry();
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  async removeItem(e) {
    const { id } = e.currentTarget.dataset;
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
    try {
      matchResults = (await getPantryMatch()) || [];
    } catch (e) {
      matchResults = [];
    }
    this.setData({
      matchResults: this.normalizeMatches(matchResults),
      showMatch: true
    });
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
    const n = String(name || '');
    for (const rule of CATEGORY_RULES) {
      if (rule.words.some((w) => n.includes(w))) {
        return rule;
      }
    }
    return { key: 'other', label: '其他', icon: 'other' };
  },

  normalizeMatches(matches) {
    return (matches || []).map((item) => {
      const recipe = item.recipe || {};
      const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
      const total = ingredients.length || 0;
      const rate = item.matchRate || 0;
      const have = total ? Math.round(rate * total) : 0;
      const full = total > 0 && have >= total;
      const missingList = item.missingIngredients && item.missingIngredients.length
        ? item.missingIngredients
        : [];
      return {
        id: item.id || recipe.id || item.recipeId,
        title: recipe.title || '未命名',
        metaText: `${recipe.cuisine || '家常'} · ${recipe.timeCost || '--'} 分钟`,
        coverImage: recipe.coverImage || this.dishImage(recipe.title),
        haveText: total ? `${have}/${total}` : `${Math.round(rate * 100)}%`,
        percentWidth: Math.max(6, Math.round(rate * 100)),
        full,
        missingText: full
          ? '食材都有，直接开火'
          : (missingList.length ? `还差 ${missingList.join('、')}` : '还差一点配料')
      };
    });
  },

  dishImage(title) {
    const slug = DISH_IMG[String(title || '').trim()];
    return slug ? `/assets/dishes/${slug}.jpg` : DEFAULT_DISH_IMG;
  },

  daysLeft(expiresAt) {
    if (!expiresAt) return null;
    const target = new Date(expiresAt).getTime();
    if (Number.isNaN(target)) return null;
    return Math.floor((target - Date.now()) / 86400000);
  },

  buildAmountText(item) {
    const text = `${item.amount || ''}${item.unit || ''}`.trim();
    return text || '未记录';
  },

  buildExpiresText(days) {
    if (days === null) return '未填到期日';
    if (days < 0) return '已过期，尽快处理';
    if (days <= 3) return `还剩 ${days} 天，先用`;
    return `保质期 还剩 ${days} 天`;
  }
});
