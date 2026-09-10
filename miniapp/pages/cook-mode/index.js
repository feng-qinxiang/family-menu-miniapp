// pages/cook-mode/index.js · 烹饪模式（沉浸暗底分步引导）
const api = require('../../utils/api');
const { decodeStep } = require('../../utils/recipe-steps');
const { recipeDishImg, stepDishImg } = require('../../utils/image');

// 数字补零
function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

// 中文步序
const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function cnStep(i) {
  return CN_NUM[i] ? `第${CN_NUM[i]}步` : `第${i}步`;
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

// 份量缩放：数值按比例换算，非数值（适量/少许）原样保留（与菜谱详情页同规则）
function scaleAmount(amount, ratio) {
  if (amount == null || amount === '') return '';
  const num = Number(amount);
  if (!isFinite(num) || String(amount).trim() === '') {
    return String(amount);
  }
  const rounded = Math.round(num * ratio * 10) / 10;
  return String(rounded);
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
  _baseAt: 0,             // 本轮计时起点（Date.now），后台回来按差值追上
  _baseLeft: 0,           // 起点时的剩余秒数
  _hiddenRunning: false,  // 切后台前计时是否在跑

  onLoad(options) {
    let sbh = 0;
    // 顶栏右侧计时按钮避开微信胶囊：胶囊左缘到屏幕右缘的宽度作为 padding-right
    let capsulePad = 19; // 兜底 = 原 38rpx
    try {
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      sbh = (win && win.statusBarHeight) || 0;
      const mb = wx.getMenuButtonBoundingClientRect();
      if (mb && mb.left && win && win.windowWidth && mb.left < win.windowWidth) {
        capsulePad = win.windowWidth - mb.left + 8;
      }
    } catch (e) {
      sbh = 0;
    }
    // 烹饪模式常亮：onLoad 开、onUnload 关
    if (wx.setKeepScreenOn) {
      wx.setKeepScreenOn({ keepScreenOn: true });
    }
    const recipeId = (options && (options.recipeId || options.id)) || '';
    // 从菜单页「开做」进入时带 menuItemId，完成烹饪自动把该菜标记「已上桌」
    this._menuItemId = (options && options.menuItemId) || '';
    // 详情页带入的人数（份量已按其换算），>0 时按比例缩放食材用量
    this._servings = Number(options && options.servings) || 0;
    this.setData({ statusBarHeight: sbh, capsulePad, recipeId });
    this.loadDetail(recipeId);
  },

  onUnload() {
    this.clearTimer();
    if (wx.setKeepScreenOn) {
      wx.setKeepScreenOn({ keepScreenOn: false });
    }
  },

  onHide() {
    // 切后台停 tick 省电；_baseAt 保留，回来按 Date.now 差值续跑（计时连续，后台时间也算）
    if (this.data.running) {
      this.clearTimer();
      this._hiddenRunning = true;
    }
  },

  onShow() {
    // 后台回来：沿用旧基准重启 tick，第一拍即把后台流逝的时间算进来
    if (this._hiddenRunning) {
      this._hiddenRunning = false;
      this.startTimer(true);
    }
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
    const dishImg = recipeDishImg(recipe);

    const steps = rawSteps.map((st, i) => {
      const decoded = decodeStep(st);
      const text = decoded.text;
      const image = stepDishImg(recipe, i, decoded.image);
      return {
        index: i,
        text,
        image,
        num: pad2(i + 1),
        cn: cnStep(i + 1),
        seconds: detectSeconds(text)
      };
    });

    // 详情页带入了人数时按比例缩放用量（与详情页 scaleAmount 同一规则）
    const baseServings = Number(recipe.servings) || 0;
    const ratio = (this._servings > 0 && baseServings > 0) ? this._servings / baseServings : 1;
    const ingredients = (Array.isArray(recipe.ingredients) ? recipe.ingredients : []).map((it) => {
      if (typeof it === 'string') return { name: it, label: it };
      const name = it.name || '';
      const amount = it.amount != null ? it.amount : '';
      const unit = it.unit || '';
      const scaled = ratio === 1 ? amount : scaleAmount(amount, ratio);
      const label = [name, `${scaled}${unit}`.trim()].filter(Boolean).join(' ');
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

  // 计时器开关：步骤没写时长时先选时长；已有时长则开始/暂停
  toggleTimer() {
    if (!this.data.hasTimer) {
      this.pickDuration();
      return;
    }
    if (this.data.running) {
      this.pauseTimer();
    } else {
      this.startTimer();
    }
  },

  // 快捷选/换时长：随时可重选，选完按新时长重新开始计时
  pickDuration() {
    const labels = ['1 分钟', '3 分钟', '5 分钟', '10 分钟', '15 分钟', '30 分钟'];
    const seconds = [60, 180, 300, 600, 900, 1800];
    wx.showActionSheet({
      itemList: labels,
      success: (res) => {
        const total = seconds[res.tapIndex];
        this.clearTimer();
        this.setData({
          timerTotal: total,
          timerLeft: total,
          timerText: this.fmt(total),
          hasTimer: true,
          running: false
        });
        this.startTimer();
      },
      fail: () => {}
    });
  },

  startTimer(resumeBase) {
    if (!resumeBase && this.data.timerLeft <= 0) {
      // 已结束则重置再开
      this.setData({ timerLeft: this.data.timerTotal });
    }
    this.clearTimer();
    if (!resumeBase) {
      // 新开始：以当前剩余为基准
      this._baseAt = Date.now();
      this._baseLeft = this.data.timerLeft;
    }
    // resumeBase=true（后台续跑）：沿用 _baseAt/_baseLeft，差值自动补上后台流逝
    this.setData({ running: true });
    this._timer = setInterval(() => this._tick(), 1000);
    this._tick();
  },

  _tick() {
    const elapsed = (Date.now() - this._baseAt) / 1000;
    // ceil：向下取整会在 1000ms 间隔下少显示一秒（0.4s 就跳成 0）
    const left = Math.ceil(this._baseLeft - elapsed);
    if (left <= 0) {
      this.clearTimer();
      this.setData({ timerLeft: 0, timerText: this.fmt(0), running: false });
      wx.vibrateShort && wx.vibrateShort({ type: 'heavy' });
      wx.showToast({ title: '这一步时间到啦', icon: 'none' });
      return;
    }
    this.setData({ timerLeft: left, timerText: this.fmt(left) });
  },

  pauseTimer() {
    if (!this.data.running) return;
    // 固化此刻的真实剩余（时间戳差值），下次从暂停点续跑
    const elapsed = (Date.now() - this._baseAt) / 1000;
    this._baseLeft = Math.max(0, Math.ceil(this._baseLeft - elapsed));
    this.clearTimer();
    this.setData({
      running: false,
      timerLeft: this._baseLeft,
      timerText: this.fmt(this._baseLeft)
    });
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
    this._hiddenRunning = false;
    this.setData({ running: false });
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

  // 完成 → 先请用户打个真实评分，再写做菜记录 + 回做菜记录页
  onFinish() {
    this.clearTimer();
    this._hiddenRunning = false;
    this.setData({ running: false });
    // 菜单联动：走完烹饪流程即视为这道菜上桌，静默回写菜单状态
    if (this._menuItemId) {
      api.updateMenuItemStatus(this._menuItemId, 'done').catch(() => {});
      this._menuItemId = '';
    }
    const { recipeId, recipe } = this.data;
    const title = recipe ? recipe.title : '';
    const gotoLog = () => {
      const url = `/pages/cook-log/index?recipeId=${encodeURIComponent(recipeId)}&title=${encodeURIComponent(title)}`;
      wx.navigateTo({
        url,
        fail: () => {
          wx.showToast({ title: '完成本次烹饪', icon: 'success' });
          setTimeout(() => this.onClose(), 800);
        }
      });
    };
    if (!recipeId) {
      gotoLog();
      return;
    }
    // 真实评分（含「不评分」），不再默认写死 5 分
    wx.showActionSheet({
      itemList: ['⭐⭐⭐⭐⭐ 超好吃', '⭐⭐⭐⭐ 不错', '⭐⭐⭐ 一般', '先不评分'],
      success: async (sheet) => {
        const score = [5, 4, 3, null][sheet.tapIndex];
        try {
          const payload = { recipeId, remark: '' };
          if (score != null) payload.score = score;
          await api.addCookHistory(payload);
        } catch (err) {
          wx.showToast({ title: '记录保存失败', icon: 'none' });
        }
        gotoLog();
      },
      fail: () => {
        // 用户取消评分也记录一笔（不带分）
        api.addCookHistory({ recipeId, remark: '' }).catch(() => {});
        gotoLog();
      }
    });
  },

  noop() {}
});
