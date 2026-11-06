const { getCapsule } = require('../../utils/capsule');

const { addTodayMenuRecipe, getMyFavorites, getRecipes, getShoppingList, getTodayMenu, getFamilyProfile, getPantryItems, getPantryMatch } = require('../../utils/api');
const { sourceLabels, cuisineList, mealOptions, sourceTabs, AVOID_KEYWORDS } = require('../../utils/constants');
const { fallbackDishImg, recipeDishImg, onImgError } = require('../../utils/image');
const { debounce } = require('../../utils/debounce');
const { withScrollReveal, dispose: disposeScrollReveal } = require('../../behaviors/scroll-reveal');
const { recipesFromPosts } = require('../../utils/dish-logic');
const { runGuarded } = require('../../utils/interaction');
const { pantrySummary, normalizeMatches } = require('../../utils/pantry-match');
const { parseMealRequest, hasMildLabel } = require('../../utils/meal-request');

// 与社区页 FEED_PAGE_SIZE 对齐（pages/community/index.js）；原为 6，每屏只出 6 个，
// 滚两下就得再点一次「上拉加载更多」，列表页不该这么碎。
const PAGE_SIZE = 20;

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

// 「川菜 · 粤菜 · 家常」：按道数降序取前 3 个菜系（同数保持首次出现顺序）
function summarizeCuisines(list) {
  const counts = {};
  const order = [];
  list.forEach((r) => {
    const c = String((r && r.cuisine) || '').trim();
    if (!c) return;
    if (!counts[c]) order.push(c);
    counts[c] = (counts[c] || 0) + 1;
  });
  return order.sort((a, b) => counts[b] - counts[a]).slice(0, 3).join(' · ');
}

Page({
  onPickedImgError(e) { onImgError(e, this, 'pickedRecipe.cover'); },
  data: {
    sourceTabs,
    cuisineList,
    // 长列表回顶键（页面级滚动，滚深出现）
    showBackTop: false,
    activeSource: 'all',
    railMode: 'cuisine',
    railModes: ['菜系', '来源'],
    searchText: '',
    showPantryDetails: true,
    requestOpen: false,
    requestText: '',
    requestPreview: { labels: [], warnings: [], canApply: false },
    requestMildOnly: false,
    requestExamples: ['两人吃，30分钟，不辣', '晚餐，冰箱有的，临期优先', '四个人，半小时，家常'],
    pickerOpen: false,
    pickMode: 'all',
    pickedRecipe: null,
    pickCount: 0,
    pantryLoading: true,
    pantryFailed: false,
    pantrySummary: { count: 0, expiringCount: 0, expiredCount: 0, priorityText: '' },
    pantryItems: [],
    pantryStockFailed: false,
    pantryStockLoading: true,
    // 全部/筛选后菜谱放 this._recipes / this._filteredRecipes（wxml 只渲染 displayedRecipes，其余只要计数）
    recipeCount: 0,
    filteredCount: 0,
    displayedRecipes: [],
    // 页头副标题里的菜系概览（按道数取前 3），来自真实数据，不写死
    cuisineSummary: '',
    pageSize: PAGE_SIZE,
    hasMore: false,
    remainCount: 0,
    todayDishIds: [],
    menuTray: { count: 0, names: '', shoppingCount: 0 },
    mealOptions,
    mealOptionLabels: mealOptions.map(m => m.label),
    mealIndex: 2,                                    // 默认 'dinner'
    mealDropOpen: false,
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

  onLoad(options = {}) {
    let fontScale = 'normal';
    let showPantryDetails = true;
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    try { showPantryDetails = wx.getStorageSync('recipe_pantry_details') !== false; } catch (e) { /* 默认显示 */ }
    const capsule = getCapsule();
    const capsuleTop = capsule.top;
    const capsuleRight = capsule.right;
    const mealIndex = mealOptions.findIndex(item => item.key === options.meal);
    this.setData({
      fontScale, capsuleTop, capsuleRight, showPantryDetails,
      searchText: options.q || '',
      pickerOpen: options.pick === 'random' || options.pick === 'pantry',
      pickMode: options.pick === 'pantry' ? 'pantry' : 'all',
      mealIndex: mealIndex >= 0 ? mealIndex : 2,
      activeMealType: mealIndex >= 0 ? options.meal : 'dinner'
    });
  },

  onShow() {
      // 首次进页面需要骨架；之后切回来只静默刷新，避免整页闪一下
      // 两个 load 都不在内部过滤，全部回来后只跑一次 applyFilter（原先各跑一次）
      Promise.all([this.loadRecipes(this._hasLoaded === true, true), this.loadPantryChoices(true)]).then(() => {
        this._hasLoaded = true;
        this.applyFilter();
      });
    },

    onPullDownRefresh() {
      Promise.all([this.loadRecipes(), this.loadPantryChoices()]).catch(() => {}).then(() => setTimeout(() => wx.stopPullDownRefresh(), 300));
    },

    // silent=true：已有数据时的「回页刷新」，不显示整页骨架（避免切 tab 闪一下）
    // skipFilter=true：调用方会在并行加载都完成后统一 applyFilter
  async loadRecipes(silent, skipFilter) {
    if (!silent) this.setData({ loading: true });
    try {
      const source = this.data.activeSource;
      // 禁用数组解构：该语法编译后依赖 @babel/runtime 辅助模块，未打包进小程序会整页白屏
      const loaded = await Promise.all([
        source === 'favorites' ? getMyFavorites() : getRecipes('all'),
        getTodayMenu(),
        getShoppingList(),
        getFamilyProfile()
      ]);
      const rawList = loaded[0], todayMenu = loaded[1];
      const shoppingList = loaded[2], familyProfile = loaded[3];
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
      this._recipes = raw.map((recipe) => this.normalizeRecipe(recipe, tray.ids));
      this.setData({
        recipeCount: this._recipes.length,
        cuisineSummary: summarizeCuisines(raw),
        cuisineList: Array.from(new Set(cuisineList.concat(raw.map(recipe => String(recipe.cuisine || '').trim()).filter(Boolean), this.data.advFilter.cuisine || []).filter(Boolean))),
        todayDishIds: tray.ids,
        menuTray: { count: tray.count, names: tray.names, shoppingCount: tray.shoppingCount },
        avoidTags,
        avoidTagsText: avoidTags.join('、'),
        loading: false,
        loadError: false
      });
      if (!skipFilter) this.applyFilter();
    } catch (err) {
      this._recipes = [];
      this._filteredRecipes = [];
      this.setData({ recipeCount: 0, cuisineSummary: '', filteredCount: 0, displayedRecipes: [], pickedRecipe: null, pickCount: 0, loading: false, loadError: true });
    }
  },

  retryLoad() {
    this.setData({ loading: true, loadError: false });
    this.loadRecipes();
  },

  async loadPantryChoices(skipFilter) {
    const seq = (this._pantrySeq || 0) + 1;
    this._pantrySeq = seq;
    this._pantryMatches = [];
    this.setData({ pantryLoading: true, pantryStockLoading: true, pantryStockFailed: false, pantryFailed: false, pickedRecipe: null, pickCount: 0 });
    const loaded = await Promise.allSettled([getPantryItems(), getPantryMatch()]);
    if (seq !== this._pantrySeq) return;
    const stocks = loaded[0].status === 'fulfilled' && Array.isArray(loaded[0].value) ? loaded[0].value : [];
    // ponytail: 复用匹配接口的前 10 道候选；菜谱增多后再给匹配接口加分页。
    this._pantryMatches = loaded[1].status === 'fulfilled' ? normalizeMatches(loaded[1].value) : [];
    this.setData({
      pantryItems: stocks.map(item => ({ ...item, amountText: `${item.amount || ''}${item.unit || ''}` })),
      pantrySummary: pantrySummary(stocks),
      pantryLoading: false, pantryStockLoading: false,
      pantryStockFailed: loaded[0].status === 'rejected',
      pantryFailed: loaded[0].status === 'rejected' || loaded[1].status === 'rejected'
    });
    if (skipFilter !== true) this.applyFilter();
  },

  openPicker(e) {
    const mode = e.currentTarget.dataset.mode === 'pantry' ? 'pantry' : 'all';
    this.setData({ pickerOpen: true, pickMode: mode, pickedRecipe: null, pickCount: 0 });
    this.applyFilter();
  },

  closePicker() {
    this.setData({ pickerOpen: false, pickMode: 'all', pickedRecipe: null });
    this.applyFilter();
  },

  pickerCandidates() {
    return (this._filteredRecipes || []).filter(recipe => !this.data.todayDishIds.includes(String(recipe.id)));
  },

  pickRandom() {
    if (this.data.loading || (this.data.pickMode === 'pantry' && (this.data.pantryLoading || this.data.pantryFailed))) return;
    const candidates = this.pickerCandidates();
    const current = this.data.pickedRecipe;
    const alternatives = current ? candidates.filter(recipe => String(recipe.id) !== String(current.id)) : candidates;
    const available = alternatives.length ? alternatives : candidates;
    const priority = this.data.pickMode === 'pantry' ? available.filter(recipe => (recipe.expiringIngredients || []).length) : [];
    const pool = priority.length ? priority : available;
    this.setData({ pickedRecipe: pool.length ? pool[Math.floor(Math.random() * pool.length)] : null, pickCount: candidates.length });
  },

  addPickedRecipe() {
    if (this.data.pickedRecipe) return this.addRecipeToToday({ detail: { id: this.data.pickedRecipe.id } });
  },

  goPantry() {
    wx.navigateTo({ url: '/pages/pantry/index' });
  },

  togglePantryDetails(e) {
    const showPantryDetails = !!e.detail.value;
    this.setData({ showPantryDetails });
    try { wx.setStorageSync('recipe_pantry_details', showPantryDetails); } catch (err) { /* 本页仍可切换 */ }
  },

  openMealRequest() {
    this.setData({ requestOpen: true });
  },

  closeMealRequest() {
    this.setData({ requestOpen: false });
  },

  onMealRequestInput(e) {
    const requestText = String(e.detail.value || '').slice(0, 100);
    this.setData({ requestText, requestPreview: parseMealRequest(requestText, this.data.cuisineList) });
  },

  useMealRequestExample(e) {
    this.onMealRequestInput({ detail: { value: this.data.requestExamples[Number(e.currentTarget.dataset.index)] || '' } });
  },

  applyMealRequest() {
    const request = parseMealRequest(this.data.requestText, this.data.cuisineList);
    this.setData({ requestPreview: request });
    if (!request.canApply) return;
    const needReload = this.data.activeSource === 'favorites';
    const mealIndex = mealOptions.findIndex(item => item.key === request.mealType);
    this.setData({
      requestOpen: false, requestMildOnly: request.mildOnly,
      activeSource: 'all', searchText: '', showAdvFilter: false,
      advFilter: { cuisine: request.cuisine, maxTime: request.maxTime, minServings: request.minServings },
      pickerOpen: true, pickMode: request.pantryOnly ? 'pantry' : 'all', pickedRecipe: null,
      ...(mealIndex >= 0 ? { mealIndex, activeMealType: request.mealType } : {})
    });
    if (needReload) return this.loadRecipes();
    this.applyFilter();
  },

  clearMildRequest() {
    this.setData({ requestMildOnly: false });
    this.applyFilter();
  },

  normalizeRecipe(recipe, selectedIds) {
    const id = String(recipe.id || '');
    const ids = selectedIds || this.data.todayDishIds;
    // 公共菜谱库（后端 is_public，不是本人建的 owned 菜谱）单独给标签：
    // 它们和自家菜谱的 sourceType 都是 owned，共用"自建"会让人以为是自己建的。
    const isSharedLibrary = recipe.sourceType === 'owned' && recipe.mine === false;
    return {
      ...recipe,
      selected: ids.includes(id),
      tasteTags: Array.isArray(recipe.tasteTags) ? recipe.tasteTags : [],
      summary: recipe.summary || '',
      cover: recipeDishImg(recipe),
      sourceLabel: isSharedLibrary
        ? '公共菜谱'
        : (sourceLabels[recipe.sourceType] || '自家菜谱')
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
    this._recipes = (this._recipes || []).map((recipe) => ({
      ...recipe,
      selected: ids.includes(String(recipe.id || ''))
    }));
    const names = this._recipes
      .filter((recipe) => ids.includes(String(recipe.id || '')))
      .map((recipe) => recipe.title)
      .filter(Boolean)
      .slice(0, 3)
      .join('、');
    this.setData({
      todayDishIds: ids,
      menuTray: {
        ...this.data.menuTray,
        count: ids.length,
        names: names || '先挑一道主菜'
      }
    }, () => this.applyFilter());
  },

  selectRailMode(event) {
    const mode = event.currentTarget.dataset.mode || (Number(event.detail && event.detail.value) === 1 ? 'source' : 'cuisine');
    this.setData({ railMode: mode === 'source' ? 'source' : 'cuisine' });
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
    const allRecipes = this._recipes || [];
    const avoidFiltered = avoidTags.length
      ? allRecipes.filter((recipe) => !matchesAvoid(recipe, avoidTags))
      : allRecipes;
    const avoidHiddenCount = allRecipes.length - avoidFiltered.length;
    const matchMap = new Map((this._pantryMatches || []).map(recipe => [String(recipe.id), recipe]));
    const filteredRecipes = avoidFiltered.filter((recipe) => {
      if (this.data.requestMildOnly && !hasMildLabel(recipe)) return false;
      if (this.data.pickMode === 'pantry') {
        const match = matchMap.get(String(recipe.id));
        if (this.data.pantryLoading || this.data.pantryFailed || !match || !match.full) return false;
      }
      // 收藏源：列表本身已是收藏结果，不再按 sourceType 过滤
      // 「自建」只认本人创建的（后端 RecipeCard.mine）：公共菜谱库的 source_type 也是 owned，
      // 只按 sourceType 过滤会把平台示例菜谱混进"自家菜谱"，用户会以为那不是自己建的菜凭空出现。
      const sourceMatch = this.data.activeSource === 'all'
        || this.data.activeSource === 'favorites'
        || (this.data.activeSource === 'owned'
          ? recipe.mine === true
          : recipe.sourceType === this.data.activeSource);
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
      if (maxTime > 0 && (!(Number(recipe.timeCost) > 0) || Number(recipe.timeCost) > maxTime)) return false;
      if (minServings > 0 && (!(Number(recipe.servings) > 0) || Number(recipe.servings) < minServings)) return false;
      return true;
    }).map(recipe => {
      const match = matchMap.get(String(recipe.id));
      const pantryStatus = this.data.pantryLoading ? '正在核对用料…'
        : this.data.pantryFailed ? '用料暂未确认'
        : !this.data.pantrySummary.count ? '还没有记录食材'
        : match ? (match.full ? '食材齐全 · 按菜谱量' : `已有 ${match.haveText} · ${match.missingText}`)
        : '点开菜谱核对用料';
      return { ...recipe, expiringIngredients: match ? match.expiringIngredients : [], priorityText: match ? match.priorityText : '', pantryText: match ? match.missingText : '', pantryStatus, pantryReady: !this.data.pantryFailed && !!(match && match.full) };
    });

    const displayed = filteredRecipes.slice(0, PAGE_SIZE);
    this._filteredRecipes = filteredRecipes;
    this.setData({
      filteredCount: filteredRecipes.length,
      displayedRecipes: displayed,
      hasMore: filteredRecipes.length > displayed.length,
      remainCount: filteredRecipes.length - displayed.length,
      avoidHiddenCount
    }, () => withScrollReveal(this, { item: '.rx-card-slot' }));
    if (this.data.pickerOpen) {
      const candidates = this.pickerCandidates();
      const current = this.data.pickedRecipe;
      const retained = current && candidates.find(recipe => String(recipe.id) === String(current.id));
      if (retained) this.setData({ pickedRecipe: retained, pickCount: candidates.length });
      else this.pickRandom();
    }
  },

  // 临时关闭/恢复忌口过滤
  toggleAvoidFilter() {
    this.setData({ avoidActive: !this.data.avoidActive }, () => this.applyFilter());
  },

  loadMore() {
    if (!this.data.hasMore) return;
    const all = this._filteredRecipes || [];
    const next = all.slice(0, this.data.displayedRecipes.length + PAGE_SIZE);
    this.setData({
      displayedRecipes: next,
      hasMore: all.length > next.length,
      remainCount: all.length - next.length
    }, () => withScrollReveal(this, { item: '.rx-card-slot' }));
  },

  onUnload() {
    // 防抖定时器要主动取消：否则 300ms 后仍会跑一次 applyFilter()，对已销毁的页面 setData
    this._debouncedFilter.cancel();
    disposeScrollReveal(this);
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

  toggleMealDrop() {
    this.setData({ mealDropOpen: !this.data.mealDropOpen });
  },

  closeMealDrop() {
    if (this.data.mealDropOpen) this.setData({ mealDropOpen: false });
  },

  onMealPick(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const key = mealOptions[idx] && mealOptions[idx].key;
    if (!key) return;
    this.setData({ mealIndex: idx, activeMealType: key, mealDropOpen: false });
  },

  clearFilter() {
    // 非收藏来源共享完整菜谱列表，清空时可直接恢复；收藏才需要重拉。
    const needReload = this.data.activeSource === 'favorites';
    this.setData({
      activeSource: 'all',
      searchText: '',
      pickerOpen: false,
      pickMode: 'all',
      pickedRecipe: null,
      requestMildOnly: false,
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
      // 原来直接跳菜单：点了"加入"却换页、什么也没加，读起来像点错了。
      // 说一句再去，跳页才解释得通。
      wx.showToast({ title: '这道菜已在今日菜单，带你去看', icon: 'none' });
      wx.switchTab({ url: '/pages/menu/index' });
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
    wx.switchTab({ url: '/pages/menu/index' });
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
