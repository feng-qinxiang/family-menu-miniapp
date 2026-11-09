// node miniapp/test/shopping-stock.test.js · 买菜清单「放进冰箱」：只入冰箱里还没有的、重复点不重复入、中途失败只算成功的。
const assert = require('assert');
const pantry = [];
let failOn = '';
const toasts = [];
global.getApp = () => ({ globalData: { apiBaseUrl: 'http://127.0.0.1:19088' } });
global.wx = {
  getStorageSync: () => '', setStorageSync() {}, removeStorageSync() {},
  getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
  showToast: (o) => toasts.push(o.title), showLoading() {}, hideLoading() {},
  request(opts) {
    if (opts.url.endsWith('/api/pantry') && opts.method === 'POST') {
      if (opts.data.ingredientName === failOn) return opts.fail({ errMsg: 'request:fail' });
      pantry.push({ id: pantry.length + 1, ...opts.data });
      return opts.success({ statusCode: 200, data: pantry[pantry.length - 1] });
    }
    if (opts.url.endsWith('/api/pantry')) return opts.success({ statusCode: 200, data: pantry.slice() });
    throw new Error('unexpected ' + opts.url);
  }
};
let def;
global.Page = (d) => { def = d; };
require('../pages/shopping/index');
const page = Object.assign(Object.create(def), { data: JSON.parse(JSON.stringify(def.data)) });
page.setData = function (patch, cb) { Object.assign(this.data, patch); if (cb) cb(); };
page.applyShoppingList = function (list, ctx) { this.setData(this.buildShoppingState(list, ctx)); };
const items = [
  { itemId: 1, ingredientName: '排骨', amount: '500', unit: '克', purchased: true },
  { itemId: 2, ingredientName: '糖', amount: '2', unit: '勺', purchased: true },
  { itemId: 3, ingredientName: '醋', amount: '3', unit: '勺', purchased: false }
];
pantry.push({ id: 99, ingredientName: '糖', amount: '1', unit: '袋' });

(async () => {
  await page.loadPantry();
  page.applyShoppingList({ items }, { pantryItems: page._pantryItems });
  assert.strictEqual(page.data.stockableCount, 1, '冰箱已有糖、醋没买：只剩排骨可入');

  failOn = '排骨';
  await page.stockPurchased();
  assert.strictEqual(pantry.length, 1, '失败不能写入');
  assert.strictEqual(page.data.stockableCount, 1, '失败后按钮还在');
  assert.ok(/没放进去/.test(toasts.pop()));

  failOn = '';
  await page.stockPurchased();
  assert.deepStrictEqual(pantry.map((p) => p.ingredientName), ['糖', '排骨']);
  assert.strictEqual(pantry[1].amount, '500');
  assert.strictEqual(page.data.stockableCount, 0, '入库后按钮消失');
  await page.stockPurchased();
  assert.strictEqual(pantry.length, 2, '再点不重复入库');
  console.log('shopping-stock.test ok: only missing items, failure keeps button, no duplicates');
})().catch((e) => { console.error(e); process.exit(1); });
