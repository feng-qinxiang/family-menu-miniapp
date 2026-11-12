// Tab migration: every entry uses the correct API and old completion links keep their highlight.
const assert = require('node:assert/strict');
let definition;
const navigation = [];
const app = { globalData: {} };
global.Page = (page) => { definition = page; };
global.getApp = () => app;
global.wx = {
  getStorageSync() { return ''; },
  navigateTo(options) { navigation.push({ type: 'navigate', url: options.url }); },
  switchTab(options) { navigation.push({ type: 'tab', url: options.url }); if (options.success) options.success(); }
};

function page(module) {
  require(module);
  return Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback(); }
  });
}
function route(instance, method, type, url) {
  instance[method]();
  assert.deepEqual(navigation.pop(), { type, url }, method);
}

try {
  const home = page('../pages/home/index');
  route(home, 'goCookLog', 'tab', '/pages/cook-log/index');
  const menu = page('../pages/menu/index');
  menu.route = 'pages/menu/index';
  menu.loadData = () => {};
  global.getCurrentPages = () => [menu];
  for (const entry of [home, page('../pages/recipes/index')]) {
    menu.switchView({ currentTarget: { dataset: { view: 'week' } } });
    menu.onShow();
    assert.equal(menu.data.view, 'week', '普通 tab 回访保留本周计划');
    route(entry, 'goMenu', 'tab', '/pages/menu/index');
    assert.equal(menu.data.view, 'today', '今日菜单入口不能误落到保留的周计划');
  }
  route(menu, 'goCookLog', 'tab', '/pages/cook-log/index');
  route(menu, 'goAddRecipe', 'navigate', '/pages/recipes/index');
  route(menu, 'goPantry', 'navigate', '/pages/pantry/index');
  const me = page('../pages/me/index');
  route(me, 'goCookLog', 'tab', '/pages/cook-log/index');
  route(me, 'goRecipes', 'navigate', '/pages/recipes/index');

  const bridge = page('../pkg-extra/cook-log/index');
  bridge.onLoad({ recipeId: '102' });
  assert.equal(app.globalData.pendingCookLogRecipeId, '102');
  assert.deepEqual(navigation.pop(), { type: 'tab', url: '/pages/cook-log/index' });

  const log = page('../pages/cook-log/index');
  log.onShow();
  assert.equal(log._highlightRecipeId, '102');
  assert.equal(app.globalData.pendingCookLogRecipeId, undefined, 'Completion handoff is consumed once');
  assert.equal(log.data.activeFilter, 'all');

  log.buildView([
    { id: 1, recipeId: 101, recipeTitle: '红烧肉', cookedAt: '2026-10-07 18:00:00', score: 4, cookedByName: '爸爸' },
    { id: 2, recipeId: 102, recipeTitle: '番茄炒蛋', coverImage: '/uploaded/tomato-egg.jpg', cookedAt: '2026-10-08 18:00:00', score: 5, cookedByName: '妈妈', remark: '下次少放一点盐' }
  ]);
  const records = log.data.visibleGroups.flatMap((group) => group.items);
  assert.deepEqual(records.map((record) => record.recipeId), [102, 101]);
  assert.equal(records[0].highlight, true);
  assert.equal(records[0].cover, '/uploaded/tomato-egg.jpg', 'Uploaded recipe cover wins');
  assert.equal(records[1].cover, 'http://localhost:9088/assets/dishes/hongshao-pork.jpg', 'No cover uses a matching server recipe image');
  log.onSelectFilter({ currentTarget: { dataset: { value: 'star5' } } });
  assert.equal(log.data.filteredCount, 1);
  assert.equal(log.data.visibleGroups[0].items[0].recipeId, 102);
  route(log, 'goCooking', 'tab', '/pages/menu/index');

  const weekly = page('../pkg-extra/weekly-menu/index');
  const monday = weekly.normalizeDay({ date: '2026-10-05', recipes: [{ id: 101, title: '红烧肉', coverImage: '/uploaded/weekly.jpg' }] }, '2026-10-09');
  assert.equal(monday.wkLabel, '周一', '日历日期按本地日显示，不能因 UTC 偏移变周日');
  assert.equal(monday.dateLabel, '10月5日');
  assert.equal(monday.lunch.image, '/uploaded/weekly.jpg');
  assert.equal(monday.dinner, null, '缺餐保留待安排状态');
  const weekbar = weekly.buildWeekbar({ days: [monday, { date: 'invalid', recipeCount: 0 }] });
  assert.equal(weekbar[0].dateNumber, 5, '七日选择显示真实日期号');
  assert.equal(weekbar[0].short, '一');
  assert.equal(weekbar[1].dateNumber, '', '无效日期不显示 NaN');
} finally {
  delete global.Page;
  delete global.wx;
  delete global.getApp;
  delete global.getCurrentPages;
}
console.log('journey-navigation.test ok: tabs, secondary tools, legacy completion links, record covers and filters');
