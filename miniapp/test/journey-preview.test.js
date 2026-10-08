// Run the actual preview Page: ordering -> cooking -> record -> community -> ordering.
const assert = require('node:assert/strict');
let definition;
global.Page = (page) => { definition = page; };
global.wx = {
  getStorageSync() { return 'normal'; },
  getMenuButtonBoundingClientRect() { return { left: 280, top: 24, bottom: 56 }; },
  getWindowInfo() { return { windowWidth: 375 }; },
  pageScrollTo() {}, showToast() {},
  request() { throw new Error('A design preview must not call live APIs'); },
  setStorageSync() { throw new Error('A design preview must not change saved user data'); }
};
require('../pkg-preview/journey/index');
const createPage = (options) => {
  const p = Object.assign({}, definition, { data: structuredClone(definition.data), setData(patch) { Object.assign(this.data, patch); } });
  p.onLoad(options); return p;
};
const event = (dataset) => ({ currentTarget: { dataset } });

for (const design of ['a', 'b', 'c']) {
  const p = createPage({ design });
  assert.equal(p.data.design, design);
  assert.deepEqual(p.data.tabs.map((t) => t.label), ['点菜', '做菜', '记录', '社区', '我的']);
  p.pickRecipe(event({ id: 'potato' })); p.pickRecipe(event({ id: 'potato' }));
  assert.equal(p.data.orders.length, 4, 'Repeated taps must not add the same dish twice');
  p.selectMeal(event({ meal: 'lunch' }));
  assert.equal(p.data.orders.length, 1, 'A different meal keeps its own order');
  p.pickRecipe(event({ id: 'potato' }));
  p.selectMeal(event({ meal: 'dinner' }));
  assert.equal(p.data.orders.length, 4);
  p.startCook();
  assert.equal(p.data.view, 'cook');
  assert.equal(p.data.activeId, 'pork');
  for (let i = 0; i < 4; i += 1) p.nextStep();
  assert.equal(p.data.sheet, 'record');
  assert.equal(p.data.history.length, 3, 'Finishing steps does not record before confirmation');
  p.setRating(event({ rating: 4 })); p.inputRemark({ detail: { value: '下次少放一点糖。' } });
  p.saveRecord(); p.saveRecord();
  assert.equal(p.data.view, 'record');
  assert.equal(p.data.history.length, 4, 'Repeated confirmation creates one record');
  assert.equal(p.data.latest.title, '红烧肉');
  assert.equal(p.data.latest.score, 4); assert.equal(p.data.latest.remark, '下次少放一点糖。');
  assert.equal(p.data.doneCount, 1);
  p.shareRecord(event({ id: p.data.latest.id }));
  assert.equal(p.data.sheet, 'share');
  p.publishPost(); p.publishPost();
  assert.equal(p.data.view, 'community'); assert.equal(p.data.posts.length, 4);
  assert.equal(p.data.posts[0].recipe.id, 'pork');
  const postId = p.data.posts[0].id;
  p.likePost(event({ id: postId })); p.likePost(event({ id: postId }));
  assert.equal(p.data.posts[0].likes, 0);
  p.orderPost(event({ id: 'shrimp' }));
  assert.equal(p.data.view, 'order'); assert.equal(p.data.orders.length, 5);
  p.selectDesign(event({ design: 'b' }));
  assert.equal(p.data.doneCount, 1, 'Comparing designs must preserve the scenario');
  p.selectMeal(event({ meal: 'breakfast' })); p.startCook();
  assert.equal(p.data.view, 'order', 'An empty meal sends the user to ordering');
  p.onUnload();
}

// Hidden/background pages stop rendering the timer, and resume from elapsed wall time.
{
  const p = createPage({}); p.startCook();
  const originalNow = Date.now; let now = originalNow(); Date.now = () => now;
  try {
    p.toggleTimer(); p.onHide();
    assert.equal(p._tick, null);
    now += 61000; p.onShow(); p.onHide();
    assert.equal(p.data.timerLabel, '03:59');
    p.toggleTimer(); p.onHide();
    now += 10000; p.syncTimer();
    assert.equal(p.data.timerLabel, '03:59', 'Paused timers do not consume time');
    p.selectMeal(event({ meal: 'lunch' }));
    assert.equal(p.data.timerRunning, false, 'A timer from dinner must not appear in lunch');
  } finally { Date.now = originalNow; p.onUnload(); }
}

delete global.Page; delete global.wx;
console.log('journey-preview.test ok: three designs, four-stage flow, meal isolation, duplicate clicks, timer lifecycle');
