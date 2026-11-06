// node miniapp/test/ui-followup.test.js：真实 Page 方法，微信授权与业务 API 使用替身。
const assert = require('node:assert/strict');
const api = require('../utils/api');
const originalApi = { ...api };
let definition, accepted = false, updateFails = false, commentsFail = true;
let requested = 0, writes = 0, modalCount = 0;
let setting = { available: true, enabled: false, templates: { wish: 'wish-template' } };
const recipes = [
  { id: 1, title: '米饭', cuisine: '主食', sourceType: 'owned', mine: true, timeCost: 20, servings: 2 },
  { id: 2, title: '炒饭', cuisine: '主食', sourceType: 'community', timeCost: 15, servings: 2 },
  { id: 3, title: '回锅肉', cuisine: '川菜', sourceType: 'owned', mine: true, timeCost: 25, servings: 2 }
];
Object.assign(api, {
  getRecipes: async () => recipes,
  getTodayMenu: async () => ({ items: [] }),
  getShoppingList: async () => [],
  getFamilyProfile: async () => ({ members: [] }),
  getSubscribeSetting: async () => setting,
  updateSubscribe: async enabled => { if (updateFails) throw new Error('offline'); writes++; setting = { ...setting, enabled }; return setting; },
  getNotifications: async () => ({ items: [{ id: 1, kind: 'pantry', actionType: 'pantry', title: '临期提醒', unread: true, group: 'today' }] }),
  getCommunityPost: async () => ({ id: 1, title: '晚饭', content: '家里的味道', images: [] }),
  getCommunityComments: async () => { if (commentsFail) throw new Error('offline'); return [{ commentId: 1, author: '家人', content: '好吃' }]; }
});
global.wx = {
  getStorageSync: () => '', setStorageSync() {}, showToast() {},
  showModal() { modalCount++; },
  requestSubscribeMessage(options) {
    requested++;
    assert.ok(options.tmplIds.length <= 3);
    options.success(Object.fromEntries(options.tmplIds.map(id => [id, accepted ? 'accept' : 'reject'])));
  }
};
global.Page = page => { definition = page; };
function page(file) {
  require(file);
  return { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch, cb) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.'); let target = this.data;
      while (parts.length > 1) target = target[parts.shift()];
      target[parts[0]] = value;
    }
    if (cb) cb();
  } };
}
const event = dataset => ({ currentTarget: { dataset } });
const settled = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  try {
    const recipePage = page('../pages/recipes/index');
    await recipePage.loadRecipes();
    assert.ok(recipePage.data.cuisineList.includes('主食'), '真实自定义菜系也可选择');
    recipePage.selectSource(event({ source: 'owned' }));
    recipePage.setFilterCuisine(event({ val: '主食' }));
    assert.deepEqual(recipePage._filteredRecipes.map(r => r.id), [1], '菜系和来源同时生效');
    recipePage.selectRailMode(event({ mode: 'source' }));
    assert.equal(recipePage.data.advFilter.cuisine, '主食', '切换左侧分类保留另一维条件');
    recipePage.selectSource(event({ source: 'community' }));
    assert.deepEqual(recipePage._filteredRecipes.map(r => r.id), [2]);
    let reloads = 0;
    recipePage.loadRecipes = async () => { reloads++; };
    recipePage.clearFilter();
    assert.equal(reloads, 0, '清空本地来源筛选不重拉完整列表');
    assert.equal(recipePage._filteredRecipes.length, 3);
    recipePage.setData({ activeSource: 'favorites' });
    recipePage.clearFilter();
    assert.equal(reloads, 1, '离开收藏仍重新获取完整列表');

    const pantry = page('../pages/pantry/index');
    await pantry.loadReminderSetting();
    await pantry.subscribeReminder();
    assert.equal(requested, 0, '没有临期模板不会拿其他模板冒充');
    assert.equal(modalCount, 1);
    setting = { ...setting, templates: { wish: 'wish-template', meal: 'meal-template', pantry: 'pantry-template' } };
    await pantry.loadReminderSetting();
    const rejected = pantry.subscribeReminder();
    assert.equal(requested, 1, '授权同步发起，前面没有网络等待');
    await rejected;
    assert.equal(writes, 0, '拒绝授权不打开通知开关');
    accepted = true;
    await pantry.subscribeReminder();
    assert.equal(writes, 1);
    assert.equal(pantry.data.reminderSubscribed, true, '显示一次订阅，不声称持续有配额');
    pantry.setData({ reminderSubscribed: false });
    updateFails = true;
    await pantry.subscribeReminder();
    assert.equal(pantry.data.reminderSubscribed, false, '保存失败不显示订阅设置成功');
    assert.equal(pantry.data.reminderBusy, false);
    updateFails = false;
    const subscribe = require('../utils/subscribe');
    const before = requested;
    const grant = subscribe.apply('all', true);
    assert.equal(requested, before + 1);
    assert.equal(await grant, true);

    const notifications = page('../pkg-extra/me/notifications/index');
    notifications.loadData(); await settled();
    assert.equal(notifications.data.all[0].action.label, '查看冰箱');
    notifications.setData({ activeTab: 'family' }); notifications.recompute();
    assert.equal(notifications.data.visibleCount, 1, '临期消息归到家庭');

    const detail = page('../pkg-extra/community/post-detail/index');
    detail.setData({ postId: '1' });
    detail.loadAll('1'); await settled();
    assert.equal(detail.data.commentsError, true);
    assert.equal(detail.data.loadError, false, '评论失败保留帖子正文');
    commentsFail = false;
    await detail.retryComments();
    assert.equal(detail.data.commentsError, false);
    assert.equal(detail.data.comments.length, 1);
    detail.goComments();
    assert.equal(detail.data.scrollIntoView, 'post-comments');
    detail.backToTop();
    assert.equal(detail.data.scrollIntoView, '', '评论定位不能阻止回到顶部');
    detail.onPhotoChange({ detail: { current: 2 } });
    assert.equal(detail.data.photoIndex, 2);

    const { chooseImage } = require('../utils/upload');
    wx.chooseMedia = options => { assert.deepEqual(options.sourceType, ['camera']); options.success({ tempFiles: [{ tempFilePath: '/temporary/photo.jpg' }] }); };
    assert.deepEqual(await chooseImage(1, ['camera']), ['/temporary/photo.jpg']);
    console.log('ui-followup.test ok: crossed cuisine/source filters, camera source, exact pantry authorization, failure retention, notification route and comment retry');
  } finally {
    Object.assign(api, originalApi); delete global.wx; delete global.Page;
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
