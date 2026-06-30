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

const PANTRY_CATS = [
  { key: 'veg',    label: '蔬菜', words: ['菜', '番茄', '椒', '土豆', '葱', '蒜', '姜', '瓜', '茄', '萝卜', '豆角', '芹', '菇', '笋', '兰花', '生菜'] },
  { key: 'meat',   label: '肉蛋', words: ['肉', '蛋', '鸡', '鸭', '鱼', '虾', '牛', '猪', '羊', '豆腐', '排骨'] },
  { key: 'season', label: '调料', words: ['生抽', '老抽', '酱', '醋', '油', '盐', '糖', '淀粉', '料酒', '蚝油', '辣'] }
];

function pantryCategory(name) {
  const n = String(name || '');
  const cat = PANTRY_CATS.find(c => c.words.some(w => n.includes(w)));
  return cat ? { key: cat.key, label: cat.label } : { key: 'other', label: '其他' };
}

function groupPantry(items) {
  const map = {};
  (items || []).forEach(it => {
    const cat = pantryCategory(it.ingredientName || it.name);
    if (!map[cat.key]) map[cat.key] = { key: cat.key, label: cat.label, items: [] };
    map[cat.key].items.push(it);
  });
  return ['veg', 'meat', 'season', 'other'].map(k => map[k]).filter(Boolean);
}

const ingredientCategories = [
  { key: 'veg', label: '蔬菜水果', words: ['菜', '葱', '姜', '蒜', '番茄', '西兰花', '黄瓜', '椒', '香菜'] },
  { key: 'meat', label: '肉蛋水产', words: ['肉', '鸡', '蛋', '鱼', '虾', '牛', '猪', '五花'] },
  { key: 'seasoning', label: '调味干货', words: ['盐', '糖', '生抽', '老抽', '料酒', '醋', '酱', '油', '八角', '花椒'] }
];

Page({
  data: {
    tab: 'shopping',          // shopping | pantry
    pantryCategories: [],
    pantryCount: 0,
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
    loading: true
  },

  onShow() {
    this.loadShoppingList();
  },

  async loadShoppingList() {
    const [shoppingList, todayMenu, pantryItems] = await Promise.all([
      getShoppingList(),
      getTodayMenu(),
      getPantryItems()
    ]);
    this.applyShoppingList(shoppingList, { todayMenu, pantryItems, loading: false });
    this.setPantryView(pantryItems);
  },

  setPantryView(pantryItems) {
    const items = Array.isArray(pantryItems) ? pantryItems : [];
    this.setData({
      pantryCategories: groupPantry(items),
      pantryCount: items.length
    });
  },

  switchTab(e) {
    const { tab } = e.currentTarget.dataset;
    if (!tab || tab === this.data.tab) return;
    this.setData({ tab });
    if (tab === 'pantry') {
      getPantryItems().then(items => this.setPantryView(items));
    }
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
    const items = await getPantryItems();
    this.setPantryView(items);
    wx.showToast({ title: '已记入', icon: 'success' });
  },

  async removePantryEntry(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    try {
      await deletePantryItem(id);
    } catch (err) {
      wx.showToast({ title: '删除失败', icon: 'none' });
      return;
    }
    const items = await getPantryItems();
    this.setPantryView(items);
  },

  async refreshList() {
    const [shoppingList, todayMenu, pantryItems] = await Promise.all([
      rebuildShoppingList(),
      getTodayMenu(),
      getPantryItems()
    ]);
    this.applyShoppingList(shoppingList, { todayMenu, pantryItems });
    wx.showToast({ title: '已按菜单整理', icon: 'success' });
  },

  async toggleItem(event) {
    const { id, purchased } = event.currentTarget.dataset;
    const currentPurchased = purchased === true || purchased === 'true';
    const [shoppingList, todayMenu, pantryItems] = await Promise.all([
      toggleShoppingPurchased(id, !currentPurchased),
      getTodayMenu(),
      getPantryItems()
    ]);
    this.applyShoppingList(shoppingList, { todayMenu, pantryItems });
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
    const ingredientName = (payload.ingredientName || '').trim();
    if (!ingredientName.trim()) {
      wx.showToast({ title: '请输入食材名', icon: 'none' });
      return;
    }
    const result = await addShoppingItem({
      ingredientName,
      amount: payload.amount || '',
      unit: payload.unit || ''
    });
    if (result) {
      const [todayMenu, pantryItems] = await Promise.all([getTodayMenu(), getPantryItems()]);
      const nextState = this.buildShoppingState(result, { todayMenu, pantryItems });
      if (shouldClearInput) {
        nextState.newItem = { ingredientName: '', amount: '', unit: '' };
      }
      this.setData(nextState);
    } else {
      await this.loadShoppingList();
      if (shouldClearInput) {
        this.setData({ newItem: { ingredientName: '', amount: '', unit: '' } });
      }
    }
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  async deleteItem(event) {
    const { id } = event.currentTarget.dataset;
    const result = await deleteShoppingItem(id);
    if (result) {
      const [todayMenu, pantryItems] = await Promise.all([getTodayMenu(), getPantryItems()]);
      this.applyShoppingList(result, { todayMenu, pantryItems });
    } else {
      await this.loadShoppingList();
    }
  },

  applyShoppingList(shoppingList, extraState) {
    const context = extraState || {};
    this.setData({
      ...this.buildShoppingState(shoppingList, context),
      ...context
    });
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
    return {
      shoppingList: { ...normalized, items },
      pendingItems,
      purchasedItems,
      groupedPending: this.groupItems(pendingItems),
      groupedPurchased: this.groupItems(purchasedItems),
      summary: {
        totalCount,
        pendingCount,
        purchasedCount,
        progressPercent,
        statusText: totalCount ? (pendingCount ? `还差 ${pendingCount} 项` : '今天买齐了') : '今天不用买'
      }
    };
  },

  enrichItems(items, context) {
    const menuItems = context.todayMenu && Array.isArray(context.todayMenu.items) ? context.todayMenu.items : [];
    const pantryItems = Array.isArray(context.pantryItems) ? context.pantryItems : [];
    return items.map((item) => {
      const sourceRecipes = this.findSourceRecipes(item.ingredientName, menuItems);
      const inPantry = pantryItems.some((pantryItem) => this.sameIngredient(pantryItem.ingredientName, item.ingredientName));
      const category = this.resolveCategory(item.ingredientName);
      return {
        ...item,
        sourceText: sourceRecipes.length ? `来自 ${sourceRecipes.join('、')}` : '手动补充',
        pantryText: inPantry ? '库存里已有' : '',
        categoryKey: category.key,
        categoryLabel: category.label
      };
    });
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
