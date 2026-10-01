/**
 * 首页风格预览 · 方案 D「成熟电商骨架 + 图片主导」
 *
 * 结构照搬 TDesign 零售模板首页（搜索 → 轮播 → 分类 tabs → 双列商品流），
 * 内容层参考下厨房 / NYT Cooking：大图、少装饰、信息只留菜名 + 一行 meta。
 * 只读预览：数据走真实接口，写操作只弹 toast；切分类、切餐次只改本地视图。
 */
const { getCapsule } = require('../../utils/capsule');
const { getDashboard, getTodayMenu, getFamilyProfile } = require('../../utils/api');
const { SLOTS, mealTypeLabels } = require('../../utils/constants');
const features = require('../../utils/features');
const { recipeDishImg, fallbackDishImg } = require('../../utils/image');
const { filterBySlot } = require('../../utils/dish-logic');

const BANNER_SIZE = 4;
const FEED_SIZE = 10;
const MAX_TABS = 6;
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
// 瀑布流图片高度三档（宽 335rpx 时约 4:3 / 1:1 / 3:4），按 id 稳定取，不随机
const IMG_H = [252, 335, 420];

function metaText(r) {
  const parts = [];
  if (r.timeCost) parts.push(r.timeCost + '分钟');
  if (r.cuisine) parts.push(r.cuisine);
  return parts.join(' · ') || '家常';
}

function compareRecipes(a, b) {
  const d = (Number(b.rating) || 0) - (Number(a.rating) || 0);
  return d || (Number(b.id) || 0) - (Number(a.id) || 0);
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
      rating: Number(r.rating) || 0,
      cuisine: String(r.cuisine || '').trim(),
      dishImg: recipeDishImg(r),
      meta: metaText(r),
      imgH: IMG_H[Number(r.id) % IMG_H.length]
    });
  });
  return list.sort(compareRecipes);
}

// 菜系出现次数降序取前几个做 tab；第一个固定「推荐」
function buildTabs(list) {
  const count = {};
  list.forEach((r) => { if (r.cuisine) count[r.cuisine] = (count[r.cuisine] || 0) + 1; });
  const names = Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, MAX_TABS - 1);
  return [{ key: '', label: '推荐' }].concat(names.map((n) => ({ key: n, label: n })));
}

Page({
  data: {
    loading: true,
    loaded: false,
    loadError: '',
    fontScale: 'normal',
    capsuleTop: 'calc(env(safe-area-inset-top) + 90rpx)',
    capsuleRight: '96px',

    familyName: '',
    dateText: '',
    banners: [],
    bannerIdx: 0,
    meals: [],
    tabs: [{ key: '', label: '推荐' }],
    currentTab: '',
    colL: [],
    colR: [],
    total: 0
  },

  onLoad() {
    const now = new Date();
    const capsule = getCapsule();
    this.setData({
      capsuleTop: capsule.top,
      capsuleRight: capsule.right,
      dateText: `${now.getMonth() + 1}月${now.getDate()}日 周${WEEK[now.getDay()]}`
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
    if (this._watchdog) clearTimeout(this._watchdog);
    this._watchdog = setTimeout(() => {
      if (this._seq !== seq || !this.data.loading) return;
      this._seq += 1;
      this.setData({ loading: false, loadError: '加载超时，请重试' });
    }, 8000);
    try {
      const res = await Promise.all([getDashboard(), getTodayMenu(), getFamilyProfile().catch(() => null)]);
      if (this._seq !== seq) return;
      const menu = res[1] && Array.isArray(res[1].items) ? res[1].items : [];
      const items = menu.map((it) => ({
        id: it.id,
        recipeId: it.recipeId,
        mealType: it.mealType,
        dishImg: recipeDishImg(it.recipe || { id: it.recipeId }),
        seed: String(it.recipeId || it.id || '')
      }));
      this._sorted = collectRecipes(res[0]);
      const meals = SLOTS.map((s) => {
        const list = filterBySlot(items, s.key);
        return {
          key: s.key,
          label: mealTypeLabels[s.key] || s.label,
          count: list.length,
          img: list.length ? list[0].dishImg : '',
          seed: list.length ? list[0].seed : ''
        };
      });
      this.setData({
        loading: false,
        loaded: true,
        familyName: (res[2] && res[2].familyName) || '我的家',
        banners: this._sorted.slice(0, BANNER_SIZE),
        meals,
        tabs: buildTabs(this._sorted),
        total: this._sorted.length
      });
      this.applyFeed();
    } catch (err) {
      if (this._seq !== seq) return;
      console.error('preview home-d loadAll failed', err);
      this.setData({ loading: false, loadError: (err && err.message) || '加载失败，请重试' });
    } finally {
      if (this._seq === seq && this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
    }
  },

  // 双列瀑布：按累计高度往矮的一列放（小红书/下厨房同做法），两列底部大致齐平
  applyFeed() {
    const tab = this.data.currentTab;
    const list = (this._sorted || []).filter((r) => !tab || r.cuisine === tab).slice(0, FEED_SIZE);
    const colL = [];
    const colR = [];
    let hL = 0;
    let hR = 0;
    list.forEach((r) => {
      if (hL <= hR) { colL.push(r); hL += r.imgH + 120; } else { colR.push(r); hR += r.imgH + 120; }
    });
    this.setData({ colL, colR });
  },

  onTab(e) {
    const key = e.currentTarget.dataset.key || '';
    if (key === this.data.currentTab) return;
    this.setData({ currentTab: key });
    this.applyFeed();
  },

  onBannerChange(e) {
    this.setData({ bannerIdx: e.detail.current });
  },

  onRetry() { this.loadAll(); },
  onSearch() { this.preview('打开搜索'); },
  onMeal(e) {
    const ds = e.currentTarget.dataset;
    this.preview(ds.count ? `查看${ds.label}菜单` : `去挑${ds.label}`);
  },
  onRecipeTap(e) { this.preview(`打开「${e.currentTarget.dataset.title || '菜谱'}」`); },
  onAdd(e) { this.preview(`加入今日菜单「${e.currentTarget.dataset.title || ''}」`); },
  onSeeAll() { this.preview('打开菜谱库'); },

  onPicError(e) {
    const ds = e.currentTarget.dataset;
    if (!ds.path) return;
    this.setData({ [ds.path]: fallbackDishImg(ds.seed) });
  },

  preview(text) {
    wx.showToast({ title: '预览：' + text, icon: 'none' });
  }
});
