// artifacts/ui-audit/phase2-walkthrough.js · 二期用户界面真实走查
// 前置：server 9088 已起；DevTools 已 cli auto --auto-port 9420。
// 流程：HTTP 造今日菜单数据 → automator 连 IDE → 逐页验证「开做」/厨房总控/社区/详情 → 截图 artifacts/ui-audit/phase2/。
const automator = require('miniprogram-automator');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:9088';
const OUT = path.join(__dirname, 'phase2');
fs.mkdirSync(OUT, { recursive: true });

function req(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(`${BASE}${urlPath}`, {
      method,
      headers: {
        ...(data ? { 'Content-Type': 'application/json' } : {}),
        'X-Auth-Token': token || '',
        'X-Device-Id': 'walkthrough-' + Date.now()
      }
    }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: buf ? JSON.parse(buf) : null }); }
        catch (e) { resolve({ status: res.statusCode, json: null }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function waitPage(mini, url, ms) {
  const deadline = Date.now() + (ms || 8000);
  while (Date.now() < deadline) {
    const page = await mini.currentPage();
    if (page && page.path === url) return page;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

(async () => {
  // —— 连 IDE：先让小程序自己完成游客登录，再借它的会话造数据 ——
  // （此前用脚本自己的游客身份加菜，与小程序的家庭不同，页面 todayMenu 恒为空——走查第一课）
  const mini = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  console.log('已连接 DevTools 自动化');
  let page = await mini.reLaunch('/pages/home/index');
  await new Promise((r) => setTimeout(r, 3500));
  page = await waitPage(mini, 'pages/home/index');
  const token = await mini.callWxMethod('getStorageSync', 'auth_token');
  check('借小程序会话: auth_token', !!token);

  // —— 数据准备（同一身份）：公共菜谱 → 今日午餐+晚餐各一道 ——
  const recipes = await req('GET', '/api/recipes?source=all', null, token);
  const first = (recipes.json || [])[0];
  check('HTTP: 公共菜谱可拉取', !!first, first ? first.title : '无菜谱');
  const r2 = (recipes.json || [])[1] || first;
  const a1 = await req('POST', '/api/daily-menu/today/items', { recipeId: first.id, mealType: 'lunch' }, token);
  const a2 = await req('POST', '/api/daily-menu/today/items', { recipeId: r2.id, mealType: 'dinner' }, token);
  check('HTTP: 加菜到今日午餐+晚餐', a1.status === 200 && a2.status === 200);

  // 1) 首页：今日菜单卡「开做」按钮（重新拉数据）
  page = await mini.reLaunch('/pages/home/index');
  await new Promise((r) => setTimeout(r, 3000));
  page = await waitPage(mini, 'pages/home/index');
  const cookBtn = await page.$('.mh-mc-go-cook');
  check('首页: 「开做」主按钮渲染', !!cookBtn, cookBtn ? '存在 .mh-mc-go-cook' : '菜单卡与空态卡按钮都未出现');
  const cookBtnText = cookBtn ? (await cookBtn.text()).trim() : '';
  check('首页: 按钮文案含「开做/继续做/已齐/去厨房」', /开做|继续做|已齐|去厨房/.test(cookBtnText), cookBtnText);
  await mini.screenshot({ path: path.join(OUT, '01-home.png') });

  // 2) 点「开做」→ 厨房总控
  await cookBtn.tap();
  page = await waitPage(mini, 'pkg-extra/kitchen/index', 10000);
  check('跳转: 厨房总控页打开', !!page);
  await new Promise((r) => setTimeout(r, 1200));
  const cards = await page.$$('.k-card');
  check('厨房: 灶台卡渲染 ≥1', cards.length >= 1, `${cards.length} 张`);
  const timerBtn = await page.$('.k-tbtn');
  check('厨房: 计时按钮渲染', !!timerBtn);
  const cookAct = await page.$('.k-act.primary');
  check('厨房: 「开做/继续做」动作渲染', !!cookAct, cookAct ? (await cookAct.text()).trim() : '');
  await mini.screenshot({ path: path.join(OUT, '02-kitchen.png') });

  // 3) 厨房里点开做 → cook-mode（再返回）
  if (cookAct) {
    await cookAct.tap();
    page = await waitPage(mini, 'pkg-extra/cook-mode/index', 10000);
    check('跳转: cook-mode 打开', !!page);
    await new Promise((r) => setTimeout(r, 1500));
    const stepImg = await page.$('.stepimg');
    check('cook-mode: 步骤大图渲染', !!stepImg);
    const ing = await page.$('.ing');
    check('cook-mode: 食材标签渲染', !!ing);
    await mini.screenshot({ path: path.join(OUT, '03-cookmode.png') });
    await mini.navigateBack();
    page = await waitPage(mini, 'pkg-extra/kitchen/index');
    await new Promise((r) => setTimeout(r, 800));
  }

  // 4) 社区：话题 chips + 帖子卡
  await mini.switchTab('/pages/community/index');
  page = await waitPage(mini, 'pages/community/index');
  await new Promise((r) => setTimeout(r, 2000));
  const tchips = await page.$$('.tchip');
  check('社区: 话题 chips 渲染', tchips.length > 0, `${tchips.length} 个`);
  const pcards = await page.$$('.pcard');
  check('社区: 帖子卡渲染', pcards.length > 0, `${pcards.length} 张`);
  await mini.screenshot({ path: path.join(OUT, '04-community.png') });

  // 话题过滤：点第一个 chip → 过滤条出现
  if (tchips.length) {
    await tchips[0].tap();
    await new Promise((r) => setTimeout(r, 1500));
    const filterBar = await page.$('.tag-filter');
    check('社区: 话题过滤条出现', !!filterBar, filterBar ? (await filterBar.text()).trim() : '');
    const clearBtn = await page.$('.tag-filter-x');
    if (clearBtn) await clearBtn.tap();
    await new Promise((r) => setTimeout(r, 1200));
    await mini.screenshot({ path: path.join(OUT, '05-community-tagfilter.png') });
  }

  // 5) 帖子详情：正文 + 分享按钮
  if (pcards.length) {
    await pcards[0].tap();
    page = await waitPage(mini, 'pkg-extra/community/post-detail/index', 10000);
    check('跳转: 帖子详情打开', !!page);
    await new Promise((r) => setTimeout(r, 1500));
    const shareBtn = await page.$('.react-share');
    check('详情: 分享按钮渲染', !!shareBtn);
    const cmt = await page.$('.csec');
    check('详情: 评论区渲染', !!cmt);
    await mini.screenshot({ path: path.join(OUT, '06-post-detail.png') });
  }

  // 6) 发帖弹层：配图选择器
  await mini.switchTab('/pages/community/index');
  page = await waitPage(mini, 'pages/community/index');
  await new Promise((r) => setTimeout(r, 1000));
  const postToggle = await page.$('.nav-post-btn');
  if (postToggle) {
    await postToggle.tap();
    await new Promise((r) => setTimeout(r, 800));
    const imgAdd = await page.$('.pf-img-add');
    check('发帖弹层: 配图「＋」渲染', !!imgAdd);
    await mini.screenshot({ path: path.join(OUT, '07-post-form.png') });
  } else {
    check('发帖弹层: 入口按钮', false, '未找到 .nav-post');
  }

  const fails = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(results, null, 2));
  console.log(`\n===== 走查完成：${results.length - fails.length}/${results.length} 通过 =====`);
  if (fails.length) {
    console.log('未过项：');
    fails.forEach((f) => console.log(`  ✘ ${f.name} ${f.detail}`));
  }
  await mini.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('走查脚本异常:', err.message);
  process.exit(1);
});
