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
const { runGuarded } = require('../../utils/interaction');
const { sourceLabels, mealTypeLabels, SLOTS, cuisinePinyin } = require('../../utils/constants');
const { fallbackDishImg, recipeDishImg, onImgError } = require('../../utils/image');
const { decorateHero, filterBySlot, todayDateKey } = require('../../utils/dish-logic');
const { withTabSelect } = require('../../behaviors/tab-select');
const WISH_STORAGE_KEY = 'family_wishes_v1';
const WISH_PENDING_KEY = 'wish_pending_v1';
const CACHE_KEY_MENU = 'home_cache_todayMenu';
const CACHE_KEY_SHOPPING = 'home_cache_shoppingPending';

// ponytail: simple stale-while-revalidate — show cached data instantly, overwrite on network success
function readCache(key) {
  try { return wx.getStorageSync(key); } catch (e) { return null; }
}
function writeCache(key, val) {
  try { wx.setStorageSync(key, val); } catch (e) { /* best-effort */ }
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

// —— 离线许愿待同步队列 ——
// 之前只提示「联网后自动同步」但没有任何补发逻辑，服务端一刷新就把本地许愿抹掉。
function loadPending() {
  try {
    const raw = wx.getStorageSync(WISH_PENDING_KEY);
    if (Array.isArray(raw)) return raw;
  } catch (e) {}
  return [];
}
function savePending(list) {
  try { wx.setStorageSync(WISH_PENDING_KEY, list || []); } catch (e) {}
}
function pushPending(wish) {
  const list = loadPending();
  list.push(wish);
  savePending(list);
}
function removePending(id) {
  savePending(loadPending().filter((w) => w.id !== id));
}

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

/**
 * 推荐排序：库存匹配率 > 评分 > id。
 *
 * 之前这里用的是 Math.random 打乱，结果每次进首页、每切一次菜系看到的推荐都不一样，
 * 和 DESIGN 决策 1「首页固定为今天做什么」直接冲突——随机推荐等于没有推荐。
 * 现在改用可解释的稳定序（匹配率是后端 pantry/match 已经算好的，之前只是没拿来排序）。
 */
function compareRecipes(a, b) {
  const mr = (b.matchedRatio || 0) - (a.matchedRatio || 0);
  if (mr !== 0) return mr;
  const ra = Number(a.rating) || 0;
  const rb = Number(b.rating) || 0;
  if (rb !== ra) return rb - ra;
  return (Number(b.id) || 0) - (Number(a.id) || 0);
}

Page({
  data: {
    loading: true,
    greeting: '你好',
    currentUser: {},
    familyProfile: { members: [] },

    // 餐次 & 许愿池（§3 / §5）
    slots: SLOTS,
    currentSlot: 'dinner',
    todayKey: '',
    wishes: [],            // 当前 (date,slot) 下的许愿数组
    wishExpanded: false,   // 许愿池默认折叠一行，点击展开（DEC-UI1）
    showWishModal: false,  // 许愿弹窗（原先只在 setData 时才出现，未在 data 里声明）
    wishInput: '',
    fontScale: 'normal',   // 大字模式档位，onShow 从本地存储读取
    slotDoneCount: 0,      // 当前餐次已上桌的数量，updateSlotMenu 里算
    role: '',              // 本人在家庭中的角色（owner/admin/member），loadAll 时由后端数据填充
    canConfirm: true,      // owner/admin 可确认菜单；无家庭数据时不阻断（§6）

    activeCuisine: 'all',
    heroRecipe: null,
    visibleRecipes: [],
    todayMenu: [],
    slotMenu: [],          // 当前餐次 (currentSlot) 的菜单项，随 slotbar 联动
    shoppingPending: 0,
    cuisineTiles: [],

    allRecipes: [],
    loadError: '',
    // 有可展示内容时刷新失败不摘下方结构（DEC-5）
    hasHomeData: false,
    capsuleTop: 'calc(env(safe-area-inset-top) + 90rpx)',
    capsuleRight: '96px'
  },

  /**
   * 软失败保留下方：必须有「可浏览的菜谱/hero/有内容的菜单卡/许愿」
   * 仅 todayMenu 离线缓存不够——否则 load 失败仍露出空区块标题+空白（截图痛点）
   */
  _syncHasHomeData(patch) {
    const d = Object.assign({}, this.data, patch || {});
    const hasRecipes =
      !!(d.heroRecipe) ||
      (Array.isArray(d.visibleRecipes) && d.visibleRecipes.length > 0) ||
      (Array.isArray(d.allRecipes) && d.allRecipes.length > 0);
    const hasMenuCard = Array.isArray(d.slotMenu) && d.slotMenu.length > 0;
    const hasWishes = Array.isArray(d.wishes) && d.wishes.length > 0;
    return !!(hasRecipes || hasMenuCard || hasWishes);
  },

  onLoad() {
    this._inited = false;
    const todayKey = todayDateKey();
    // 离线缓存：先用上次菜单渲染；hasHomeData 等 loadAll/applyFilters 后再定
    const cachedMenu = readCache(CACHE_KEY_MENU);
    const cachedPending = readCache(CACHE_KEY_SHOPPING);
    const menu = Array.isArray(cachedMenu) ? cachedMenu : [];
    let capsuleTop = 'calc(env(safe-area-inset-top) + 90rpx)';
    let capsuleRight = '96px';
    try {
      const mb = wx.getMenuButtonBoundingClientRect();
      const sys = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
      if (mb && sys && mb.left) {
        capsuleTop = mb.top + 'px';
        capsuleRight = (sys.windowWidth - mb.left + 8) + 'px';
      }
    } catch (e) {}
    this.setData({
      todayKey,
      todayMenu: menu,
      shoppingPending: typeof cachedPending === 'number' ? cachedPending : 0,
      hasHomeData: false,
      capsuleTop,
      capsuleRight
    });
    this.refreshWishes();
    this.loadAll();
  },

  onShow() {
    withTabSelect(this, 0);
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
      // 先把上次离线存的许愿补发，再拉最新列表，避免被服务端结果覆盖掉
      await this.flushPendingWishes(date, slot);
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

  // 补发离线期间积压的许愿；成功的出队，仍失败的留队下次再试
  async flushPendingWishes(date, slot) {
    const pending = loadPending().filter((w) => w.date === date && w.slot === slot);
    if (!pending.length) return;
    await Promise.all(pending.map((w) =>
      addWish({ date: w.date, slot: w.slot, text: w.text, recipeId: null })
        .then(() => { removePending(w.id); })
        .catch(() => {})
    ));
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
    // 上桌进度：菜单页标记的 done 状态在首页卡片同步展示
    const slotDoneCount = slotMenu.filter(it => it.status === 'done').length;
    this.setData({ slotMenu, slotDoneCount });
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
      // 离线兜底：入待同步队列，下次 refreshWishes 会补发（不是只喊口号）
      pushPending({ id: wish.id, date, slot, text: wish.text });
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
    // 若这条还在待同步队列里，直接出队，避免删除后被补发回来
    removePending(id);
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
      // 本地已删，服务端删除失败下次拉取会重现；提示重试而非承诺自动同步
      wx.showToast({ title: '已在本机移除，云端可能稍后恢复', icon: 'none' });
    }
  },

  // 心愿条目「待挑菜」→ 带心愿文本直达菜谱搜索。事件只负责取 dataset，
  // 真正的跳转逻辑在 pickDishForWish（confirmMenu 也复用它，不用再伪造事件对象）。
  pickForWish(e) {
    const ds = e.currentTarget.dataset;
    this.pickDishForWish({
      text: ds.text,
      id: ds.id,
      slot: ds.slot || this.data.currentSlot
    });
  },

  // 许愿 → 挑菜 → 入菜单：wishId/slot 一路透传，详情页加菜成功后自动销愿
  pickDishForWish(wish) {
    const text = ((wish && wish.text) || '').trim();
    if (!text) {
      wx.showToast({ title: '这条心愿还没有内容', icon: 'none' });
      return;
    }
    const wishId = (wish && wish.id) || '';
    const slot = (wish && wish.slot) || this.data.currentSlot || 'dinner';
    wx.navigateTo({
      url: `/pages/recipes/search/index?keyword=${encodeURIComponent(text)}&wishId=${encodeURIComponent(wishId)}&slot=${slot}`,
      fail: () => wx.switchTab({ url: '/pages/recipes/index' })
    });
  },

  // 许愿都是纯文本（confirmWish 不写 recipeId），无法直接入菜单，
  // 主 CTA 改为带第一条心愿直达搜索挑菜；挑到后详情页加菜会自动销愿。
  confirmMenu() {
    if (!this.data.canConfirm) {
      wx.showToast({ title: '请等做饭人确认', icon: 'none' });
      return;
    }
    const list = this.data.wishes;
    if (!list || !list.length) {
      wx.showToast({ title: '先从下面挑菜或点「我想吃」', icon: 'none' });
      return;
    }
    const first = list[0];
    this.pickDishForWish({ text: first.text, id: first.id, slot: first.slot });
  },

  async loadAll() {
    this.setData({ loading: true, loadError: '' });
    // 超时兜底：避免接口挂死导致永久骨架/白屏
    const seq = (this._loadAllSeq = (this._loadAllSeq || 0) + 1);
    if (this._loadAllWatchdog) clearTimeout(this._loadAllWatchdog);
    this._loadAllWatchdog = setTimeout(() => {
      if (this._loadAllSeq !== seq) return;
      if (!this.data.loading) return;
      this._loadAllSeq += 1;
      console.warn('home loadAll watchdog timeout');
      this.setData({
        loading: false,
        loadError: this.data.loadError || '加载超时，请重试',
        hasHomeData: this._inited ? this._syncHasHomeData() : false
      });
    }, 8000);
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
        dishImg: recipeDishImg(item.recipe || { id: item.recipeId })
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

      if (this._loadAllSeq !== seq) return;

      const allRecipes = this.collectRecipes(dashboard, matchedMap);
      const cuisineTiles = this.buildCuisineTiles(allRecipes);
      const myRole = this._resolveMyRole(user, family);

      // 写缓存供离线兜底
      writeCache(CACHE_KEY_MENU, normalizedItems);
      writeCache(CACHE_KEY_SHOPPING, shoppingPending);

      const patch = {
        loading: false,
        loadError: '',
        greeting: greetingText(),
        currentUser: user || {},
        familyProfile: family || { members: [] },
        role: myRole || '',
        // owner/admin 是「做饭人」可确认菜单；普通 member 需等待；查不到角色（无家庭）不阻断
        canConfirm: myRole ? ['owner', 'admin', 'cook'].indexOf(myRole) !== -1 : true,
        todayMenu: normalizedItems,
        shoppingPending,
        allRecipes,
        cuisineTiles
      };
      patch.hasHomeData = this._syncHasHomeData(patch);
      this.setData(patch);
      this.updateSlotMenu();

      this.applyFilters('all', allRecipes);
      // applyFilters 后刷新 hasHomeData（hero/visible/side 已写入）
      this.setData({ hasHomeData: this._syncHasHomeData() });
      this._inited = true;
      if (this._loadAllWatchdog) { clearTimeout(this._loadAllWatchdog); this._loadAllWatchdog = null; }
    } catch (err) {
      if (this._loadAllWatchdog) { clearTimeout(this._loadAllWatchdog); this._loadAllWatchdog = null; }
      if (this._loadAllSeq !== seq) return;
      console.error('home loadAll failed', err);
      // 从未成功加载过 → 强制全屏错误（忽略本地许愿/菜单缓存造成的 hasHomeData 误判）
      // 已成功过 → 软失败，保留下方可交互结构
      const soft = !!this._inited;
      this.setData({
        loading: false,
        loadError: (err && err.message) ? err.message : '加载失败',
        hasHomeData: soft ? this._syncHasHomeData({ loading: false }) : false
      });
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
        dishImg: recipeDishImg(item.recipe || { id: item.recipeId })
      }));
      const shoppingPending = shoppingItems.filter(i => !i.purchased).length;
      this.setData({ todayMenu: normalizedItems, shoppingPending });
      this.updateSlotMenu();
      writeCache(CACHE_KEY_MENU, normalizedItems);
      writeCache(CACHE_KEY_SHOPPING, shoppingPending);
    } catch (err) {
      console.warn('home refreshLight menu', err);
      return;
    }
    try {
      const [family, user] = await Promise.all([getFamilyProfile(), getCurrentUser()]);
      const patch = {};
      if (family) patch.familyProfile = family;
      if (user) patch.currentUser = user;
      if (family || user) {
        const myRole = this._resolveMyRole(
          user || this.data.currentUser,
          family || this.data.familyProfile
        );
        patch.role = myRole || '';
        patch.canConfirm = myRole ? ['owner', 'admin', 'cook'].indexOf(myRole) !== -1 : true;
      }
      if (Object.keys(patch).length) this.setData(patch);
    } catch (err) {
      console.warn('home refreshLight profile', err);
    }
  },

  // 本人在家庭中的角色：owner/admin/member（后端 FamilyMemberItem.role）
  _resolveMyRole(user, family) {
    const members = (family && Array.isArray(family.members)) ? family.members : [];
    const uid = user && user.userId;
    if (uid == null || !members.length) return '';
    const me = members.find((m) => m && String(m.userId) === String(uid));
    return me && me.role ? String(me.role) : '';
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
        dishImg: recipeDishImg(recipe),
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

  /**
   * 首屏推荐：稳定排序 + 可轮转。
   * _heroOffset 只在用户主动点「换一个」或切菜系时变化，所以同一天反复进出首页看到的是同一批推荐。
   */
  applyFilters(cuisine, recipesSource) {
    const recipes = recipesSource || this.data.allRecipes;
    const filtered = (cuisine === 'all'
      ? recipes
      : recipes.filter(r => r.cuisine === cuisine))
      .slice()
      .sort(compareRecipes);

    const total = filtered.length;
    const offset = total ? ((this._heroOffset || 0) % total) : 0;
    const list = total ? filtered.slice(offset).concat(filtered.slice(0, offset)) : [];
    const hero = list[0] || null;
    const visible = list.slice(1, 11);

    this.setData({
      activeCuisine: cuisine,
      heroRecipe: hero ? { ...hero, titleClass: decorateHero(hero.title) } : null,
      visibleRecipes: visible
    });
  },

  selectCuisine(e) {
    const { cuisine } = e.currentTarget.dataset;
    // 换菜系＝换一批推荐，从头看起；否则会带着上一个菜系的轮转位串味
    this._heroOffset = 0;
    this.applyFilters(cuisine);
  },

  // 「换一个」：整体轮转一位，结果可预期（不会像随机那样每次都跳成完全不同的一道菜）
  shuffleHero() {
    this._heroOffset = (this._heroOffset || 0) + 1;
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
    // 防重 + 即时反馈：joined 在途时重复点击被忽略（此前连点会重复 POST）
    await runGuarded(this, `add-${id}`, () => addTodayMenuRecipe(id, slot), {
      loading: '加入中',
      success: `已加入今日${slotLabel}`,
      fail: '加入失败，请重试'
    });
    if (this._inited) this.refreshLight();
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

  toggleWishExpand() {
    this.setData({ wishExpanded: !this.data.wishExpanded });
  },
  onShareAppMessage() {
    return {
      title: '家庭点菜 · 今天吃什么一起定',
      path: '/pages/home/index'
    };
  },
});
