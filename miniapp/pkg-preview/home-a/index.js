/**
 * 首页风格预览 · 方案 A「清爽卡片流」
 *
 * 只读预览：数据走真实接口（与 pages/home 同源：dashboard 出菜谱、daily-menu/today 出今日菜单），
 * 所有写操作（加菜、跳转）只弹 toast。唯二真实生效的交互是「切餐次」和「换一批」，都只改本地视图。
 */
const { getCapsule } = require('../../utils/capsule');
const { getDashboard, getTodayMenu, getFamilyProfile, getCurrentUser } = require('../../utils/api');
const { SLOTS, mealTypeLabels } = require('../../utils/constants');
const features = require('../../utils/features');
const { recipeDishImg, fallbackDishImg } = require('../../utils/image');
const { filterBySlot } = require('../../utils/dish-logic');

const REC_SIZE = 5;     // 推荐横滑一批几张
const GRID_SIZE = 6;    // 网格最多几格（两列 × 3 行）
const STACK_SIZE = 3;   // 主卡里叠放的已点菜图
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

function greetingText(h) {
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

// 进页默认选「下一顿」：10 点前早餐、15 点前午餐、其余晚餐
function defaultSlot(h) {
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  return 'dinner';
}

function metaText(r) {
  const parts = [];
  if (r.timeCost) parts.push(r.timeCost + ' 分钟');
  if (r.servings) parts.push(r.servings + ' 人份');
  return parts.length ? parts.join(' · ') : (r.cuisine || '家常');
}

// 稳定序：评分 > id（和 pages/home 一致地不用随机；匹配率需要 pantry/match，预览页不拉）
function compareRecipes(a, b) {
  const ra = Number(a.rating) || 0;
  const rb = Number(b.rating) || 0;
  if (rb !== ra) return rb - ra;
  return (Number(b.id) || 0) - (Number(a.id) || 0);
}

function collectRecipes(dashboard) {
  if (!dashboard) return [];
  const all = []
    .concat(dashboard.ownedRecipes || [])
    .concat(features.COMMUNITY ? (dashboard.communityRecipes || []) : [])
    .concat(dashboard.importedRecipes || []);
  const seen = {};
  const list = [];
  all.forEach((r) => {
    if (!r || !r.id || seen[r.id]) return;
    seen[r.id] = true;
    list.push({
      id: r.id,
      title: r.title || '未命名菜谱',
      rating: r.rating || 0,
      dishImg: recipeDishImg(r),
      meta: metaText(r)
    });
  });
  return list.sort(compareRecipes);
}

Page({
  data: {
    loading: true,
    loaded: false,          // 成功加载过一次：之后再失败只出顶部提示条，不摘内容
    loadError: '',
    fontScale: 'normal',
    capsuleTop: 'calc(env(safe-area-inset-top) + 90rpx)',
    capsuleRight: '96px',

    greeting: '你好',
    nickname: '',
    familyName: '',
    dateText: '',

    slots: SLOTS,
    currentSlot: 'dinner',
    slotLabel: '晚餐',
    slotCount: 0,
    slotPics: [],
    slotMore: 0,

    recs: [],
    grid: [],
    total: 0,
    canShuffle: false
  },

  onLoad() {
    const now = new Date();
    const h = now.getHours();
    const capsule = getCapsule();
    const slot = defaultSlot(h);
    this.setData({
      capsuleTop: capsule.top,
      capsuleRight: capsule.right,
      greeting: greetingText(h),
      dateText: `${now.getMonth() + 1}月${now.getDate()}日 周${WEEK[now.getDay()]}`,
      currentSlot: slot,
      slotLabel: mealTypeLabels[slot] || '晚餐'
    });
    this.loadAll();
  },

  onShow() {
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
  },

  onUnload() {
    if (this._watchdog) clearTimeout(this._watchdog);
  },

  onPullDownRefresh() {
    this.loadAll().then(() => wx.stopPullDownRefresh());
  },

  async loadAll() {
    const seq = (this._seq || 0) + 1;
    this._seq = seq;
    this.setData({ loading: true, loadError: '' });
    // 超时兜底：接口挂死时不让骨架永远转下去
    if (this._watchdog) clearTimeout(this._watchdog);
    this._watchdog = setTimeout(() => {
      if (this._seq !== seq || !this.data.loading) return;
      this._seq += 1;
      this.setData({ loading: false, loadError: '加载超时，请重试' });
    }, 8000);
    try {
      // 菜谱和今日菜单是首页主体，失败即整页失败；家庭名/昵称只是装饰，失败不拖垮首页
      const res = await Promise.all([
        getDashboard(),
        getTodayMenu(),
        getFamilyProfile().catch(() => null),
        getCurrentUser().catch(() => null)
      ]);
      if (this._seq !== seq) return;
      const menu = res[1] && Array.isArray(res[1].items) ? res[1].items : [];
      const family = res[2] || {};
      const user = res[3] || {};

      this._menu = menu.map((it) => ({
        id: it.id,
        recipeId: it.recipeId,
        mealType: it.mealType,
        dishImg: recipeDishImg(it.recipe || { id: it.recipeId }),
        seed: String(it.recipeId || it.id || '')
      }));
      // 今日菜单里已有的菜（不分餐次，与 pages/home 的查重口径一致）
      this._joinedIds = {};
      this._menu.forEach((it) => { if (it.recipeId != null) this._joinedIds[String(it.recipeId)] = true; });
      this._sorted = collectRecipes(res[0]);
      this._offset = 0;

      this.setData({
        loading: false,
        loaded: true,
        loadError: '',
        nickname: user.nickname || '',
        familyName: family.familyName || '我的家',
        total: this._sorted.length
      });
      this.applySlot();
      this.applyRecipes();
    } catch (err) {
      if (this._seq !== seq) return;
      console.error('preview home-a loadAll failed', err);
      this.setData({ loading: false, loadError: (err && err.message) || '加载失败，请重试' });
    } finally {
      if (this._seq === seq && this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
    }
  },

  // 主卡：当前餐次已点几道 + 叠放前 3 张菜图
  applySlot() {
    const slot = this.data.currentSlot;
    const items = filterBySlot(this._menu || [], slot);
    this.setData({
      slotLabel: mealTypeLabels[slot] || '晚餐',
      slotCount: items.length,
      slotPics: items.slice(0, STACK_SIZE).map((it, i) => ({ key: `${it.id || it.recipeId}-${i}`, img: it.dishImg, seed: it.seed })),
      slotMore: Math.max(0, items.length - STACK_SIZE)
    });
  },

  // 推荐 = 稳定序按 _offset 轮转后的前 REC_SIZE 道；网格 = 其余的前 GRID_SIZE 道（菜少时允许和推荐重叠）
  applyRecipes() {
    const list = this._sorted || [];
    const n = list.length;
    const off = n ? (this._offset || 0) % n : 0;
    const rotated = n ? list.slice(off).concat(list.slice(0, off)) : [];
    const recs = rotated.slice(0, REC_SIZE);
    const inRecs = {};
    recs.forEach((r) => { inRecs[r.id] = true; });
    let grid = list.filter((r) => !inRecs[r.id]).slice(0, GRID_SIZE);
    if (!grid.length) grid = list.slice(0, GRID_SIZE);
    const joined = this._joinedIds || {};
    const mark = (r) => Object.assign({}, r, { joined: !!joined[String(r.id)] });
    this.setData({ recs: recs.map(mark), grid: grid.map(mark), canShuffle: n > REC_SIZE });
  },

  selectSlot(e) {
    const slot = e.currentTarget.dataset.slot;
    if (!slot || slot === this.data.currentSlot) return;
    this.setData({ currentSlot: slot });
    this.applySlot();
  },

  onShuffle() {
    this._offset = (this._offset || 0) + REC_SIZE;
    this.applyRecipes();
  },

  onRetry() {
    this.loadAll();
  },

  onPrimary() {
    const label = this.data.slotLabel;
    this.preview(this.data.slotCount ? `查看${label}菜单` : `去挑${label}`);
  },

  onRecipeTap(e) {
    this.preview(`打开「${e.currentTarget.dataset.title || '菜谱'}」`);
  },

  onAdd(e) {
    const ds = e.currentTarget.dataset;
    if (ds.joined) {
      this.preview('已在今日菜单里');
      return;
    }
    this.preview(`加入${this.data.slotLabel}「${ds.title || ''}」`);
  },

  onSeeAll() {
    this.preview('打开菜谱库');
  },

  // 菜图加载失败：按 id/菜名落到本地菜图（与 pages/home 的 onGridImgError 同口径）
  onPicError(e) {
    const ds = e.currentTarget.dataset;
    if (!ds.path) return;
    this.setData({ [ds.path]: fallbackDishImg(ds.seed) });
  },

  preview(text) {
    wx.showToast({ title: '预览：' + text, icon: 'none' });
  }
});
