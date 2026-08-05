const { addTodayMenuRecipe, getMyFavorites, getRecipes, getShoppingList, getTodayMenu } = require('../../utils/api');
const { recipeSourceLabels, cuisineList, mealOptions, sourceTabs } = require('../../utils/constants');
const { fallbackDishImg, onImgError } = require('../../utils/image');
const { debounce } = require('../../utils/debounce');

const PAGE_SIZE = 6;

Page({
  data: {
    sourceTabs,
    cuisineList,
    activeSource: 'all',
    searchText: '',
    recipes: [],
    filteredRecipes: [],
    displayedRecipes: [],
    heroRecipe: null,
    pageSize: PAGE_SIZE,
    hasMore: false,
    remainCount: 0,
    todayDishIds: [],
    menuTray: { count: 0, names: '', shoppingCount: 0 },
    mealOptions,
    activeMealType: 'dinner',
    loading: true,
    searchFocused: false,
    skeletonCards: [1, 2, 3, 4],
    showAdvFilter: false,
    advFilter: { cuisine: '', maxTime: 0, minServings: 0 }
  },

  onLoad() {},

  onShow() {
      this.loadRecipes();
    },

    onPullDownRefresh() {
      Promise.resolve(this.loadRecipes()).catch(() => {}).then(() => setTimeout(() => wx.stopPullDownRefresh(), 300));
    },

  async loadRecipes() {
    this.setData({ loading: true });
    try {
      const source = this.data.activeSource;
      const [recipes, favorites, todayMenu, shoppingList] = await Promise.all([
        source === 'favorites' ? getMyFavorites() : getRecipes('all'),
        source !== 'favorites' ? Promise.resolve([]) : Promise.resolve([]),
        getTodayMenu(),
        getShoppingList()
      ]);
      const tray = this.buildMenuTray(todayMenu, shoppingList);
      const raw = Array.isArray(recipes) ? recipes : [];
      this.setData({
        recipes: raw.map((recipe) => this.normalizeRecipe(recipe, tray.ids)),
        todayDishIds: tray.ids,
        menuTray: { count: tray.count, names: tray.names, shoppingCount: tray.shoppingCount },
        loading: false
      });
      this.applyFilter();
    } catch (err) {
      wx.showToast({ title: '加载菜谱失败', icon: 'none' });
      this.setData({ recipes: [], filteredRecipes: [], loading: false });
    }
  },

  normalizeRecipe(recipe, selectedIds) {
    const id = String(recipe.id || '');
    const ids = selectedIds || this.data.todayDishIds;
    return {
      ...recipe,
      selected: ids.includes(id),
      tasteTags: Array.isArray(recipe.tasteTags) ? recipe.tasteTags : [],
      summary: recipe.summary || '',
      cover: recipe.coverImage || fallbackDishImg(recipe.id || recipe.title),
      sourceLabel: recipeSourceLabels[recipe.sourceType] || '自家菜谱'
    };
  },

  buildMenuTray(todayMenu, shoppingList) {
    const items = Array.isArray(todayMenu && todayMenu.items) ? todayMenu.items : [];
    const ids = items.map((item) => String(item.recipeId || (item.recipe && item.recipe.id) || '')).filter(Boolean);
    const names = items
      .map((item) => item.recipe && item.recipe.title)
      .filter(Boolean)
      .slice(0, 3)
      .join('、');
    const shoppingItems = Array.isArray(shoppingList && shoppingList.items) ? shoppingList.items : [];
    return {
      ids,
      count: ids.length,
      names: names || '先挑一道主菜',
      shoppingCount: shoppingItems.filter((item) => !item.purchased).length
    };
  },

  markRecipeSelected(id) {
    const key = String(id || '');
    if (!key) return;
    const ids = this.data.todayDishIds.includes(key)
      ? this.data.todayDishIds
      : this.data.todayDishIds.concat(key);
    const recipes = this.data.recipes.map((recipe) => ({
      ...recipe,
      selected: ids.includes(String(recipe.id || ''))
    }));
    const names = recipes
      .filter((recipe) => ids.includes(String(recipe.id || '')))
      .map((recipe) => recipe.title)
      .filter(Boolean)
      .slice(0, 3)
      .join('、');
    this.setData({
      todayDishIds: ids,
      recipes,
      menuTray: {
        ...this.data.menuTray,
        count: ids.length,
        names: names || '先挑一道主菜'
      }
    }, () => this.applyFilter());
  },

  selectSource(event) {
    const { source } = event.currentTarget.dataset;
    if (source === this.data.activeSource) return;
    const prevSource = this.data.activeSource;
    this.setData({ activeSource: source });
    // 收藏源需要重新拉接口（进入或离开收藏都要重载）
    if (source === 'favorites' || prevSource === 'favorites') {
      this.loadRecipes();
    } else {
      this.applyFilter();
    }
  },

  onSearchInput(event) {
    this.setData({ searchText: event.detail.value || '' });
    this._debouncedFilter();
  },

  _debouncedFilter: debounce(function () {
    this.applyFilter();
  }, 300),

  onSearchFocus() {
    this.setData({ searchFocused: true });
  },

  onSearchBlur() {
    this.setData({ searchFocused: false });
  },

  applyFilter() {
    const keyword = this.data.searchText.trim().toLowerCase();
    const { cuisine, maxTime, minServings } = this.data.advFilter;
    const filteredRecipes = (this.data.recipes || []).filter((recipe) => {
      // 收藏源：列表本身已是收藏结果，不再按 sourceType 过滤
      const sourceMatch = this.data.activeSource === 'all'
        || this.data.activeSource === 'favorites'
        || recipe.sourceType === this.data.activeSource;
      if (!sourceMatch) return false;
      if (keyword) {
        const searchTarget = [
          recipe.title,
          recipe.cuisine,
          (recipe.tasteTags || []).join(' '),
          recipe.summary
        ].join(' ').toLowerCase();
        if (!searchTarget.includes(keyword)) return false;
      }
      if (cuisine && recipe.cuisine !== cuisine) return false;
      if (maxTime > 0 && recipe.timeCost > maxTime) return false;
      if (minServings > 0 && recipe.servings < minServings) return false;
      return true;
    });

    // hero: 优先宫保鸡丁，否则首道菜
    const hero = filteredRecipes.find((r) => /宫保鸡丁/.test(r.title || '')) || filteredRecipes[0] || null;

    const displayed = filteredRecipes.slice(0, PAGE_SIZE);
    this.setData({
      filteredRecipes,
      heroRecipe: hero,
      displayedRecipes: displayed,
      hasMore: filteredRecipes.length > displayed.length,
      remainCount: filteredRecipes.length - displayed.length
    });
  },

  loadMore() {
    if (!this.data.hasMore) return;
    const next = this.data.filteredRecipes.slice(0, this.data.displayedRecipes.length + PAGE_SIZE);
    this.setData({
      displayedRecipes: next,
      hasMore: this.data.filteredRecipes.length > next.length,
      remainCount: this.data.filteredRecipes.length - next.length
    });
  },

  toggleAdvFilter() {
    this.setData({ showAdvFilter: !this.data.showAdvFilter });
  },

  setFilterCuisine(e) {
    this.setData({ 'advFilter.cuisine': e.currentTarget.dataset.val });
    this.applyFilter();
  },

  setFilterTime(e) {
    this.setData({ 'advFilter.maxTime': Number(e.currentTarget.dataset.val) });
    this.applyFilter();
  },

  setFilterServings(e) {
    this.setData({ 'advFilter.minServings': Number(e.currentTarget.dataset.val) });
    this.applyFilter();
  },

  selectMeal(e) {
    const { meal } = e.currentTarget.dataset;
    if (meal) {
      this.setData({ activeMealType: meal });
    }
  },

  clearFilter() {
    this.setData({
      activeSource: 'all',
      searchText: '',
      showAdvFilter: false,
      advFilter: { cuisine: '', maxTime: 0, minServings: 0 }
    });
    this.applyFilter();
  },

  applyAdvFilter() {
    this.applyFilter();
    wx.showToast({ title: '已筛选', icon: 'success' });
  },



  goDetail(event) {
    const { id } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/recipe-detail/index?id=${id}` });
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/recipe-edit/index' });
  },

  async addRecipeToToday(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    if (this.data.todayDishIds.includes(String(id))) {
      wx.switchTab({ url: '/pages/menu/index' });
      return;
    }
    try {
      await addTodayMenuRecipe(id, this.data.activeMealType || 'dinner');
      this.markRecipeSelected(id);
      const meal = mealOptions.find((item) => item.key === this.data.activeMealType);
      wx.showToast({ title: `已加入${meal ? meal.label : '今日菜单'}`, icon: 'success' });
    } catch (err) {
      wx.showToast({ title: '加入失败', icon: 'none' });
    }
  },

  goMenu() {
    wx.switchTab({ url: '/pages/menu/index' });
  },

  goShopping() {
    wx.navigateTo({ url: '/pages/shopping/index' });
  },

  onReachBottom() {
    this.loadMore();
  },

  onGridImgError(e) {
    const idx = e.currentTarget.dataset.index;
    if (idx === undefined) return;
    const item = this.data.displayedRecipes[idx];
    if (item) {
      this.setData({ [`displayedRecipes[${idx}].cover`]: fallbackDishImg(item.id || item.title) });
    }
  },
  onShareAppMessage() {
    return {
      title: '家里的菜谱库，快来看看',
      path: '/pages/recipes/index'
    };
  },
});
