#!/usr/bin/env node
/**
 * UI 台账（生成物，禁止手填）
 *
 *   node miniapp/test/ui-ledger.js            # 打印摘要 + 写 artifacts/ui-ledger/ledger.{md,json}
 *   node miniapp/test/ui-ledger.js --check    # 只比对上一次的「实现数」，变多则 exit 1
 *
 * 为什么要有它：四条主线（点菜 / 做菜 / 社区 / 冰箱）是各页各写一遍样式的，
 * 靠人眼截图找不一致，成本随页数线性涨、而且下次改页又会漂回来。
 * 这份台账把「同一个视觉角色有几种实现」变成一个可以单调下降的数字：
 * 它不判断好不好看（那仍然是人 + 截图的活），它只让漂移在**引入的那一刻**可见。
 *
 * 口径说明（避免把脚本读数当真理）：
 *  - 「实现数」按**去重后的取值/写法**计，不按出现次数计：同一个值用 5 次算 1 种实现。
 *  - 走 token 的算 1 种（`var(--x)` 记其 token 名），写死数值的按数值各算一种。
 *  - 加载态 / 空态是**分类**计数（骨架屏 / 组件 / 手写 spinner / 无），不是取值。
 *  - 只报事实，不修代码。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, '..', 'artifacts', 'ui-ledger');
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

const JOURNEYS = [
  ['点菜', ['pages/home', 'pages/menu', 'pages/shopping', 'pages/recipes',
    'pkg-extra/weekly-menu', 'pkg-extra/recipes/search', 'pkg-extra/favorites']],
  ['做菜', ['pkg-extra/recipe-detail', 'pkg-extra/cook-mode', 'pkg-extra/kitchen',
    'pkg-extra/cook-log', 'pkg-extra/recipe-edit']],
  ['社区', ['pages/community', 'pkg-extra/community/post-detail']],
  ['冰箱', ['pages/pantry']],
];

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'miniprogram_npm', '.git'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
};

const allFiles = [...walk(path.join(ROOT, 'pages')), ...walk(path.join(ROOT, 'pkg-extra')),
  ...walk(path.join(ROOT, 'components')), ...walk(path.join(ROOT, 'custom-tab-bar'))];
const pageDirs = [...new Set(allFiles.filter((f) => f.endsWith('.wxml'))
  .map((f) => rel(path.dirname(f))))];
const journeyOf = (dir) => (JOURNEYS.find(([, list]) => list.includes(dir)) || ['未归类'])[0];

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

/** 把 WXSS 拆成 {selector, decls} 列表（够用就行，不求解析器级精确） */
const cssRules = (src) => {
  const out = [];
  const clean = stripComments(src);
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    const decls = {};
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i > 0) decls[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
    out.push({ selector, decls });
  }
  return out;
};

// 缩略图/头像这类"图块"角色：按类名识别，取值取 width/height
const BLOCK_ROLE = /(thumb|cover|dish-img|pic|ava|avatar|img)/i;
// 圆角：token 与裸值分开统计
const RADIUS_TOKEN = /var\(\s*(--r-[a-z0-9-]+)\s*/;

const EMOJI_PRESENTATION_BMP = [
  [0x203c, 0x203c], [0x2049, 0x2049], [0x2122, 0x2122], [0x2139, 0x2139],
  [0x2194, 0x2199], [0x21a9, 0x21aa], [0x231a, 0x231b], [0x23cf, 0x23cf],
  [0x23e9, 0x23f3], [0x23f8, 0x23fa], [0x24c2, 0x24c2], [0x25aa, 0x25ab],
  [0x25b6, 0x25b6], [0x25b8, 0x25bc], [0x25c0, 0x25c0], [0x25c2, 0x25c4],
  [0x25e3, 0x25e3], [0x25ed, 0x25ee], [0x25f8, 0x25fb], [0x2600, 0x2604],
  [0x260e, 0x260e], [0x2611, 0x2611], [0x2614, 0x2615], [0x2618, 0x2618],
  [0x261d, 0x261d], [0x2620, 0x2620], [0x2622, 0x2623], [0x2626, 0x2626],
  [0x262a, 0x262a], [0x262e, 0x262f], [0x2638, 0x263a], [0x2640, 0x2640],
  [0x2642, 0x2642], [0x2648, 0x2653], [0x265f, 0x2660], [0x2663, 0x2663],
  [0x2665, 0x2666], [0x2668, 0x2668], [0x267b, 0x267b], [0x267e, 0x267e],
  [0x267f, 0x267f], [0x2692, 0x2692], [0x2694, 0x2697], [0x2699, 0x2699],
  [0x269b, 0x269f], [0x26a0, 0x26a1], [0x26a7, 0x26a7], [0x26aa, 0x26ab],
  [0x26b0, 0x26b1], [0x26b4, 0x26b7], [0x26bd, 0x26be], [0x26c2, 0x26c4],
  [0x26c8, 0x26c8], [0x26ce, 0x26d1], [0x26d3, 0x26d4], [0x26e9, 0x26ea],
  [0x26f0, 0x26f5], [0x26f7, 0x26fa], [0x26fd, 0x26fd], [0x2702, 0x2702],
  [0x2708, 0x270d], [0x270f, 0x270f], [0x2712, 0x2712], [0x2714, 0x2714],
  [0x2716, 0x2716], [0x271d, 0x271d], [0x2721, 0x2721], [0x2728, 0x2728],
  [0x2733, 0x2734], [0x2744, 0x2744], [0x2747, 0x2747], [0x274c, 0x274c],
  [0x274e, 0x274e], [0x2753, 0x2755], [0x2757, 0x2757], [0x2763, 0x2764],
  [0x2795, 0x2797], [0x27a1, 0x27a1], [0x27b0, 0x27b0], [0x27bf, 0x27bf],
  [0x2934, 0x2935], [0x2b05, 0x2b07], [0x2b1b, 0x2b1c], [0x2b50, 0x2b50],
  [0x2b55, 0x2b55]
];
const isEmojiPresentationBmp = (cp) => EMOJI_PRESENTATION_BMP.some(([lo, hi]) => cp >= lo && cp <= hi);

const rows = pageDirs.map((dir) => {
  const wxml = stripComments(read(path.join(ROOT, dir, 'index.wxml')));
  const wxss = read(path.join(ROOT, dir, 'index.wxss'));
  const json = read(path.join(ROOT, dir, 'index.json'));
  const rules = cssRules(wxss);

  // —— 图块尺寸：token 记名，裸值记值 ——
  const blocks = [];
  for (const { selector, decls } of rules) {
    if (!BLOCK_ROLE.test(selector)) continue;
    const w = decls.width;
    const h = decls.height;
    if (!w || !h) continue;
    const norm = (v) => (v || '').replace(/\s+/g, '');
    if (norm(w) !== norm(h)) continue; // 非正方形不是"图块"
    // 百分比的"正方形"是遮罩/占位层，不是一种尺寸规格
    if (/%|calc|em|rem|vh|vw/.test(w)) continue;
    const tok = /--([a-z0-9-]+)/.exec(w);
    blocks.push(tok ? `--${tok[1]}` : norm(w));
  }

  // —— 圆角 ——
  const radii = [];
  for (const { decls } of rules) {
    for (const key of ['border-radius', 'border-top-left-radius']) {
      const v = decls[key];
      if (!v) continue;
      const tok = RADIUS_TOKEN.exec(v);
      // RADIUS_TOKEN 的捕获组本身带 `--`，不要再前缀一次（否则输出 ----r-card）
      radii.push(tok ? tok[1] : v.replace(/\s+/g, ' '));
    }
  }

  // —— 加载态 / 空态分类 ——
  const usesStateLoading = /<state-loading/.test(wxml);
  const usesSkeleton = /skel|shimmer/.test(wxml) || /shimmer/.test(wxss);
  const usesInlineSpinner = /class="[^"]*(loading|spinner)[^"]*"/.test(wxml) && !usesStateLoading;
  const loading = usesStateLoading ? 'state-loading' : usesSkeleton ? '骨架屏'
    : usesInlineSpinner ? '手写 spinner' : '无';
  const usesStateEmpty = /<state-empty/.test(wxml);
  const bespokeEmpty = /class="[^"]*(empty|load-error)[^"]*"/.test(wxml) && !usesStateEmpty;
  const emptyState = usesStateEmpty ? (bespokeEmpty ? 'state-empty + 自绘' : 'state-empty')
    : bespokeEmpty ? '自绘' : '无';

  // —— 未声明组件 / 置了没人读的状态位 ——
  const undeclared = [];
  for (const tag of new Set((wxml.match(/<([a-z][a-z0-9]*(?:-[a-z0-9]+)+)[\s/>]/g) || [])
    .map((s) => s.slice(1).split(/[\s/>]/)[0]))) {
    if (['scroll-view', 'cover-view', 'cover-image', 'movable-area', 'movable-view',
      'match-media', 'page-container', 'root-portal', 'navigation-bar',
      'keyboard-accessory', 'page-meta', 'share-element'].includes(tag)) continue;
    if (!json.includes(`"${tag}"`)) undeclared.push(tag);
  }
  const jsSrc = read(path.join(ROOT, dir, 'index.js'));
  const setKeys = new Set();
  for (const m of jsSrc.matchAll(/setData\(\s*\{([\s\S]{0,600}?)\}\s*\)/g)) {
    for (const k of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) setKeys.add(k[1]);
  }
  const deadFlags = [...setKeys].filter((k) => /(?:Failed|Error)$/.test(k)
    && !new RegExp(`\\b${k}\\b`).test(wxml));

  // —— 图标来源 ——
  let emojiHits = 0;
  for (const ch of wxml) {
    const cp = ch.codePointAt(0);
    if (cp > 0xffff || (cp < 0x10000 && isEmojiPresentationBmp(cp))) emojiHits += 1;
  }
  const cssIcons = new Set((wxss.match(/\.(?:ico|ic|ricon|fab)-[a-z0-9-]+/g) || [])
    .concat(wxml.match(/\b(?:ico|ic|ricon|fab)-[a-z0-9-]+/g) || []));

  const rawRpx = (wxss.match(/:\s*[^;]*?\d+(?:\.\d+)?rpx/g) || []).length;
  // 只数**几何属性**上的裸 px：backdrop-filter: blur(6px) 这类模糊半径本来就该用 px
  // （它不随屏宽缩放），算进来是噪音——实测全站 4 处裸 px 里有 2 处是 blur、
  // 2 处是胶囊避让的兜底值（胶囊是 px 定宽控件，用 px 才对）。
  const rawPx = (wxss.match(/(?:^|[;\s])(left|right|top|bottom|width|height|margin|padding|gap|font-size|border-radius)\s*:\s*[^;]*?\d+(?:\.\d+)?px(?![a-z])/gm) || [])
    .filter((s) => !/rpx/.test(s)).length;

  return {
    dir,
    journey: journeyOf(dir),
    blocks: [...new Set(blocks)].sort(),
    radii: [...new Set(radii)].sort(),
    loading,
    emptyState,
    undeclared,
    deadFlags,
    emojiHits,
    cssIcons: cssIcons.size,
    rawRpx,
    rawPx,
  };
});

const journeyOrder = ['点菜', '做菜', '社区', '冰箱', '未归类'];
const byJourney = (j) => rows.filter((r) => r.journey === j);

// 「实现数」= **没名字的裸值种数**。第一版把 token 名也各算一种，结果把 9 个裸值
// 换成 5 个 token 之后指标反而涨了 1——那是在给规格表改名，不是收敛。
// 现在只数"还没进 token 表的取值"，它归零才说明这一角色真的被管住了；
// 同时另报 token 种数，用来盯"表是不是又在长私人偏方"。
const rawKinds = (list, key) => [...new Set(list.flatMap((r) => r[key]))].filter((v) => !/^--/.test(v)).length;
const tokenKinds = (list, key) => [...new Set(list.flatMap((r) => r[key]))].filter((v) => /^--/.test(v)).length;
const divergence = {
  图块尺寸: rawKinds(rows, 'blocks'),
  圆角: rawKinds(rows, 'radii'),
  加载态: new Set(rows.map((r) => r.loading)).size,
  空态: new Set(rows.map((r) => r.emptyState)).size,
};
const coreRows = rows.filter((r) => r.journey !== '未归类');
const divergenceCore = {
  图块尺寸: rawKinds(coreRows, 'blocks'),
  圆角: rawKinds(coreRows, 'radii'),
  加载态: new Set(coreRows.map((r) => r.loading)).size,
  空态: new Set(coreRows.map((r) => r.emptyState)).size,
};
const tokenCount = {
  图块尺寸: tokenKinds(rows, 'blocks'),
  圆角: tokenKinds(rows, 'radii'),
};

const totals = {
  pages: rows.length,
  undeclared: rows.filter((r) => r.undeclared.length).map((r) => `${r.dir}:${r.undeclared.join(',')}`),
  deadFlags: rows.filter((r) => r.deadFlags.length).map((r) => `${r.dir}:${r.deadFlags.join(',')}`),
  emojiHits: rows.filter((r) => r.emojiHits).map((r) => `${r.dir}:${r.emojiHits}`),
  rawRpx: rows.reduce((a, r) => a + r.rawRpx, 0),
  rawPx: rows.reduce((a, r) => a + r.rawPx, 0),
};

const md = [];
md.push('# UI 台账（生成物，勿手改）');
md.push('');
md.push('生成命令：`node miniapp/test/ui-ledger.js`（零依赖，只读扫描，不改任何文件）');
md.push('');
md.push('## 收敛主指标：还没进 token 表的裸值种数（越小越好，归零才算管住）');
md.push('');
md.push('| 角色 | 四条主线 | 全站（含未归类） |');
md.push('| --- | --- | --- |');
for (const k of Object.keys(divergenceCore)) {
  md.push(`| ${k} | ${divergenceCore[k]} | ${divergence[k]} |`);
}
md.push('');
md.push(`已命名的规格：图块 ${tokenCount.图块尺寸} 个 token、圆角 ${tokenCount.圆角} 个 token。`
  + '这两个数**不该无脑涨**——每加一个 token 都要能说出它是哪个角色。');
md.push('');
md.push('## 逐页读数');
md.push('');
for (const j of journeyOrder) {
  const list = byJourney(j);
  if (!list.length) continue;
  md.push(`### ${j}`);
  md.push('');
  md.push('| 页面 | 图块尺寸 | 圆角取值 | 加载态 | 空态 | 裸 rpx | 裸 px | emoji | CSS 图标 | 未声明组件 | 置了没人读的状态位 |');
  md.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of list) {
    md.push(`| \`${r.dir}\` | ${r.blocks.join(' / ') || '—'} | ${r.radii.join(' / ') || '—'} | ${r.loading} | ${r.emptyState} | ${r.rawRpx} | ${r.rawPx} | ${r.emojiHits || '0'} | ${r.cssIcons} | ${r.undeclared.join(', ') || '—'} | ${r.deadFlags.join(', ') || '—'} |`);
  }
  md.push('');
}
md.push('## 已接受的债务（不是待办）');
md.push('');
md.push('- 全站裸 rpx 共 **' + totals.rawRpx + '** 处。本轮**不做 `--sp-*` 全量替换**：'
  + '现有 spacing token 只有 6 档，而各页众数值（20/28/36rpx 等）压根没有对应 token，'
  + '全量替换等于在零视觉断言的 CI 下重做 1.3 万行样式——与当初放弃 `--fs-*` 改名同形。'
  + '**只在某一轮已经要改那个块时顺手用 token**。');
md.push(`- 裸 px ${totals.rawPx} 处：px 在小程序里不随屏宽缩放，出现即应逐个确认（不是批量替换对象）。`);
md.push('');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'ledger.md'), md.join('\n'));
fs.writeFileSync(path.join(OUT_DIR, 'ledger.json'), JSON.stringify({ divergence, divergenceCore, totals, rows }, null, 2));

console.log(`UI 台账：${totals.pages} 个页面 -> artifacts/ui-ledger/ledger.md`);
console.log('四条主线·没名字的裸值种数：' + Object.entries(divergenceCore).map(([k, v]) => `${k}=${v}`).join(' · ')
  + `（图块 token ${tokenCount.图块尺寸} 个 / 圆角 token ${tokenCount.圆角} 个）`);
console.log('全站·没名字的裸值种数：' + Object.entries(divergence).map(([k, v]) => `${k}=${v}`).join(' · '));
console.log(`裸 rpx ${totals.rawRpx} · 裸 px ${totals.rawPx} · 未声明组件 ${totals.undeclared.length} · 死状态位 ${totals.deadFlags.length} · emoji 图标 ${totals.emojiHits.length} 页`);
if (totals.undeclared.length) console.log('  未声明：' + totals.undeclared.join(' | '));
if (totals.deadFlags.length) console.log('  死状态位：' + totals.deadFlags.join(' | '));
if (totals.emojiHits.length) console.log('  emoji：' + totals.emojiHits.join(' | '));

if (process.argv.includes('--check')) {
  const prevPath = path.join(OUT_DIR, 'last.json');
  const prev = fs.existsSync(prevPath) ? JSON.parse(fs.readFileSync(prevPath, 'utf8')) : null;
  fs.writeFileSync(prevPath, JSON.stringify(divergenceCore));
  if (!prev) {
    console.log('--check：没有上一次的读数，本次只落基线');
  } else {
    const worse = Object.keys(divergenceCore).filter((k) => divergenceCore[k] > prev[k]);
    if (worse.length) {
      console.error('--check 失败：' + worse.map((k) => `${k} ${prev[k]} -> ${divergenceCore[k]}`).join('、')
        + '（同一视觉角色的实现数变多了，要么收敛、要么在台账里写明为什么是新角色）');
      process.exit(1);
    }
    console.log('--check：实现数没有变差');
  }
}
