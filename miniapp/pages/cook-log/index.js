const { getCookHistory } = require('../../utils/api');

// 本地菜图兜底（稳定 hash 映射，与 recipe-card 一致）
const FALLBACK_DISHES = [
  'beef-broccoli', 'chicken-congee', 'egg-drop-soup', 'fried-rice',
  'hongshao-pork', 'hot-sour-soup', 'kungpao-chicken', 'lo-mein',
  'long-beans', 'mapo-tofu', 'orange-chicken', 'shrimp-peas',
  'sichuan-eggplant', 'sweet-sour-chicken', 'tomato-egg', 'wontons'
];

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const TONES = ['tone-a', 'tone-b', 'tone-c', 'tone-d', 'tone-e'];

function pickCover(item) {
  if (item && item.coverImage) return item.coverImage;
  const seed = String((item && (item.recipeId || item.recipeTitle)) || '');
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return '/assets/dishes/' + FALLBACK_DISHES[sum % FALLBACK_DISHES.length] + '.jpg';
}

// 解析 cookedAt（YYYY-MM-DD 或带时间）为 Date，失败回退当天
function parseDate(value) {
  if (!value) return new Date();
  const d = new Date(String(value).replace(/-/g, '/'));
  return isNaN(d.getTime()) ? new Date() : d;
}

// 餐段：午 / 晚（按小时简单推断，无时间则按 score 奇偶兜底为晚/午）
function mealOf(date, idx) {
  const h = date.getHours();
  if (h === 0 && date.getMinutes() === 0) return idx % 2 === 0 ? '晚' : '午';
  return h < 15 ? '午' : '晚';
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

Page({
  data: {
    statusBarHeight: 0,
    loading: true,
    heroCover: '/assets/dishes/beef-broccoli.jpg',
    bigNum: 0,
    stats: { dishes: 0, fireDays: 0, praise: 0 },
    week: [],            // 本周打卡 7 态
    weekDoneText: '',
    cooks: [],           // chip 用厨师列表
    activeFilter: 'all', // all | 五星 | cook:xxx
    groups: [],          // 月份分组 [{ key, label, en, count, items: [] }]
    visibleGroups: [],   // 受 expanded 控制
    expanded: false,
    totalCount: 0,
    hiddenCount: 0,
    loadError: false
  },

  onLoad() {
    let sbh = 0;
    try {
      if (typeof wx.getWindowInfo === 'function') {
        sbh = wx.getWindowInfo().statusBarHeight || 0;
      } else if (typeof wx.getSystemInfoSync === 'function') {
        sbh = wx.getSystemInfoSync().statusBarHeight || 0;
      }
    } catch (e) { sbh = 0; }
    this.setData({ statusBarHeight: sbh });
    this.loadHistory();
  },

  loadHistory() {
    this.setData({ loading: true, loadError: false });
    getCookHistory()
      .then((list) => {
        const records = Array.isArray(list) ? list : [];
        this.buildView(records);
      })
      .catch(() => {
        // 加载失败进错误态，不伪装成"没有做菜记录"
        this.setData({ loading: false, loadError: true });
      });
  },

  // 把扁平 cookHistory 加工成视图模型
  buildView(records) {
    const enriched = records.map((r, i) => {
      const date = parseDate(r.cookedAt);
      const cookName = r.cookName || r.cookedBy || r.author || '家人';
      const score = Math.max(0, Math.min(5, Number(r.score) || 0));
      const stars = [];
      for (let s = 0; s < 5; s++) stars.push(s < score);
      return {
        id: r.id || ('cook-' + i),
        recipeId: r.recipeId,
        title: r.recipeTitle || r.title || '一道家常菜',
        cover: pickCover(r),
        score,
        stars,
        cookName,
        cookTone: TONES[i % TONES.length],
        cookInitial: String(cookName).charAt(0) || '家',
        remark: r.remark || '',
        dateMs: date.getTime(),
        dateLabel: pad2(date.getMonth() + 1) + '.' + pad2(date.getDate()) + ' ' + mealOf(date, i),
        ymKey: date.getFullYear() + '-' + pad2(date.getMonth() + 1),
        month: date.getMonth(),
        year: date.getFullYear(),
        dayKey: date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
      };
    });
    // 时间倒序
    enriched.sort((a, b) => b.dateMs - a.dateMs);
    this._all = enriched;

    // —— 成就统计（本月）——
    const now = new Date();
    const curKey = now.getFullYear() + '-' + pad2(now.getMonth() + 1);
    const monthItems = enriched.filter((e) => e.ymKey === curKey);
    const fireDaySet = {};
    monthItems.forEach((e) => { fireDaySet[e.dayKey] = true; });
    const praise = monthItems.filter((e) => e.score >= 4).length;

    // —— 本周打卡 7 态 ——
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = now.toDateString();
    const day = now.getDay(); // 0=日
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(todayStart);
    monday.setDate(todayStart.getDate() + mondayOffset);
    const doneSet = {};
    enriched.forEach((e) => { doneSet[e.dayKey] = true; });
    const week = [];
    let doneCount = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
      const isToday = d.toDateString() === todayStr;
      let state = '';
      if (doneSet[key]) { state = 'done'; doneCount++; }
      else if (isToday) state = 'today';
      else if (d.getTime() < todayStart.getTime()) state = 'miss';
      week.push({
        dw: WEEK_LABELS[d.getDay()],
        dd: d.getDate(),
        state,
        key
      });
    }

    // —— 厨师 chip 列表 ——
    const cookMap = {};
    enriched.forEach((e) => {
      if (!cookMap[e.cookName]) {
        cookMap[e.cookName] = { name: e.cookName, initial: e.cookInitial, tone: e.cookTone };
      }
    });
    const cooks = Object.keys(cookMap).map((k) => cookMap[k]).slice(0, 4);

    this.setData({
      loading: false,
      heroCover: enriched.length ? enriched[0].cover : '/assets/dishes/beef-broccoli.jpg',
      bigNum: monthItems.length,
      stats: {
        dishes: monthItems.length,
        fireDays: Object.keys(fireDaySet).length,
        praise
      },
      week,
      weekDoneText: doneCount + ' / 7 days',
      cooks,
      totalCount: enriched.length
    }, () => this.applyFilter());
  },

  // 应用 chip 筛选 + 月份分组
  applyFilter() {
    const all = this._all || [];
    const f = this.data.activeFilter;
    let list = all;
    if (f === 'star5') list = all.filter((e) => e.score >= 5);
    else if (f.indexOf('cook:') === 0) {
      const name = f.slice(5);
      list = all.filter((e) => e.cookName === name);
    }

    // 月份分组（保持倒序）
    const groupMap = {};
    const order = [];
    list.forEach((e) => {
      if (!groupMap[e.ymKey]) {
        groupMap[e.ymKey] = {
          key: e.ymKey,
          label: (e.month + 1) + '月',
          en: MONTH_EN[e.month],
          year: e.year,
          count: 0,
          items: []
        };
        order.push(e.ymKey);
      }
      groupMap[e.ymKey].items.push(e);
      groupMap[e.ymKey].count++;
    });
    const groups = order.map((k) => groupMap[k]);

    // 折叠：默认展示前 6 条所在范围；未展开时裁剪
    const expanded = this.data.expanded;
    let shown = 0;
    const LIMIT = 6;
    const visibleGroups = [];
    let hidden = 0;
    groups.forEach((g) => {
      if (expanded) {
        visibleGroups.push(g);
        return;
      }
      if (shown >= LIMIT) {
        hidden += g.items.length;
        return;
      }
      const room = LIMIT - shown;
      const take = g.items.slice(0, room);
      hidden += g.items.length - take.length;
      shown += take.length;
      visibleGroups.push(Object.assign({}, g, { items: take }));
    });

    this.setData({
      groups,
      visibleGroups,
      hiddenCount: expanded ? 0 : hidden
    });
  },

  onSelectFilter(e) {
    const value = e.currentTarget.dataset.value;
    if (value === this.data.activeFilter) return;
    this.setData({ activeFilter: value, expanded: false }, () => this.applyFilter());
  },

  onToggleExpand() {
    this.setData({ expanded: true }, () => this.applyFilter());
  },

  onCalTap(e) {
    const state = e.currentTarget.dataset.state;
    if (state === 'miss') {
      wx.navigateTo({
        url: '/pages/recipes/index',
        fail: () => wx.switchTab({ url: '/pages/recipes/index', fail() {} })
      });
    }
  },

  onCardTap(e) {
    const recipeId = e.currentTarget.dataset.recipeId;
    const title = e.currentTarget.dataset.title || '';
    if (recipeId || recipeId === 0) {
      wx.navigateTo({ url: `/pages/recipe-detail/index?id=${recipeId}` });
      return;
    }
    wx.navigateTo({
      url: `/pages/recipes/search/index?keyword=${encodeURIComponent(title)}`,
      fail: () => wx.showToast({ title: '已显示做菜记录', icon: 'none' })
    });
  }
});
