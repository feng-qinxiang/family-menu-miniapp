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
let recipeResult = recipes, recipesFail = false, notificationsFail = false, readFails = false;
let notificationItems = [{ id: 1, kind: 'pantry', actionType: 'pantry', title: '临期提醒', unread: true, group: 'today' }];
const readCalls = [], routes = [];
Object.assign(api, {
  getRecipes: async () => { if (recipesFail) throw new Error('offline'); return recipeResult; },
  getTodayMenu: async () => ({ items: [] }),
  getShoppingList: async () => [],
  getFamilyProfile: async () => ({ members: [] }),
  getSubscribeSetting: async () => setting,
  updateSubscribe: async enabled => { if (updateFails) throw new Error('offline'); writes++; setting = { ...setting, enabled }; return setting; },
  getNotifications: async () => { if (notificationsFail) throw new Error('offline'); return { items: notificationItems }; },
  markNotificationsRead: async ids => {
    readCalls.push(ids);
    if (readFails) throw new Error('offline');
    notificationItems = notificationItems.map(item => !ids.length || ids.includes(item.id) ? { ...item, unread: false } : item);
  },
  getCommunityPost: async () => ({ id: 1, title: '晚饭', content: '家里的味道', images: [] }),
  getCommunityComments: async () => { if (commentsFail) throw new Error('offline'); return [{ commentId: 1, author: '家人', content: '好吃' }]; }
});
global.wx = {
  getStorageSync: () => '', setStorageSync() {}, showToast() {},
  navigateTo: options => routes.push(options.url),
  showModal() { modalCount++; },
  requestSubscribeMessage(options) {
    requested++;
    assert.ok(options.tmplIds.length <= 3);
    options.success(Object.fromEntries(options.tmplIds.map(id => [id, accepted ? 'accept' : 'reject'])));
  }
};
global.Page = page => { definition = page; };
function page(file, privateFields = []) {
  require(file);
  assert.ok(Object.keys(definition.data).every(key => !privateFields.includes(key.replace(/^_/, ''))), '原始列表不放进 data 默认值');
  return { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch, cb) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.'); let target = this.data;
      assert.ok(!privateFields.includes(parts[0].replace(/^_/, '')), 'setData 只发送展示数据，不发送原始列表');
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

    const notifications = page('../pkg-extra/me/notifications/index', ['all']);
    notifications.recompute();
    assert.equal(notifications.data.visibleCount, 0, '初次加载前按空列表处理');
    notifications.loadData(); await settled();
    assert.equal(notifications._all[0].action.label, '查看冰箱');
    notifications.setData({ activeTab: 'family' }); notifications.recompute();
    assert.equal(notifications.data.visibleCount, 1, '临期消息归到家庭');
    notifications.onTabChange(event({ key: 'system' }));
    assert.equal(notifications.data.visibleCount, 0);
    assert.equal(notifications.data.unreadCount, 1, '空筛选不影响全量未读数');
    notifications.onTabChange(event({ key: 'family' }));
    readFails = true;
    notifications.markRead(1);
    assert.equal(notifications._all[0].unread, false, '单条已读先乐观更新私有列表');
    assert.equal(notifications.data.unreadCount, 0);
    await settled();
    assert.equal(notifications._all[0].unread, true, '请求失败回滚原始列表');
    assert.equal(notifications.data.groups[0].items[0].unread, true);
    assert.equal(notifications.data.tabs.find(tab => tab.key === 'family').unread, 1);
    readFails = false;
    notifications.onCardTap(event({ id: 1 })); await settled();
    assert.equal(routes.pop(), '/pages/pantry/index', '点击卡片仍从私有列表取动作');
    assert.equal(notifications.data.unreadCount, 0);
    notifications.onAction(event({ id: 1 }));
    assert.equal(routes.pop(), '/pages/pantry/index', '动作按钮仍能定位通知');
    assert.deepEqual(readCalls, [[1], [1]], '已读卡片不重复写入');
    notificationItems = [
      { ...notificationItems[0], unread: true },
      { id: 2, kind: 'sys', unread: true, group: 'earlier' }
    ];
    notifications.loadData(); await settled();
    readFails = true;
    notifications.onReadAll(); notifications.onReadAll();
    assert.equal(notifications.data.unreadCount, 0);
    await settled();
    assert.deepEqual(readCalls, [[1], [1], []], '全部已读在途连点只写一次');
    assert.equal(notifications.data.unreadCount, 2, '全部已读失败后重拉并恢复各 tab 计数');
    assert.equal(notifications.data.visibleCount, 1);
    assert.equal(notifications.__readAllBusy, false);
    readFails = false;
    notifications.onReadAll(); await settled();
    assert.ok(notifications._all.every(item => !item.unread));
    assert.equal(notifications.data.unreadCount, 0);
    notificationsFail = true;
    notifications.loadData(); await settled();
    assert.equal(notifications.data.loadError, true);
    assert.deepEqual(notifications._all, []);
    assert.equal(notifications.data.visibleCount, 0, '加载失败不能复现旧消息');
    assert.ok(notifications.data.groups.every(group => group.items.length === 0));
    notificationsFail = false; notificationItems = [];
    notifications.retryLoad(); await settled();
    assert.equal(notifications.data.loadError, false, '空消息不是失败');
    assert.equal(notifications.data.unreadCount, 0);

    const search = page('../pkg-extra/recipes/search/index', ['allRecipes']);
    search.onInput({ detail: { value: '饭' } });
    assert.equal(search.data.total, 0, '首次加载前输入也可按空列表筛选');
    search._fetch('饭'); await settled();
    assert.deepEqual(search.data.list.map(item => item.id), [1, 2]);
    assert.ok(search.data.list[0].titleParts.some(part => part.hl && part.t === '饭'));
    search.onSortTap(event({ key: 'fast' }));
    assert.deepEqual(search.data.list.map(item => item.id), [2, 1]);
    assert.deepEqual(search._allRecipes.map(item => item.id), [1, 2, 3], '排序不改变原始列表');
    search.onClear(); search.onSortTap(event({ key: 'sichuan' }));
    assert.deepEqual(search.data.list.map(item => item.id), [3]);
    search.onSortTap(event({ key: 'all' }));
    search.onInput({ detail: { value: '回锅鱼' } });
    assert.equal(search.data.noExactHit, true);
    assert.equal(search.data.nearbyMode, true);
    assert.deepEqual(search.data.list.map(item => item.id), [3], '近邻回退仍读取完整私有列表');
    assert.ok(search.data.list[0].titleParts.every(part => !part.hl), '近邻不冒充精确命中');
    recipesFail = true;
    search._fetch(''); await settled();
    assert.equal(search.data.loadError, true);
    assert.deepEqual(search._allRecipes, []);
    search.onClear();
    assert.equal(search.data.total, 0, '失败后筛选不恢复旧结果');
    recipesFail = false; recipeResult = { list: [] };
    search.onRetry(); await settled();
    assert.equal(search.data.loadError, false);
    assert.deepEqual(search.data.list, []);
    recipeResult = { list: recipes };
    search.onRetry(); await settled();
    assert.equal(search.data.total, 3, '重试兼容 list 包装的返回值');
    recipeResult = recipes;

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
