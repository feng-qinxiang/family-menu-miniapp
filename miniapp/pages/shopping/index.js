const {
  addPantryItem,
  deletePantryItem,
  addShoppingItem,
  deleteShoppingItem,
  getPantryItems,
  getShoppingList,
  getTodayMenu,
  rebuildShoppingList,
  toggleShoppingPurchased
} = require('../../utils/api');
const { withScrollReveal, dispose: disposeScrollReveal } = require('../../behaviors/scroll-reveal');
const { indexPantry, pantryHas } = require('../../utils/pantry-match');

const { recipeDishImg, localDishByIngredient } = require('../../utils/image');
const { INGREDIENT_CATEGORIES, categoryOf } = require('../../utils/ingredients');
const { shoppingEmptyReason } = require('../../utils/kitchen');

function pantryCategory(name) {
  return categoryOf(name);
}

function decoratePantryItem(it) {
  const name = it.ingredientName || it.name || '';
  const cat = pantryCategory(name);
  return {
    ...it,
    cover: localDishByIngredient(name),
    initial: String(name || '菜').slice(0, 1),
    categoryKey: cat.key
  };
}

function groupPantry(items) {
  const map = {};
  (items || []).forEach(it => {
    const cat = pantryCategory(it.ingredientName || it.name);
    if (!map[cat.key]) map[cat.key] = { key: cat.key, label: cat.label, items: [] };
    map[cat.key].items.push(decoratePantryItem(it));
  });
  return ['veg', 'meat', 'season', 'other'].map(k => map[k]).filter(Boolean);
}

const ingredientCategories = INGREDIENT_CATEGORIES;

Page({
  data: {
    tab: 'shopping',          // shopping | pantry
    navSolid: false,
    pantryCategories: [],
    pantryCount: 0,
    pantryError: false,
    newPantryItem: { ingredientName: '', amount: '', unit: '' },
    showPantryForm: false,
    shoppingList: {
      shoppingListId: 0,
      dailyMenuId: 0,
      familyId: 0,
      status: 'OPEN',
      items: []
    },
    pendingItems: [],
    purchasedItems: [],
    groupedPending: [],
    groupedPurchased: [],
    // 空清单的原因（'no-menu' / 'no-ingredients'）与对应文案，由 buildShoppingState 填
    emptyReason: '',
    emptyState: { title: '', desc: '', cta: '' },
    summary: {
      totalCount: 0,
      pendingCount: 0,
      purchasedCount: 0,
      progressPercent: 0,
      statusText: '等今日菜单'
    },
    quickItems: [
      { ingredientName: '葱姜蒜', amount: '1', unit: '份' },
      { ingredientName: '鸡蛋', amount: '6', unit: '个' },
      { ingredientName: '青菜', amount: '1', unit: '把' }
    ],
    newItem: { ingredientName: '', amount: '', unit: '' },
    skeletonRows: [1, 2, 3],
    loading: true,
    loadError: false,
    addItemSubmitting: false
  },

  onShow() {
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
    Promise.resolve(this.loadShoppingList(this._hasLoaded === true)).then(() => { this._hasLoaded = true; });
  },

  onPageScroll(e) {
    const navSolid = (e.scrollTop || 0) > 80;
    if (navSolid !== this.data.navSolid) this.setData({ navSolid });
  },

  async onPullDownRefresh() {
    try {
      await this.loadShoppingList();
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async loadShoppingList(silent) {
    if (!silent) this.setData({ loading: true });
    this.setData({ loadError: false });
    try {
      // 禁用数组解构：该语法编译后依赖 @babel/runtime 辅助模块，未打包进小程序会整页白屏
      const loaded = await Promise.all([
        getShoppingList(),
        getTodayMenu(),
        getPantryItems()
      ]);
      const shoppingList = loaded[0], todayMenu = loaded[1], pantryItems = loaded[2];
      this._lastContext = { todayMenu, pantryItems };
      this.applyShoppingList(shoppingList, { todayMenu, pantryItems, loading: false });
      this.setPantryView(pantryItems);
    } catch (err) {
      console.error('shopping load failed', err);
      this.setData({ loading: false, loadError: true });
    }
  },

  retryLoad() {
    this.setData({ loading: true, loadError: false });
    this.loadShoppingList();
  },

  // 空态出口：没点菜去挑菜，点了菜没录用料去补用料——两条路都落在菜谱页
  goRecipes() {
    wx.switchTab({ url: '/pages/recipes/index', fail() {} });
  },

  setPantryView(pantryItems) {
    const items = Array.isArray(pantryItems) ? pantryItems : [];
    this.setData({
      pantryCategories: groupPantry(items),
      pantryCount: items.length,
      // 拉到数据就说明这次没失败（重试成功后失败态要自动消失）
      pantryError: false
    });
  },

  switchTab(e) {
    const { tab } = e.currentTarget.dataset;
    if (!tab || tab === this.data.tab) return;
    this.setData({ tab });
    if (tab === 'pantry') this.loadPantry();
  },

  // 冰箱列表单独拉一次：失败要留失败态（和待买清单一样给「重新加载」）。
  // 否则断网时用户看到的是「冰箱还空着」——库存明明还在，只是没拉到
  loadPantry() {
    this.setData({ pantryError: false });
    return getPantryItems()
      .then((items) => this.setPantryView(items))
      .catch((err) => {
        this.setData({ pantryError: true });
      });
  },

  retryPantry() {
    this.loadPantry();
  },

  togglePantryForm() {
    this.setData({ showPantryForm: !this.data.showPantryForm });
  },

  onPantryInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`newPantryItem.${field}`]: e.detail.value });
  },

  async addPantryEntry() {
    const { ingredientName, amount, unit } = this.data.newPantryItem;
    if (!(ingredientName || '').trim()) {
      wx.showToast({ title: '请输入食材名', icon: 'none' });
      return;
    }
    try {
      await addPantryItem({ ingredientName: ingredientName.trim(), amount, unit });
    } catch (err) {
      wx.showToast({ title: '添加失败', icon: 'none' });
      return;
    }
    this.setData({ newPantryItem: { ingredientName: '', amount: '', unit: '' }, showPantryForm: false });
    try {
      const items = await getPantryItems();
      this.setPantryView(items);
    } catch (err) {
      wx.showToast({ title: '库存刷新失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已记入', icon: 'success' });
  },

  async removePantryEntry(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
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
    try {
      const items = await getPantryItems();
      this.setPantryView(items);
    } catch (err) {
      wx.showToast({ title: '库存刷新失败', icon: 'none' });
    }
  },

  // 实测（2026-09-19）：重建删掉 is_manual=0 的自动条目后，会按「食材名+单位」把上一版的
  // 已买勾选恢复回去（TodayService.loadPreviousPurchasedMap），手动条目不动。
  // 早先这里的注释和文案都写成"已买会被清掉"，与代码和实测都相反。
  async refreshList() {
    const res = await wx.showModal({
      title: '按今日菜单重新整理？',
      content: '自动条目按当前菜单重算用量；已勾的「买好了」和你手动加的条目都会保留。',
      confirmText: '重新整理',
      cancelText: '取消'
    });
    if (!res.confirm) return;
    if (this.data.refreshingList) return;
    this.setData({ refreshingList: true });
    wx.showLoading({ title: '整理中', mask: true });
    try {
      const loaded = await Promise.all([
        rebuildShoppingList(),
        getTodayMenu(),
        getPantryItems()
      ]);
      const shoppingList = loaded[0], todayMenu = loaded[1], pantryItems = loaded[2];
      this._lastContext = { todayMenu, pantryItems };
      this.applyShoppingList(shoppingList, { todayMenu, pantryItems });
      wx.hideLoading();
      wx.showToast({ title: '已按菜单整理', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '整理失败，请重试', icon: 'none' });
    } finally {
      this.setData({ refreshingList: false });
    }
  },

  async toggleItem(event) {
    const { id } = event.currentTarget.dataset;
    const items = (this.data.shoppingList && this.data.shoppingList.items) || [];
    const idx = items.findIndex((it) => it.itemId === id);
    if (idx < 0) return;
    const next = !items[idx].purchased;
    const name = items[idx].ingredientName || '这项';
    // 乐观更新：本地先翻勾（分组/摘要同步重算），单发 PATCH，不重拉列表
    const flipped = items.map((it, k) => (k === idx ? { ...it, purchased: next } : it));
    this.setData(this.buildShoppingState({ ...this.data.shoppingList, items: flipped }, this._lastContext || {}));
    wx.showToast({
      title: next ? `${name} 已入篮` : `${name} 改回待买`,
      icon: 'none'
    });
    try {
      await toggleShoppingPurchased(id, next);
    } catch (err) {
      // 失败定向翻回目标项：按 itemId 对当前数据操作，仅当该项仍处于本次乐观翻勾态才回退，
      // 不动期间已翻的其他项（禁止快照覆盖/重拉列表式回滚，防连勾竞态弹回邻项）
      const current = (this.data.shoppingList && this.data.shoppingList.items) || [];
      const reverted = current.map((it) => (it.itemId === id && it.purchased === next ? { ...it, purchased: !next } : it));
      this.setData(this.buildShoppingState({ ...this.data.shoppingList, items: reverted }, this._lastContext || {}));
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    }
  },

  onNewItemInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`newItem.${field}`]: e.detail.value });
  },

  async addItem() {
    const { ingredientName, amount, unit } = this.data.newItem;
    await this.addItemPayload({ ingredientName, amount, unit }, true);
  },

  async addQuickItem(event) {
    const { name, amount, unit } = event.currentTarget.dataset;
    await this.addItemPayload({ ingredientName: name, amount, unit }, false);
  },

  async addItemPayload(payload, shouldClearInput) {
    if (this.data.addItemSubmitting) return;
    const ingredientName = (payload.ingredientName || '').trim();
    if (!ingredientName.trim()) {
      wx.showToast({ title: '请输入食材名', icon: 'none' });
      return;
    }
    let result;
    this.setData({ addItemSubmitting: true });
    // 添加后还会串行补拉菜单与库存明细，全程没有反馈会让用户以为没点上
    wx.showLoading({ title: '添加中', mask: true });
    try {
      result = await addShoppingItem({
        ingredientName,
        amount: payload.amount || '',
        unit: payload.unit || ''
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ addItemSubmitting: false });
      wx.showToast({ title: '添加失败，请重试', icon: 'none' });
      return;
    }
    if (result) {
      let context = this._lastContext || {};
      try {
        const loaded = await Promise.all([getTodayMenu(), getPantryItems()]);
        const todayMenu = loaded[0], pantryItems = loaded[1];
        context = this._lastContext = { todayMenu, pantryItems };
      } catch (err) {
        wx.showToast({ title: '清单已更新，明细刷新失败', icon: 'none' });
      }
      wx.hideLoading();
      const nextState = this.buildShoppingState(result, context);
      if (shouldClearInput) {
        nextState.newItem = { ingredientName: '', amount: '', unit: '' };
      }
      nextState.addItemSubmitting = false;
      this.setData(nextState);
    } else {
      await this.loadShoppingList();
      if (shouldClearInput) {
        this.setData({ newItem: { ingredientName: '', amount: '', unit: '' }, addItemSubmitting: false });
      } else {
        this.setData({ addItemSubmitting: false });
      }
    }
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  async deleteItem(event) {
    const { id } = event.currentTarget.dataset;
    // 二次确认（仿 menu 撤菜弹窗），防误触
    const res = await wx.showModal({
      title: '移除这一项？',
      confirmText: '移除',
      cancelText: '保留'
    });
    if (!res.confirm) return;
    let result;
    try {
      result = await deleteShoppingItem(id);
    } catch (err) {
      wx.showToast({ title: '删除失败，请重试', icon: 'none' });
      return;
    }
    if (result) {
      let context = this._lastContext || {};
      try {
        const loaded = await Promise.all([getTodayMenu(), getPantryItems()]);
        const todayMenu = loaded[0], pantryItems = loaded[1];
        context = this._lastContext = { todayMenu, pantryItems };
      } catch (err) {
        wx.showToast({ title: '清单已更新，明细刷新失败', icon: 'none' });
      }
      this.applyShoppingList(result, context);
    } else {
      await this.loadShoppingList();
    }
  },

  applyShoppingList(shoppingList, extraState) {
    const context = extraState || {};
    const patch = this.buildShoppingState(shoppingList, context);
    // 仅把 loading 透传进 data，todayMenu/pantryItems 只用于 enrich，不写入 page data
    if (Object.prototype.hasOwnProperty.call(context, 'loading')) {
      patch.loading = context.loading;
    }
    this.setData(patch, () => withScrollReveal(this, { item: '.mkt-item' }));
  },

  onUnload() {
    disposeScrollReveal(this);
  },

  buildShoppingState(shoppingList, context) {
    const normalized = shoppingList || {};
    const items = this.enrichItems(Array.isArray(normalized.items) ? normalized.items : [], context || {});
    const pendingItems = items.filter((item) => !item.purchased);
    const purchasedItems = items.filter((item) => item.purchased);
    const totalCount = items.length;
    const purchasedCount = purchasedItems.length;
    const pendingCount = pendingItems.length;
    const progressPercent = totalCount ? Math.round((purchasedCount / totalCount) * 100) : 0;
    // 清单为空时的原因（'no-menu' / 'no-ingredients'）：文案与出路都按它分岔，
    // 见 utils/kitchen.js#shoppingEmptyReason 里"为什么不能只说一句"的注释
    const emptyReason = shoppingEmptyReason((context.todayMenu && context.todayMenu.items || []).length, totalCount);
    return {
      shoppingList: { ...normalized, items },
      pendingItems,
      purchasedItems,
      groupedPending: this.groupItems(pendingItems),
      groupedPurchased: this.groupItems(purchasedItems),
      emptyReason,
      emptyState: emptyReason === 'no-ingredients'
        ? { title: '还没有要买的', desc: '今天点的菜还没录用料，去菜谱里补上就能自动生成', cta: '去菜谱' }
        : { title: '今天还没点菜', desc: '先去菜谱挑几道，买菜清单会跟着长出来', cta: '去点菜' },
      summary: {
        totalCount,
        pendingCount,
        purchasedCount,
        progressPercent,
        statusText: totalCount
          ? (pendingCount ? `还差 ${pendingCount} 样` : '今天买齐了')
          : (emptyReason === 'no-ingredients' ? '这几道菜还没录食材' : '今天还没点菜')
      }
    };
  },

  enrichItems(items, context) {
    const menuItems = context.todayMenu && Array.isArray(context.todayMenu.items) ? context.todayMenu.items : [];
    const pantryItems = Array.isArray(context.pantryItems) ? context.pantryItems : [];
    const pantryIndex = indexPantry(pantryItems);
    return items.map((item) => {
      // 后端已在清单条目上返回来源菜谱（今日菜单回溯），优先使用；本地匹配仅作旧数据兜底
      const backendSources = Array.isArray(item.sourceRecipes) ? item.sourceRecipes.filter(Boolean) : [];
      const sourceRecipes = backendSources.length
        ? backendSources.slice(0, 2)
        : this.findSourceRecipes(item.ingredientName, menuItems);
      // 「库存里已有」用与服务端扣库存同一口径（utils/pantry-match）：
      // 原来只比名字（还带双向子串），"冰箱里有紫菜 1 包"会被当成"紫菜 8g 够了"
      const inPantry = pantryHas(pantryIndex, item.ingredientName, item.unit, item.amount);
      const category = this.resolveCategory(item.ingredientName);
      return {
        ...item,
        sourceText: sourceRecipes.length ? `来自 ${sourceRecipes.join('、')}` : '手动补充',
        pantryText: inPantry ? '库存里已有' : '',
        categoryKey: category.key,
        categoryLabel: category.label,
        cover: this.resolveItemCover(item.ingredientName, menuItems, sourceRecipes),
        initial: String(item.ingredientName || '菜').slice(0, 1)
      };
    });
  },

  resolveItemCover(ingredientName, menuItems, sourceRecipes) {
    // 有来源菜谱时直接用该菜谱封面（菜单项的 recipe 含 title/coverImage）
    if (Array.isArray(sourceRecipes) && sourceRecipes.length) {
      for (let i = 0; i < menuItems.length; i++) {
        const recipe = menuItems[i].recipe || {};
        if (recipe.title && sourceRecipes.indexOf(recipe.title) !== -1) {
          return recipeDishImg(recipe);
        }
      }
    }
    return localDishByIngredient(ingredientName);
  },

  findSourceRecipes(ingredientName, menuItems) {
    const result = [];
    menuItems.forEach((menuItem) => {
      const recipe = menuItem.recipe || {};
      const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
      const matched = ingredients.some((ingredient) => this.sameIngredient(ingredient.name || ingredient.ingredientName, ingredientName));
      if (matched && recipe.title) {
        result.push(recipe.title);
      }
    });
    return result.slice(0, 2);
  },

  sameIngredient(left, right) {
    const a = String(left || '').trim();
    const b = String(right || '').trim();
    return !!a && !!b && (a.includes(b) || b.includes(a));
  },

  resolveCategory(name) {
    const value = String(name || '');
    const matched = ingredientCategories.find((category) => category.words.some((word) => value.includes(word)));
    return matched || { key: 'other', label: '其他' };
  },

  groupItems(items) {
    const map = new Map();
    items.forEach((item) => {
      const key = item.categoryKey || 'other';
      if (!map.has(key)) {
        map.set(key, { key, label: item.categoryLabel || '其他', items: [] });
      }
      map.get(key).items.push(item);
    });
    return Array.from(map.values());
  }
});
