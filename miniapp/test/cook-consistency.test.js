// node miniapp/test/cook-consistency.test.js · 真实 API 与 Page，检查失去回包后的恢复及上桌顺序。
const assert = require('assert');
const storage = new Map();
const posts = [];
let identity = { userId: 7, familyId: 10 };
let saveFails = false;
let identityFails = false;
global.getApp = () => ({ globalData: { apiBaseUrl: 'http://127.0.0.1:19088' } });
global.wx = {
  getStorageSync: (key) => structuredClone(storage.get(key)),
  setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
  removeStorageSync: (key) => storage.delete(key),
  showToast() {},
  request(opts) {
    if (opts.url.endsWith('/api/auth/me')) {
      opts.success({ statusCode: identityFails ? 503 : 200, data: identityFails ? {} : identity });
      return;
    }
    assert.ok(opts.url.endsWith('/api/cook-history'));
    posts.push(structuredClone(opts.data));
    if (saveFails) opts.fail({ errMsg: 'request:fail timeout' });
    else opts.success({ statusCode: 200, data: { id: 1, pantryDeducted: 0 } });
  }
};

let api = require('../utils/api');
const pendingKeys = () => [...storage.keys()].filter((key) => key.startsWith('cook_completion_'));
const options = { completionKey: 'mode-2', silent: true };

async function checkRecovery() {
  saveFails = true;
  await assert.rejects(() => api.addCookHistory({ recipeId: 2, servings: 8, score: 5, remark: '原记录' }, options));
  const original = posts[posts.length - 1];
  assert.ok(/^[A-Za-z0-9_-]{1,64}$/.test(original.completionId));
  assert.strictEqual(pendingKeys().length, 1, '失败必须保留整份原请求');

  // 页面/小程序模块重开后复用持久化请求，包括原来的评分、备注和份数。
  delete require.cache[require.resolve('../utils/api')];
  api = require('../utils/api');
  saveFails = false;
  await api.addCookHistory({ recipeId: 2, servings: 2, score: 1, remark: '改过了' }, options);
  assert.deepStrictEqual(posts[posts.length - 1], original);
  assert.strictEqual(pendingKeys().length, 0, '确认成功后才清 pending');
  await api.addCookHistory({ recipeId: 2, servings: 8 }, options);
  assert.notStrictEqual(posts[posts.length - 1].completionId, original.completionId, '下一次真实做菜是新动作');

  saveFails = true;
  await assert.rejects(() => api.addCookHistory({ recipeId: 2, servings: 4, score: 4 }, options));
  const familyA = posts[posts.length - 1];
  identity = { userId: 7, familyId: 11 };
  await assert.rejects(() => api.addCookHistory({ recipeId: 2, servings: 6 }, options));
  assert.strictEqual(posts[posts.length - 1].servings, 6);
  assert.notStrictEqual(posts[posts.length - 1].completionId, familyA.completionId);
  identity = { userId: 8, familyId: 10 };
  await assert.rejects(() => api.addCookHistory({ recipeId: 2, servings: 3 }, options));
  assert.strictEqual(posts[posts.length - 1].servings, 3);
  assert.strictEqual(pendingKeys().length, 3, '账号和家庭各自隔离未确认动作');
  identity = { userId: 7, familyId: 10 };
  saveFails = false;
  await api.addCookHistory({ recipeId: 2, servings: 1 }, options);
  assert.deepStrictEqual(posts[posts.length - 1], familyA, '回原家庭恢复原动作');

  const before = posts.length;
  identityFails = true;
  await assert.rejects(() => api.addCookHistory({ recipeId: 2 }, options));
  identityFails = false;
  assert.strictEqual(posts.length, before, '身份无法确认时不能写入');
  const setStorage = wx.setStorageSync;
  wx.setStorageSync = () => { throw new Error('storage unavailable'); };
  await assert.rejects(() => api.addCookHistory({ recipeId: 2 }, options));
  wx.setStorageSync = setStorage;
  assert.strictEqual(posts.length, before, '不能保存恢复标识时不得先提交');

  const menu = { recipeId: 2, servings: 4, completionId: 'menu-9' };
  await api.addCookHistory(menu, { completionKey: 'menu-9', silent: true });
  await api.addCookHistory(menu, { completionKey: 'menu-9', silent: true });
  assert.deepStrictEqual(posts.slice(-2).map((p) => p.completionId), ['menu-9', 'menu-9'], '状态同步重试保持同一菜单完成标识');
}

async function checkPages() {
  const calls = { saves: [], menus: [], removed: [], toasts: [] };
  let save;
  let saveError = false;
  let menuError = false;
  api.addCookHistory = (payload, opts) => {
    calls.saves.push({ payload, opts });
    if (saveError) return Promise.reject(new Error('save failed'));
    return new Promise((resolve) => { save = resolve; });
  };
  api.updateMenuItemStatus = async (...args) => {
    calls.menus.push(args);
    if (menuError) throw new Error('status failed');
  };
  api.removeTodayMenuRecipe = async (...args) => { calls.removed.push(args); };
  let todayMenuItems = [], menuLoadFails = false;
  Object.assign(api, {
    getTodayMenu: async () => { if (menuLoadFails) throw new Error('offline'); return { items: todayMenuItems }; },
    getShoppingList: async () => ({ items: [] }),
    getWeeklyMenu: async () => ({ days: [] }),
    getPantryItems: async () => []
  });
  Object.assign(wx, {
    showModal: async () => ({ confirm: true }),
    showLoading() {}, hideLoading() {},
    showToast: (opts) => calls.toasts.push(opts.title)
  });
  const definitions = {};
  for (const name of ['menu', 'kitchen']) {
    global.Page = (definition) => { definitions[name] = definition; };
    require(name === 'menu' ? '../pages/menu/index' : '../pkg-extra/kitchen/index');
  }
  delete global.Page;

  for (const name of ['menu', 'kitchen']) {
    calls.saves.length = calls.menus.length = calls.toasts.length = 0;
    let refreshes = 0;
    const page = {
      ...definitions[name],
      data: structuredClone(definitions[name].data),
      loadData: async () => { refreshes++; },
      setData(patch) { Object.assign(this.data, patch); }
    };
    const raw = { itemId: 9, mealType: 'dinner', recipe: { id: 2, title: '测试菜', servings: 4 } };
    page._todayMenu = [raw];
    page.data.items = name === 'kitchen' ? [page.decorate(raw, '晚餐')] : [];
    storage.set('kitchen_timer_9', { running: true });
    const event = { currentTarget: { dataset: { id: 2, item: 9, index: 0 } } };
    const finish = page.markCooked(event);
    await page.markCooked(event);
    assert.strictEqual(calls.saves.length, 1, name + ': 在途连点只保存一次');
    assert.deepStrictEqual(calls.saves[0], {
      payload: { recipeId: 2, servings: 4, completionId: 'menu-9' },
      opts: { completionKey: 'menu-9' }
    });
    assert.strictEqual(calls.menus.length, 0, name + ': 保存确认前不能上桌');
    assert.strictEqual(refreshes, 0);
    assert.ok(storage.has('kitchen_timer_9'));
    save({ pantryDeducted: 2 });
    await finish;
    assert.deepStrictEqual(calls.menus, [[9, 'done']]);
    assert.strictEqual(refreshes, 1);
    if (name === 'kitchen') assert.ok(!storage.has('kitchen_timer_9'));

    calls.saves.length = calls.menus.length = calls.toasts.length = 0;
    storage.set('kitchen_timer_9', { running: true });
    refreshes = 0;
    saveError = true;
    await page.markCooked(event);
    saveError = false;
    assert.strictEqual(calls.menus.length, 0, name + ': 保存失败不写状态');
    assert.strictEqual(refreshes, 0);
    assert.ok(storage.has('kitchen_timer_9'));

    menuError = true;
    const partial = page.markCooked(event);
    await Promise.resolve();
    save({});
    await partial;
    menuError = false;
    assert.ok(calls.toasts.includes('已记录，上桌状态未同步，请重试'));
    assert.strictEqual(refreshes, 0);
    assert.ok(storage.has('kitchen_timer_9'));
    const retry = page.markCooked(event);
    await Promise.resolve();
    save({});
    await retry;
    assert.deepStrictEqual(calls.saves.slice(-2).map((s) => s.payload.completionId), ['menu-9', 'menu-9']);
    assert.strictEqual(refreshes, 1);
  }

  assert.ok(!Object.hasOwn(definitions.menu.data, 'todayMenu'));
  assert.ok(!Object.hasOwn(definitions.menu.data, '_todayMenu'));
  const menu = { ...definitions.menu, data: structuredClone(definitions.menu.data), setData(patch) {
    assert.ok(!Object.keys(patch).some(key => /^_?todayMenu(?:[.\[]|$)/.test(key)), '原始菜单不通过 setData 发送');
    Object.assign(this.data, patch);
  } };
  assert.strictEqual(menu.onShareAppMessage().title, '今天的菜单，来看看吗', '尚未加载时分享安全回退');
  todayMenuItems = [{ itemId: 9, mealType: 'dinner', recipe: { id: 2, title: '测试菜', servings: 4 } }];
  await menu.loadData();
  require('../utils/count-up').stopNumberAnim(menu);
  assert.deepStrictEqual(menu._todayMenu, todayMenuItems);
  assert.strictEqual(menu.data.mealGroups[0].items[0].recipe.servings, 4);
  assert.strictEqual(menu.onShareAppMessage().title, '今天家里吃这些（1 道）');
  menuLoadFails = true;
  const originalError = console.error;
  console.error = () => {};
  try { await menu.loadData(); } finally { console.error = originalError; }
  assert.strictEqual(menu.data.loadError, 'offline');
  assert.deepStrictEqual(menu._todayMenu, todayMenuItems, '刷新失败保留上次原始菜单');
  assert.strictEqual(menu.data.mealGroups.length, 1);
  menuLoadFails = false;
  todayMenuItems = [{ itemId: 10, recipeId: 7, mealType: 'dinner' }];
  await menu.loadData();
  require('../utils/count-up').stopNumberAnim(menu);
  assert.strictEqual(menu.data.mealGroups[0].items[0].dishImage, '/assets/dish-placeholder.svg', '无菜谱详情的菜单项给占位图，不借别的菜的照片');
  const imagePatches = [];
  menu.onImgError.call({ setData: patch => imagePatches.push(patch) }, { currentTarget: { dataset: { group: 0, dish: 0, seed: 7 } } });
  assert.deepStrictEqual(imagePatches, [{ 'mealGroups[0].items[0].dishImage': '/assets/dish-placeholder.svg' }], '坏图只替换目标项为包内占位，不再重试网络菜图');
  todayMenuItems = [];
  await menu.loadData();
  assert.deepStrictEqual(menu._todayMenu, []);
  assert.deepStrictEqual(menu.data.mealGroups, []);
  assert.strictEqual(menu.onShareAppMessage().title, '今天的菜单，来看看吗', '成功返回空菜单时不分享旧计数');
  menu.loadData = async () => {};
  await menu.removeItem({ currentTarget: { dataset: { id: 2, meal: 'dinner' } } });
  assert.deepStrictEqual(calls.removed, [[2, 'dinner']], '撤菜只撤当前餐次');
}

(async () => {
  await checkRecovery();
  await checkPages();
  console.log('cook-consistency.test: 恢复、身份分区、保存顺序与撤菜断言通过 ✔');
})().catch((err) => { console.error(err); process.exitCode = 1; });
