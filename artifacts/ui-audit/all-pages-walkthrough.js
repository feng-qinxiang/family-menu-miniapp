// artifacts/ui-audit/all-pages-walkthrough.js · 全站 37 页冒烟走查
// 每页：真实打开 → 断言 path / 非白屏（view 数 > 5）/ 核心元素 → 截图 → 收集 console error。
// 带参页借小程序自己的会话取 recipeId / postId；payment 两页依赖订单与 PAYMENT 开关，标记 skip。
const automator = require('miniprogram-automator');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:9088';
const OUT = path.join(__dirname, 'all-pages');
fs.mkdirSync(OUT, { recursive: true });

function req(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(`${BASE}${urlPath}`, {
      method,
      headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), 'X-Auth-Token': token || '', 'X-Device-Id': 'allpages-' + Date.now() }
    }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => { try { resolve({ status: res.statusCode, json: buf ? JSON.parse(buf) : null }); } catch (e) { resolve({ status: res.statusCode, json: null }); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// 全部 37 页：mode = tab(switchTab) / nav(navigateTo)；key = 核心元素 selector（可选）；
// setup = 带参页的数据准备键；skip 理由写在 note。
const PAGES = [
  { path: 'pages/home/index', mode: 'reLaunch', key: '.mh-menucard,.mh-empty-menu' },
  { path: 'pages/recipes/index', mode: 'tab', key: '.rx-card-slot,.mag-hero' },
  { path: 'pages/community/index', mode: 'tab', key: '.tchip' },
  { path: 'pages/menu/index', mode: 'nav', key: '.m-quick-row,.m-kitchen-entry' },
  { path: 'pages/me/index', mode: 'tab', key: '.me-mag,.mag-hero' },
  { path: 'pages/shopping/index', mode: 'nav' },
  { path: 'pages/pantry/index', mode: 'tab' },
  { path: 'pkg-extra/kitchen/index', mode: 'nav', key: '.k-card,.k-head' },
  { path: 'pkg-extra/community/post-detail/index', mode: 'nav', arg: 'postId', key: '.post-title,.author' },
  { path: 'pkg-extra/vip/index', mode: 'nav' },
  { path: 'pkg-extra/vip/upgrade/index', mode: 'nav' },
  { path: 'pkg-extra/vip/orders/index', mode: 'nav' },
  { path: 'pkg-extra/payment/checkout/index', mode: 'nav', skip: '需订单号且 PAYMENT 开关关闭' },
  { path: 'pkg-extra/payment/success/index', mode: 'nav', skip: '需订单号且 PAYMENT 开关关闭' },
  { path: 'pkg-extra/favorites/index', mode: 'nav' },
  { path: 'pkg-extra/import/index', mode: 'nav' },
  { path: 'pkg-extra/recipe-detail/index', mode: 'nav', arg: 'id', key: '.rd-hero' },
  { path: 'pkg-extra/recipe-edit/index', mode: 'nav', arg: 'id' },
  { path: 'pkg-extra/weekly-menu/index', mode: 'nav' },
  { path: 'pkg-extra/recipes/search/index', mode: 'nav' },
  { path: 'pkg-extra/cook-mode/index', mode: 'nav', arg: 'id', key: '.stepimg' },
  { path: 'pkg-extra/cook-log/index', mode: 'nav' },
  { path: 'pkg-extra/auth/login/index', mode: 'nav' },
  { path: 'pkg-extra/auth/login-phone/index', mode: 'nav' },
  { path: 'pkg-extra/family/create/index', mode: 'nav' },
  { path: 'pkg-extra/family/join/index', mode: 'nav' },
  { path: 'pkg-extra/family/members/index', mode: 'nav' },
  { path: 'pkg-extra/family/invite/index', mode: 'nav' },
  { path: 'pkg-extra/me/settings/index', mode: 'nav' },
  { path: 'pkg-extra/me/notifications/index', mode: 'nav' },
  { path: 'pkg-extra/me/preference-profile/index', mode: 'nav' },
  { path: 'pkg-extra/me/feedback/index', mode: 'nav' },
  { path: 'pkg-extra/me/help-faq/index', mode: 'nav' },
  { path: 'pkg-extra/me/about/index', mode: 'nav' },
  { path: 'pkg-extra/legal/terms/index', mode: 'nav' },
  { path: 'pkg-extra/legal/privacy/index', mode: 'nav' },
  { path: 'pkg-extra/me/profile-edit/index', mode: 'nav' }
];

const results = [];
const consoleErrors = [];

(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  mini.on('console', (msg) => {
    if (msg.type === 'error') consoleErrors.push({ args: String(msg.args).slice(0, 200) });
  });
  mini.on('exception', (exp) => consoleErrors.push({ exception: String(exp && exp.message).slice(0, 200) }));

  // 首页触发游客登录 → 借会话拿参数
  await mini.reLaunch('/pages/home/index');
  await new Promise((r) => setTimeout(r, 3000));
  const token = await mini.callWxMethod('getStorageSync', 'auth_token');
  const recipes = await req('GET', '/api/recipes?source=all', null, token);
  const recipeId = (recipes.json || [])[0] && recipes.json[0].id;
  const posts = await req('GET', '/api/community/posts', null, token);
  const postId = (posts.json || [])[0] && posts.json[0].id;
  console.log(`参数就绪: recipeId=${recipeId} postId=${postId}`);

  for (const item of PAGES) {
    const tag = item.path;
    if (item.skip) {
      results.push({ path: tag, ok: true, skip: item.skip });
      console.log(`⊘ ${tag} — skip（${item.skip}）`);
      continue;
    }
    try {
      let query = '';
      if (item.arg === 'id' && recipeId) query = `?id=${recipeId}`;
      if (item.arg === 'postId' && postId) query = `?postId=${postId}`;
      const full = item.path + query;
      if (item.mode === 'tab') {
        await mini.switchTab('/' + item.path);
      } else {
        await mini.reLaunch('/' + full);
      }
      // 等页面路由与首屏渲染
      let page = null;
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        page = await mini.currentPage();
        if (page && page.path === item.path) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      if (!page || page.path !== item.path) {
        results.push({ path: tag, ok: false, why: '未打开（当前: ' + (page && page.path) + '）' });
        console.log(`✘ ${tag} — 未打开`);
        continue;
      }
      await new Promise((r) => setTimeout(r, 1200));

      // 非白屏：view 元素数量
      const views = await page.$$('view');
      const notBlank = views.length > 5;
      // 核心元素（可能多个候选，逗号分隔逐个试）
      let keyHit = true;
      if (item.key) {
        keyHit = false;
        for (const sel of item.key.split(',')) {
          if (await page.$(sel.trim())) { keyHit = true; break; }
        }
      }
      const ok = notBlank && keyHit;
      results.push({ path: tag, ok, views: views.length, keyHit, why: !notBlank ? '疑似白屏(view≤5)' : (!keyHit ? '核心元素未命中' : '') });
      console.log(`${ok ? '✔' : '✘'} ${tag} — views=${views.length}${item.key ? ' key=' + keyHit : ''}`);
      await mini.screenshot({ path: path.join(OUT, tag.replace(/\//g, '_') + '.png') });
    } catch (err) {
      results.push({ path: tag, ok: false, why: String(err.message).slice(0, 120) });
      console.log(`✘ ${tag} — 异常: ${err.message}`);
    }
  }

  const fails = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skip);
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ results, consoleErrors: consoleErrors.slice(0, 40) }, null, 2));
  console.log(`\n===== 全站走查：${results.length - fails.length - skipped.length}/${results.length - skipped.length} 通过，skip ${skipped.length} =====`);
  if (fails.length) fails.forEach((f) => console.log(`  ✘ ${f.path} — ${f.why}`));
  const realErrors = consoleErrors.filter((e) => !/SharedArrayBuffer|deprecat/i.test(e.args || e.exception || ''));
  if (realErrors.length) {
    console.log(`\nconsole error（${realErrors.length} 条，前 10）：`);
    realErrors.slice(0, 10).forEach((e) => console.log('  ' + (e.args || e.exception)));
  }
  await mini.disconnect();
  process.exit(0);
})().catch((err) => { console.error('走查异常:', err.message); process.exit(1); });
