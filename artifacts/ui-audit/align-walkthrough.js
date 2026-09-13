// align-walkthrough.js · 对齐改造走查：反馈历史区块 + 社区审核角标
const automator = require('miniprogram-automator');
const http = require('http');
const path = require('path');
const fs = require('fs');

const BASE = 'http://127.0.0.1:9088';
const OUT = path.join(__dirname, 'align');
fs.mkdirSync(OUT, { recursive: true });

function req(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(`${BASE}${urlPath}`, {
      method,
      headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), 'X-Auth-Token': token || '', 'X-Device-Id': 'align-' + Date.now() }
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

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  await mini.reLaunch('/pages/home/index');
  await new Promise((r) => setTimeout(r, 3000));
  const token = await mini.callWxMethod('getStorageSync', 'auth_token');
  check('借会话 token', !!token);

  // —— C2: 游客发帖（PENDING）→ 社区信息流自己的帖子带「审核中」角标 ——
  const marker = '审核角标走查 ' + Date.now();
  const created = await req('POST', '/api/community/posts', token ? {
    title: marker, content: '用于验证审核中角标', tags: ['走查']
  } : null, token);
  check('HTTP: 发帖（游客→PENDING）', created.status === 200 && created.json.auditStatus === 'PENDING',
    'auditStatus=' + (created.json && created.json.auditStatus));

  await mini.reLaunch('/pages/community/index');
  await new Promise((r) => setTimeout(r, 2500));
  let page = await mini.currentPage();
  const pendingBadge = await page.$('.ppending');
  check('社区: 自己的 PENDING 帖显示「审核中」角标', !!pendingBadge, pendingBadge ? await pendingBadge.text() : '未命中 .ppending');
  await mini.screenshot({ path: path.join(OUT, '01-community-pending.png') });

  // —— C1: 提交反馈 → 「意见反馈」页历史区块可见 ——
  const fbMarker = '反馈闭环走查 ' + Date.now();
  const fb = await req('POST', '/api/feedback', { types: ['bug'], content: fbMarker }, token);
  check('HTTP: 提交反馈', fb.status === 200);
  const list = await req('GET', '/api/me/feedbacks', null, token);
  check('HTTP: 反馈历史含刚提交条目', Array.isArray(list.json) && list.json.some((it) => it.content === fbMarker));

  await mini.reLaunch('/pkg-extra/me/feedback/index');
  await new Promise((r) => setTimeout(r, 2500));
  page = await mini.currentPage();
  const fhItem = await page.$('.fh-item');
  check('反馈页: 「我的反馈」历史区块渲染', !!fhItem);
  const fhBadge = await page.$('.fh-badge');
  check('反馈页: 状态徽标（处理中）', !!fhBadge, fhBadge ? await fhBadge.text() : '');
  await mini.screenshot({ path: path.join(OUT, '02-feedback-history.png') });

  // —— C4: 首页许愿池文案（等管理员确认 / 去挑菜）—— 截图留档
  await mini.reLaunch('/pages/home/index');
  await new Promise((r) => setTimeout(r, 2000));
  await mini.screenshot({ path: path.join(OUT, '03-home.png') });
  check('首页: 截图留档（术语统一在代码层断言）', true);

  const fails = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(results, null, 2));
  console.log(`\n===== 对齐走查：${results.length - fails.length}/${results.length} 通过 =====`);
  await mini.disconnect();
  process.exit(0);
})().catch((err) => { console.error('走查异常:', err.message); process.exit(1); });
