const {
  getPantryItems,
  getShoppingList,
  getTodayMenu,
  getWeeklyMenu,
  generateWeeklyMenu,
  rebuildShoppingList,
  addCookHistory,
  removeTodayMenuRecipe,
  updateMenuItemStatus,
  announceMeal
} = require('../../utils/api');
const { mealTypeLabels, mealOrder } = require('../../utils/constants');
const { fallbackDishImg, recipeDishImg, LOCAL_DISHES } = require('../../utils/image');
const { runGuarded } = require('../../utils/interaction');
const subscribe = require('../../utils/subscribe');

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

// 做菜顺序建议（轻量统筹）：同一餐 ≥2 道待做菜时，按耗时倒排——
// 先开工最耗时的（炖煮类），空档再做快手菜，尽量同时上桌（对齐同行逆排程思路的简化版）
function buildCookOrder(list) {
  const pending = list.filter(d => d.status !== 'done' && d.recipe && Number(d.recipe.timeCost) > 0);
  if (pending.length < 2) return '';
  return pending
    .slice()
    .sort((a, b) => Number(b.recipe.timeCost) - Number(a.recipe.timeCost))
    .map(d => `${d.recipe.title} ${d.recipe.timeCost}分`)
    .join(' → ');
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
    loadError: '',
    heroMetaTop: '91px'
  },

  onLoad() {
    try {
      const mb = wx.getMenuButtonBoundingClientRect();
      if (mb && mb.bottom) this.setData({ heroMetaTop: (mb.bottom + 8) + 'px' });
    } catch (e) {}
    // 预热订阅消息配置：喊开饭时要在点击手势里同步申请授权，不能临时去等网络
    subscribe.preload();
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
    // 首次进页面给骨架，之后回页只静默刷新
    const first = this._hasLoaded !== true;
    Promise.resolve(this.loadData(!first)).then(() => { this._hasLoaded = true; });
  },

  onPullDownRefresh() {
    Promise.resolve(this.loadData()).catch(() => {}).then(() => setTimeout(() => wx.stopPullDownRefresh(), 300));
  },

    // silent=true：已有数据时的「回页刷新」，不显示整页骨架（避免切 tab 闪一下）
  async loadData(silent) {
    if (!silent) this.setData({ loading: true });
    this.setData({ loadError: '' });
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
      // 份量口径：单菜最大份数（每道菜按各自份数做），不是总人数。
      // 文案同步为「最多 N 份」，避免多道菜时被误读成"几个人吃"。
      const maxServings = items.reduce((max, it) => Math.max(max, (it.recipe && it.recipe.servings) || 0), 0);

      const pantrySet = new Set(pantryItems.map(p => normalizeName(p.ingredientName || p.name)));
      const pendingItems = shoppingItems.filter(i => !i.purchased);
      const purchasedItems = shoppingItems.filter(i => i.purchased);
      const pantryReadyCount = pendingItems.filter(i => {
        const n = normalizeName(i.ingredientName || i.name);
        return Array.from(pantrySet).some(p => p && (p === n || p.includes(n) || n.includes(p)));
      }).length;
      const shoppingPercent = shoppingItems.length === 0 ? 0
        : Math.round(purchasedItems.length * 100 / shoppingItems.length);

      const decorate = (it, mealLabel) => ({
        ...it,
        status: it.status || 'todo',
        mealTypeLabel: mealLabel,
        dishImage: resolveImage(it.recipe, it.recipeId || (it.recipe && it.recipe.title))
      });

      const groups = mealOrder
        .map(meal => {
          const list = items
            .filter(it => (it.mealType || 'dinner') === meal)
            .map(it => decorate(it, mealTypeLabels[meal] || '晚餐'));
          return {
            meal,
            label: mealTypeLabels[meal] || '晚餐',
            items: list,
            cookOrderText: buildCookOrder(list)
          };
        })
        .filter(g => g.items.length > 0);

      if (groups.length === 0 && items.length) {
        const list = items.map(it => decorate(it, '晚餐'));
        groups.push({
          meal: 'dinner',
          label: mealTypeLabels.dinner,
          items: list,
          cookOrderText: buildCookOrder(list)
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
        totalServings: maxServings,
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
      this.checkAllDone(items);
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
    // 防重 + 反馈：确认后到结果之间此前完全没有反馈，慢网络下像没点上
    let removed = false;
    await runGuarded(this, `remove-${id}`, async () => {
      await removeTodayMenuRecipe(id);
      removed = true;
    }, {
      loading: '撤菜中',
      success: '',
      fail: '移除失败'
    });
    if (!removed) return;
    await this.loadData();
  },

  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({ url: `/pkg-extra/recipe-detail/index?id=${id}` });
  },

  goShopping() {
    wx.navigateTo({ url: '/pages/shopping/index' });
  },

  goWeekly() {
    wx.navigateTo({ url: '/pkg-extra/weekly-menu/index' });
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
    const { id, item } = e.currentTarget.dataset;
    if (!id) return;
    // 先写入「烧着呢」再跳转：此前是 fire-and-forget，跳到烹饪模式后立刻返回菜单
    // 会读到旧状态（onShow 重拉早于写入完成）。写入很快，等一下换来状态一致。
    if (item) {
      try {
        await updateMenuItemStatus(item, 'cooking');
      } catch (err) {
        // 写入失败不拦住做菜：返回本页 onShow 会重新拉取真实状态
        console.warn('mark cooking failed', err);
      }
    }
    wx.navigateTo({
      url: `/pkg-extra/cook-mode/index?id=${id}&menuItemId=${item || ''}`,
      fail: () => wx.showToast({ title: '页面打开失败，请重试', icon: 'none' })
    });
  },

  async markCooked(e) {
    const { id, item } = e.currentTarget.dataset;
    if (!id) return;
    const res = await wx.showModal({
      title: '这道菜上桌了？',
      content: '标记上桌，并记一笔做菜历史',
      confirmText: '上桌',
      cancelText: '再等等',
      editable: false
    });
    if (!res.confirm) return;
    let done = false;
    await runGuarded(this, `cooked-${id}`, async () => {
      await Promise.all([
        item ? updateMenuItemStatus(item, 'done') : Promise.resolve(),
        addCookHistory({ recipeId: id }).catch(() => {})
      ]);
      done = true;
    }, {
      loading: '处理中',
      success: '已上桌',
      fail: '操作失败'
    });
    if (!done) return;
    await this.loadData();
  },

  // 全部上桌的跳变检测（loadData 末尾调用）：从"未全做完"变成"全做完"时弹一次开饭广播
  checkAllDone(items) {
    const allDone = items.length > 0 && items.every(it => (it.status || 'todo') === 'done');
    const wasDone = this._allDone;
    this._allDone = allDone;
    if (!allDone || wasDone !== false) return;
    wx.showModal({
      title: '今天的菜都做好了！',
      content: '要喊家人来吃饭吗？会给家里每个人发一条开饭通知。',
      confirmText: '喊开饭',
      cancelText: '先不用',
      success: (res) => {
        if (!res.confirm) return;
        // 顺带补一次「开饭提醒」订阅授权（一次性订阅：同意一次才够发一条）。
        // 若基础库不认弹窗回调里的手势，这里只会拿不到授权、静默返回 false，不影响下面发通知。
        subscribe.apply('meal');
        announceMeal()
          .then(() => wx.showToast({ title: '已通知家人', icon: 'success' }))
          .catch(() => wx.showToast({ title: '通知没发出去', icon: 'none' }));
      }
    });
  },

  async buildShopping() {
    if (!this.data.totalCount) {
      wx.showToast({ title: '菜单还是空的', icon: 'none' });
      return;
    }
    // 重建会覆盖当前清单（手动补充的条目会重算），属于破坏性操作，先确认
    const res = await wx.showModal({
      title: '按今日菜单重新生成清单？',
      content: '会按当前菜单重算食材，之前在清单里手动添加的条目将被覆盖。',
      confirmText: '重新生成',
      cancelText: '取消'
    });
    if (!res.confirm) return;
    const ok = await runGuarded(this, 'rebuild-shopping', () => rebuildShoppingList(), {
      loading: '生成中',
      success: '已生成',
      fail: '生成失败'
    });
    if (ok === undefined) return;
    if (this._navTimer) clearTimeout(this._navTimer);
    this._navTimer = setTimeout(() => wx.navigateTo({ url: '/pages/shopping/index' }), 400);
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
