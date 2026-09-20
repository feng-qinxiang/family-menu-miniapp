// pages/cook-mode/index.js · 烹饪模式（沉浸暗底分步引导）
const api = require('../../utils/api');
const { recipeDishImg, stepDishImg, onPhotoError: markPhotoBroken } = require('../../utils/image');
const { restoreTimerSlots } = require('../../utils/kitchen');

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
  onPhotoError(e) { markPhotoBroken(e, this); },
  data: {
    // 大字模式：app.wxss 的 .font-lg 会把 --fs-mul 提到 1.15。
    // 这页以前没接档位，等于「设置里开了大字，做菜模式照样小字」——而做菜时手机放在
    // 一臂外、手上有油，恰恰是最需要大字的一屏。app.wxss 的注释本来就写着全站都要挂。
    statusBarHeight: 0,
    fontScale: 'normal',
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

    // 计时器（下面这几个只是「当前步那个槽」的视图，真实状态在 _slots 里）
    timerTotal: 0,     // 本步总秒数
    timerLeft: 0,      // 剩余秒数
    timerText: '00:00',
    running: false,
    hasTimer: false,
    // 离开某一步时它还在跑 → 顶栏下方那枚小条接管显示，点一下回到那一步。
    // 为什么非做不可：真实做菜是并行的（炖着 20 分钟去看下一步的配料），
    // 旧实现 gotoStep 第一件事就是 clearTimer，那个倒计时既没提示也不保留，说没就没。
    bgIdx: -1,
    bgName: '',
    bgText: '',
    bgExtra: 0,        // 除了小条上这个，还有几个在跑
    // 换步时把步骤正文滚回顶部。0/0.01 交替：scroll-top 只在「值发生变化」时才下发，
    // 恒绑 0 时第二步之后的滚动位置会一直留着（长菜谱读到下面才换步，新步骤开头在屏外）。
    // 0.01px 会被渲染层夹回 0，所以两档观感都是顶部。
    stepTop: 0
  },

  _timer: null,
  // 每步一个计时槽 { total, baseAt, baseLeft, running }。
  // 用「起点时间戳 + 起点剩余」表示而不是逐秒递减，所以切后台、来回换步都不需要额外补偿：
  // 剩余永远是 baseLeft - (Date.now() - baseAt)/1000，算一次就自动把流逝的时间追平。
  _slots: null,

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
    try { this.data.fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) {}
    this.setData({ statusBarHeight: sbh, capsulePad, recipeId });
    this.loadDetail(recipeId);
  },

  onUnload() {
    this.stopTicker();
    // 页面要销毁了，把还在跑的槽落一次盘：靠 tick 落不够（可能已经停在 00:00 无 tick 的状态）
    this.persistSlots();
    if (wx.setKeepScreenOn) {
      wx.setKeepScreenOn({ keepScreenOn: false });
    }
  },

  onHide() {
    // 只停 tick 省电，不动任何槽的基准：回到前台第一拍就会把后台流逝的秒数一次追平
    this.stopTicker();
  },

  onShow() {
    this.ensureTicker();
  },

  slot(i) {
    if (!this._slots) this._slots = {};
    if (!this._slots[i]) this._slots[i] = { total: 0, baseAt: 0, baseLeft: 0, running: false };
    return this._slots[i];
  },

  leftOf(s) {
    if (!s.running) return Math.max(0, s.baseLeft);
    // ceil：向下取整会在 1000ms 间隔下少显示一秒（0.4s 就跳成 0）
    return Math.max(0, Math.ceil(s.baseLeft - (Date.now() - s.baseAt) / 1000));
  },

  anyRunning() {
    const s = this._slots || {};
    return Object.keys(s).some((k) => s[k].running);
  },

  ensureTicker() {
    if (this._timer || !this.anyRunning()) return;
    this._timer = setInterval(() => this._tick(), 1000);
    this._tick();
  },

  stopTicker() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  // 把「当前步的槽」+「其它仍在跑的槽」投影到 data 上
  renderTimers() {
    const cur = this.slot(this.data.current);
    const left = this.leftOf(cur);
    let bestIdx = -1;
    let bestLeft = 0;
    let running = 0;
    const s = this._slots || {};
    Object.keys(s).forEach((k) => {
      const idx = Number(k);
      if (!s[idx].running || idx === this.data.current) return;
      const l = this.leftOf(s[idx]);
      running += 1;
      if (bestIdx < 0 || l < bestLeft) {
        bestIdx = idx;
        bestLeft = l;
      }
    });
    this.setData({
      timerTotal: cur.total,
      timerLeft: left,
      timerText: this.fmt(left),
      running: cur.running,
      hasTimer: cur.total > 0,
      bgIdx: bestIdx,
      bgName: bestIdx >= 0 ? ((this.data.steps[bestIdx] || {}).cn || '') : '',
      bgText: bestIdx >= 0 ? this.fmt(bestLeft) : '',
      bgExtra: running > 1 ? running - 1 : 0
    });
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
      // 服务端已返回结构化步骤 {text,image,video}，直接取用
      const text = (st && st.text) || '';
      const image = stepDishImg(recipe, i, st && st.image);
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
      if (typeof it === 'string') return { name: it, label: it, checked: false };
      const name = it.name || '';
      const amount = it.amount != null ? it.amount : '';
      const unit = it.unit || '';
      const scaled = ratio === 1 ? amount : scaleAmount(amount, ratio);
      const label = [name, `${scaled}${unit}`.trim()].filter(Boolean).join(' ');
      return { name, label: label || name, checked: false };
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
      // 计时槽要在 gotoStep 之前恢复：否则第一步的 gotoStep 会把"这步本来还剩 12:04"当成没跑过
      this.restoreSlots(recipeId, steps);
      this.resumeOrStart(recipeId, steps);
    }
  },

  // —— 计时槽本地续跑：离开页面（关掉、被回收、切去冰箱）再回来，倒数不归零 ——
  // 厨房总控页早就按 menuItemId 把计时存进 storage 了（kitchen/index.js 的 restoreTimer/persistTimer），
  // 本页原来只把 _slots 挂在页面对象上——同一个"炖着 20 分钟"的概念，
  // 从菜单页开做能跨路由活着、把做菜页关掉就归零。两处存的四元组形状完全一致，这里只是换个存放位置。
  timersKey(recipeId) {
    return `cook_timers_${recipeId}`;
  },

  persistSlots() {
    const recipeId = this.data.recipeId;
    if (!recipeId) return;
    try {
      const s = this._slots || {};
      const out = {};
      Object.keys(s).forEach((k) => {
        const v = s[k];
        if (!v || !(v.total > 0)) return;
        out[k] = { total: v.total, baseAt: v.baseAt, baseLeft: v.baseLeft, running: !!v.running };
      });
      if (Object.keys(out).length) wx.setStorageSync(this.timersKey(recipeId), out);
      else wx.removeStorageSync(this.timersKey(recipeId));
    } catch (e) {
      // 存不上不影响本轮页面内使用（与厨房页同一取舍）
    }
  },

  restoreSlots(recipeId, steps) {
    let saved = null;
    try { saved = wx.getStorageSync(this.timersKey(recipeId)); } catch (e) { saved = null; }
    // 算法在 utils/kitchen.js（与厨房页共用一份），这里只负责读写存储
    this._slots = restoreTimerSlots(saved, steps.length);
  },

  // —— 步骤进度本地续做：同一道菜中途退出，再进来回到上次步骤 ——
  // 存 {i,total}（厨房总控页用来显示"第几/共几步"）；读取兼容旧格式纯数字
  progressKey(recipeId) {
    return `cook_progress_${recipeId}`;
  },

  resumeOrStart(recipeId, steps) {
    let startAt = 0;
    try {
      const saved = wx.getStorageSync(this.progressKey(recipeId));
      const savedIdx = (saved && typeof saved === 'object') ? Number(saved.i) : Number(saved);
      // 停在哪一步（含最后一步）都续做；完成时会清进度，能读到就说明没走完
      if (savedIdx > 0 && savedIdx < steps.length) {
        startAt = savedIdx;
        wx.showToast({ title: `已回到上次进度（${steps[savedIdx].cn}）`, icon: 'none' });
      }
    } catch (e) {
      // 本地存储不可用则从头开始，不影响烹饪
    }
    this.gotoStep(startAt);
  },

  // 备菜清单勾选：备齐一样勾一样（纯本地状态，不做持久化）
  toggleIng(event) {
    const idx = Number(event.currentTarget.dataset.idx);
    const item = this.data.ingredients[idx];
    if (!item) return;
    this.setData({ [`ingredients[${idx}].checked`]: !item.checked });
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });
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
    const sl = this.slot(i);
    // 第一次进这一步才按菜谱识别到的时长铺默认值；跑过/手动改过的以槽里的为准（不清零、不杀掉在跑的）
    if (!sl.total) {
      sl.total = seconds;
      sl.baseLeft = seconds;
    }
    this.setData({
      current: i,
      dots,
      stepTop: this.data.stepTop === 0 ? 0.01 : 0
    });
    this.renderTimers();
    // 换到一个还在跑的步 → 需要 tick；换走时留下面一个还在跑的步 → 也要 tick
    this.ensureTicker();
    // 记录进度：中途退出（onClose/切走被杀）再进可续做，厨房总控页据此显示步骤进度
    try {
      if (this.data.recipeId) {
        wx.setStorageSync(this.progressKey(this.data.recipeId), { i, total: steps.length });
      }
    } catch (e) {
      // 存不上就算了，续做是锦上添花
    }
    this.persistSlots();
  },

  // 进度条每段都可点：直接跳到那一步（原来只能线性 上一步/下一步，
  // 想回头看第 3 步得连点 5 次往回退）
  onDotTap(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    if (!Number.isFinite(idx)) return;
    this.gotoStep(idx);
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
        const cur = this.slot(this.data.current);
        cur.total = seconds[res.tapIndex];
        cur.baseLeft = cur.total;
        cur.baseAt = Date.now();
        cur.running = true;
        this.renderTimers();
        this.ensureTicker();
        this.persistSlots();
      },
      fail: () => {}
    });
  },

  startTimer() {
    const cur = this.slot(this.data.current);
    if (!cur.total) return;
    // 跑完了再按就是重新开始
    if (this.leftOf(cur) <= 0) cur.baseLeft = cur.total;
    cur.baseAt = Date.now();
    cur.running = true;
    this.renderTimers();
    this.ensureTicker();
    this.persistSlots();
  },

  _tick() {
    const s = this._slots || {};
    const done = [];
    Object.keys(s).forEach((k) => {
      const slot = s[k];
      if (!slot.running) return;
      // 只读、不重新取基准：baseAt 在整个计时期间固定，节流/切后台后的那一拍会一次把
      // 流逝的秒数全追回来。反过来若每拍都把 baseAt 推到「现在」，elapsed 就永远略小于 1，
      // ceil(1 - 0.995) = 1 → 数字卡在 00:01 再也不到 0（实测踩过）。
      if (this.leftOf(slot) > 0) return;
      slot.running = false;
      slot.baseLeft = 0;
      slot.baseAt = 0;
      done.push(Number(k));
    });
    this.renderTimers();
    if (!this.anyRunning()) this.stopTicker();
    if (done.length) {
      this.persistSlots();
      wx.vibrateShort && wx.vibrateShort({ type: 'heavy' });
      const first = (this.data.steps[done[0]] || {}).cn || '这一步';
      const more = done.length > 1 ? `（另有 ${done.length - 1} 步也到点）` : '';
      wx.showToast({ title: `${first}时间到啦${more}`, icon: 'none' });
    }
  },

  pauseTimer() {
    const cur = this.slot(this.data.current);
    if (!cur.running) return;
    cur.baseLeft = this.leftOf(cur);
    cur.running = false;
    cur.baseAt = 0;
    this.renderTimers();
    if (!this.anyRunning()) this.stopTicker();
    this.persistSlots();
  },

  resetTimer() {
    const cur = this.slot(this.data.current);
    cur.baseLeft = cur.total;
    cur.running = false;
    cur.baseAt = 0;
    this.renderTimers();
    if (!this.anyRunning()) this.stopTicker();
    this.persistSlots();
  },

  // 顶栏小条：跳回那个还在倒计时的步骤
  jumpToBgStep() {
    if (this.data.bgIdx >= 0) this.gotoStep(this.data.bgIdx);
  },

  // 退出烹饪模式
  onClose() {
    this.stopTicker();
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
    // 这道菜走完了，所有步的计时一起作废：gotoLog 是 navigateTo，本页还留在栈里，
    // 不清空的话用户从做菜记录页退回来会看到"这步还剩 12:04"继续倒数。
    this.stopTicker();
    this._slots = {};
    // 烹饪走完，清掉本地续做进度
    try {
      if (this.data.recipeId) {
        wx.removeStorageSync(this.progressKey(this.data.recipeId));
        wx.removeStorageSync(this.timersKey(this.data.recipeId));
      }
    } catch (e) {
      // 清不掉无碍，下次进来至多回到末步再点一次完成
    }
    // 菜单联动：走完烹饪流程即视为这道菜上桌，静默回写菜单状态
    if (this._menuItemId) {
      // 尽力而为：失败时这道菜在厨房总控里仍是"待做"。不弹窗打断跳转，但必须留痕可查
      api.updateMenuItemStatus(this._menuItemId, 'done').catch((err) => {
        console.warn('[cook-mode] 菜单状态回写失败', this._menuItemId, err);
      });
      this._menuItemId = '';
    }
    const { recipeId, recipe } = this.data;
    const title = recipe ? recipe.title : '';
    const gotoLog = () => {
      const url = `/pkg-extra/cook-log/index?recipeId=${encodeURIComponent(recipeId)}&title=${encodeURIComponent(title)}`;
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
      fail: async () => {
        // 用户取消评分也记录一笔（不带分）。静默吞掉失败会让人以为记上了：
        // 下面紧接着就跳去做菜记录页，页面上看不出少了一条
        try {
          await api.addCookHistory({ recipeId, remark: '' });
        } catch (err) {
          wx.showToast({ title: '记录保存失败', icon: 'none' });
        }
        gotoLog();
      }
    });
  },

  noop() {}
});
