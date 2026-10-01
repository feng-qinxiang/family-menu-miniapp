/**
 * 首页风格预览 · 方案 C「暖色精致沉浸」
 * 数据只读真实接口（与 pages/home 同源：getDashboard / getTodayMenu / getPantryMatch），
 * 所有写操作在预览里只弹 toast，不落库。
 */
const { getCapsule } = require('../../utils/capsule');
const { getDashboard, getTodayMenu, getPantryMatch } = require('../../utils/api');
const { recipeDishImg, localDishByTitle, onPhotoError: markPhotoBroken } = require('../../utils/image');
const { filterBySlot } = require('../../utils/dish-logic');
const features = require('../../utils/features');

// 已知「菜名 ↔ 库存图」错配（逐张看过 assets/dishes 原图）。只在本页兜底：
// 命中的菜不上推荐大图，列表里显示中性占位而不是一张别的菜。
// 根因在 server data.sql 的 cover_image 与 utils/image.js 的 TITLE_RULES，不在本页改。
const MISMATCH = [
  { kw: '排骨', file: 'sweet-sour-chicken' },   // 图是去骨糖醋肉块配彩椒，没有排骨
  { kw: '西兰花', file: 'stir-fry-veg' },       // 图是蒜蓉青菜；牛肉炒西兰花用的 beef-broccoli 不受影响
  { kw: '鸡翅', file: 'orange-chicken' },       // 图是带橙片的橙香鸡块，不是鸡翅
  { kw: '红烧肉', file: 'hongshao-pork' }       // 存疑：图更像蜜汁鸡丁，确认前不上大图
];

/** 这张图能不能当「这道菜的照片」：用户实拍可信；本地库存图要按菜名规则命中或是种子显式封面，且不在错配名单里 */
function photoOf(recipe) {
  const title = recipe.title || '';
  const img = recipeDishImg(recipe);
  const local = /^\/assets\/dishes\/([\w-]+)\.jpg$/.exec(img);
  if (!local) return { img, trusted: !!img };
  if (MISMATCH.some((m) => title.indexOf(m.kw) >= 0 && m.file === local[1])) return { img, trusted: false };
  // 哈希兜底来的图（fallbackDishImg）和菜名毫无关系，不可信
  return { img, trusted: localDishByTitle(title) === img || (recipe.coverImage || recipe.cover) === img };
}

const SLOTS = [
  { key: 'breakfast', label: '早餐', word: '今早' },
  { key: 'lunch', label: '午餐', word: '中午' },
  { key: 'dinner', label: '晚餐', word: '今晚' }
];
function slotOf(key) {
  return SLOTS.filter((s) => s.key === key)[0] || SLOTS[2];
}
function defaultSlot() {
  const h = new Date().getHours();
  return h < 10 ? 'breakfast' : h < 15 ? 'lunch' : 'dinner';
}
function greetingText() {
  const h = new Date().getHours();
  return h < 6 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
}
function dateText() {
  const d = new Date();
  return `${d.getMonth() + 1}月${d.getDate()}日 · 周${'日一二三四五六'[d.getDay()]}`;
}

// 「按心情挑」：全部由真实字段推出（time_cost / taste_tags / cuisine / 菜名），一道菜都没命中的入口不出现
const MOODS = [
  { key: 'quick', label: '快手菜', test: (r) => (r.timeCost > 0 && r.timeCost <= 15) || /快手/.test(r.s) },
  { key: 'rice', label: '下饭菜', test: (r) => /下饭|浓香|香辣|麻辣/.test(r.s) },
  { key: 'light', label: '清淡', test: (r) => /清淡|清爽|爽口|少油|蒸菜/.test(r.s) },
  { key: 'soup', label: '汤', test: (r) => /汤/.test(r.s) },
  { key: 'staple', label: '主食面点', test: (r) => /主食|面点|面食|炒饭|馄饨|拌面/.test(r.s) },
  { key: 'kids', label: '孩子爱吃', test: (r) => /孩子/.test(r.s) }
];

/** 标题跟着推荐菜和餐次走，不写死一句「今晚想吃点啥」 */
function headlineOf(slot, hero) {
  if (!hero) return `${slot.word}，吃点什么`;
  const s = hero.s + (hero.summary || '');
  const what = /汤/.test(s) ? '喝碗热汤'
    : /清淡|清爽|少油|蒸/.test(s) ? '吃得清爽些'
      : /下饭|浓香|香辣|麻辣/.test(s) ? '来道下饭的'
        : hero.timeCost > 0 && hero.timeCost <= 15 ? '做道快手的' : '做点暖胃的';
  return `${slot.word}，${what}`;
}

/** 推荐序与首页一致：库存匹配率 > 评分 > id，稳定可解释 */
function compareRecipes(a, b) {
  if (b.match !== a.match) return b.match - a.match;
  if (b.rating !== a.rating) return b.rating - a.rating;
  return (Number(b.id) || 0) - (Number(a.id) || 0);
}

function toView(recipe, match) {
  const tags = Array.isArray(recipe.tasteTags) ? recipe.tasteTags : [];
  const photo = photoOf(recipe);
  const timeCost = Number(recipe.timeCost) || 0;
  const servings = Number(recipe.servings) || 0;
  const meta = [];
  if (timeCost) meta.push(`${timeCost} 分钟`);
  if (servings) meta.push(`${servings} 人份`);
  return {
    id: recipe.id,
    title: recipe.title || '未命名菜谱',
    initial: (recipe.title || '菜').slice(0, 1),
    summary: recipe.summary || '',
    cuisine: recipe.cuisine || '',
    tag: tags[0] || recipe.cuisine || '',
    timeCost,
    rating: Number(recipe.rating) || 0,
    match: match || 0,
    meta: meta.join(' · '),
    feedMeta: [timeCost ? `${timeCost} 分钟` : '', tags[0] || recipe.cuisine || ''].filter(Boolean).join(' · '),
    img: photo.trusted ? photo.img : '',
    trusted: photo.trusted,
    broken: false,
    s: [recipe.title, recipe.cuisine, recipe.summary].concat(tags).join(' ')
  };
}

Page({
  data: {
    loading: true,
    loadError: '',
    menuFailed: false,
    fontScale: 'normal',
    capsuleTop: 'calc(env(safe-area-inset-top) + 90rpx)',
    capsuleRight: '96px',
    dateLine: '',
    greeting: '',
    headline: '',
    slots: SLOTS,
    currentSlot: 'dinner',
    slotWord: '今晚',
    slotLabel: '晚餐',
    slotCount: 0,
    slotPreview: '',
    hero: null,
    heroInMenu: false,
    moods: [],
    activeMood: '',
    activeMoodLabel: '',
    feed: [],
    total: 0
  },

  onLoad() {
    const capsule = getCapsule();
    const slot = slotOf(defaultSlot());
    this.setData({
      capsuleTop: capsule.top,
      capsuleRight: capsule.right,
      dateLine: dateText(),
      greeting: greetingText(),
      currentSlot: slot.key,
      slotWord: slot.word,
      slotLabel: slot.label
    });
    this.load();
  },

  onShow() {
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
  },

  onUnload() {
    if (this._watchdog) clearTimeout(this._watchdog);
  },
  async load() {
    const seq = (this._seq = (this._seq || 0) + 1);
    this.setData({ loading: true, loadError: '' });
    if (this._watchdog) clearTimeout(this._watchdog);
    // 超时兜底：接口挂死不许永久骨架
    this._watchdog = setTimeout(() => {
      if (this._seq !== seq || !this.data.loading) return;
      this._seq += 1;
      this.setData({ loading: false, loadError: '加载超时，请重试' });
    }, 8000);
    try {
      // 禁用数组解构（编译依赖未打包的 @babel/runtime）；匹配率只影响排序，失败按 0 算；
      // 今日菜单失败不拖垮整页，但要单独标出来，不能显示成「已点 0 道」
      const loaded = await Promise.all([
        getDashboard(),
        getTodayMenu().catch(() => null),
        getPantryMatch().catch(() => [])
      ]);
      if (this._seq !== seq) return;
      clearTimeout(this._watchdog);
      const dashboard = loaded[0];
      if (!dashboard) throw new Error('首页数据为空');
      const menu = loaded[1];
      const matchMap = {};
      (Array.isArray(loaded[2]) ? loaded[2] : []).forEach((m) => {
        if (m && m.recipe && m.recipe.id != null) matchMap[String(m.recipe.id)] = Math.round((m.matchRate || 0) * 100);
      });
      const seen = {};
      const all = []
        .concat(dashboard.ownedRecipes || [])
        .concat(features.COMMUNITY ? (dashboard.communityRecipes || []) : [])
        .concat(dashboard.importedRecipes || [])
        .filter((r) => r && r.id && !seen[r.id] && (seen[r.id] = true))
        .map((r) => toView(r, matchMap[String(r.id)]))
        .sort(compareRecipes);
      this._all = all;
      this._menu = menu && Array.isArray(menu.items) ? menu.items : [];
      this._heroOffset = 0;
      this.setData({ loading: false, loadError: '', menuFailed: !menu, total: all.length, moods: this.buildMoods(all) });
      this.render();
    } catch (err) {
      if (this._seq !== seq) return;
      clearTimeout(this._watchdog);
      this.setData({ loading: false, loadError: (err && err.message) || '加载失败' });
    }
  },

  buildMoods(all) {
    const used = {};
    return MOODS.map((m) => {
      const hit = all.filter(m.test);
      if (!hit.length) return null;
      // 封面挑一张可信、且没被前面入口用过的图，避免六个入口三张一样
      const cover = hit.filter((r) => r.trusted && !used[r.img])[0] || hit.filter((r) => r.trusted)[0];
      if (cover) used[cover.img] = true;
      return { key: m.key, label: m.label, count: hit.length, img: cover ? cover.img : '', initial: m.label.slice(0, 1), broken: false };
    }).filter(Boolean);
  },

  render() {
    const all = this._all || [];
    // 大图位只放「图和菜名对得上」的菜；一张可信图都没有才退回全量（届时 WXML 画占位，不画错图）
    const trusted = all.filter((r) => r.trusted);
    const pool = trusted.length ? trusted : all;
    const hero = pool.length ? pool[(this._heroOffset || 0) % pool.length] : null;
    const mood = MOODS.filter((m) => m.key === this.data.activeMood)[0];
    const feed = all.filter((r) => (!hero || r.id !== hero.id) && (!mood || mood.test(r))).slice(0, 12);
    const slot = slotOf(this.data.currentSlot);
    const slotMenu = filterBySlot(this._menu || [], slot.key);
    const names = slotMenu.map((it) => (it.recipe && it.recipe.title) || it.recipeTitle || '').filter(Boolean);
    this.setData({
      hero,
      heroInMenu: !!hero && slotMenu.some((it) => String(it.recipeId) === String(hero.id)),
      headline: headlineOf(slot, hero),
      slotCount: slotMenu.length,
      slotPreview: names.slice(0, 2).join('、') + (names.length > 2 ? ' 等' : ''),
      feed
    });
  },

  reload() { this.load(); },

  selectSlot(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.currentSlot) return;
    const slot = slotOf(key);
    this.setData({ currentSlot: slot.key, slotWord: slot.word, slotLabel: slot.label });
    this.render();
  },

  selectMood(e) {
    const key = e.currentTarget.dataset.key;
    const next = key === this.data.activeMood ? '' : key;
    const m = MOODS.filter((x) => x.key === next)[0];
    this.setData({ activeMood: next, activeMoodLabel: m ? m.label : '' });
    this.render();
  },

  clearMood() {
    this.setData({ activeMood: '', activeMoodLabel: '' });
    this.render();
  },

  shuffleHero() {
    this._heroOffset = (this._heroOffset || 0) + 1;
    this.render();
  },

  addHero() {
    const hero = this.data.hero;
    if (!hero) return;
    wx.showToast({ title: this.data.heroInMenu ? `预览：已在${this.data.slotLabel}` : `预览：加入${this.data.slotLabel}`, icon: 'none' });
  },

  openRecipe(e) {
    const title = e.currentTarget.dataset.title || '菜谱';
    wx.showToast({ title: `预览：打开${title}`, icon: 'none' });
  },

  openOrdered() {
    wx.showToast({ title: this.data.menuFailed ? '预览：菜单没取到' : `预览：${this.data.slotLabel}已点 ${this.data.slotCount} 道`, icon: 'none' });
  },

  // 图挂了只标记 broken，WXML 画中性占位；不换成别的库存菜图
  onPhotoError(e) { markPhotoBroken(e, this); }
});
