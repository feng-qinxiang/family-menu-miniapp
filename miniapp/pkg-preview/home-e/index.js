/**
 * 首页风格预览 · 方案 E「家庭点菜单」
 *
 * 定位：家里人点菜 → 做饭的人（多半是新手）照着做。
 * 结构借点餐小程序（麦当劳/喜茶：餐次切换 + 已点清单 + 底部结算条），「结算」换成「开始做菜」。
 * 预览页的「点它」只改本地视图（点单立刻进清单、角标和底栏跟着变），不写接口。
 */
const { getCapsule } = require('../../utils/capsule');
const { getDashboard, getTodayMenu, getFamilyProfile, getCurrentUser } = require('../../utils/api');
const { SLOTS } = require('../../utils/constants');
const features = require('../../utils/features');
const { recipeDishImg, fallbackDishImg } = require('../../utils/image');
const { filterBySlot } = require('../../utils/dish-logic');

const EASY_MAX_MIN = 20;
const EASY_SIZE = 8;
const OFTEN_SIZE = 4;
const TONES = 4;
const STATUS = {
  todo: { text: '待做', cls: 'is-todo' },
  cooking: { text: '在做', cls: 'is-cooking' },
  done: { text: '做好了', cls: 'is-done' }
};
const MEAL = {
  breakfast: { ask: '早饭吃什么', label: '早饭' },
  lunch: { ask: '午饭吃什么', label: '午饭' },
  dinner: { ask: '晚饭吃什么', label: '晚饭' }
};
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

// ponytail: RecipeCard 没带 difficulty 字段，预览先按用时估难度；正式铺开时让接口带上 recipe.difficulty
function levelOf(min) {
  const m = Number(min) || 0;
  if (!m) return '';
  if (m <= EASY_MAX_MIN) return '简单';
  if (m <= 45) return '中等';
  return '费点功夫';
}

function defaultSlot(h) {
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  return 'dinner';
}

// 同一个人永远同一个颜色：先按家庭成员顺序，查不到再按名字哈希
function toneOf(name, toneMap) {
  if (!name) return 'tone-x';
  if (toneMap[name]) return toneMap[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return 'tone-' + (h % TONES);
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
      timeCost: Number(r.timeCost) || 0,
      level: levelOf(r.timeCost),
      cookCount: Number(r.cookCount) || 0,
      dishImg: recipeDishImg(r)
    });
  });
  return list;
}

// 与 pages/menu 的 buildCookOrder 同口径：≥2 道待做才给建议，按耗时倒排（先开工慢的）
function cookSteps(orders) {
  const pending = orders.filter((o) => !o.done && o.timeCost > 0);
  if (pending.length < 2) return [];
  return pending.slice().sort((a, b) => b.timeCost - a.timeCost).map((o) => ({ key: o.key, title: o.title, min: o.timeCost }));
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
    members: [],
    slots: [],
    currentSlot: 'dinner',
    ask: '晚饭吃什么',
    mealLabel: '晚饭',
    orders: [],
    steps: [],
    totalMin: 0,
    doneCount: 0,
    easy: [],
    often: []
  },

  onLoad() {
    const now = new Date();
    const capsule = getCapsule();
    const slot = defaultSlot(now.getHours());
    this.setData({
      capsuleTop: capsule.top,
      capsuleRight: capsule.right,
      dateText: `${now.getMonth() + 1}月${now.getDate()}日 周${WEEK[now.getDay()]}`,
      currentSlot: slot
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

  onShareAppMessage() {
    return { title: `${MEAL[this.data.currentSlot].ask}？来点一道`, path: '/pages/home/index' };
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
      const res = await Promise.all([
        getDashboard(),
        getTodayMenu(),
        getFamilyProfile().catch(() => null),
        getCurrentUser().catch(() => null)
      ]);
      if (this._seq !== seq) return;
      const family = res[2] || {};
      this._me = (res[3] && res[3].nickname) || '我';
      this._toneMap = {};
      const members = (family.members || []).slice(0, 5).map((m, i) => {
        const name = m.nickname || '家人';
        this._toneMap[name] = 'tone-' + (i % TONES);
        return { key: String(m.userId || i), initial: name.slice(0, 1), tone: this._toneMap[name] };
      });
      this._menu = (res[1] && Array.isArray(res[1].items) ? res[1].items : []).map((it) => {
        const r = it.recipe || { id: it.recipeId };
        return this.toOrder({
          key: String(it.itemId || it.recipeId),
          recipeId: it.recipeId,
          mealType: it.mealType,
          title: r.title || '菜',
          who: it.addedByName || '',
          timeCost: Number(r.timeCost) || 0,
          status: it.status,
          dishImg: recipeDishImg(r)
        });
      });
      const recipes = collectRecipes(res[0]);
      this._easy = recipes
        .filter((r) => r.timeCost && r.timeCost <= EASY_MAX_MIN)
        .sort((a, b) => a.timeCost - b.timeCost)
        .slice(0, EASY_SIZE);
      this.setData({
        loading: false,
        loaded: true,
        familyName: family.familyName || '我的家',
        members,
        often: recipes.filter((r) => r.cookCount > 0).sort((a, b) => b.cookCount - a.cookCount).slice(0, OFTEN_SIZE)
      });
      this.applySlot();
    } catch (err) {
      if (this._seq !== seq) return;
      console.error('preview home-e loadAll failed', err);
      this.setData({ loading: false, loadError: (err && err.message) || '加载失败，请重试' });
    } finally {
      if (this._seq === seq && this._watchdog) { clearTimeout(this._watchdog); this._watchdog = null; }
    }
  },

  toOrder(o) {
    const st = STATUS[o.status] || STATUS.todo;
    return Object.assign({}, o, {
      initial: (o.who || '?').slice(0, 1),
      tone: toneOf(o.who, this._toneMap || {}),
      level: levelOf(o.timeCost),
      statusText: st.text,
      statusCls: st.cls,
      done: o.status === 'done'
    });
  },

  applySlot() {
    const menu = this._menu || [];
    const slot = this.data.currentSlot;
    const orders = filterBySlot(menu, slot);
    const picked = {};
    orders.forEach((o) => { picked[String(o.recipeId)] = true; });
    this.setData({
      ask: MEAL[slot].ask,
      mealLabel: MEAL[slot].label,
      slots: SLOTS.map((s) => ({ key: s.key, label: MEAL[s.key].label, count: filterBySlot(menu, s.key).length })),
      orders,
      steps: cookSteps(orders),
      // 几道菜能交叉着做：取最长那道 + 每多一道 5 分钟，比直接相加贴近真实
      totalMin: orders.length ? Math.max.apply(null, orders.map((o) => o.timeCost)) + (orders.length - 1) * 5 : 0,
      doneCount: orders.filter((o) => o.done).length,
      easy: (this._easy || []).map((r) => Object.assign({}, r, { picked: !!picked[String(r.id)] }))
    });
  },

  selectSlot(e) {
    const slot = e.currentTarget.dataset.slot;
    if (!slot || slot === this.data.currentSlot) return;
    this.setData({ currentSlot: slot });
    this.applySlot();
  },

  // 预览：点/取消只动本地清单，让人直接感受「点完立刻出现在单子上」
  onPick(e) {
    const ds = e.currentTarget.dataset;
    const slot = this.data.currentSlot;
    const id = String(ds.id);
    const menu = this._menu || [];
    const idx = menu.findIndex((o) => o.mealType === slot && String(o.recipeId) === id);
    if (idx >= 0) {
      menu.splice(idx, 1);
    } else {
      const r = (this._easy || []).concat(this.data.often).find((x) => String(x.id) === id);
      if (!r) return;
      menu.push(this.toOrder({
        key: 'local-' + id + '-' + slot,
        recipeId: r.id,
        mealType: slot,
        title: r.title,
        who: this._me,
        timeCost: r.timeCost,
        status: 'todo',
        dishImg: r.dishImg
      }));
      wx.vibrateShort && wx.vibrateShort({ type: 'light' });
    }
    this._menu = menu;
    this.applySlot();
  },

  onRetry() { this.loadAll(); },
  onInvite() { this.preview('邀请家人一起点菜'); },
  onOrderMore() { this.preview('去菜谱库点菜'); },
  onOrderTap(e) { this.preview(`打开「${e.currentTarget.dataset.title}」做法`); },
  onRecipeTap(e) { this.preview(`打开「${e.currentTarget.dataset.title}」`); },
  onStartCook() { this.preview(this.data.orders.length ? '进入跟做：一步一步来' : '去菜谱库点菜'); },

  onPicError(e) {
    const ds = e.currentTarget.dataset;
    if (ds.path) this.setData({ [ds.path]: fallbackDishImg(ds.seed) });
  },

  preview(text) {
    wx.showToast({ title: '预览：' + text, icon: 'none' });
  }
});
