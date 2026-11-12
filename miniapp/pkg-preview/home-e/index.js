/**
 * 首页风格预览 · 方案 E「家庭点菜单」
 *
 * 定位：家里人点菜 → 做饭的人（多半是新手）照着做。
 * 结构借点餐小程序（麦当劳/喜茶：餐次切换 + 已点清单 + 小票存根），「结算」换成「开始做菜」。
 * 预览页的「点它」只改本地视图（点单立刻进清单、角标和存根跟着变），不写接口。
 */
const { getCapsule } = require('../../utils/capsule');
const { getDashboard, getTodayMenu, getFamilyProfile, getCurrentUser } = require('../../utils/api');
const { SLOTS } = require('../../utils/constants');
const features = require('../../utils/features');
const { recipeDishImg, fallbackDishImg } = require('../../utils/image');
const { filterBySlot } = require('../../utils/dish-logic');

const EASY_MAX_MIN = 20;
const SHELF_SIZE = 8;
const TONES = 5; // 家人五色，和「我的」页同一套
// ponytail: 菜谱没有「季节」字段，先按菜名/口味标签/简介里的时令关键词猜；正式铺开时让接口带 recipe.seasons
const SEASONS = [
  // 春天不放「鲜」：口味标签里的「鲜香」会把麻婆豆腐也算成春菜
  { months: [3, 4, 5], name: '春天', sub: '春笋韭菜，吃个鲜', words: ['笋', '韭', '荠', '香椿', '豌豆', '蚕豆', '菠菜', '春'] },
  { months: [6, 7, 8], name: '夏天', sub: '清淡爽口不上火', words: ['凉', '拌', '黄瓜', '苦瓜', '冬瓜', '绿豆', '清淡', '爽口', '清爽', '开胃'] },
  { months: [9, 10, 11], name: '秋天', sub: '天凉了，贴贴秋膘', words: ['南瓜', '藕', '山药', '栗', '蟹', '梨', '芋', '红薯', '银耳', '排骨', '汤', '炖', '红烧', '浓香'] },
  { months: [12, 1, 2], name: '冬天', sub: '暖身的炖菜热汤', words: ['萝卜', '白菜', '羊', '炖', '锅', '汤', '暖', '红烧'] }
];
const SHELF_ALL = { easy: '20 分钟内的菜', season: '当季菜', often: '做过的菜' };

function seasonOf(month) {
  return SEASONS.find((s) => s.months.indexOf(month) >= 0);
}

// 命中几个时令词就算几分，0 分不进；同分按评分高的先
function pickSeason(recipes, season, skip) {
  return recipes
    .filter((r) => !skip[r.id])
    .map((r) => {
      const text = r.title + ' ' + r.tags.join(' ') + ' ' + r.summary;
      return { r, score: season.words.filter((w) => text.indexOf(w) >= 0).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.r.rating - a.r.rating)
    .slice(0, SHELF_SIZE)
    .map((x) => x.r);
}
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
      tags: Array.isArray(r.tasteTags) ? r.tasteTags : [],
      summary: r.summary || '',
      rating: Number(r.rating) || 0,
      dishImg: recipeDishImg(r)
    });
  });
  return list;
}

// 与 pages/menu 的 buildCookOrder 同口径：≥2 道待做才排，按耗时倒排（先开工慢的）
// 顺序直接排进清单、序号标在菜图上，不再单独一块「建议顺序」把菜名重复列一遍
// 没填用时的排在有序号的后面，做好了的沉底
function sortForCook(orders) {
  const timed = orders.filter((o) => !o.done && o.timeCost > 0).sort((a, b) => b.timeCost - a.timeCost);
  // 用时全一样时排不出先后，硬标 1、2 再说「慢的先开火」反而误导
  if (timed.length < 2 || timed[0].timeCost === timed[timed.length - 1].timeCost) {
    return { list: orders.map((o) => Object.assign({}, o, { seq: 0 })), seqOn: false };
  }
  const rest = orders.filter((o) => !o.done && !(o.timeCost > 0)).concat(orders.filter((o) => o.done));
  const list = timed.map((o, i) => Object.assign({}, o, { seq: i + 1 }))
    .concat(rest.map((o) => Object.assign({}, o, { seq: 0 })));
  return { list, seqOn: true };
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
    headNote: '',
    // 先把三段排好，加载中餐次分段就在，数据回来只补角标，不跳
    slots: SLOTS.map((s) => ({ key: s.key, label: MEAL[s.key].label, count: 0 })),
    currentSlot: 'dinner',
    mealLabel: '晚饭',
    orders: [],
    seqOn: false,
    totalMin: 0,
    shelves: []
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
      this._members = (family.members || []).slice(0, 6).map((m, i) => {
        const name = m.nickname || '家人';
        this._toneMap[name] = 'tone-' + (i % TONES);
        return { key: String(m.userId || i), name, initial: name.slice(0, 1), tone: this._toneMap[name] };
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
      this._shelves = this.buildShelves(recipes, new Date().getMonth() + 1);
      this.setData({
        loading: false,
        loaded: true,
        familyName: family.familyName || '我的家'
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

  // 下面几排推荐共用一个横滑模板；哪排没菜就不出现
  buildShelves(recipes, month) {
    const meta = (r) => [r.timeCost ? r.timeCost + '分钟' : '', r.level].filter(Boolean).join(' · ');
    const easy = recipes
      .filter((r) => r.timeCost && r.timeCost <= EASY_MAX_MIN)
      .sort((a, b) => a.timeCost - b.timeCost)
      .slice(0, SHELF_SIZE);
    // 常做按真实做菜记录，没记录宁可不出，不拿评分冒充
    const often = recipes.filter((r) => r.cookCount > 0).sort((a, b) => b.cookCount - a.cookCount).slice(0, SHELF_SIZE);
    // 当季放最后当「换换口味」，只放前两排没出现过的菜
    const skip = {};
    easy.concat(often).forEach((r) => { skip[r.id] = true; });
    const season = seasonOf(month);
    return [
      { key: 'easy', title: '新手也能做', sub: '20 分钟内上桌', items: easy.map((r) => Object.assign({}, r, { meta: meta(r) })) },
      // 卡片窄：次数放前面、不加空格，实在挤不下截掉的是用时
      { key: 'often', title: '家里常做', sub: '按做过的次数', items: often.map((r) => Object.assign({}, r, { meta: [`做过${r.cookCount}次`, r.timeCost ? r.timeCost + '分钟' : ''].filter(Boolean).join(' · ') })) },
      { key: 'season', title: season.name + '吃这些', sub: season.sub, items: pickSeason(recipes, season, skip).map((r) => Object.assign({}, r, { meta: meta(r) })) }
    ].filter((s) => s.items.length);
  },

  toOrder(o) {
    const st = STATUS[o.status] || STATUS.todo;
    const mine = !!o.who && o.who === this._me;
    const whoText = o.who ? (mine ? '我点的' : o.who + '点的') : '';
    const level = levelOf(o.timeCost);
    return Object.assign({}, o, {
      whoText,
      level,
      // 一行写完，用「·」隔开，和推荐卡片的写法一致
      // 左边写「谁点的 · 难度」，用时单独放到右边一栏，和序号一起看出先后
      metaText: [whoText, level].filter(Boolean).join(' · '),
      timeText: o.timeCost ? String(o.timeCost) : '',
      statusText: st.text,
      statusCls: st.cls,
      // 刚点的都是「待做」，每行一个灰标签只是噪音；只在「在做 / 做好了」时才标
      showStatus: st !== STATUS.todo,
      done: o.status === 'done'
    });
  },

  applySlot() {
    const menu = this._menu || [];
    const slot = this.data.currentSlot;
    const orders = filterBySlot(menu, slot);
    const picked = {};
    const whoSet = {};
    orders.forEach((o) => {
      picked[String(o.recipeId)] = true;
      if (o.who) whoSet[o.who] = true;
    });
    // 家人进度：谁已经点了这顿（头像亮 + 勾），还差几个人
    // 自己的头像和单子里一样显示「我」，不然同一个人两处写法不一致
    const members = (this._members || []).map((m) => Object.assign({}, m, {
      initial: m.name === this._me ? '我' : m.initial,
      ordered: !!whoSet[m.name]
    }));
    const waiting = members.filter((m) => !m.ordered).length;
    const solo = members.length < 2;
    // 几道菜能交叉着做：取最长那道 + 每多一道 5 分钟，比直接相加贴近真实
    // 做好了的不算；一道都没填用时就不报（存根改写「共几道」），不然会出「约 0 分钟」「约 5 分钟」
    const todo = orders.filter((o) => !o.done);
    const longest = todo.length ? Math.max.apply(null, todo.map((o) => o.timeCost)) : 0;
    const totalMin = longest ? longest + (todo.length - 1) * 5 : 0;
    // 标题下一行只说家人进度；道数和时间挪到底部存根，和「开始做菜」挨着
    const headNote = solo ? '家里就你一个，点 + 拉家人进来' : (waiting ? `还差 ${waiting} 人没点` : '全家都点好了');
    const cook = sortForCook(orders);
    this.setData({
      members,
      headNote,
      mealLabel: MEAL[slot].label,
      slots: SLOTS.map((s) => ({ key: s.key, label: MEAL[s.key].label, count: filterBySlot(menu, s.key).length })),
      orders: cook.list,
      seqOn: cook.seqOn,
      totalMin,
      shelves: (this._shelves || []).map((s) => Object.assign({}, s, {
        items: s.items.map((r) => Object.assign({}, r, { picked: !!picked[String(r.id)] }))
      }))
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
      const all = [].concat.apply([], (this._shelves || []).map((s) => s.items));
      const r = all.find((x) => String(x.id) === id);
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
  onShelfAll(e) { this.preview('去菜谱库：' + SHELF_ALL[e.currentTarget.dataset.key]); },
  onStartCook() { this.preview(this.data.orders.length ? '进入跟做：一步一步来' : '去菜谱库点菜'); },

  onPicError(e) {
    const ds = e.currentTarget.dataset;
    if (ds.path) this.setData({ [ds.path]: fallbackDishImg(ds.seed) });
  },

  preview(text) {
    wx.showToast({ title: '预览：' + text, icon: 'none' });
  }
});
