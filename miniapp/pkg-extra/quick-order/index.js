// 一句话点菜：说一句「晚饭加个番茄炒蛋 / 午饭不要红烧肉了 / 把红烧肉换成糖醋排骨」，
// 先给确认卡，点了「确认修改」才调接口改今天的菜单。
// 听懂这一步只在 understand() 里：现在是 utils/parser.js 的中文规则，
// 以后换大模型时只换 understand()，让它返回同样形状的计划（见 parser.js 的 plan 说明），确认卡和下面的流程都不用动。
const { getRecipes, getTodayMenu, addTodayMenuRecipe, removeTodayMenuRecipe } = require('../../utils/api');
const { planMenuCommand, pickCandidate, planActions, MEAL_LABELS } = require('../../utils/parser');
const { runGuarded } = require('../../utils/interaction');
const { openTodayMenu } = require('../../utils/tabs');

const MEAL_KEYS = ['breakfast', 'lunch', 'dinner'];

// 计划 → 确认卡要画的东西（wxml 里不能调函数，这里先算好）
function cardView(plan) {
  const hasAdd = plan.items.some((it) => it.role === 'add');
  const lines = plan.items.map((it, index) => {
    const verb = it.role === 'add' ? '加上' : '撤掉';
    if (it.recipe) {
      const meal = it.role === 'remove' ? (it.recipe.mealType || plan.mealType) : plan.mealType;
      return { index, op: it.role, verb, title: it.recipe.title, mealLabel: MEAL_LABELS[meal] || '' };
    }
    let ask;
    if (it.candidates.length) {
      ask = it.missing ? `今天的菜单里没有「${it.query}」，要撤哪道？` : `「${it.query}」是哪道？点一下`;
    } else {
      ask = it.role === 'remove' ? `${MEAL_LABELS[plan.mealType]}还没点菜，没有可撤的` : `菜谱里没找到「${it.query}」`;
    }
    const candidates = it.candidates.map((c) => (it.role === 'remove' && c.mealType ? `${c.title} · ${MEAL_LABELS[c.mealType] || ''}` : c.title));
    return { index, op: it.role, verb, ask, candidates };
  });
  return {
    showMeals: hasAdd,
    meals: MEAL_KEYS.map((key) => ({ key, label: MEAL_LABELS[key], on: key === plan.mealType })),
    lines,
    canConfirm: planActions(plan).length > 0
  };
}

Page({
  data: {
    statusBarHeight: 0,
    fontScale: 'normal',
    loading: true,
    loadError: false,
    defaultMeal: 'dinner',
    examples: [],
    input: '',
    turns: [],
    scrollTo: ''
  },

  onLoad(options) {
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    let statusBarHeight = 0;
    try { statusBarHeight = wx.getWindowInfo().statusBarHeight || 0; } catch (e) { statusBarHeight = 0; }
    // 首页带来当前选中的餐次：句子里没说哪一餐就用它，和首页「加入X餐」一致
    const defaultMeal = MEAL_KEYS.indexOf(options && options.slot) !== -1 ? options.slot : 'dinner';
    this._seq = 0;
    this.setData({ fontScale, statusBarHeight, defaultMeal });
    this.loadContext();
  },

  // 能点的菜 + 今天已点的菜：听懂一句话要靠它们对菜名
  async loadContext() {
    this.setData({ loading: true, loadError: false });
    try {
      const loaded = await Promise.all([getRecipes('all'), getTodayMenu()]);
      const recipes = loaded[0];
      const menu = loaded[1];
      if (!Array.isArray(recipes) || !menu) throw new Error('empty');
      this._recipes = recipes.map((r) => ({ id: r.id, title: r.title })).filter((r) => r.title);
      this._setMenu(menu);
      this.setData({ loading: false, examples: this.buildExamples() });
    } catch (e) {
      this.setData({ loading: false, loadError: true });
    }
  },

  _setMenu(menu) {
    this._menu = ((menu && menu.items) || []).map((it) => ({
      id: it.recipeId,
      title: (it.recipe && it.recipe.title) || '',
      mealType: it.mealType || 'dinner'
    })).filter((m) => m.title);
  },

  // 示例用家里真有的菜名，点了就能走通：撤菜、换菜只拿今天已点的菜举例
  buildExamples() {
    const picked = this._menu[0];
    const names = this._recipes.map((r) => r.title).filter((t) => t.length <= 6 && !(picked && t === picked.title));
    const out = [];
    if (names[0]) out.push(`${MEAL_LABELS[this.data.defaultMeal]}加个${names[0]}`);
    if (picked) {
      out.push(`${MEAL_LABELS[picked.mealType]}不要${picked.title}了`);
      if (names[1]) out.push(`把${picked.title}换成${names[1]}`);
    }
    return out;
  },

  // 听懂一句话 → 计划。现在是规则；以后换大模型只改这里（返回同样形状的计划即可）
  understand(text) {
    return Promise.resolve(planMenuCommand(text, {
      recipes: this._recipes,
      menu: this._menu,
      mealType: this.data.defaultMeal
    }));
  },

  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  useExample(e) {
    this.setData({ input: e.currentTarget.dataset.text || '' });
  },

  async send() {
    const said = (this.data.input || '').trim();
    if (!said) return;
    const turns = this.data.turns.map((t) => (t.state === 'open' ? { ...t, state: 'cancelled' } : t));
    const id = ++this._seq;
    turns.push({ id, said, thinking: true });
    this.setData({ turns, input: '', scrollTo: '' });
    const plan = await this.understand(said);
    const idx = this.data.turns.findIndex((t) => t.id === id);
    if (idx < 0) return;
    this.setData({ [`turns[${idx}]`]: this.replyFor(id, said, plan), scrollTo: 'qo-end' });
  },

  replyFor(id, said, plan) {
    if (plan.notToday) return { id, said, text: '现在只能改今天的菜单，明天以后的还不行。' };
    if (!plan.intent) return { id, said, text: '没听出要加、撤还是换哪道菜。可以这样说：「晚饭加个番茄炒蛋」「午饭不要红烧肉了」「把红烧肉换成糖醋排骨」。' };
    return { id, said, plan, view: cardView(plan), state: 'open' };
  },

  _updatePlan(ti, plan) {
    this.setData({ [`turns[${ti}].plan`]: plan, [`turns[${ti}].view`]: cardView(plan) });
  },

  pick(e) {
    const { turn, item, cand } = e.currentTarget.dataset;
    const t = this.data.turns[turn];
    if (!t || t.state !== 'open') return;
    const candidate = t.plan.items[item] && t.plan.items[item].candidates[cand];
    if (candidate) this._updatePlan(turn, pickCandidate(t.plan, item, candidate));
  },

  chooseMeal(e) {
    const { turn, meal } = e.currentTarget.dataset;
    const t = this.data.turns[turn];
    if (!t || t.state !== 'open') return;
    this._updatePlan(turn, { ...t.plan, mealType: meal, mealGuessed: false });
  },

  cancel(e) {
    const ti = e.currentTarget.dataset.turn;
    if (this.data.turns[ti] && this.data.turns[ti].state === 'open') this.setData({ [`turns[${ti}].state`]: 'cancelled' });
  },

  // 只有这里会改数据：先撤后加，一条条调现成的菜单接口
  async confirm(e) {
    const ti = e.currentTarget.dataset.turn;
    const t = this.data.turns[ti];
    if (!t || t.state !== 'open') return;
    const actions = planActions(t.plan);
    if (!actions.length) return;
    const done = [];
    const ok = await runGuarded(this, 'confirm', async () => {
      for (const a of actions) {
        if (a.op === 'remove') await removeTodayMenuRecipe(a.recipeId, a.mealType);
        else await addTodayMenuRecipe(a.recipeId, a.mealType);
        done.push(`${a.op === 'remove' ? '撤掉' : '加上'}${a.title}`);
      }
      return true;
    }, { loading: '正在改菜单', fail: '' });
    // 不管成没成都重新拉一次今天的菜单，下一句话按改完的样子认
    try { this._setMenu(await getTodayMenu()); } catch (err) { /* 拉不到就沿用旧的，下一句撤菜时最多多问一句 */ }
    if (ok) {
      this.setData({ [`turns[${ti}].state`]: 'done', examples: this.buildExamples() });
      return;
    }
    this.setData({
      [`turns[${ti}].state`]: 'failed',
      [`turns[${ti}].failText`]: done.length
        ? `只改了一半：${done.join('、')}，剩下的没成功，可以再说一次。`
        : '没改成，网络开小差了，可以再说一次。'
    });
  },

  goMenu() {
    openTodayMenu();
  }
});
