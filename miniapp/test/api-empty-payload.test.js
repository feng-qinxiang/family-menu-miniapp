// api-empty-payload.test · 「2xx 但 body 为空」在共享层的口径（零依赖，node 直跑）
//
// 背景：帖子详情曾经拿到 200 + 空 body，页面只能自己猜，把它渲染成「帖子不存在或已删除」——
// 用户什么都没做错却被告知内容没了（`74b-post-detail-report.png`）。后端把那条路改成了 404，
// 这里钉住客户端这一半：读接口（GET）的空 body 必须在 utils/api.js 里变成带文案的失败。
// 同时钉住不许误伤的两类：列表接口返回空数组是合法的；写/删接口返回空 body 是常态。
const assert = require('assert');

const calls = [];
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
  showToast() {},
};

const api = require('../utils/api');

(async () => {
  // ① 详情类读接口：200 + 空 body → 必须 reject 且带可展示文案（不能再静默返回空）
  next = { statusCode: 200, data: '' };
  await assert.rejects(
    () => api.getCommunityPost(7),
    (err) => err.message === '数据异常，请重试',
    '200 空 body 必须变成带文案的失败'
  );

  // ② 列表类读接口：空数组是合法结果，不能被当成异常
  next = { statusCode: 200, data: [] };
  assert.deepStrictEqual(await api.getPantryItems(), [], '空列表不是异常');
  next = { statusCode: 200, data: {} };
  assert.deepStrictEqual(await api.getCommunityPost(7), {}, '空对象也不是异常');

  // ③ 写/删接口：200 + 空 body 是常态，必须照旧 resolve
  next = { statusCode: 200, data: '' };
  assert.strictEqual(await api.deleteCommunityPost(7), '');
  assert.strictEqual(calls[calls.length - 1].method, 'DELETE');

  // ④ 声明了 fallback 的读接口（getCurrentUser）保留「失败=默认值」，不抛给调用方
  next = { statusCode: 200, data: '' };
  assert.strictEqual(await api.getCurrentUser(), null, 'fallback 优先于新口径');

  console.log('api-empty-payload.test: 全部断言通过 ✔');
})().catch((err) => {
  console.error('api-empty-payload.test 失败:', err && err.message);
  process.exit(1);
});
