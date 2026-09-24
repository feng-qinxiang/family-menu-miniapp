// node miniapp/test/cook-finish.test.js · 真实 Page 方法 + 最小 wx/API 替身，无网络/数据库写入。
const assert = require('assert');
const api = require('../utils/api');
let definition;
global.Page = (page) => { definition = page; };
require('../pkg-extra/cook-mode/index');
delete global.Page;

function setup() {
  const calls = { sheets: [], saves: [], menus: [], redirects: [], toasts: [] };
  const storage = new Map([
    ['cook_progress_2', { i: 1, total: 2 }],
    ['cook_timers_2', { 1: { total: 60, baseLeft: 60, running: false } }]
  ]);
  global.wx = {
    showActionSheet: (opts) => calls.sheets.push(opts),
    removeStorageSync: (key) => storage.delete(key),
    showToast: (opts) => calls.toasts.push(opts.title),
    redirectTo: (opts) => { calls.redirects.push(opts.url); opts.fail(); }
  };
  api.addCookHistory = async (payload) => { calls.saves.push(payload); return { pantryDeducted: 2 }; };
  api.updateMenuItemStatus = async (...args) => { calls.menus.push(args); };
  const page = {
    ...definition,
    data: { ...structuredClone(definition.data), recipeId: '2', recipe: { title: '红烧肉' }, current: 1, total: 2 },
    _menuItemId: '9',
    _slots: { 1: { total: 60, baseAt: Date.now(), baseLeft: 60, running: true } },
    setData(patch) { Object.assign(this.data, patch); }
  };
  return { page, calls, storage };
}

(async () => {
  // 评分面板打开、请求未回包期间，连续点完成都只保存一次；成功后跳转失败也不再写入。
  {
    const { page, calls, storage } = setup();
    let completeSave;
    api.addCookHistory = (payload) => {
      calls.saves.push(payload);
      return new Promise((resolve) => { completeSave = resolve; });
    };
    const finish = page.onFinish();
    await page.onFinish();
    assert.strictEqual(calls.sheets.length, 1, '连点不能开第二个评分面板');
    assert.strictEqual(page.data.finishing, true);
    assert.strictEqual(storage.size, 2, '评分前不能先清续做状态');
    assert.strictEqual(calls.menus.length, 0, '记录保存前不能先上桌');
    calls.sheets[0].success({ tapIndex: 1 });
    await Promise.resolve();
    await page.onFinish();
    assert.strictEqual(calls.saves.length, 1, '请求在途时不能再提交');
    completeSave({ pantryDeducted: 2 });
    await finish;
    assert.deepStrictEqual(calls.saves, [{ recipeId: '2', remark: '', score: 4 }]);
    assert.deepStrictEqual(calls.menus, [['9', 'done']]);
    assert.strictEqual(storage.size, 0, '保存成功才清状态');
    assert.strictEqual(page.data.finished, true);
    assert.strictEqual(page.data.finishing, false);
    assert.strictEqual(page.data.running, false, '跳转失败留在原页时计时显示也必须清掉');
    assert.ok(calls.toasts.includes('已记录 · 冰箱扣了 2 项'));
    assert.ok(calls.redirects[0].startsWith('/pkg-extra/cook-log/index?recipeId=2'));
    page.gotoStep(0);
    assert.strictEqual(page.data.current, 1, '已完成时不再写回续做进度');
    await page.onFinish();
    assert.strictEqual(calls.redirects.length, 2, '跳转失败可以重试查看记录');
    assert.strictEqual(calls.saves.length, 1, '跳转失败后的点击不能再次扣库存');
    assert.strictEqual(calls.sheets.length, 1);
  }

  // 明确保存失败：留在本页、不清进度/计时、不标记上桌，并释放在途锁。
  {
    const { page, calls, storage } = setup();
    api.addCookHistory = async () => { throw new Error('save rejected'); };
    const finish = page.onFinish();
    calls.sheets[0].fail({ errMsg: 'showActionSheet:fail cancel' });
    await finish;
    assert.strictEqual(storage.size, 2);
    assert.strictEqual(page._slots[1].running, true);
    assert.strictEqual(page.data.finished, false);
    assert.strictEqual(page.data.finishing, false);
    assert.strictEqual(calls.menus.length, 0);
    assert.strictEqual(calls.redirects.length, 0);
    assert.ok(calls.toasts.includes('保存未确认，请先查看做菜记录'));
    api.addCookHistory = async (payload) => { calls.saves.push(payload); return {}; };
    const retry = page.onFinish();
    assert.strictEqual(calls.sheets.length, 2, '保存失败后不能永久锁死');
    calls.sheets[1].success({ tapIndex: 3 });
    await retry;
    assert.deepStrictEqual(calls.saves, [{ recipeId: '2', remark: '' }], '先不评分不应伪造星级');
  }

  // 取消评分仍按原约定记录一次；菜单状态失败不把成功的历史记录当作失败重试。
  {
    const { page, calls } = setup();
    api.updateMenuItemStatus = async () => { throw new Error('menu unavailable'); };
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args);
    try {
      const finish = page.onFinish();
      calls.sheets[0].fail({ errMsg: 'showActionSheet:fail cancel' });
      await finish;
    } finally {
      console.warn = originalWarn;
    }
    assert.strictEqual(warnings.length, 1, '菜单同步失败须留日志');
    assert.deepStrictEqual(calls.saves, [{ recipeId: '2', remark: '' }]);
    assert.ok(calls.toasts.includes('已记录，上桌状态未同步'));
    assert.strictEqual(page.data.finished, true);
    await page.onFinish();
    assert.strictEqual(calls.saves.length, 1, '菜单同步失败不能再次写做菜记录');
  }

  console.log('cook-finish.test: 全部断言通过 ✔');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
