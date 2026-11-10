// node miniapp/test/cook-log-week.test.js · 记录页周历：做过饭的那天带上当天最新一道菜的图，没做的不带。
const assert = require('assert');
let definition;
global.wx = global.wx || {};
global.Page = (page) => { definition = page; };
require('../pages/cook-log/index');
delete global.Page;

const pad2 = (n) => String(n).padStart(2, '0');
const now = new Date();
const today = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
const page = {
  ...definition,
  data: { ...definition.data, activeFilter: 'all' },
  setData(patch, cb) { Object.assign(this.data, patch); if (cb) cb(); }
};
page.buildView([
  { id: 1, recipeId: 1, recipeTitle: '早上那道', cookedAt: today + ' 08:00:00' },
  { id: 2, recipeId: 2, recipeTitle: '晚上那道', cookedAt: today + ' 19:00:00' }
]);

const week = page.data.week;
assert.strictEqual(week.length, 7);
const todayCell = week.find((d) => d.key === today);
assert.ok(todayCell && /done/.test(todayCell.state), '今天有记录，应是 done');
const latest = page._all ? page._all[0] : null;
assert.ok(todayCell.cover, '做过饭的那天要带菜图');
if (latest) assert.strictEqual(todayCell.cover, latest.cover, '同一天多道菜时取最新一道');
week.filter((d) => d.key !== today).forEach((d) => assert.strictEqual(d.cover, '', d.key + ' 没做饭，不该有图'));

page.buildView([]);
assert.ok(page.data.week.every((d) => d.cover === ''), '没有任何记录时七天都不带图');
console.log('✔ cook-log-week');
