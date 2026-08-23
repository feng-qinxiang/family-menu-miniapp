const {
  getPantryItems,
  getShoppingList,
  getTodayMenu,
  getWeeklyMenu,
  generateWeeklyMenu,
  rebuildShoppingList,
  addCookHistory,
  removeTodayMenuRecipe
} = require('../../utils/api');
const { mealTypeLabels, mealOrder } = require('../../utils/constants');
const { fallbackDishImg, recipeDishImg, LOCAL_DISHES } = require('../../utils/image');

function buildToday() {
  const d = new Date();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 · ${weekdays[d.getDay()]}`;
}

function mealTimeLabel() {
  const h = new Date().getHours();
  if (h < 10) return '早餐时间';
  if (h < 15) return '午餐时间';
  if (h < 21) return '晚餐时间';
  return '夜宵时间';
}

function hashIndex(seed, mod) {
  const s = (seed || '').toString();
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) % 1000000;
  }
  return Math.abs(h) % mod;
}

function localDishImage(seed) {
  return `/assets/dishes/${LOCAL_DISHES[hashIndex(seed, LOCAL_DISHES.length)]}.jpg`;
}

function resolveImage(recipe, seed) {
  if (recipe) return recipeDishImg(recipe);
  return localDishImage(seed);
}

function normalizeName(name) {
  return (name || '').toString().toLowerCase().trim();
}

Page({
  data: {
    view: 'today',          // today | week (§3 segment)
    todayLabel: buildToday(),
    mealTimeLabel: mealTimeLabel(),
    heroImage: '/assets/dishes/hot-sour-soup.jpg',
    todayMenu: [],
    mealGroups: [],
    totalCount: 0,
    totalTime: 0,
    totalServings: 0,
    shoppingPending: 0,
    shoppingTotal: 0,
    shoppingDone: 0,
    shoppingPercent: 0,
    pantryReadyCount: 0,
    weeklyDays: [],
    loading: true,
    loadError: ''
  },

  onShow() {
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
    // 跨天刷新日期文案（todayLabel 在 data 初始化时只算一次）
    const label = buildToday();
    if (label !== this.data.todayLabel) {
      this.setData({ todayLabel: label });
    }
    this.loadData();
  },

  onPullDownRefresh() {
    Promise.resolve(this.loadData()).catch(() => {}).then(() => setTimeout(() => wx.stopPullDownRefresh(), 300));
  },

  async loadData() {
    this.setData({ loading: true, loadError: '' });
    try {
      const [todayMenu, shoppingList, weeklyMenu, pantry] = await Promise.all([
        getTodayMenu(),
        getShoppingList(),
        getWeeklyMenu(),
        getPantryItems()
      ]);

      const items = todayMenu && Array.isArray(todayMenu.items) ? todayMenu.items : [];
      const shoppingItems = shoppingList && Array.isArray(shoppingList.items) ? shoppingList.items : [];
      const weeklyDays = weeklyMenu && Array.isArray(weeklyMenu.days) ? weeklyMenu.days.slice(0, 5) : [];
      const pantryItems = Array.isArray(pantry) ? pantry : [];

      const totalCount = items.length;
      const totalTime = items.reduce((sum, it) => sum + (it.recipe && it.recipe.timeCost ? Number(it.recipe.timeCost) : 0), 0);
      const totalServings = items.reduce((max, it) => Math.max(max, (it.recipe && it.recipe.servings) || 0), 0);

      const pantrySet = new Set(pantryItems.map(p => normalizeName(p.ingredientName || p.name)));
      const pendingItems = shoppingItems.filter(i => !i.purchased);
      const purchasedItems = shoppingItems.filter(i => i.purchased);
      const pantryReadyCount = pendingItems.filter(i => {
        const n = normalizeName(i.ingredientName || i.name);
        return Array.from(pantrySet).some(p => p && (p === n || p.includes(n) || n.includes(p)));
      }).length;
      const shoppingPercent = shoppingItems.length === 0 ? 0
        : Math.round(purchasedItems.length * 100 / shoppingItems.length);

      const groups = mealOrder
        .map(meal => {
          const list = items
            .filter(it => (it.mealType || 'dinner') === meal)
            .map(it => ({
              ...it,
              mealTypeLabel: mealTypeLabels[meal] || '晚餐',
              dishImage: resolveImage(it.recipe, it.recipeId || (it.recipe && it.recipe.title))
            }));
          return {
            meal,
            label: mealTypeLabels[meal] || '晚餐',
            items: list
          };
        })
        .filter(g => g.items.length > 0);

      if (groups.length === 0 && items.length) {
        groups.push({
          meal: 'dinner',
          label: mealTypeLabels.dinner,
          items: items.map(it => ({
            ...it,
            mealTypeLabel: '晚餐',
            dishImage: resolveImage(it.recipe, it.recipeId || (it.recipe && it.recipe.title))
          }))
        });
      }

      const heroItem = items[0];
      const heroImage = resolveImage(
        heroItem && heroItem.recipe,
        (heroItem && heroItem.recipeId) || 'hot-sour-soup'
      );

      this.setData({
        todayMenu: items,
        mealGroups: groups,
        heroImage: items.length ? heroImage : '/assets/dishes/hot-sour-soup.jpg',
        mealTimeLabel: mealTimeLabel(),
        totalCount,
        totalTime,
        totalServings,
        shoppingPending: pendingItems.length,
        shoppingTotal: shoppingItems.length,
        shoppingDone: purchasedItems.length,
        shoppingPercent,
        pantryReadyCount,
        weeklyDays: weeklyDays.map((day, idx) => {
          const recipes = Array.isArray(day.recipes) ? day.recipes : [];
          const names = recipes.map(r => r.title).filter(Boolean);
          return {
            ...day,
            recipeCount: recipes.length,
            d1: day.dayLabel || (idx === 0 ? '明天' : `第${idx + 1}天`),
            d2: day.dateLabel || day.date || '',
            recipeText: names.length ? names.slice(0, 2).join(' · ') : '还没排，去看看'
          };
        }),
        loading: false,
        loadError: ''
      });
    } catch (err) {
      console.error('menu loadData failed', err);
      this.setData({
        loading: false,
        loadError: (err && err.message) ? err.message : '加载失败'
      });
    }
  },

  async removeItem(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    const res = await wx.showModal({
      title: '撤掉这道菜？',
      content: '撤掉后会重算购物清单',
      confirmText: '撤掉',
      cancelText: '保留'
    });
    if (!res.confirm) return;
    try {
      await removeTodayMenuRecipe(id);
    } catch (err) {
      wx.showToast({ title: '移除失败', icon: 'none' });
      return;
    }
    await this.loadData();
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({ url: `/pages/recipe-detail/index?id=${id}` });
  },

  goShopping() {
    wx.navigateTo({ url: '/pages/shopping/index' });
  },

  goWeekly() {
    wx.navigateTo({ url: '/pages/weekly-menu/index' });
  },

  goPantry() {
    wx.switchTab({ url: '/pages/pantry/index' });
  },

  goAddRecipe() {
    wx.switchTab({ url: '/pages/recipes/index' });
  },

  // ====== §3 / §7 新增 ======
  retryLoad() {
    this.setData({ loading: true });
    this.loadData();
  },

  switchView(e) {
    const { view } = e.currentTarget.dataset;
    if (!view || view === this.data.view) return;
    this.setData({ view });
  },

  async startCook(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({ url: `/pages/cook-mode/index?id=${id}` });
  },

  async markCooked(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    const res = await wx.showModal({
      title: '已做完？',
      content: '记一笔到做菜历史',
      confirmText: '完成',
      cancelText: '再等等',
      editable: false
    });
    if (!res.confirm) return;
    try {
      await addCookHistory({ recipeId: id });
      wx.showToast({ title: '已记录', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: '记录失败', icon: 'none' });
    }
  },

  async buildShopping() {
    if (!this.data.totalCount) {
      wx.showToast({ title: '菜单还是空的', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '生成中', mask: true });
    try {
      await rebuildShoppingList();
      wx.hideLoading();
      wx.showToast({ title: '已生成', icon: 'success' });
      if (this._navTimer) clearTimeout(this._navTimer);
      this._navTimer = setTimeout(() => wx.navigateTo({ url: '/pages/shopping/index' }), 400);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  onUnload() {
    if (this._navTimer) {
      clearTimeout(this._navTimer);
      this._navTimer = null;
    }
  },

  async genWeekly() {
    wx.showLoading({ title: '排周菜单', mask: true });
    try {
      await generateWeeklyMenu();
      wx.hideLoading();
      wx.showToast({ title: '已生成', icon: 'success' });
      this.loadData();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  onShareAppMessage() {
    const n = (this.data.todayMenu && this.data.todayMenu.length) || 0;
    return {
      title: n > 0 ? '今天家里吃这些（' + n + ' 道）' : '今天的菜单，来看看吗',
      path: '/pages/menu/index'
    };
  },

  // 图片加载失败兜底：coverImage 失效时用本地占位图（home 页同款策略）
  onHeroImgError() {
    this.setData({ heroImage: fallbackDishImg('hot-sour-soup') });
  },

  onImgError(e) {
    const { group, dish, seed } = e.currentTarget.dataset;
    if (typeof group !== 'number' || typeof dish !== 'number') return;
    this.setData({ [`mealGroups[${group}].items[${dish}].dishImage`]: fallbackDishImg(seed) });
  },
});
