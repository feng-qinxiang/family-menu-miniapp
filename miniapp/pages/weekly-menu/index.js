const { generateWeeklyMenu, getWeeklyMenu } = require('../../utils/api');

const LOCAL_DISHES = [
  'beef-broccoli', 'chicken-congee', 'egg-drop-soup', 'fried-rice',
  'hongshao-pork', 'hot-sour-soup', 'kungpao-chicken', 'lo-mein',
  'long-beans', 'mapo-tofu', 'orange-chicken', 'shrimp-peas',
  'sichuan-eggplant', 'sweet-sour-chicken', 'tomato-egg', 'wontons'
];
const TITLE_DISH_MAP = [
  { kw: ['红烧肉', '红烧'], img: 'hongshao-pork' },
  { kw: ['番茄', '西红柿', '炒蛋'], img: 'tomato-egg' },
  { kw: ['宫保', '鸡丁'], img: 'kungpao-chicken' },
  { kw: ['麻婆', '豆腐'], img: 'mapo-tofu' },
  { kw: ['空心菜', '豆角', '青菜', '蒜蓉'], img: 'long-beans' },
  { kw: ['酸辣'], img: 'hot-sour-soup' },
  { kw: ['蛋花', '紫菜蛋'], img: 'egg-drop-soup' },
  { kw: ['炒饭'], img: 'fried-rice' },
  { kw: ['面', '捞面'], img: 'lo-mein' },
  { kw: ['牛肉', '西兰花'], img: 'beef-broccoli' },
  { kw: ['茄子'], img: 'sichuan-eggplant' },
  { kw: ['虾', '豌豆'], img: 'shrimp-peas' },
  { kw: ['粥'], img: 'chicken-congee' },
  { kw: ['咕咾', '糖醋', '里脊'], img: 'sweet-sour-chicken' },
  { kw: ['馄饨', '云吞'], img: 'wontons' },
  { kw: ['橙', '橘'], img: 'orange-chicken' }
];
const WK_SHORT = ['日', '一', '二', '三', '四', '五', '六'];
const WK_FULL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function hashIndex(seed, mod) {
  const s = (seed || '').toString();
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) % 1000000;
  }
  return Math.abs(h) % mod;
}

function dishImageFor(recipe) {
  if (recipe && recipe.coverImage) return recipe.coverImage;
  const title = String((recipe && recipe.title) || '');
  for (const m of TITLE_DISH_MAP) {
    if (m.kw.some((k) => title.indexOf(k) >= 0)) return `/assets/dishes/${m.img}.jpg`;
  }
  return `/assets/dishes/${LOCAL_DISHES[hashIndex(title, LOCAL_DISHES.length)]}.jpg`;
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(String(str).replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

function mdLabel(d) {
  return d ? `${d.getMonth() + 1}月${d.getDate()}日` : '';
}

Page({
  data: {
    statusBarHeight: 0,
    weeklyMenu: { weekStart: '', weekEnd: '', days: [] },
    weekbar: [],
    rangeText: '',
    heroSub: '',
    heroImage: '/assets/dishes/fried-rice.jpg',
    menuSummary: {
      dayCount: 0,
      recipeCount: 0,
      blankCount: 0
    },
    activeIndex: -1,
    loading: true,
    loadError: false
  },

  onLoad() {
    try {
      const info = (wx.getWindowInfo && wx.getWindowInfo()) || (wx.getSystemInfoSync && wx.getSystemInfoSync());
      this.setData({ statusBarHeight: (info && info.statusBarHeight) || 0 });
    } catch (e) {
      this.setData({ statusBarHeight: 0 });
    }
    this.loadData();
  },

  onShow() {
    if (!this.data.loading) this.loadData();
  },

  async loadData() {
    this.setData({ loadError: false });
    try {
      const weeklyMenu = this.normalizeWeeklyMenu(await getWeeklyMenu());
      this.applyMenu(weeklyMenu);
    } catch (e) {
      this.setData({ loading: false, loadError: true });
    }
  },

  retryLoad() {
    this.setData({ loading: true, loadError: false });
    this.loadData();
  },

  async regenerate() {
    if (this._regenerating) return;
    this._regenerating = true;
    wx.showLoading({ title: '排菜中', mask: true });
    try {
      const weeklyMenu = this.normalizeWeeklyMenu(await generateWeeklyMenu());
      this.applyMenu(weeklyMenu);
      wx.hideLoading();
      wx.showToast({ title: '已排好一版', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '排菜失败', icon: 'none' });
    } finally {
      this._regenerating = false;
    }
  },

  applyMenu(weeklyMenu) {
    const summary = this.buildMenuSummary(weeklyMenu);
    const todayIdx = weeklyMenu.days.findIndex((d) => d.isToday);
    this.setData({
      weeklyMenu,
      menuSummary: summary,
      weekbar: this.buildWeekbar(weeklyMenu),
      rangeText: summary.rangeText,
      heroSub: this.buildHeroSub(weeklyMenu, summary),
      activeIndex: todayIdx >= 0 ? todayIdx : -1,
      loading: false
    });
  },

  normalizeWeeklyMenu(weeklyMenu) {
    const days = Array.isArray(weeklyMenu && weeklyMenu.days) ? weeklyMenu.days : [];
    const todayStr = new Date().toISOString().slice(0, 10);
    return {
      weekStart: (weeklyMenu && weeklyMenu.weekStart) || '',
      weekEnd: (weeklyMenu && weeklyMenu.weekEnd) || '',
      days: days.map((day) => this.normalizeDay(day, todayStr))
    };
  },

  normalizeDay(day, todayStr) {
    const recipes = Array.isArray(day.recipes) ? day.recipes.map((r) => ({ ...r })) : [];
    const lunch = recipes[0] || null;
    const dinner = recipes[1] || null;
    const d = parseDate(day.date);
    const wkIndex = d ? d.getDay() : -1;
    const wkLabel = wkIndex >= 0 ? WK_FULL[wkIndex] : (day.dayLabel || '');
    const isToday = day.date === todayStr || day.dayLabel === '今天';
    return {
      ...day,
      recipes,
      recipeCount: recipes.length,
      wkLabel,
      dateLabel: mdLabel(d),
      isToday,
      lunch: lunch ? { ...lunch, image: dishImageFor(lunch) } : null,
      dinner: dinner ? { ...dinner, image: dishImageFor(dinner) } : null
    };
  },

  buildWeekbar(weeklyMenu) {
    return weeklyMenu.days.map((day, index) => {
      const d = parseDate(day.date);
      const wkIndex = d ? d.getDay() : index;
      return {
        index,
        short: WK_SHORT[wkIndex] || String(index + 1),
        filled: day.recipeCount > 0,
        isToday: day.isToday
      };
    });
  },

  buildMenuSummary(weeklyMenu) {
    const days = weeklyMenu.days || [];
    const recipeCount = days.reduce((t, d) => t + (d.recipeCount || 0), 0);
    const blankCount = days.reduce((t, d) => t + (d.lunch ? 0 : 1) + (d.dinner ? 0 : 1), 0);
    const start = parseDate(weeklyMenu.weekStart);
    const end = parseDate(weeklyMenu.weekEnd);
    const rangeText = start && end ? `${mdLabel(start)} — ${mdLabel(end)}` : '还没排本周';
    return { dayCount: days.length, recipeCount, blankCount, rangeText };
  },

  buildHeroSub(weeklyMenu, summary) {
    const fullDays = weeklyMenu.days.filter((d) => d.lunch && d.dinner).length;
    const tail = summary.blankCount > 0
      ? `已排好 ${fullDays} 天，还差 ${summary.blankCount} 个空位`
      : `${weeklyMenu.days.length} 天都排满啦`;
    return `${summary.rangeText} · ${tail}`;
  },

  onWeekTap(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ activeIndex: index });
    wx.pageScrollTo({ selector: `#day-${index}`, duration: 280, offsetTop: -10 });
  },

  onDishTap(e) {
    const { id } = e.currentTarget.dataset;
    if (!id && id !== 0) return;
    wx.navigateTo({ url: `/pages/recipe-detail/index?id=${encodeURIComponent(id)}` });
  },

  onAddTap() {
    wx.switchTab({ url: '/pages/recipes/index' });
  },
  onShareAppMessage() {
    return {
      title: '本周家庭菜单',
      path: '/pages/weekly-menu/index'
    };
  },
});
