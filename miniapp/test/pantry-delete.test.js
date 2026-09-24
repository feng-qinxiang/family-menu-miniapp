// pantry-delete.test · deletePantryItem 的 404 语义（零依赖，node 直跑）
//
// 后端 2026-09-23 起：DELETE 影响 0 行返回 404（重复删同一条 / 两端同时删 / 删别人家的）。
// 这条口径错了的表现是：用户连点两次删除，第二次明明已经删掉了，却闪一句「删除失败」。
// 断言三层：200 正常删；404 视为已删除且不弹任何提示；真失败（500）照旧抛给调用方。
const assert = require('assert');

// —— 最小 wx 桩：只实现 utils/api.js 走到的那几个接口 ——
const calls = [];
const toasts = [];
let next = { statusCode: 200, data: null };
global.wx = {
  request(opts) {
    calls.push(opts);
    opts.success({ statusCode: next.statusCode, data: next.data });
  },
  getStorageSync(key) { return key === 'auth_token' ? 'tok' : ''; },
  setStorageSync() {},
  removeStorageSync() {},
  getAccountInfoSync() { return { miniProgram: { envVersion: 'develop' } }; },
  showToast(o) { toasts.push((o && o.title) || ''); },
};

const api = require('../utils/api');

(async () => {
  // ① 正常删除：200 → resolve，且真的发到 /api/pantry/{id}
  next = { statusCode: 200, data: null };
  assert.strictEqual(await api.deletePantryItem(11), null);
  assert.strictEqual(calls[0].method, 'DELETE');
  assert.ok(calls[0].url.endsWith('/api/pantry/11'), `DELETE 路径不对：${calls[0].url}`);
  assert.deepStrictEqual(toasts, [], '正常删除不该弹提示');

  // ② 竞态删除：第二次拿到 404 → 仍按成功返回，且不能弹服务端文案
  toasts.length = 0;
  next = { statusCode: 404, data: { message: '库存条目不存在' } };
  await api.deletePantryItem(11); // reject 就失败（调用方会闪「删除失败」）
  assert.deepStrictEqual(toasts, [], '404 是「已经删掉了」，不该弹任何提示');

  // ③ 真失败照旧抛出，status 保留给调用方/调试
  next = { statusCode: 500, data: { message: '服务器开小差了' } };
  await assert.rejects(() => api.deletePantryItem(11), (err) => err.status === 500);

  // ④ 断网（status 0）同样是失败，不能被 404 分支吞掉
  global.wx.request = (opts) => { calls.push(opts); opts.fail({ errMsg: 'request:fail' }); };
  await assert.rejects(() => api.deletePantryItem(11), (err) => err.status === 0);

  console.log('pantry-delete.test: 全部断言通过 ✔');
})().catch((err) => {
  console.error('pantry-delete.test 失败:', err && err.message);
  process.exit(1);
});
