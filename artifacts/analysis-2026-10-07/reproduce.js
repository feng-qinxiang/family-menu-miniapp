// Run with real Node 22+. API probes write only to the isolated service on port 19088.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const observations = [];
const observe = (id, actual, expected) => observations.push({ id, actual, expected });

function loadApi(storage) {
  const calls = [];
  let firstRead = true;
  const guestToken = randomUUID();
  const loginToken = randomUUID();
  const wx = {
    getStorageSync: (key) => storage.get(key) || '',
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
    clearStorageSync: () => storage.clear(),
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
    showToast() {},
    login(opts) { calls.push('wx.login'); opts.success({ code: randomUUID() }); },
    request(opts) {
      const route = new URL(opts.url).pathname;
      calls.push(route);
      if (route === '/api/auth/otp/login' || route === '/api/auth/login') {
        opts.success({ statusCode: 200, data: { token: loginToken } });
      } else if (route === '/api/auth/guest') {
        opts.success({ statusCode: 200, data: { token: guestToken } });
      } else if (firstRead) {
        firstRead = false;
        opts.success({ statusCode: 401, data: { message: 'expired' } });
      } else {
        opts.success({ statusCode: 200, data: [] });
      }
    }
  };
  const filename = path.join(root, 'miniapp/utils/api.js');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    wx, module, require: createRequire(filename), console,
    setTimeout() { return 0; }, clearTimeout() {}
  }, { filename });
  return { api: module.exports, wx, calls };
}

async function clientProbes() {
  const storage = new Map([
    ['device_id', randomUUID()], ['auth_token', randomUUID()], ['session_kind', 'login']
  ]);
  const { api, wx, calls } = loadApi(storage);
  let settings;
  const filename = path.join(root, 'miniapp/pkg-extra/me/settings/index.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    wx, require: createRequire(filename), Page(definition) { settings = definition; }
  }, { filename });
  settings._doClearCache.call({
    data: { generalList: [] }, setData() {}, _loadFontScale() {}, _toast() {}
  });
  assert.equal(storage.has('auth_token'), true);
  assert.equal(storage.has('session_kind'), false);
  await api.getPantryItems();
  assert.equal(calls.includes('/api/auth/guest'), true);
  observe('F02-clear-cache-session', { kindRemoved: true, renewEndpoint: '/api/auth/guest' },
    'Keep login provider and renew the same account.');

  const otpStorage = new Map([['device_id', randomUUID()]]);
  const otp = loadApi(otpStorage);
  await otp.api.loginWithOtp({ phone: '', code: '' });
  await otp.api.getPantryItems();
  assert.equal(otp.calls.includes('wx.login'), true);
  assert.equal(otp.calls.includes('/api/auth/login'), true);
  observe('F11-otp-renew', { kind: otpStorage.get('session_kind'), renewEndpoint: '/api/auth/login' },
    'OTP expiry must not silently switch to a WeChat identity.');

  const pantry = require(path.join(root, 'miniapp/utils/pantry-match'));
  const available = pantry.pantryHas([{ ingredientName: 'egg', amount: '1', unit: 'piece' }],
    'egg', 'piece', '8');
  assert.equal(available, true);
  observe('F06-client-stock-quantity', { stock: 1, need: 8, available }, 'available=false; deficit=7');
}

async function serverProbes() {
  const base = process.env.ANALYSIS_BASE_URL || 'http://127.0.0.1:19088';
  assert.equal(base, 'http://127.0.0.1:19088', 'Refusing probes against another service.');
  const device = 'analysis-' + randomUUID();
  let token;
  async function api(route, method = 'GET', body) {
    const headers = { 'Content-Type': 'application/json', 'X-Device-Id': device };
    if (token) headers['X-Auth-Token'] = token;
    const response = await fetch(base + route, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    assert.equal(response.ok, true, `${method} ${route}: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  const session = await api('/api/auth/guest', 'POST');
  token = session.token;
  assert.equal(typeof token, 'string');
  const recipe = await api('/api/recipes', 'POST', {
    title: 'analysis egg quantity', sourceType: 'self', cuisine: 'home', tasteTags: ['plain'],
    timeCost: 10, servings: 4, steps: ['cook'],
    ingredients: [{ name: 'egg', amount: '2', unit: 'piece' }], summary: 'isolated audit probe'
  });
  assert.equal(Number.isInteger(recipe.id), true);
  const stock = await api('/api/pantry', 'POST', { ingredientName: 'egg', amount: '1', unit: 'piece' });
  const matches = await api('/api/pantry/match');
  const match = matches.find((item) => item.recipe.id === recipe.id);
  assert.equal(match.matchRate, 1);
  assert.deepEqual(match.missingIngredients, []);
  observe('F06-server-stock-quantity', { stock: 1, need: 2, matchRate: match.matchRate,
    missing: match.missingIngredients }, 'matchRate < 1; deficit=1');

  await api(`/api/pantry/${stock.id}`, 'PUT', { ingredientName: 'egg', amount: '20', unit: 'piece' });
  const amount = async () => Number((await api('/api/pantry')).find((item) => item.id === stock.id).amount);
  await api('/api/cook-history', 'POST', { recipeId: recipe.id, remark: '', servings: 8 });
  assert.equal(await amount(), 18);
  observe('F04-serving-deduction', { recipeServings: 4, requestedServings: 8, initialStock: 20,
    actualStock: 18, deducted: 2 }, 'stock=16; deduct 4 for eight servings');
  const scored = { recipeId: recipe.id, score: 5, remark: 'same request' };
  const first = await api('/api/cook-history', 'POST', scored);
  const second = await api('/api/cook-history', 'POST', scored);
  assert.notEqual(first.id, second.id);
  assert.equal(await amount(), 14);
  observe('F05-scored-retry', { separateRecords: true, stockBefore: 18, stockAfter: 14,
    deducted: 4 }, 'Retry one completion request only once; additional review should not consume stock.');

  const lunch = await api('/api/daily-menu/today/items', 'POST', { recipeId: recipe.id, mealType: 'lunch' });
  const lunchItem = lunch.items.find((item) => item.recipeId === recipe.id);
  await api(`/api/daily-menu/today/items/${lunchItem.itemId}/status`, 'PATCH', { status: 'done' });
  const dinner = await api('/api/daily-menu/today/items', 'POST', { recipeId: recipe.id, mealType: 'dinner' });
  const items = dinner.items.filter((item) => item.recipeId === recipe.id);
  assert.equal(items.length, 1);
  assert.equal(items[0].mealType, 'dinner');
  assert.equal(items[0].status, 'todo');
  observe('F07-meal-overwrite', { remainingMeals: items.map((item) => item.mealType),
    lunchDoneRemoved: true, itemIdChanged: items[0].itemId !== lunchItem.itemId },
    'Preserve lunch and dinner independently, including status.');

  const week = await api('/api/weekly-menu/current');
  const regenerated = await api('/api/weekly-menu/generate', 'POST');
  assert.deepEqual(regenerated, week);
  observe('F09-weekly-regeneration', { identicalResponse: true },
    'Explicit regenerate should replace the cached plan. Code confirms immediate cache return.');

  await api('/api/auth/me', 'PATCH', { nickname: 'audit profile', avatarUrl: '/assets/audit.png' });
  const profile = await api('/api/auth/me');
  assert.equal(profile.nickname, 'audit profile');
  token = (await api('/api/auth/guest', 'POST')).token;
  const renewed = await api('/api/auth/me');
  assert.equal(renewed.userId, profile.userId);
  assert.notEqual(renewed.nickname, profile.nickname);
  assert.notEqual(renewed.avatarUrl, profile.avatarUrl);
  observe('F08-profile-renew', { sameUser: true, nicknameOverwritten: true, avatarOverwritten: true },
    'Preserve edited profile during silent renewal.');
}

(async () => {
  await clientProbes();
  if (!process.argv.includes('--client-only')) await serverProbes();
  const result = { generatedAt: new Date().toISOString(),
    purpose: 'Reproduce current defects; assertions describe the observed broken behavior, not acceptance criteria.',
    observations };
  fs.writeFileSync(path.join(__dirname, 'reproduction-results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
})().catch((err) => {
  console.error('Probe failed:', err.message);
  process.exitCode = 1;
});
