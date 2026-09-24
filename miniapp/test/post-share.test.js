// post-share.test · 「晒一晒」跨 tab 交接的两条契约（零依赖，node 直跑）
//
// 这个模块只干一件事：把「晒哪道菜」从做菜页交给社区 tab（tab 页 switchTab 带不了 query，
// 只能用一次性 storage 交接）。所以它只有两条契约，两条都靠读写顺序成立：
//   ① 取一次就撕（takePendingRecipe）——社区页 onShow 会反复触发
//      （从帖子详情返回、切 tab 回来都算），不撕掉就会反复弹出发帖层；
//   ② **跳转失败也要撕**（composePostWithRecipe 的 fail 分支）——留下的单子会在用户
//      下次自己点开社区 tab 时凭空弹出发帖层，还带着一道他早不记得的菜。
// wx 是外部依赖：这里手搓最小 storage + switchTab 桩，只为把这两条钉住。
const assert = require('assert');

const store = {};
let switchTabResult = 'ok';   // ok | fail | throw
let switchTabCalls = 0;

global.wx = {
  setStorageSync(k, v) {
    if (switchTabResult === 'storage-throw') throw new Error('storage full');
    store[k] = v;
  },
  getStorageSync(k) { return store[k]; },
  removeStorageSync(k) { delete store[k]; },
  switchTab(opts) {
    switchTabCalls += 1;
    if (switchTabResult === 'fail') { opts.fail && opts.fail({ errMsg: 'switchTab:fail' }); return; }
    opts.success && opts.success();
  }
};

const { composePostWithRecipe, takePendingRecipe } = require('../utils/post-share');
const PENDING_KEY = 'pending_post_recipe';

function seedPending() {
  store[PENDING_KEY] = { recipeId: 2, title: '红烧肉' };
}

(async () => {
  // ① 取一次就撕：第二次必须拿不到，storage 也必须空了
  seedPending();
  const first = takePendingRecipe();
  assert.deepStrictEqual(first, { recipeId: 2, title: '红烧肉' }, '交接单没取出来');
  assert.strictEqual(store[PENDING_KEY], undefined, '取完没撕掉：社区页每次 onShow 都会再弹一次发帖层');
  assert.strictEqual(takePendingRecipe(), null, '同一张单子被取了两次');

  // 空/脏数据不出事（storage 里可能是别的版本写进去的形状）
  store[PENDING_KEY] = { title: '没 id' };
  assert.strictEqual(takePendingRecipe(), null, '没有 recipeId 的单子不该当成交接');
  assert.strictEqual(store[PENDING_KEY], undefined, '脏单子也要撕掉，否则永远卡在那里');
  store[PENDING_KEY] = '脏值';
  assert.strictEqual(takePendingRecipe(), null, 'storage 里是脏值也不该炸');

  // ② 跳转成功：单子留着（由社区页取走），并把菜带过去
  switchTabResult = 'ok';
  switchTabCalls = 0;
  await composePostWithRecipe(2, '红烧肉');
  assert.strictEqual(switchTabCalls, 1, '没跳社区 tab');
  assert.deepStrictEqual(store[PENDING_KEY], { recipeId: 2, title: '红烧肉' }, '跳成功了却没把菜交接过去');

  // ③ 跳转失败：必须当场撕单，否则下次自己点开社区会凭空弹发帖层
  switchTabResult = 'fail';
  let rejected = null;
  await composePostWithRecipe(2, '红烧肉').catch((err) => { rejected = err; });
  assert.ok(rejected, '跳转失败时 composePostWithRecipe 没有 reject（调用方就没法提示了）');
  assert.strictEqual(store[PENDING_KEY], undefined, '跳转失败却留着交接单：下次进社区会弹出一道早不记得的菜');

  // ④ 没有 recipeId / 写 storage 就炸：直接 reject，别写也别跳
  switchTabResult = 'ok';
  switchTabCalls = 0;
  await composePostWithRecipe(0, '没这道菜').catch(() => {});
  assert.strictEqual(switchTabCalls, 0, '没有 recipeId 时不该跳（过去等于空手发帖）');
  assert.strictEqual(store[PENDING_KEY], undefined, '没有 recipeId 却写了交接单');

  switchTabResult = 'storage-throw';
  const threw = await composePostWithRecipe(2, '红烧肉').then(() => null, (err) => err);
  assert.ok(threw, 'storage 写不进去时要 reject');
  assert.strictEqual(switchTabCalls, 0, 'storage 写不进去就不该跳');

  // ⑤ COMMUNITY 关闭（个人主体）：所有「晒一晒」动线唯一的出口必须当场拒绝。
  //    社区 tab 此时根本不存在（tabs.js 会摘掉），跳过去等于把用户送进空白页；
  //    交接单也不能写，否则下次自己点开社区会凭空弹出发帖层。
  const features = require('../utils/features');
  features.COMMUNITY = false;
  switchTabResult = 'ok';
  switchTabCalls = 0;
  const offErr = await composePostWithRecipe(2, '红烧肉').then(() => null, (err) => err);
  assert.ok(offErr, 'COMMUNITY 关闭时 composePostWithRecipe 没有 reject');
  assert.strictEqual(switchTabCalls, 0, 'COMMUNITY 关闭时还跳了社区 tab');
  assert.strictEqual(store[PENDING_KEY], undefined, 'COMMUNITY 关闭时还写了交接单');
  features.COMMUNITY = true;

  console.log('post-share.test: 全部断言通过 ✔');
})();
