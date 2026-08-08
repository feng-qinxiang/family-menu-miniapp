// pages/cook-mode/index.js · 烹饪模式（沉浸暗底分步引导）
const api = require('../../utils/api');

// 本地菜图兜底池（接口清单 16 张），禁止用作 background-image
const LOCAL_DISHES = [
  'mapo-tofu', 'tomato-egg', 'hongshao-pork', 'kungpao-chicken', 'long-beans',
  'shrimp-peas', 'egg-drop-soup', 'hot-sour-soup', 'fried-rice', 'lo-mein',
  'beef-broccoli', 'chicken-congee', 'orange-chicken', 'sichuan-eggplant',
  'sweet-sour-chicken', 'wontons'
];

function fallbackDishImg(seed) {
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return `/assets/dishes/${LOCAL_DISHES[h % LOCAL_DISHES.length]}.jpg`;
}

// 数字补零
function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

// 中文步序
const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function cnStep(i) {
  return CN_NUM[i] ? `第${CN_NUM[i]}步` : `第${i}步`;
}
const EN_STEP = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
function enStep(i) {
  return EN_STEP[i] ? `Step ${EN_STEP[i]}` : `Step ${i}`;
}

// 从步骤文本里抽取「约 N 分钟 / N 分钟」估算秒数；无则 0
function detectSeconds(text) {
  if (!text) return 0;
  const m = String(text).match(/(\d+)\s*分钟/);
  if (m) return Math.min(parseInt(m[1], 10), 60) * 60;
  const s = String(text).match(/(\d+)\s*秒/);
  if (s) return parseInt(s[1], 10);
  return 0;
}

Page({
  data: {
    statusBarHeight: 0,
    loading: true,
    loadError: false,
    recipeId: '',
    recipe: null,
    dishName: '',
    dishImg: '',
    steps: [],
    ingredients: [],
    current: 0,        // 当前步索引
    total: 0,
    dots: [],          // 进度点状态：done|now|''

    // 计时器
    timerTotal: 0,     // 本步总秒数
    timerLeft: 0,      // 剩余秒数
    timerText: '00:00',
    running: false,
    hasTimer: false
  },

  _timer: null,

  onLoad(options) {
    let sbh = 0;
    try {
      sbh = (wx.getWindowInfo ? wx.getWindowInfo().statusBarHeight : wx.getSystemInfoSync().statusBarHeight) || 0;
    } catch (e) {
      sbh = 0;
    }
    const recipeId = (options && (options.recipeId || options.id)) || '';
    this.setData({ statusBarHeight: sbh, recipeId });
    this.loadDetail(recipeId);
  },

  onUnload() {
    this.clearTimer();
  },

  onHide() {
    // 离开页面暂停计时，避免后台空跑
    this.pauseTimer();
  },

  clearTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  async loadDetail(recipeId) {
    this.setData({ loading: true, loadError: false });
    let recipe = null;
    let failed = false;
    try {
      if (recipeId) {
        recipe = await api.getRecipeDetail(recipeId);
      } else {
        failed = true;   // 无 recipeId：入口缺参，等同失败
      }
    } catch (e) {
      recipe = null;
      failed = true;
    }

    if (failed || !recipe) {
      // failed（网络错误/缺参）→ loadError 显示可重试失败态；
      // 非 failed 且 recipe 为空（真没步骤）→ 沿用下方空数据守护
      this.setData({ loading: false, recipe: null, steps: [], total: 0, loadError: failed });
      return;
    }

    const rawSteps = Array.isArray(recipe.steps) ? recipe.steps : [];
    const dishImg = recipe.coverImage || fallbackDishImg(recipe.id || recipe.title);

    // 归一化步骤：兼容 string 或 { text, image }
    const steps = rawSteps.map((st, i) => {
      const text = typeof st === 'string' ? st : (st && (st.text || st.desc)) || '';
      const image = (typeof st === 'object' && st && st.image) ? st.image : '';
      return {
        index: i,
        text,
        image: image || dishImg,
        num: pad2(i + 1),
        cn: cnStep(i + 1),
        en: enStep(i + 1),
        seconds: detectSeconds(text)
      };
    });

    const ingredients = (Array.isArray(recipe.ingredients) ? recipe.ingredients : []).map((it) => {
      if (typeof it === 'string') return { name: it, label: it };
      const name = it.name || '';
      const amount = it.amount != null ? it.amount : '';
      const unit = it.unit || '';
      const label = [name, `${amount}${unit}`.trim()].filter(Boolean).join(' ');
      return { name, label: label || name };
    });

    this.setData({
      loading: false,
      recipe,
      dishName: recipe.title || '今日菜谱',
      dishImg,
      steps,
      ingredients,
      total: steps.length
    });

    if (steps.length) {
      this.gotoStep(0);
    }
  },

  // 切换到指定步骤
  gotoStep(idx) {
    const { steps } = this.data;
    if (!steps.length) return;
    const i = Math.max(0, Math.min(idx, steps.length - 1));
    const step = steps[i];

    // 进度点
    const dots = steps.map((s, k) => (k < i ? 'done' : k === i ? 'now' : ''));

    const seconds = step.seconds || 0;
    this.clearTimer();
    this.setData({
      current: i,
      dots,
      timerTotal: seconds,
      timerLeft: seconds,
      timerText: this.fmt(seconds),
      running: false,
      hasTimer: seconds > 0
    });
  },

  fmt(sec) {
    const s = Math.max(0, sec | 0);
    return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
  },

  onPrev() {
    if (this.data.current <= 0) return;
    this.gotoStep(this.data.current - 1);
  },

  onNext() {
    const { current, total } = this.data;
    if (current >= total - 1) {
      this.onFinish();
      return;
    }
    this.gotoStep(current + 1);
  },

  // 计时器开关
  toggleTimer() {
    if (!this.data.hasTimer) return;
    if (this.data.running) {
      this.pauseTimer();
    } else {
      this.startTimer();
    }
  },

  startTimer() {
    if (this.data.timerLeft <= 0) {
      // 已结束则重置再开
      this.setData({ timerLeft: this.data.timerTotal });
    }
    this.clearTimer();
    this.setData({ running: true });
    this._timer = setInterval(() => {
      let left = this.data.timerLeft - 1;
      if (left <= 0) {
        left = 0;
        this.clearTimer();
        this.setData({ timerLeft: 0, timerText: this.fmt(0), running: false });
        wx.vibrateShort && wx.vibrateShort({ type: 'heavy' });
        wx.showToast({ title: '这一步时间到啦', icon: 'none' });
        return;
      }
      this.setData({ timerLeft: left, timerText: this.fmt(left) });
    }, 1000);
  },

  pauseTimer() {
    if (!this.data.running) return;
    this.clearTimer();
    this.setData({ running: false });
  },

  resetTimer() {
    this.clearTimer();
    this.setData({
      timerLeft: this.data.timerTotal,
      timerText: this.fmt(this.data.timerTotal),
      running: false
    });
  },

  // 退出烹饪模式
  onClose() {
    this.clearTimer();
    const pages = getCurrentPages();
    if (pages && pages.length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.switchTab({ url: '/pages/home/index', fail() {} });
    }
  },

  // 失败重试
  retryLoad() {
    this.loadDetail(this.data.recipeId);
  },

  // 完成 → 跳做菜记录
  onFinish() {
    this.clearTimer();
    const { recipeId, recipe } = this.data;
    const title = recipe ? recipe.title : '';
    const url = `/pages/cook-log/index?recipeId=${encodeURIComponent(recipeId)}&title=${encodeURIComponent(title)}`;
    wx.navigateTo({
      url,
      fail: () => {
        // cook-log 暂未就绪时兜底返回
        wx.showToast({ title: '完成本次烹饪', icon: 'success' });
        setTimeout(() => this.onClose(), 800);
      }
    });
  },

  noop() {}
});
