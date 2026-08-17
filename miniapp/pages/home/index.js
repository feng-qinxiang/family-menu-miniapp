const {
  addTodayMenuRecipe,
  getCurrentUser,
  getDashboard,
  getFamilyProfile,
  getPantryMatch,
  getShoppingList,
  getTodayMenu,
  getWishes,
  addWish,
  removeWish: removeWishApi
} = require('../../utils/api');
const { sourceLabels, mealTypeLabels, SLOTS, cuisinePinyin } = require('../../utils/constants');
const { fallbackDishImg, onImgError } = require('../../utils/image');
const { decorateHero, filterBySlot } = require('../../utils/dish-logic');
const WISH_STORAGE_KEY = 'family_wishes_v1';
const CACHE_KEY_MENU = 'home_cache_todayMenu';
const CACHE_KEY_SHOPPING = 'home_cache_shoppingPending';

// ponytail: simple stale-while-revalidate — show cached data instantly, overwrite on network success
function readCache(key) {
  try { return wx.getStorageSync(key); } catch (e) { return null; }
}
function writeCache(key, val) {
  try { wx.setStorageSync(key, val); } catch (e) { /* best-effort */ }
}

function todayDateKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function loadWishes() {
  try {
    const raw = wx.getStorageSync(WISH_STORAGE_KEY);
    if (raw && typeof raw === 'object') return raw;
  } catch (err) {}
  return {};
}

function saveWishes(map) {
  try { wx.setStorageSync(WISH_STORAGE_KEY, map); } catch (err) {}
}

const memberTones = ['tone-a', 'tone-b', 'tone-c', 'tone-d', 'tone-e'];

function getCuisineClass(cuisine) {
  return cuisinePinyin[cuisine] || '';
}

function greetingText() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

Page({
  data: {
    loading: true,
    greeting: '你好',
    currentUser: {},
    familyProfile: { members: [] },
    cookCandidates: [],
    activeCookKey: '',
    activeCook: null,

    // 餐次 & 许愿池（§3 / §5）
    slots: SLOTS,
    currentSlot: 'dinner',
    todayKey: '',
    wishes: [],            // 当前 (date,slot) 下的许愿数组
    role: 'cook',          // 简化：默认本人=做饭人；接入后端后由 family.members[me].role 决定
    canConfirm: true,      // role∈{admin,cook} 时为 true（§6）

    activeCuisine: 'all',
    heroRecipe: null,
    sideRecipes: [],
    visibleRecipes: [],
    todayMenu: [],
    slotMenu: [],          // 当前餐次 (currentSlot) 的菜单项，随 slotbar 联动
    shoppingPending: 0,
    cuisineTiles: [],

    allRecipes: [],
    isEmpty: false,        // 菜谱全空（sideRecipes 与 visibleRecipes 均空），用于空态文案收敛
    loadError: ''
  },

  onLoad() {
    this._inited = false;
    const todayKey = todayDateKey();
    // 离线缓存：先用上次数据渲染，网络回来后覆盖
    const cachedMenu = readCache(CACHE_KEY_MENU);
    const cachedPending = readCache(CACHE_KEY_SHOPPING);
    this.setData({
      todayKey,
      todayMenu: Array.isArray(cachedMenu) ? cachedMenu : [],
      shoppingPending: typeof cachedPending === 'number' ? cachedPending : 0
    });
    this.refreshWishes();
    this.loadAll();
  },

  onShow() {
    // 字号档位在 onShow 读取：从设置页切回来立即生效（不再只在首次 onLoad 生效）
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
    // 跨日刷新（用户隔夜回来）
    const todayKey = todayDateKey();
    if (todayKey !== this.data.todayKey) {
      this.setData({ todayKey });
    }
    this.refreshWishes();
    if (this._inited) {
      this.refreshLight();
    }
  },

  onPullDownRefresh() {
    const done = () => setTimeout(() => wx.stopPullDownRefresh(), 300);
    Promise.all([this.loadAll(), this.refreshWishes()]).catch(() => {}).then(done);
  },

  // ============ 餐次 / 许愿池 ============
  async refreshWishes() {
    const date = this.data.todayKey || todayDateKey();
    const slot = this.data.currentSlot;
    const reqSeq = (this._wishSeq || 0) + 1;
    this._wishSeq = reqSeq;
    try {
      const list = await getWishes(date, slot);
      // 快速切餐次时，旧响应晚到直接丢弃，避免覆盖新 slot 数据
      if (this._wishSeq !== reqSeq) return;
      // 同步写本地缓存供离线读
      const all = loadWishes();
      all[`${date}:${slot}`] = Array.isArray(list) ? list : [];
      saveWishes(all);
      this.setData({ wishes: all[`${date}:${slot}`] });
    } catch (err) {
      if (this._wishSeq !== reqSeq) return;
      // 降级：用本地缓存
      const all = loadWishes();
      this.setData({ wishes: Array.isArray(all[`${date}:${slot}`]) ? all[`${date}:${slot}`] : [] });
    }
  },

  selectSlot(e) {
    const { slot } = e.currentTarget.dataset;
    if (!slot || slot === this.data.currentSlot) return;
    this.setData({ currentSlot: slot });
    this.updateSlotMenu();
    this.refreshWishes();
  },

  // 当前餐次菜单：todayMenu 按 currentSlot 过滤（mealType 缺失默认归 dinner，见 dish-logic.js）
  updateSlotMenu() {
    const slotMenu = filterBySlot(this.data.todayMenu, this.data.currentSlot);
    this.setData({ slotMenu });
  },

  goWeek() {
    wx.navigateTo({ url: '/pages/weekly-menu/index' });
  },

  addWish() {
    this.setData({ showWishModal: true, wishInput: '' });
  },
  onWishInput(e) {
    this.setData({ wishInput: e.detail.value });
  },
  closeWishModal() {
    this.setData({ showWishModal: false });
  },

  // 弹窗滚动穿透锁
  noopScroll() {},
  confirmWish() {
    const text = (this.data.wishInput || '').trim();
    if (!text) return;
    const me = this.data.currentUser || {};
    this.setData({ showWishModal: false, wishInput: '' });
    this.persistWish({
      id: `w-${Date.now()}`,
      text,
      by: me.nickname || '我',
      at: Date.now()
    });
  },

  async persistWish(wish) {
    const date = this.data.todayKey;
    const slot = this.data.currentSlot;
    const key = `${date}:${slot}`;
    // 乐观更新本地
    const all = loadWishes();
    const list = Array.isArray(all[key]) ? all[key] : [];
    list.push(wish);
    all[key] = list;
    saveWishes(all);
    this.setData({ wishes: list });
    try {
      const saved = await addWish({ date, slot, text: wish.text, recipeId: wish.recipeId || null });
      // 用服务端返回的 id 替换本地临时 id（如有）
      if (saved && saved.id && saved.id !== wish.id) {
        const updated = list.map(w => w.id === wish.id ? { ...w, id: saved.id } : w);
        all[key] = updated;
        saveWishes(all);
        this.setData({ wishes: updated });
      }
    } catch (err) {
      // 离线兜底：保留本地乐观结果，提示用户稍后同步
      wx.showToast({ title: '已记在本机，联网后自动同步', icon: 'none' });
    }
  },

  async removeWish(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    // 二次确认（仿 menu 撤菜弹窗），防误触
    const res = await wx.showModal({
      title: '移除这条心愿？',
      confirmText: '移除',
      cancelText: '留下'
    });
    if (!res.confirm) return;
    const key = `${this.data.todayKey}:${this.data.currentSlot}`;
    // 乐观删除
    const all = loadWishes();
    const list = (all[key] || []).filter(w => w.id !== id);
    all[key] = list;
    saveWishes(all);
    this.setData({ wishes: list });
    try {
      await removeWishApi(id);
    } catch (err) {
      // 离线兜底：本地已删，提示用户稍后同步
      wx.showToast({ title: '已在本机移除，联网后同步', icon: 'none' });
    }
  },

  async confirmMenu() {
    if (!this.data.canConfirm) {
      wx.showToast({ title: '请等做饭人确认', icon: 'none' });
      return;
    }
    const list = this.data.wishes;
    if (!list || !list.length) {
      wx.showToast({ title: '先从下面挑菜或点「我想吃」', icon: 'none' });
      return;
    }
    // 区分：带 recipeId 的可直接入菜单；纯文本许愿无法匹配菜谱
    const withRecipe = list.filter(w => w.recipeId);
    const textOnly = list.filter(w => !w.recipeId);

    if (!withRecipe.length) {
      // 全是纯文本许愿，无法加入菜单，保留许愿池不清空
      wx.showModal({
        title: '还差一步',
        content: '许愿池里都是「想吃什么」的心愿，去菜谱里挑到对应的菜、点 + 加入，就能凑成今晚的菜单啦。',
        confirmText: '去挑菜',
        cancelText: '知道了',
        success: (res) => {
          if (res.confirm) wx.switchTab({ url: '/pages/recipes/index' });
        }
      });
      return;
    }

    wx.showLoading({ title: '加入菜单中', mask: true });
    // 并发下单（不因单个失败中断整体），完成后统一汇报
    const results = await Promise.allSettled(
      withRecipe.map((w) => addTodayMenuRecipe(w.recipeId, this.data.currentSlot))
    );
    const addedIds = withRecipe.filter((w, i) => results[i].status === 'fulfilled').map((w) => w.id);
    const failed = results.length - addedIds.length;
    // 只清掉成功加入菜单的许愿，纯文本许愿保留在池中
    const all = loadWishes();
    const key = `${this.data.todayKey}:${this.data.currentSlot}`;
    const remaining = (all[key] || []).filter(w => !addedIds.includes(w.id));
    all[key] = remaining;
    saveWishes(all);
    wx.hideLoading();
    this.setData({ wishes: remaining });
    addedIds.forEach(id => removeWishApi(id).catch(() => {}));
    await this.refreshLight();
    const added = addedIds.length;
    if (added) {
      wx.showToast({
        title: failed ? `已加入 ${added} 道，失败 ${failed} 道` : `已加入 ${added} 道菜`,
        icon: failed ? 'none' : 'success'
      });
    } else {
      wx.showToast({ title: '加入失败，请重试', icon: 'none' });
    }
    if (added && textOnly.length) {
      // 提醒还有纯文本心愿未处理
      setTimeout(() => {
        wx.showToast({ title: `还有 ${textOnly.length} 条心愿待挑菜`, icon: 'none' });
      }, 1600);
    }
  },

  async loadAll() {
    try {
      const [dashboard, todayMenu, shopping, family, user, match] = await Promise.all([
        getDashboard(),
        getTodayMenu(),
        getShoppingList(),
        getFamilyProfile(),
        getCurrentUser(),
        getPantryMatch()
      ]);

      const items = todayMenu && Array.isArray(todayMenu.items) ? todayMenu.items : [];
      const normalizedItems = items.map(item => ({
        ...item,
        mealTypeLabel: mealTypeLabels[item.mealType] || '晚餐',
        dishImg: (item.recipe && item.recipe.coverImage)
          || fallbackDishImg(item.recipeId || (item.recipe && item.recipe.title))
      }));

      const shoppingItems = shopping && Array.isArray(shopping.items) ? shopping.items : [];
      const shoppingPending = shoppingItems.filter(i => !i.purchased).length;

      const matchedMap = new Map();
      const matchList = Array.isArray(match) ? match : [];
      matchList.forEach(m => {
        const recipeId = m && m.recipe && m.recipe.id;
        if (recipeId == null) return;
        matchedMap.set(String(recipeId), Math.round(((m.matchRate) || 0) * 100));
      });

      const allRecipes = this.collectRecipes(dashboard, matchedMap);
      const cuisineTiles = this.buildCuisineTiles(allRecipes);
      const cookCandidates = this.buildCookCandidates(user, family);

      // 写缓存供离线兜底
      writeCache(CACHE_KEY_MENU, normalizedItems);
      writeCache(CACHE_KEY_SHOPPING, shoppingPending);

      this.setData({
        loading: false,
        loadError: '',
        greeting: greetingText(),
        currentUser: user || {},
        familyProfile: family || { members: [] },
        cookCandidates,
        activeCookKey: cookCandidates[0] ? cookCandidates[0].key : '',
        activeCook: cookCandidates[0] || null,
        todayMenu: normalizedItems,
        shoppingPending,
        allRecipes,
        cuisineTiles
      });
      this.updateSlotMenu();

      // 写入离线缓存
      writeCache(CACHE_KEY_MENU, normalizedItems);
      writeCache(CACHE_KEY_SHOPPING, shoppingPending);

      this.applyFilters('all', allRecipes);
      this._inited = true;
    } catch (err) {
      console.error('home loadAll failed', err);
      this.setData({
        loading: false,
        loadError: (err && err.message) ? err.message : '加载失败'
      });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async refreshLight() {
    try {
      const [todayMenu, shopping] = await Promise.all([getTodayMenu(), getShoppingList()]);
      const items = todayMenu && Array.isArray(todayMenu.items) ? todayMenu.items : [];
      const shoppingItems = shopping && Array.isArray(shopping.items) ? shopping.items : [];
      const normalizedItems = items.map(item => ({
        ...item,
        mealTypeLabel: mealTypeLabels[item.mealType] || '晚餐',
        dishImg: (item.recipe && item.recipe.coverImage)
          || fallbackDishImg(item.recipeId || (item.recipe && item.recipe.title))
      }));
      const shoppingPending = shoppingItems.filter(i => !i.purchased).length;
      this.setData({ todayMenu: normalizedItems, shoppingPending });
      this.updateSlotMenu();
      writeCache(CACHE_KEY_MENU, normalizedItems);
      writeCache(CACHE_KEY_SHOPPING, shoppingPending);
    } catch (err) {
      console.warn('home refreshLight failed', err);
    }
  },

  buildCookCandidates(user, family) {
    const list = [];
    if (user && user.nickname) {
      list.push({
        key: user.userId ? `u-${user.userId}` : 'u-me',
        nickname: user.nickname,
        initial: user.nickname.slice(0, 1),
        tone: memberTones[0]
      });
    }
    const members = (family && Array.isArray(family.members)) ? family.members : [];
    members.forEach((m, i) => {
      if (!m || !m.nickname) return;
      if (user && m.userId === user.userId) return;
      list.push({
        key: `m-${m.userId || i}`,
        nickname: m.nickname,
        initial: m.nickname.slice(0, 1),
        tone: memberTones[(i + 1) % memberTones.length]
      });
    });
    return list;
  },

  collectRecipes(dashboard, matchedMap) {
    if (!dashboard) return [];
    const all = []
      .concat(dashboard.ownedRecipes || [])
      .concat(dashboard.communityRecipes || [])
      .concat(dashboard.importedRecipes || []);
    const seen = new Set();
    const list = [];
    all.forEach(recipe => {
      if (!recipe || !recipe.id || seen.has(recipe.id)) return;
      seen.add(recipe.id);
      const matchedRatio = matchedMap.get(String(recipe.id)) || 0;
      list.push({
        ...recipe,
        tasteTags: Array.isArray(recipe.tasteTags) ? recipe.tasteTags : [],
        rating: recipe.rating || '',
        summary: recipe.summary || '',
        sourceLabel: sourceLabels[recipe.sourceType] || '',
        cuisineClass: getCuisineClass(recipe.cuisine),
        dishImg: recipe.coverImage || fallbackDishImg(recipe.id || recipe.title),
        matchedRatio
      });
    });
    return list;
  },

  buildCuisineTiles(recipes) {
    const counts = new Map();
    recipes.forEach(r => {
      const c = r.cuisine || '其他';
      counts.set(c, (counts.get(c) || 0) + 1);
    });
    const preferred = ['家常', '川菜', '粤菜', '湘菜', '鲁菜', '西餐', '日料'];
    const tiles = [{ key: 'all', label: '全部', count: recipes.length }];
    preferred.forEach(label => {
      const count = counts.get(label) || 0;
      if (count > 0) {
        tiles.push({ key: label, label, count });
      }
    });
    return tiles;
  },

  applyFilters(cuisine, recipesSource) {
    const recipes = recipesSource || this.data.allRecipes;
    const filtered = cuisine === 'all'
      ? recipes
      : recipes.filter(r => r.cuisine === cuisine);

    const shuffled = shuffle(filtered);
    const hero = shuffled[0] || null;
    const sides = shuffled.slice(1, 3).map(r => ({ ...r }));
    const visible = shuffled.slice(3, 11);

    this.setData({
      activeCuisine: cuisine,
      heroRecipe: hero ? { ...hero, titleClass: decorateHero(hero.title) } : null,
      sideRecipes: sides,
      visibleRecipes: visible,
      isEmpty: !sides.length && !visible.length
    });
  },

  selectCuisine(e) {
    const { cuisine } = e.currentTarget.dataset;
    this.applyFilters(cuisine);
  },

  selectCook(e) {
    const { key } = e.currentTarget.dataset;
    const cook = this.data.cookCandidates.find(c => c.key === key);
    if (!cook) return;
    this.setData({ activeCookKey: key, activeCook: cook });
  },

  shuffleHero() {
    this.applyFilters(this.data.activeCuisine);
  },

  async addToToday(e) {
    const id = (e.detail && e.detail.id) || (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id);
    if (!id) return;
    // 查重（对照 recipes 页 todayDishIds 模式）：已在今日菜单直接提示，不重复加
    if ((this.data.todayMenu || []).some(it => String(it.recipeId) === String(id))) {
      wx.showToast({ title: '已经在今日菜单里啦', icon: 'none' });
      return;
    }
    const slot = this.data.currentSlot || 'dinner';
    const slotLabel = mealTypeLabels[slot] || '晚餐';
    try {
      await addTodayMenuRecipe(id, slot);
      wx.showToast({ title: `已加入今日${slotLabel}`, icon: 'success' });
      if (this._inited) this.refreshLight();
    } catch (err) {
      wx.showToast({ title: '加入失败，请重试', icon: 'none' });
    }
  },

  goDetail(e) {
    const id = (e.detail && e.detail.id) || (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id);
    if (!id) return;
    wx.navigateTo({ url: `/pages/recipe-detail/index?id=${id}` });
  },

  goMenu() {
    wx.navigateTo({ url: '/pages/menu/index' });
  },

  goShopping() {
    wx.navigateTo({ url: '/pages/shopping/index' });
  },

  goRecipes() {
    wx.switchTab({ url: '/pages/recipes/index' });
  },

  goRandom() {
    this.applyFilters(this.data.activeCuisine);
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
  },

  goByTime() {
    const fast = this.data.allRecipes.filter(r => r.timeCost && r.timeCost <= 15);
    if (!fast.length) {
      wx.showToast({ title: '暂无快手菜', icon: 'none' });
      return;
    }
    const shuffled = shuffle(fast);
    const hero = shuffled[0] || null;
    const sides = shuffled.slice(1, 3);
    const visible = shuffled.slice(3, 11);
    this.setData({
      activeCuisine: 'all',
      heroRecipe: hero ? { ...hero, titleClass: decorateHero(hero.title) } : null,
      sideRecipes: sides,
      visibleRecipes: visible,
      isEmpty: !sides.length && !visible.length
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
  },

  goByPantry() {
    wx.switchTab({ url: '/pages/pantry/index' });
  },

  onHeroImgError() {
    const hero = this.data.heroRecipe;
    if (!hero) return;
    this.setData({ 'heroRecipe.dishImg': fallbackDishImg(hero.id || hero.title) });
  },

  onGridImgError(e) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.visibleRecipes[idx];
    if (typeof idx === 'number' && item) {
      this.setData({ [`visibleRecipes[${idx}].dishImg`]: fallbackDishImg(item.id || item.title) });
    }
  },

  onSideImgError(e) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.sideRecipes[idx];
    if (typeof idx === 'number' && item) {
      this.setData({ [`sideRecipes[${idx}].dishImg`]: fallbackDishImg(item.id || item.title) });
    }
  },
  onShareAppMessage() {
    return {
      title: '家庭点菜 · 今天吃什么一起定',
      path: '/pages/home/index'
    };
  },
});
