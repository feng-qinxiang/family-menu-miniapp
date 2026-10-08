/** Three design directions share one local scenario. No API or storage writes. */
const { getCapsule } = require('../../utils/capsule');
const features = require('../../utils/features');

const DESIGNS = [
  { key: 'a', label: 'A 现版优化', name: '熟悉的味道，更清楚的流程', desc: '保留米白、番茄红与菜图，让这一餐先被看见。' },
  { key: 'b', label: 'B 家庭点菜单', name: '把一家人的这一餐放在中心', desc: '菜单像一张家里的点菜单，点好就开火，上桌就记下。' },
  { key: 'c', label: 'C 清爽厨房', name: '少一点装饰，多一点好用', desc: '紧凑的菜谱网格、清晰的进度，做饭时一眼找到操作。' }
];
const TABS = [
  { key: 'order', label: '点菜', icon: 'tab-home', active: 'tab-home-active' },
  { key: 'cook', label: '做菜', icon: 'journey-cook', active: 'journey-cook-active' },
  { key: 'record', label: '记录', icon: 'tab-recipe', active: 'tab-recipe-active' },
  { key: 'community', label: '社区', icon: 'tab-community', active: 'tab-community-active' },
  { key: 'me', label: '我的', icon: 'tab-profile', active: 'tab-profile-active' }
];
const MEALS = [{ key: 'breakfast', label: '早餐' }, { key: 'lunch', label: '午餐' }, { key: 'dinner', label: '晚餐' }];
const RECIPES = [
  { id: 'pork', title: '红烧肉', image: '/assets/dishes/hongshao-pork.jpg', minutes: 50, tag: '爸爸想吃', steps: ['五花肉切块，冷水下锅焯去浮沫。', '小火炒糖色，加入五花肉翻炒上色。', '加入热水和调味料，小火焖煮至软烂。', '大火收汁，尝一尝咸淡就可以上桌。'] },
  { id: 'egg', title: '番茄炒蛋', image: '/assets/dishes/tomato-egg.jpg', minutes: 15, tag: '妈妈拿手', steps: ['番茄切块，鸡蛋打散。', '热锅炒鸡蛋，刚凝固时先盛出。', '炒软番茄，再倒回鸡蛋。', '加盐翻匀，装盘上桌。'] },
  { id: 'veg', title: '清炒时蔬', image: '/assets/dishes/stir-fry-veg.jpg', minutes: 10, tag: '我想吃', steps: ['青菜洗净沥干，蒜切末。', '热锅下油，炒香蒜末。', '加入青菜，大火快速翻炒。', '加盐调味，保持脆嫩就出锅。'] },
  { id: 'potato', title: '酸辣土豆丝', image: '/assets/dishes/potato-shreds.jpg', minutes: 15, tag: '15 分钟快手菜', steps: ['土豆切丝，用水洗去淀粉。', '热锅炒香蒜和辣椒。', '下土豆丝，大火翻炒。', '加入醋和盐，炒匀出锅。'] },
  { id: 'chicken', title: '香菇滑鸡', image: '/assets/dishes/mushroom-chicken.jpg', minutes: 25, tag: '下饭家常菜', steps: ['鸡肉切块，腌制入味。', '香菇切片，姜切丝。', '炒香姜，放入鸡肉和香菇。', '焖熟后收汁，装盘。'] },
  { id: 'soup', title: '紫菜蛋花汤', image: '/assets/dishes/egg-drop-soup.jpg', minutes: 8, tag: '给这一餐添碗汤', steps: ['鸡蛋打散，紫菜备好。', '水烧开后放入紫菜。', '缓缓倒入蛋液。', '调味，盛入汤碗。'] },
  { id: 'shrimp', title: '豌豆炒虾仁', image: '/assets/dishes/shrimp-peas.jpg', minutes: 18, tag: '清爽不油腻', steps: ['虾仁处理干净，豌豆备好。', '豌豆先焯水。', '热锅炒虾仁，加入豌豆。', '调味翻匀，装盘。'] }
];
const recipe = (id) => RECIPES.find((r) => r.id === id);
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const dayKey = (date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

Page({
  data: {
    designs: DESIGNS, design: 'a', designInfo: DESIGNS[0], view: 'order', previewChrome: true,
    tabs: TABS.filter((t) => t.key !== 'community' || features.COMMUNITY), showCommunity: features.COMMUNITY,
    fontScale: 'normal', dark: false, capsuleTop: '48px', capsuleRight: '96px',
    meals: MEALS, meal: 'dinner', mealLabel: '晚餐', orders: [], recommendations: [],
    doneCount: 0, remainingCount: 0, menuExpanded: false, active: null, library: RECIPES,
    timerLabel: '05:00', timerRunning: false, history: [], latest: null, posts: [], week: [],
    sheet: '', tool: '', toolItems: [], remark: '', rating: 5, stars: [1, 2, 3, 4, 5], postText: '', shareRecord: null
  },

  onLoad(options = {}) {
    const capsule = getCapsule();
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { /* Preview can run without storage. */ }
    const design = DESIGNS.find((d) => d.key === options.design) || DESIGNS[0];
    const view = this.data.tabs.some((t) => t.key === options.view) ? options.view : 'order';
    this.setData({ design: design.key, designInfo: design, view, fontScale,
      previewChrome: options.chrome !== '0', capsuleTop: capsule.top, capsuleRight: capsule.right });
    this.resetDemo();
  },

  onShow() { this.syncTimer(); this.startTick(); },
  onHide() { this.stopTick(); },
  onUnload() { this.stopTick(); },

  resetDemo() {
    this.stopTick();
    this._timer = null;
    this._menu = { breakfast: [], lunch: [{ id: 'egg', by: '我' }], dinner: [{ id: 'pork', by: '爸爸' }, { id: 'egg', by: '妈妈' }, { id: 'veg', by: '我' }] };
    this._progress = {};
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const before = new Date(); before.setDate(before.getDate() - 3);
    this._history = [
      { id: 'demo-1', recipeId: 'egg', by: '妈妈', score: 5, when: '昨天 · 晚餐', date: dayKey(yesterday), remark: '少放一点糖，番茄的酸味刚刚好。' },
      { id: 'demo-2', recipeId: 'potato', by: '我', score: 4, when: '昨天 · 晚餐', date: dayKey(yesterday), remark: '土豆丝切细一点，下次还能更脆。' },
      { id: 'demo-3', recipeId: 'chicken', by: '爸爸', score: 5, when: '三天前 · 晚餐', date: dayKey(before), remark: '这道菜一家人都喜欢。' }
    ];
    this._posts = [
      { id: 'post-1', recipeId: 'pork', author: '阿柚的厨房', initial: '柚', title: '慢慢炖的一锅，是今晚的幸福', content: '小火炖到软糯，最后留一点汁拌饭。', tag: '家常好味', likes: 28, liked: false },
      { id: 'post-2', recipeId: 'shrimp', author: '小满', initial: '满', title: '下班也能好好吃饭', content: '18 分钟就能上桌，清爽又下饭。', tag: '快手晚餐', likes: 16, liked: false },
      { id: 'post-3', recipeId: 'potato', author: '林间小厨', initial: '林', title: '土豆丝的脆，全靠这一步', content: '切好先过两遍水，大火快炒。', tag: '厨房小经验', likes: 12, liked: false }
    ];
    this.setData({ activeId: 'pork', sheet: '', timerRunning: false, timerLabel: '05:00', menuExpanded: false });
    this.refreshView();
  },

  refreshView() {
    const now = new Date();
    const meal = this.data.meal;
    const orders = this._menu[meal].map((entry) => {
      const r = recipe(entry.id), p = this._progress[`${meal}:${entry.id}`] || {};
      return Object.assign({}, r, entry, { status: p.done ? 'done' : p.started ? 'cooking' : 'todo', statusText: p.done ? '已上桌' : p.started ? '在做' : '待做' });
    });
    const activeOrder = orders.find((r) => r.id === this.data.activeId) || orders.find((r) => r.status !== 'done') || orders[0];
    let active = null;
    if (activeOrder) {
      const p = this._progress[`${meal}:${activeOrder.id}`] || { step: 0 };
      const step = p.step || 0;
      active = Object.assign({}, activeOrder, { step, stepNumber: step + 1, stepText: activeOrder.steps[step], progress: Math.round((step + 1) / activeOrder.steps.length * 100), lastStep: step === activeOrder.steps.length - 1 });
    }
    const history = this._history.map((h) => Object.assign({}, h, recipe(h.recipeId), { id: h.id }));
    const week = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(now); date.setDate(now.getDate() - ((now.getDay() + 6) % 7) + i);
      return { key: dayKey(date), label: ['一', '二', '三', '四', '五', '六', '日'][i], day: date.getDate(), today: dayKey(date) === dayKey(now), done: history.some((h) => h.date === dayKey(date)) };
    });
    this.setData({ orders, active, activeId: active ? active.id : '',
      recommendations: ['potato', 'chicken', 'soup', 'shrimp'].map((id) => Object.assign({}, recipe(id), { picked: orders.some((o) => o.id === id) })),
      mealLabel: MEALS.find((m) => m.key === meal).label,
      doneCount: orders.filter((o) => o.status === 'done').length, remainingCount: orders.filter((o) => o.status !== 'done').length,
      history, recentHistory: history.slice(1), latest: history[0] || null, fireDays: new Set(history.map((h) => h.date)).size, praiseCount: history.filter((h) => h.score === 5).length,
      posts: this._posts.map((p) => Object.assign({}, p, { recipe: recipe(p.recipeId) })), week,
      dateText: `${now.getMonth() + 1}月${now.getDate()}日 · 示例家庭`, dateDay: String(now.getDate()).padStart(2, '0'),
      recordMonth: `${now.getFullYear()}年${now.getMonth() + 1}月`
    });
  },

  selectDesign(e) {
    const design = DESIGNS.find((d) => d.key === e.currentTarget.dataset.design);
    if (design) this.setData({ design: design.key, designInfo: design });
  },
  selectView(e) {
    const view = e.currentTarget.dataset.view;
    if (!this.data.tabs.some((t) => t.key === view)) return;
    this.setData({ view, sheet: '' });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    this.stopTick(); this.startTick();
  },
  selectMeal(e) { const meal = e.currentTarget.dataset.meal; if (this._menu[meal]) { this.setData({ meal }); this.refreshView(); this.syncTimer(); } },
  toggleMenu() { this.setData({ menuExpanded: !this.data.menuExpanded }); },
  toggleFont() { this.setData({ fontScale: this.data.fontScale === 'lg' ? 'normal' : 'lg' }); },
  toggleDark() {
    const dark = !this.data.dark;
    this.setData({ dark });
    wx.setNavigationBarColor({ frontColor: dark ? '#ffffff' : '#000000', backgroundColor: dark ? '#171b19' : '#fbf8f3' });
  },

  pickRecipe(e) {
    const id = e.currentTarget.dataset.id;
    if (!recipe(id)) return;
    if (this._menu[this.data.meal].some((r) => r.id === id)) return wx.showToast({ title: '这道菜已经点好了', icon: 'none' });
    this._menu[this.data.meal].push({ id, by: '我' });
    this.refreshView();
    wx.showToast({ title: `已加入${this.data.mealLabel}`, icon: 'none' });
  },
  removeRecipe(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.orders.some((r) => r.id === id && r.status !== 'todo')) return wx.showToast({ title: '已经开做，先保留在菜单里', icon: 'none' });
    this._menu[this.data.meal] = this._menu[this.data.meal].filter((r) => r.id !== id); this.refreshView();
  },
  startCook() {
    const pending = this.data.orders.filter((r) => r.status !== 'done').sort((a, b) => b.minutes - a.minutes);
    if (!pending.length) return this.selectView({ currentTarget: { dataset: { view: this.data.orders.length ? 'record' : 'order' } } });
    this.setData({ activeId: pending[0].id });
    const key = `${this.data.meal}:${pending[0].id}`;
    this._progress[key] = Object.assign({ step: 0 }, this._progress[key], { started: true });
    this.refreshView(); this.selectView({ currentTarget: { dataset: { view: 'cook' } } });
  },
  selectCook(e) { if (this.data.orders.some((r) => r.id === e.currentTarget.dataset.id)) { this.setData({ activeId: e.currentTarget.dataset.id }); this.refreshView(); this.syncTimer(); } },
  nextStep() {
    const r = this.data.active;
    if (!r || r.status === 'done') return;
    if (r.lastStep) return this.setData({ sheet: 'record', rating: 5, remark: '' });
    this._progress[`${this.data.meal}:${r.id}`] = { started: true, step: r.step + 1 };
    this.refreshView();
  },
  setRating(e) { const n = Number(e.currentTarget.dataset.rating); if (n >= 1 && n <= 5) this.setData({ rating: n }); },
  inputRemark(e) { this.setData({ remark: e.detail.value.slice(0, 160) }); },
  saveRecord() {
    const r = this.data.active;
    if (!r || this.data.sheet !== 'record') return;
    const key = `${this.data.meal}:${r.id}`;
    if ((this._progress[key] || {}).done) return;
    this._progress[key] = { done: true, step: r.steps.length - 1 };
    this._history.unshift({ id: 'local-' + key, sourceKey: key, recipeId: r.id, by: '我', score: this.data.rating, remark: this.data.remark || '这一餐，值得记下来。', when: '刚刚 · ' + this.data.mealLabel, date: dayKey(new Date()) });
    if (this._timer && this._timer.key === key) this._timer = null;
    this.refreshView(); this.syncTimer(); this.selectView({ currentTarget: { dataset: { view: 'record' } } });
    wx.showToast({ title: '已记在示例记录中', icon: 'none' });
  },

  toggleTimer() {
    if (!this.data.active || this.data.active.status === 'done') return;
    const key = `${this.data.meal}:${this.data.active.id}`;
    if (!this._timer || this._timer.key !== key) this._timer = { key, remaining: 300, until: 0 };
    if (this._timer.until) { this._timer.remaining = Math.max(0, Math.ceil((this._timer.until - Date.now()) / 1000)); this._timer.until = 0; }
    else { this._timer.until = Date.now() + (this._timer.remaining || 300) * 1000; }
    this.syncTimer(); this.stopTick(); this.startTick();
  },
  syncTimer() {
    const key = this.data.active ? `${this.data.meal}:${this.data.active.id}` : '';
    const timer = this._timer;
    if (!timer || timer.key !== key) return this.setData({ timerLabel: '05:00', timerRunning: false });
    const remaining = timer.until ? Math.max(0, Math.ceil((timer.until - Date.now()) / 1000)) : timer.remaining;
    if (timer.until && remaining === 0) { timer.until = 0; timer.remaining = 0; this.stopTick(); }
    this.setData({ timerLabel: clock(remaining), timerRunning: Boolean(timer.until) });
  },
  startTick() { if (!this._tick && this.data.view === 'cook' && this._timer && this._timer.until) this._tick = setInterval(() => this.syncTimer(), 1000); },
  stopTick() { if (this._tick) clearInterval(this._tick); this._tick = null; },

  shareRecord(e) {
    if (!features.COMMUNITY) return;
    const id = e.currentTarget.dataset.id;
    const record = this.data.history.find((h) => h.id === id) || this.data.latest;
    if (record) this.setData({ sheet: 'share', shareRecord: record, postText: record.remark });
  },
  inputPost(e) { this.setData({ postText: e.detail.value.slice(0, 160) }); },
  publishPost() {
    const record = this.data.shareRecord;
    if (!features.COMMUNITY || this.data.sheet !== 'share' || !record) return;
    this._posts.unshift({ id: 'local-post-' + this._posts.length, recipeId: record.recipeId, author: '我家的饭桌', initial: '我', title: record.title + '，刚刚上桌', content: this.data.postText.trim() || '把这一餐分享给你。', tag: '我家的饭桌', likes: 0, liked: false });
    this.refreshView(); this.selectView({ currentTarget: { dataset: { view: 'community' } } });
    wx.showToast({ title: '已分享到示例社区', icon: 'none' });
  },
  orderPost(e) { this.pickRecipe({ currentTarget: { dataset: { id: e.currentTarget.dataset.id } } }); this.selectView({ currentTarget: { dataset: { view: 'order' } } }); },
  likePost(e) { const post = this._posts.find((p) => p.id === e.currentTarget.dataset.id); if (post) { post.liked = !post.liked; post.likes += post.liked ? 1 : -1; this.refreshView(); } },

  openTool(e) {
    const tool = e.currentTarget.dataset.tool;
    if (tool === 'recipes') return this.setData({ sheet: 'recipes' });
    const toolItems = tool === 'pantry' ? ['鸡蛋 · 6 个', '番茄 · 3 个', '青菜 · 1 把'] : ['五花肉 · 500 克', '香菇 · 6 朵'];
    this.setData({ sheet: 'tool', tool: tool === 'pantry' ? '冰箱里有什么' : '这一餐要买什么', toolItems });
  },
  closeSheet() { this.setData({ sheet: '' }); },
  eatTap() {}
});
