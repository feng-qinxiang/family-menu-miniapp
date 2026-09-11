const { addTodayMenuRecipe, getMyFavorites, getRecipes, getShoppingList, getTodayMenu, getFamilyProfile } = require('../../utils/api');
const { recipeSourceLabels, cuisineList, mealOptions, sourceTabs, AVOID_KEYWORDS } = require('../../utils/constants');
const { fallbackDishImg, recipeDishImg, onImgError } = require('../../utils/image');
const { debounce } = require('../../utils/debounce');
const { withTabSelect } = require('../../behaviors/tab-select');
const { recipesFromPosts } = require('../../utils/dish-logic');
const { runGuarded } = require('../../utils/interaction');

const PAGE_SIZE = 6;

function matchesAvoid(recipe, avoidTags) {
  if (!avoidTags || !avoidTags.length) return false;
  const title = String(recipe.title || '');
  const tags = (recipe.tasteTags || []).map(String);
  const cuisine = String(recipe.cuisine || '');
  const hay = [title, cuisine].concat(tags).join(' ');
  return avoidTags.some((tag) => {
    const kws = AVOID_KEYWORDS[tag] || [tag];
    return kws.some((kw) => hay.includes(kw));
  });
}

Page({
  data: {
    sourceTabs,
    cuisineList,
    // 长列表回顶键（页面级滚动，滚深出现）
    showBackTop: false,
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
    mealOptionLabels: mealOptions.map(m => m.label),
    mealIndex: 2,                                    // 默认 'dinner'
    activeMealType: 'dinner',
    loading: true,
    loadError: false,
    searchFocused: false,
    skeletonCards: [1, 2, 3, 4],
    showAdvFilter: false,
    advFilter: { cuisine: '', maxTime: 0, minServings: 0 },
    // 家庭忌口过滤（自动生效，可临时关闭）
    avoidTags: [],
    avoidActive: true,
    avoidHiddenCount: 0,
    capsuleTop: 'calc(env(safe-area-inset-top) + 90rpx)',
    capsuleRight: '96px'
  },

  onLoad() {
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    let capsuleTop = '';
    let capsuleRight = '96px';
    try {
      const mb = wx.getMenuButtonBoundingClientRect();
      const sys = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
      if (mb && sys && mb.left) {
        capsuleTop = mb.top + 'px';
        capsuleRight = (sys.windowWidth - mb.left + 8) + 'px';
      }
    } catch (e) {}
    this.setData({ fontScale, capsuleTop, capsuleRight });
  },

  onShow() {
      withTabSelect(this, 1);
      // 首次进页面需要骨架；之后切回来只静默刷新，避免整页闪一下
      Promise.resolve(this.loadRecipes(this._hasLoaded === true)).then(() => { this._hasLoaded = true; });
    },

    onPullDownRefresh() {
      Promise.resolve(this.loadRecipes()).catch(() => {}).then(() => setTimeout(() => wx.stopPullDownRefresh(), 300));
    },

    // silent=true：已有数据时的「回页刷新」，不显示整页骨架（避免切 tab 闪一下）
  async loadRecipes(silent) {
    if (!silent) this.setData({ loading: true });
    try {
      const source = this.data.activeSource;
      const [rawList, todayMenu, shoppingList, familyProfile] = await Promise.all([
        source === 'favorites' ? getMyFavorites() : getRecipes('all'),
        getTodayMenu(),
        getShoppingList(),
        getFamilyProfile()
      ]);
      const tray = this.buildMenuTray(todayMenu, shoppingList);
      // 收藏接口返回 CommunityPost[]，须先提取关联菜谱，否则 id 是帖子 id（详情 404 / 加菜失败）
      const recipes = source === 'favorites' ? recipesFromPosts(rawList) : rawList;
      const raw = Array.isArray(recipes) ? recipes : [];
      // 汇总家庭成员忌口（去重）
      const memberAvoids = Array.isArray(familyProfile && familyProfile.members)
        ? familyProfile.members
            .map((m) => (Array.isArray(m.avoidTags) ? m.avoidTags : []))
            .reduce((acc, tags) => acc.concat(tags), [])
            .filter(Boolean)
        : [];
      const avoidTags = Array.from(new Set(memberAvoids));
      this.setData({
        recipes: raw.map((recipe) => this.normalizeRecipe(recipe, tray.ids)),
        todayDishIds: tray.ids,
        menuTray: { count: tray.count, names: tray.names, shoppingCount: tray.shoppingCount },
        avoidTags,
        avoidTagsText: avoidTags.join('、'),
        loading: false
      });
      this.applyFilter();
    } catch (err) {
      this.setData({ recipes: [], filteredRecipes: [], displayedRecipes: [], loading: false, loadError: true });
    }
  },

  retryLoad() {
    this.setData({ loading: true, loadError: false });
    this.loadRecipes();
  },

  normalizeRecipe(recipe, selectedIds) {
    const id = String(recipe.id || '');
    const ids = selectedIds || this.data.todayDishIds;
    return {
      ...recipe,
      selected: ids.includes(id),
      tasteTags: Array.isArray(recipe.tasteTags) ? recipe.tasteTags : [],
      summary: recipe.summary || '',
      cover: recipeDishImg(recipe),
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
    // 忌口过滤：仅在开启时生效（家庭成员在 家庭成员 页配置）
    const avoidTags = this.data.avoidActive ? (this.data.avoidTags || []) : [];
    const avoidFiltered = avoidTags.length
      ? (this.data.recipes || []).filter((recipe) => !matchesAvoid(recipe, avoidTags))
      : (this.data.recipes || []);
    const avoidHiddenCount = (this.data.recipes || []).length - avoidFiltered.length;
    const filteredRecipes = avoidFiltered.filter((recipe) => {
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

    // hero: 优先「家里常做」做过次数最多的一道（与推荐口径一致）；
    // 都没做过则取列表首道（后端已按评分降序）
    const cooked = filteredRecipes.filter((r) => (r.cookCount || 0) > 0);
    const hero = (cooked.length
      ? cooked.sort((a, b) => (b.cookCount || 0) - (a.cookCount || 0))[0]
      : null) || filteredRecipes[0] || null;

    const displayed = filteredRecipes.slice(0, PAGE_SIZE);
    this.setData({
      filteredRecipes,
      heroRecipe: hero,
      displayedRecipes: displayed,
      hasMore: filteredRecipes.length > displayed.length,
      remainCount: filteredRecipes.length - displayed.length,
      avoidHiddenCount
    });
  },

  // 临时关闭/恢复忌口过滤
  toggleAvoidFilter() {
    this.setData({ avoidActive: !this.data.avoidActive }, () => this.applyFilter());
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

  onMealPicker(e) {
    const idx = Number(e.detail.value);
    const key = mealOptions[idx] && mealOptions[idx].key;
    if (!key) return;
    this.setData({ mealIndex: idx, activeMealType: key });
  },

  clearFilter() {
    const needReload = this.data.activeSource !== 'all';
    this.setData({
      activeSource: 'all',
      searchText: '',
      showAdvFilter: false,
      advFilter: { cuisine: '', maxTime: 0, minServings: 0 }
    });
    if (needReload) {
      this.loadRecipes();
    } else {
      this.applyFilter();
    }
  },

  applyAdvFilter() {
    this.applyFilter();
    wx.showToast({ title: '已筛选', icon: 'success' });
  },



  goDetail(event) {
    const id = (event.detail && event.detail.id) || (event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id);
    if (!id) return;
    wx.navigateTo({ url: `/pkg-extra/recipe-detail/index?id=${id}` });
  },

  goCreate() {
    wx.navigateTo({ url: '/pkg-extra/recipe-edit/index' });
  },

  async addRecipeToToday(e) {
    const id = (e.detail && e.detail.id) || (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id);
    if (!id) return;
    if (this.data.todayDishIds.includes(String(id))) {
      wx.navigateTo({ url: '/pages/menu/index' });
      return;
    }
    const meal = mealOptions.find((item) => item.key === this.data.activeMealType);
    let added = false;
    // 防重（每个菜一个 key：允许并发加不同的菜，但同一道菜连点只发一次）
    await runGuarded(this, `add-${id}`, async () => {
      await addTodayMenuRecipe(id, this.data.activeMealType || 'dinner');
      added = true;
    }, {
      loading: '加入中',
      success: `已加入${meal ? meal.label : '今日菜单'}`,
      fail: '加入失败'
    });
    if (added) this.markRecipeSelected(id);
  },

  goMenu() {
    wx.navigateTo({ url: '/pages/menu/index' });
  },

  // —— 回顶悬浮键（页面级滚动） ——
  onPageScroll(e) {
    const show = ((e && e.scrollTop) || 0) > 600;
    if (show !== this.data.showBackTop) this.setData({ showBackTop: show });
  },

  backToTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
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
