/**
 * 风格预览 B「餐桌仪表盘」——只读预览页，点击一律 toast，不做真实写操作。
 * 数据走真实接口（对照 pages/home/index.js 的调用方式，只读不改它）。
 * 每个接口各自兜底：某一块失败只让那块显示「—」，全部失败才出整页失败态。
 */
const { getCapsule } = require('../../utils/capsule');
const {
  getDashboard,
  getRecipes,
  getTodayMenu,
  getWishes,
  getShoppingList,
  getPantryMatch,
  getCookHistory
} = require('../../utils/api');
const { SLOTS, mealTypeLabels } = require('../../utils/constants');
const { recipeDishImg, fallbackDishImg } = require('../../utils/image');
const { filterBySlot, todayDateKey } = require('../../utils/dish-logic');
const features = require('../../utils/features');

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const STRIP_MAX = 5;     // 餐桌缩略图横排最多 5 格（702 宽卡里 104rpx 一格的上限）
const REC_PAGE = 6;      // 推荐列表一批 6 条

/** 把 promise 变成 { ok, value }：一个接口挂了不连坐其它块 */
function settle(p) {
  return Promise.resolve(p).then(
    (value) => ({ ok: true, value }),
    (err) => ({ ok: false, err })
  );
}

function slotByClock() {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 14) return 'lunch';
  return 'dinner';
}

function greetingText() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function dateText(d) {
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}`;
}

/** 本周一 00:00（周一为一周起点） */
function weekStart(now) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function parseTime(v) {
  if (!v) return NaN;
  return new Date(String(v).replace(/-/g, '/').replace('T', ' ').replace(/\.\d+.*$/, '')).getTime();
}

// 与首页同口径的稳定排序：库存匹配率 > 评分 > id（首页的 compareRecipes 没导出，这里照抄一份）
function compareRecipes(a, b) {
  const mr = (b.matchPct || 0) - (a.matchPct || 0);
  if (mr !== 0) return mr;
  const ra = Number(a.rating) || 0;
  const rb = Number(b.rating) || 0;
  if (rb !== ra) return rb - ra;
  return (Number(b.id) || 0) - (Number(a.id) || 0);
}

Page({
  data: {
    fontScale: 'normal',
    capsuleTop: 'calc(env(safe-area-inset-top) + 90rpx)',
    capsuleRight: '96px',
    greeting: '你好',
    dateLabel: '',

    loading: true,
    allFailed: false,

    slots: SLOTS,
    currentSlot: 'dinner',
    slotLabel: '晚餐',
    slotCounts: {},

    // 今日餐桌
    menuFailed: false,
    strip: [],
    stripMore: 0,
    stripPad: [],
    tableCount: 0,
    tableMinutes: '',
    tableMissing: '',
    tableMissingWarn: false,
    tableState: '',
    tableTone: '',
    primaryLabel: '',

    // bento
    wishFailed: false,
    wishCount: 0,
    wishSub: '',
    shopFailed: false,
    shopPending: 0,
    shopSub: '',
    pantryFailed: false,
    canCook: 0,
    pantrySub: '',
    cookFailed: false,
    weekCooked: 0,
    cookSub: '',

    // 推荐
    recFailed: false,
    recs: []
  },

  onLoad() {
    const capsule = getCapsule();
    const now = new Date();
    const slot = slotByClock();
    this.setData({
      capsuleTop: capsule.top,
      capsuleRight: capsule.right,
      greeting: greetingText(),
      dateLabel: dateText(now),
      currentSlot: slot,
      slotLabel: mealTypeLabels[slot] || '晚餐'
    });
    this._recOffset = 0;
    this.loadAll();
  },

  onShow() {
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
  },

  onPullDownRefresh() {
    this.loadAll().then(() => wx.stopPullDownRefresh());
  },

  loadAll() {
    const seq = (this._seq = (this._seq || 0) + 1);
    // 骨架只在首屏/失败重试时出现；下拉刷新保留现有内容，不闪成骨架
    if (!this._loadedOnce || this.data.allFailed) this.setData({ loading: true, allFailed: false });
    const slot = this.data.currentSlot;
    return Promise.all([
      settle(getTodayMenu()),
      settle(getWishes(todayDateKey(), slot)),
      settle(getShoppingList()),
      settle(getPantryMatch()),
      settle(getCookHistory()),
      // 推荐：dashboard 优先（首页同源），挂了退到 /api/recipes?source=all
      settle(getDashboard()).then((r) => (r.ok && r.value ? r : settle(getRecipes('all'))))
    ]).then((res) => {
      if (this._seq !== seq) return;
      const menuR = res[0], wishR = res[1], shopR = res[2], matchR = res[3], cookR = res[4], recR = res[5];
      this._menuOk = menuR.ok;
      this._menu = menuR.ok && menuR.value && Array.isArray(menuR.value.items) ? menuR.value.items : [];
      this._matchOk = matchR.ok;
      this._matchMap = {};
      (matchR.ok && Array.isArray(matchR.value) ? matchR.value : []).forEach((m) => {
        const id = m && m.recipe && m.recipe.id;
        if (id != null) this._matchMap[String(id)] = m;
      });
      this._recipes = recR.ok ? this.collectRecipes(recR.value) : [];
      this._recOk = recR.ok;

      const allFailed = [menuR, wishR, shopR, matchR, cookR, recR].every((r) => !r.ok);
      this._loadedOnce = !allFailed;
      this.setData(Object.assign(
        { loading: false, allFailed },
        this.wishView(wishR),
        this.shopView(shopR),
        this.pantryView(matchR),
        this.cookView(cookR)
      ));
      this.refreshTable();
      this.refreshRecs();
    });
  },

  // ============ 今日餐桌（随餐次联动，本地重算，不重新拉接口）============
  refreshTable() {
    const slot = this.data.currentSlot;
    if (!this._menuOk) {
      this.setData({
        menuFailed: true, strip: [], stripMore: 0, stripPad: [0, 1, 2], tableCount: 0,
        tableMinutes: '', tableMissing: '', tableMissingWarn: false,
        tableState: '—', tableTone: 'idle', primaryLabel: '重新加载',
        slotCounts: {}
      });
      return;
    }
    const counts = {};
    SLOTS.forEach((s) => { counts[s.key] = filterBySlot(this._menu, s.key).length; });
    const items = filterBySlot(this._menu, slot).map((it) => {
      const recipe = it.recipe || { id: it.recipeId };
      return {
        id: it.itemId || it.recipeId,
        recipeId: it.recipeId,
        title: recipe.title || '未命名',
        img: recipeDishImg(recipe),
        status: it.status || 'todo',
        timeCost: Number(recipe.timeCost) || 0
      };
    });
    const minutes = items.reduce((s, it) => s + it.timeCost, 0);
    const done = items.filter((it) => it.status === 'done').length;
    const cooking = items.some((it) => it.status === 'cooking');

    // 缺几样：本餐每道菜在冰箱匹配里的 missingIngredients 并集
    let missing = '';
    if (!items.length) missing = '';
    else if (!this._matchOk) missing = '缺料 —';
    else {
      const set = {};
      let known = 0;
      items.forEach((it) => {
        const m = this._matchMap[String(it.recipeId)];
        if (!m) return;
        known += 1;
        (m.missingIngredients || []).forEach((n) => { set[n] = true; });
      });
      const n = Object.keys(set).length;
      missing = known ? (n ? `缺 ${n} 样食材` : '食材齐') : '冰箱未登记';
    }

    let state = '未点菜', tone = 'idle', primary = '去点菜';
    if (items.length) {
      if (done === items.length) { state = '已上齐'; tone = 'ok'; primary = '回看这一餐'; }
      else if (cooking) { state = '烧着呢'; tone = 'hot'; primary = '继续做'; }
      else { state = `待开做 ${items.length - done}`; tone = 'todo'; primary = `开做 ${items.length - done} 道`; }
    }
    // 横排固定一行 5 格：超过 5 道显示 4 张 + 「+N」；不足 5 道补一格「+」；一道没有给 3 个占位格
    const over = items.length > STRIP_MAX;
    const shown = over ? items.slice(0, STRIP_MAX - 1) : items;
    const padN = over ? 0 : (items.length ? Math.min(1, STRIP_MAX - items.length) : 3);
    this.setData({
      menuFailed: false,
      slotCounts: counts,
      strip: shown,
      stripMore: over ? items.length - shown.length : 0,
      stripPad: Array.from({ length: padN }, (_, i) => i),
      tableCount: items.length,
      tableMinutes: minutes ? `约 ${minutes} 分钟` : (items.length ? '耗时未知' : ''),
      tableMissing: missing,
      tableMissingWarn: missing.indexOf('缺 ') === 0,
      tableState: state,
      tableTone: tone,
      primaryLabel: primary
    });
  },

  // ============ bento 四块 ============
  wishView(r) {
    if (!r.ok) return { wishFailed: true, wishCount: 0, wishSub: '许愿没加载出来' };
    const list = Array.isArray(r.value) ? r.value : [];
    const last = list[list.length - 1];
    return {
      wishFailed: false,
      wishCount: list.length,
      wishSub: last ? `${last.by || '家人'}：${last.text || ''}` : '还没人许愿'
    };
  },

  shopView(r) {
    if (!r.ok) return { shopFailed: true, shopPending: 0, shopSub: '清单没加载出来' };
    const items = r.value && Array.isArray(r.value.items) ? r.value.items : [];
    const pending = items.filter((i) => !i.purchased);
    const sub = !items.length ? '清单是空的'
      : !pending.length ? '都买齐了'
        : pending.slice(0, 3).map((i) => i.ingredientName).filter(Boolean).join('、');
    return { shopFailed: false, shopPending: pending.length, shopSub: sub };
  },

  pantryView(r) {
    if (!r.ok) return { pantryFailed: true, canCook: 0, pantrySub: '冰箱没加载出来' };
    const list = Array.isArray(r.value) ? r.value : [];
    const full = list.filter((m) => {
      const total = Number(m && m.totalCount) || 0;
      return total > 0 && (Number(m.matchedCount) || 0) >= total;
    });
    const sub = !list.length ? '冰箱还没登记食材'
      : full.length ? `比如 ${(full[0].recipe && full[0].recipe.title) || '一道菜'}`
        : '都还差一点配料';
    return { pantryFailed: false, canCook: full.length, pantrySub: sub };
  },

  cookView(r) {
    if (!r.ok) return { cookFailed: true, weekCooked: 0, cookSub: '记录没加载出来' };
    const list = Array.isArray(r.value) ? r.value : [];
    const from = weekStart(new Date());
    const week = list.filter((x) => parseTime(x && x.cookedAt) >= from);
    const latest = week.slice().sort((a, b) => parseTime(b.cookedAt) - parseTime(a.cookedAt))[0];
    return {
      cookFailed: false,
      weekCooked: week.length,
      cookSub: latest ? `最近：${latest.recipeTitle || '一道菜'}` : '本周还没开火'
    };
  },

  // ============ 推荐列表 ============
  collectRecipes(payload) {
    let raw = [];
    if (Array.isArray(payload)) raw = payload;
    else if (payload) {
      raw = [].concat(payload.ownedRecipes || [])
        .concat(features.COMMUNITY ? (payload.communityRecipes || []) : [])
        .concat(payload.importedRecipes || []);
    }
    const seen = {};
    const out = [];
    raw.forEach((r) => {
      if (!r || r.id == null || seen[r.id]) return;
      seen[r.id] = true;
      out.push(r);
    });
    return out;
  },

  refreshRecs() {
    if (!this._recOk) { this.setData({ recFailed: true, recs: [] }); return; }
    const inMenu = {};
    (this._menu || []).forEach((it) => { inMenu[String(it.recipeId)] = true; });
    const list = this._recipes.map((r) => {
      const m = this._matchMap[String(r.id)];
      const matchPct = m ? Math.round((m.matchRate || 0) * 100) : 0;
      const meta = [r.cuisine || '家常', r.timeCost ? `${r.timeCost} 分钟` : '', matchPct ? `食材 ${matchPct}%` : '']
        .filter(Boolean).join(' · ');
      return {
        id: r.id,
        title: r.title || '未命名',
        rating: r.rating,
        img: recipeDishImg(r),
        meta,
        matchPct,
        added: !!inMenu[String(r.id)]
      };
    }).sort(compareRecipes);
    const total = list.length;
    const off = total ? (this._recOffset % total) : 0;
    const rotated = list.slice(off).concat(list.slice(0, off));
    this.setData({ recFailed: false, recs: rotated.slice(0, REC_PAGE) });
  },

  // ============ 交互（预览：只 toast）============
  selectSlot(e) {
    const slot = e.currentTarget.dataset.slot;
    if (!slot || slot === this.data.currentSlot) return;
    this.setData({ currentSlot: slot, slotLabel: mealTypeLabels[slot] || '晚餐' });
    this.refreshTable();
    // 许愿按 (日期, 餐次) 分槽，换餐次只重拉这一块
    const seq = (this._wishSeq = (this._wishSeq || 0) + 1);
    settle(getWishes(todayDateKey(), slot)).then((r) => {
      if (this._wishSeq === seq) this.setData(this.wishView(r));
    });
  },

  shuffleRecs() {
    this._recOffset = (this._recOffset || 0) + REC_PAGE;
    this.refreshRecs();
  },

  retry() {
    this.loadAll();
  },

  onPrimary() {
    if (this.data.menuFailed) { this.loadAll(); return; }
    this.toast(this.data.primaryLabel);
  },

  onTap(e) {
    this.toast(e.currentTarget.dataset.label || '');
  },

  toast(label) {
    wx.showToast({ title: `预览：${label}`, icon: 'none' });
  },

  onStripImgError(e) {
    const i = e.currentTarget.dataset.index;
    const it = this.data.strip[i];
    if (it) this.setData({ [`strip[${i}].img`]: fallbackDishImg(it.recipeId || it.title) });
  },

  onRecImgError(e) {
    const i = e.currentTarget.dataset.index;
    const it = this.data.recs[i];
    if (it) this.setData({ [`recs[${i}].img`]: fallbackDishImg(it.id || it.title) });
  }
});
