// node miniapp/test/form-guard.test.js · 真实组件/页面方法 + 最小 wx/API 替身，无网络。
// 覆盖第 3 轮交互修复里靠时序成立、坏了也不会报错的几条：
// 返回键防连点与离开确认、保存成功后不能再点出第二份、原数据没拉到时不许保存、离线心愿补发单飞。
const assert = require('node:assert/strict');
const api = require('../utils/api');
const { LEAVE_TEXT } = require('../utils/interaction');

const stubs = {};
['saveRecipe', 'updateRecipe', 'getRecipeDetail', 'getCurrentUser', 'getFamilyProfile',
  'updateProfile', 'updateMemberAvoidTags', 'addWish', 'addTodayMenuRecipe'].forEach((name) => {
  api[name] = (...args) => stubs[name](...args);   // 页面在 require 时解构 api，先换成可改的转发
});

const storage = new Map();
let modalAnswer = false;
const calls = { navBacks: 0, modals: [], enables: 0, disables: 0, saves: [], updates: [], profiles: [], wishes: [] };
global.getCurrentPages = () => [{}, {}];
global.wx = {
  getStorageSync: (k) => (storage.has(k) ? storage.get(k) : ''),
  setStorageSync: (k, v) => { storage.set(k, v); },
  showToast() {}, showLoading() {}, hideLoading() {}, pageScrollTo() {}, switchTab() {},
  navigateBack() { calls.navBacks += 1; },
  enableAlertBeforeUnload() { calls.enables += 1; },
  disableAlertBeforeUnload() { calls.disables += 1; },
  // 页面用 await、nav-bar 用回调，两种都给；结果异步到，和真机一样
  showModal(opts) {
    calls.modals.push(opts.title);
    const res = { confirm: modalAnswer, cancel: !modalAnswer };
    return new Promise((resolve) => setTimeout(() => {
      if (opts.success) opts.success(res);
      if (opts.complete) opts.complete(res);
      resolve(res);
    }, 0));
  }
};

let def;
global.Component = (d) => { def = d; };
require('../components/nav-bar/index');
const navDef = def;
global.Page = (d) => { def = d; };
require('../pkg-extra/recipe-edit/index');
const editDef = def;
require('../pkg-extra/me/profile-edit/index');
const profileDef = def;
require('../pages/home/index');
const homeDef = def;

function setPath(obj, path, value) {
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur = obj;
  keys.slice(0, -1).forEach((k, i) => { if (cur[k] == null) cur[k] = /^\d+$/.test(keys[i + 1]) ? [] : {}; cur = cur[k]; });
  cur[keys[keys.length - 1]] = value;
}
const makePage = (d) => Object.assign({}, d, {
  data: JSON.parse(JSON.stringify(d.data)),
  setData(patch, cb) { Object.keys(patch).forEach((k) => setPath(this.data, k, patch[k])); if (cb) cb(); }
});
const makeNav = (leaveConfirm) => Object.assign({}, navDef.methods, { data: { ...navDef.data, leaveConfirm }, triggerEvent() {} });
const flush = () => new Promise((r) => setTimeout(r, 0));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const input = (field, value) => ({ currentTarget: { dataset: { field } }, detail: { value } });
const leaveModals = () => calls.modals.filter((t) => t === LEAVE_TEXT).length;

(async () => {
  // nav-bar：没改动时连点只退一层；有改动时确认框开着再点不叠第二个，取消后能再点，确认才退
  {
    const n = makeNav(false);
    const before = calls.navBacks;
    n.onBack(); n.onBack();
    assert.equal(calls.navBacks - before, 1, '返回动画期间第二下不能再退一层');

    modalAnswer = false;
    const c = makeNav(true);
    const backs = calls.navBacks;
    c.onBack(); c.onBack();
    await flush();
    assert.equal(leaveModals(), 1, '确认框开着时再点不叠第二个');
    assert.equal(calls.navBacks, backs, '点了取消不退');
    c.onBack();
    await flush();
    assert.equal(leaveModals(), 2, '取消后锁要放开，能再点');

    modalAnswer = true;
    const disables = calls.disables;
    c.onBack();
    await flush();
    assert.equal(calls.navBacks, backs + 1, '确认放弃才退');
    assert.equal(calls.disables, disables + 1, '确认过就关掉系统拦截，免得 navigateBack 再弹一次');
  }
  // recipe-edit 新建：改了才拦返回、改回去就不拦；保存在途和成功之后都不能再点出第二份
  {
    const p = makePage(editDef);
    p.onLoad({});
    assert.equal(p.data.leaveDirty, false, '刚打开没改动，不拦返回');
    const enables = calls.enables;
    p.onInput(input('title', '番茄炒蛋'));
    assert.equal(p.data.leaveDirty, true, '改了菜名要拦返回');
    assert.equal(calls.enables, enables + 1, '同时开系统返回拦截');
    p.onInput(input('title', ''));
    assert.equal(p.data.leaveDirty, false, '改回原样就不拦');

    p.setData({ form: { ...p.data.form, title: '番茄炒蛋', cuisine: '家常', tasteTags: ['下饭'],
      ingredients: [{ name: '番茄', amount: '2', unit: '个' }], steps: [{ text: '炒', image: '' }] } });
    p.syncLeave();
    let finish;
    stubs.saveRecipe = (payload) => { calls.saves.push(payload); return new Promise((r) => { finish = r; }); };
    const first = p.submit();
    await p.submit();
    assert.equal(calls.saves.length, 1, '保存在途时再点不发第二次');
    finish({ id: 7 });
    await first;
    assert.equal(p.data.saving, true, '成功后不复位 saving，返回前这 600ms 也点不出第二份');
    assert.equal(p.data.leaveDirty, false, '存好了就撤掉离开确认，否则代码里的返回也会被拦');
    await p.submit();
    assert.equal(calls.saves.length, 1, '成功后再点也不再存');
    const backs = calls.navBacks;
    p.onUnload();
    await sleep(700);
    assert.equal(calls.navBacks, backs, '页面先卸载了，返回计时器要被清掉，不能在上一页再退一层');
  }
  // recipe-edit 编辑：原菜谱没拉到时不许保存（空表单 PUT 会整条覆盖），也不拦返回；重试成功后恢复
  {
    stubs.getRecipeDetail = () => Promise.reject(new Error('offline'));
    stubs.updateRecipe = (id, payload) => { calls.updates.push(payload); return Promise.resolve({ id }); };
    const p = makePage(editDef);
    p.onLoad({ id: '5' });
    await flush();
    assert.equal(p.data.loadFailed, true);
    p.onInput(input('title', '随便写'));
    assert.equal(p.data.leaveDirty, false, '没有原菜谱可比，不拦返回');
    modalAnswer = false;
    await p.submit();
    assert.equal(calls.updates.length, 0, '原菜谱没加载出来不能保存');
    stubs.getRecipeDetail = () => Promise.resolve({ id: 5, title: '红烧肉', cuisine: '家常', tasteTags: ['下饭'],
      ingredients: [{ name: '五花肉', amount: '500', unit: '克' }], steps: [{ text: '焯水' }] });
    p.retryLoad();
    await flush();
    assert.equal(p.data.loadFailed, false);
    assert.equal(p.data.form.title, '红烧肉');
    assert.equal(p.data.leaveDirty, false, '重新加载回来是原样，不拦返回');
  }
  // profile-edit：原资料没拉到时保存会用默认值清空头像/生日/口味，必须拦住；成功保存不能连存两次
  {
    stubs.getCurrentUser = () => Promise.reject(new Error('offline'));
    stubs.updateProfile = (payload) => { calls.profiles.push(payload); return Promise.resolve({ userId: 1 }); };
    stubs.updateMemberAvoidTags = () => Promise.resolve();
    const p = makePage(profileDef);
    p.onLoad();
    await flush();
    assert.equal(p.data.loadFailed, true);
    p.setData({ 'form.nickname': '妈妈' });
    modalAnswer = false;
    await p.onSave();
    assert.equal(calls.profiles.length, 0, '原资料没加载出来不能保存');

    stubs.getCurrentUser = () => Promise.resolve({ userId: 1, nickname: '妈妈', avatarUrl: 'https://x/a.jpg', tasteTags: ['微辣'] });
    stubs.getFamilyProfile = () => Promise.resolve({ members: [{ userId: 1, avoidTags: [] }] });
    p.retryLoad();
    await sleep(5);
    assert.equal(p.data.loadFailed, false);
    p.onNickname({ detail: { value: '老妈' } });
    assert.equal(p.data.leaveDirty, true, '改了昵称要拦返回');
    const first = p.onSave();
    await p.onSave();
    await first;
    assert.equal(calls.profiles.length, 1, '保存只发一次');
    assert.equal(calls.profiles[0].avatarUrl, 'https://x/a.jpg', '原头像原样带回');
    assert.equal(p.data.saving, true, '成功后不复位 saving');
    assert.equal(p.data.leaveDirty, false);
    p.onUnload();
  }
  // 首页点菜：失败不亮「已点」，成功后即使清单刷新尚未完成也不能再 POST。
  {
    const h = makePage(homeDef);
    const e = { currentTarget: { dataset: { id: 7 } } };
    let writes = 0, refreshes = 0, finish;
    h._inited = true;
    h.refreshLight = () => { refreshes++; };
    stubs.addTodayMenuRecipe = async () => { writes++; throw new Error('offline'); };
    await h.addToToday(e);
    assert.equal(h.data.pickedRecipeIds[7], undefined, '失败保留可重试状态');
    assert.equal(refreshes, 0);
    stubs.addTodayMenuRecipe = () => { writes++; return new Promise(resolve => { finish = resolve; }); };
    const first = h.addToToday(e);
    await h.addToToday(e);
    assert.equal(writes, 2, '在途连点只发一次');
    assert.equal(h.data.pickedRecipeIds[7], undefined, '未确认成功不提前勾选');
    finish(); // API 成功无返回体也要显示已点。
    await first;
    assert.equal(h.data.pickedRecipeIds[7], true);
    assert.equal(refreshes, 1);
    h.refreshWishes = () => {};
    h.selectSlot({ currentTarget: { dataset: { slot: 'lunch' } } });
    assert.equal(h.data.pickedRecipeIds[7], true, '清单刷新未回时切餐次，仍保留已确认的点菜');
    await h.addToToday({ detail: { id: '7' } });
    assert.equal(writes, 2, '成功后的第二下不会因旧 todayMenu 再次提交');
    h.setData(h._slotMenuPatch([]));
    assert.deepEqual(h.data.pickedRecipeIds, {}, '重新同步空菜单后可重新点菜');
  }
  // 首页离线心愿补发：冷启动 onLoad 和 onShow 同时进来，同一批只能发一次（family_wish 没有唯一键）
  {
    storage.set('wish_pending_v1', [{ id: 'w1', date: '2026-11-06', slot: 'dinner', text: '想吃饺子' }]);
    let done;
    stubs.addWish = (w) => { calls.wishes.push(w); return new Promise((r) => { done = r; }); };
    const h = makePage(homeDef);
    const a = h.flushPendingWishes('2026-11-06', 'dinner');
    const b = h.flushPendingWishes('2026-11-06', 'dinner');
    assert.equal(calls.wishes.length, 1, '同一批离线心愿只能补发一次');
    done({});
    await Promise.all([a, b]);
    assert.deepEqual(storage.get('wish_pending_v1'), [], '补发成功后出队');
    await h.flushPendingWishes('2026-11-06', 'dinner');
    assert.equal(calls.wishes.length, 1, '队列空了不再发');
  }
  console.log('form-guard.test: 返回防连点、离开确认、保存防重、原数据缺失拦截、心愿补发单飞断言通过 ✔');
})().catch((err) => { console.error(err); process.exit(1); });
