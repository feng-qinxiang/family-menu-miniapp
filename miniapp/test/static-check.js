#!/usr/bin/env node
/**
 * 小程序静态自检（零依赖，直接 node 跑）
 *
 *   node miniapp/test/static-check.js
 *
 * 为什么需要它：微信开发者工具里 WXSS 编译失败只会把整个小程序变成白屏，
 * 而 git、编辑器、其它静态检查都不会报错。曾经发生过一次——重命名 CSS 类时
 * 少删了两行旧声明，多出一个 `}`，提交上去后小程序直接打不开，
 * 排查花了很久。这类错误机器一眼就能看出来，不该靠人。
 *
 * 检查项：
 *   1. app.json 声明的页面（含分包），四件套（js/json/wxml/wxss）是否齐全
 *   1b. tabBar 声明与 utils/tabs.js 是否一致（数量/顺序/路径），tab 页是否已在 pages 里
 *   2. 所有 .json 能否解析
 *   3. 所有 .wxss 花括号是否配平、是否误用了 // 注释（WXSS 不支持）
 *   4. .wxml 里引用的本地图片是否存在
 *   5. .json 里 usingComponents 指向的组件是否存在
 *   6. .wxml 里 bind / catch 绑定的处理函数是否真实存在（点了没反应的头号原因）
 *   7. .js 里字面量跳转路径是否指向已声明页面；是否用了会整页白屏的数组解构
 *   8. .wxss 里 font-size 是否可随「大字模式」缩放
 *   9. .wxss 里 border / color 是否写死裸黑（深色模式下会看不见）
 *  10. .js 里 require() 的相对路径目标是否存在（漏提交新文件 = CI 检出树里缺文件）
 *  11. .wxss 里 var(--token) 引用的名字是否真有定义（拼错的 token 会静默丢样式）
 *  12. 恒定暗底（沉浸）页的前景/填充色是否在浅色档和深色档都成立（深色档翻出 #333 正文即失败）
 *  13. 绑了动态文本的标题是否用了「单行展示字」的紧凑行高（长菜名一换行两行字会互压）
 *  14. 主包/分包体积（按真实字节，非 du 的磁盘块）：逼近 2MB 上限就报，超了才判失败
 *  15. 大字模式是否每页都接上（只接一半、整页没接都判失败）
 *  16. catch 里清列表时是否同时置了「加载失败」状态位（否则失败会被显示成「还没有数据」）
 *  17. 图标是否用了系统 emoji（非 BMP 码位，或符号区字符没追加 \FE0E 文字呈现）
 *  18. WXML 用到的自定义组件是否在同页 index.json 声明（漏声明不报错、整屏不渲染）
 *  19. JS 里置的 *Failed / *Error 状态位是否真的被 WXML 读到（置了没人读 = 失败显示成空态）
 *  20. WXML 里的图标是否用了 emoji（第 17 项只管 WXSS 的 content:，管不到渲染层）
 *  21. 行内图块（类名带 thumb）的边长是否走 app.wxss 的 --dish-thumb / --tile-* 规格表
 *  22. var(--token, 兜底) 的兜底值是否等于 token 定义值（兜底写错平时看不见）
 *  23. tab 页底部留白是否真的让开自定义 tabBar（含 --tabbar-h 或安全区）
 *  24. 字号是否在 12 档刻度上（标尺外的展示级尺寸走冻结白名单，禁止新增）
 *  25. 每条声明是否写成 property: value（花括号配平查不出非法声明，模拟器会整包编译失败）
 *  26. 大图框（aspectFill 的照片位）比例是否还在横长条上、高度是否出自 --photo-*-h 规格表
 *  27. 大图位置是否有"确认失败才画出来"的兜底（binderror + data-err-key + img-broken 三样齐）
 *  28. 卡表面（圆角走 --r-card）的左右内边距是否出自 --pad-card* 规格表
 *  29. 头像位的圆角/字号是否由框宽推出（--r-ava / --ava-glyph），而不是各写一个数
 *  30. 每个 .js 是否能通过语法解析（前面所有检查都是正则读源码，没人真的解析过）
 *
 * 退出码：有问题返回 1（可直接用于 CI）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const problems = [];

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'miniprogram_npm', '.git'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
};

/** 去掉注释，避免注释里的花括号干扰配平统计 */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');
/** 把注释内容抹成空格但**保留换行**：这样报出来的行号仍然对得上原文件。
    第一版直接用 stripComments 的结果算行号，注释越多的文件行号偏得越远（实测 app.wxss 报 435 实际在 442）。 */
const blankComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

// ---- 1. app.json 页面文件齐全（主包 + 分包） ----
const appJsonPath = path.join(ROOT, 'app.json');
if (!fs.existsSync(appJsonPath)) {
  console.error('✘ 找不到 app.json');
  process.exit(1);
}
const app = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

/** 主包页面 + 分包页面，统一成可用于拼接文件路径的相对路径。 */
const declaredPages = [
  ...(app.pages || []),
  ...(app.subpackages || []).flatMap((sp) =>
    (sp.pages || []).map((p) => `${sp.root}/${p}`)
  )
];

for (const page of declaredPages) {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) {
    if (!fs.existsSync(path.join(ROOT, page + '.' + ext))) {
      problems.push(`页面文件缺失: ${page}.${ext}`);
    }
  }
}

// ---- 1b. tabBar 声明与 utils/tabs.js 一致 ----
// tab 定义分散在 app.json 和自定义 tabBar 组件里时，很容易只改一边。
// 这里以 utils/tabs.js 为准做双向校验：顺序、数量、路径都要一致，且 tab 页必须在 pages 里。
{
  const tabsPath = path.join(ROOT, 'utils', 'tabs.js');
  if (!fs.existsSync(tabsPath)) {
    problems.push('缺少 utils/tabs.js（TabBar 的唯一数据源）');
  } else {
    let allTabs = null;
    try {
      allTabs = require(tabsPath).ALL_TABS;
    } catch (err) {
      problems.push(`utils/tabs.js 加载失败: ${err.message}`);
    }
    if (Array.isArray(allTabs)) {
      // app.json 的 pagePath 不带前导斜杠，tabs.js 里带（switchTab 与 route 匹配需要），比较时统一
      const norm = (p) => String(p).replace(/^\//, '');
      const declared = (app.tabBar && app.tabBar.list) || [];
      const declaredPaths = declared.map((t) => norm(t.pagePath));
      const canonicalPaths = allTabs.map((t) => norm(t.pagePath));
      if (declaredPaths.join('|') !== canonicalPaths.join('|')) {
        problems.push(
          `tabBar 与 utils/tabs.js 不一致: app.json=[${declaredPaths.join(', ')}] ` +
          `tabs.js=[${canonicalPaths.join(', ')}]`
        );
      }
      for (const tab of allTabs) {
        const page = tab.pagePath.replace(/^\//, '');
        if (!(app.pages || []).includes(page)) {
          problems.push(`tab 页未在 app.json pages 中声明: ${tab.pagePath}`);
        }
      }
    }
  }
}

const files = walk(ROOT);

// ---- 7. 页面跳转路径必须指向已声明的页面 ----
// 分包重构最怕的就是漏改一处 url：开发者工具不会报错，只有点进去才白屏。
// 这里把所有字面量跳转路径与 app.json 声明做一次对账（带 ${} 的动态路径不做校验）。
const NAV_URL = /(?:url|path)\s*:\s*['"]([^'"]+)['"]/g;
for (const file of files) {
  if (!file.endsWith('.js')) continue;
  const src = fs.readFileSync(file, 'utf8');
  const seen = new Set();
  for (const m of src.matchAll(NAV_URL)) {
    let target = m[1];
    if (!target.startsWith('/') || target.includes('${')) continue;   // 只校验绝对路径字面量
    target = target.split('?')[0].replace(/\/+$/, '');
    if (seen.has(target)) continue;
    seen.add(target);
    const bare = target.replace(/^\//, '');
    if (!declaredPages.includes(bare) && !declaredPages.includes(bare + '/index')) {
      problems.push(`跳转路径没有对应页面 ${rel(file)} -> ${m[1]}`);
    }
  }
}

// ---- 6. 事件处理函数存在性 ----
// 点了没反应 = 用户直接判定"这个页面坏了"。绑定名与实现名拼错（navigateTo vs navigateto、
// 删了 js 方法忘了删 wxml）在编辑器里都不会报错，所以放进静态检查。
// 处理函数可能定义在：页面 js 本体、behaviors/、app.js（全局方法）。
const behaviorsDir = path.join(ROOT, 'behaviors');
const sharedSources = [];
if (fs.existsSync(behaviorsDir)) {
  for (const f of walk(behaviorsDir)) if (f.endsWith('.js')) sharedSources.push(fs.readFileSync(f, 'utf8'));
}
const appJsPath = path.join(ROOT, 'app.js');
if (fs.existsSync(appJsPath)) sharedSources.push(fs.readFileSync(appJsPath, 'utf8'));

const EVENT_ATTR = /\b(?:bind|catch|mut-bind)(?::)?([a-zA-Z-]+)\s*=\s*"([^"{}]+)"/g;
for (const file of files) {
  if (!file.endsWith('.wxml')) continue;
  const src = fs.readFileSync(file, 'utf8');
  const jsPath = file.replace(/\.wxml$/, '.js');
  if (!fs.existsSync(jsPath)) continue;   // 组件根 wxml 等情况，另有检查
  const js = fs.readFileSync(jsPath, 'utf8');
  const seen = new Set();
  for (const m of src.matchAll(EVENT_ATTR)) {
    const handler = m[2].trim();
    if (!handler || seen.has(handler)) continue;
    seen.add(handler);
    const pattern = new RegExp(`(^|[^\\w$])${handler.replace(/[$]/g, '\\$')}\\s*[(:]`);
    if (pattern.test(js)) continue;
    if (sharedSources.some((s) => pattern.test(s))) continue;
    problems.push(`点击无响应 ${rel(file)} -> ${m[1]}="${handler}" 在 js / behaviors / app.js 中找不到实现`);
  }
}

for (const file of files) {
  const r = rel(file);

  // ---- 2. JSON 可解析 ----
  if (file.endsWith('.json')) {
    let parsed = null;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      problems.push(`JSON 语法错误 ${r}: ${err.message}`);
    }
    // ---- 5. usingComponents 组件存在 ----
    for (const [name, target] of Object.entries((parsed && parsed.usingComponents) || {})) {
      const base = target.startsWith('/') ? path.join(ROOT, target) : path.resolve(path.dirname(file), target);
      if (!fs.existsSync(base + '.wxml') && !fs.existsSync(base + '.js')) {
        problems.push(`组件不存在 ${r} -> ${name}: ${target}`);
      }
    }
  }

  // ---- 3. WXSS 配平 + 注释风格 ----
  if (file.endsWith('.wxss')) {
    const raw = fs.readFileSync(file, 'utf8');
    const body = stripComments(raw);
    const open = (body.match(/{/g) || []).length;
    const close = (body.match(/}/g) || []).length;
    if (open !== close) {
      problems.push(`WXSS 花括号不配平 ${r}: { ${open} 个, } ${close} 个（小程序会编译失败白屏）`);
    }
    body.split('\n').forEach((line, i) => {
      if (line.trim().startsWith('//')) {
        problems.push(`WXSS 使用了 // 注释（WXSS 只支持 /* */）${r}:${i + 1}`);
      }
    });
  }

  // ---- 4. wxml 本地图片存在 ----
  if (file.endsWith('.wxml')) {
    const src = fs.readFileSync(file, 'utf8');
    for (const match of src.matchAll(/src\s*=\s*["']([^"'{}]+)["']/g)) {
      const target = match[1];
      if (/^(https?:|data:|\/\/|wxfile)/.test(target)) continue;
      const resolved = target.startsWith('/')
        ? path.join(ROOT, target)
        : path.resolve(path.dirname(file), target);
      if (!fs.existsSync(resolved)) {
        problems.push(`图片不存在 ${r} -> ${target}`);
      }
    }
  }
}

// ---- 7. 数组解构语法（整页白屏级事故，已发生 15+ 页）----
// 数组解构编译后依赖 @babel/runtime 辅助模块（arrayWithHoles 等），项目未打包该运行时，
// 页面 JS 一加载即崩、整页白屏且无错误 UI。三种形式全部禁止，一律改下标取值：
//   const [a, b] = x  ｜  [a, b] = x（赋值式）  ｜  .then(([a, b]) => {})（回调参数）
const DESTRUCTURE_RULES = [
  { re: /(?:^|[^.\w$])(?:const|let|var)\s*\[[a-zA-Z_$][^[\];]*\]\s*=/, form: '声明式解构' },
  { re: /(?:^|[^\w$.\])'])\s*\[[a-zA-Z_$][^[\];]*\]\s*=(?!=)/m, form: '赋值式解构' },
  { re: /\(\s*\[[a-zA-Z_$][^[\]);]*\]\s*\)\s*=>/, form: '箭头函数参数解构' },
  { re: /\bfunction\s*[a-zA-Z_$][\w$]*\s*\(\s*\[[a-zA-Z_$]/, form: '函数参数解构' },
];
for (const file of files) {
  if (!file.endsWith('.js')) continue;
  if (rel(file).startsWith('test/')) continue;   // test/ 是 Node 侧脚本，不进小程序运行时
  const src = fs.readFileSync(file, 'utf8');
  for (const rule of DESTRUCTURE_RULES) {
    const m = rule.re.exec(src);
    if (m) {
      const line = src.slice(0, m.index).split('\n').length;
      problems.push(`数组解构语法 ${rel(file)}:${line}（${rule.form}）—— 编译依赖 @babel/runtime（未打包），会整页白屏，请改下标取值`);
      break;
    }
  }
}

// ---- 8 & 9. WXSS 逐行代码（已剔除注释，保留原行号）----
// 深色模式靠 @media 覆盖 --theme* 变量，所以"写死颜色"只在其中一档成立；
// 注释里的示例值又常被误当成声明，故两者共用一个去注释的行扫描器。
function wxssCodeLines(file) {
  const out = [];
  let inComment = false;
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    let text = line;
    if (inComment) {
      const end = text.indexOf('*/');
      if (end === -1) return;
      text = text.slice(end + 2);
      inComment = false;
    }
    const open = text.indexOf('/*');
    if (open !== -1) {
      const close = text.indexOf('*/', open + 2);
      text = close === -1 ? text.slice(0, open) : text.slice(0, open) + text.slice(close + 2);
      inComment = close === -1;
    }
    out.push([i + 1, text]);
  });
  return out;
}

// ---- 8. 字号必须能随「大字模式」放大 ----
// 全站 776 处 font-size 已统一成 var(--fs-*) 或 calc(Xrpx * var(--fs-mul, 1))。
// 再裸写一个 rpx/px 字号，就是在这一行悄悄放弃无障碍缩放——编译不报错、走查也难发现，所以钉成检查项。
const FONT_SIZE_DECL = /font-size\s*:\s*([^;{}]+)/;
// 描边/文字用了裸黑：深色档 = 深底上加一点更黑，直接看不见（厨房总控幽灵按钮、社区加图虚线都中过）
const BLACK_ON_SURFACE = /(?:^|[;{ ])(border|color)\s*:[^;]*rgba\(\s*0\s*,\s*0\s*,\s*0/;
for (const file of files) {
  if (!file.endsWith('.wxss')) continue;
  const r = rel(file);
  for (const [no, text] of wxssCodeLines(file)) {
    const fsMatch = FONT_SIZE_DECL.exec(text);
    if (fsMatch) {
      const value = fsMatch[1].trim();
      if (!value.includes('var(') && /\d+(\.\d+)?(rpx|px)/.test(value)) {
        problems.push(
          `字号不随大字模式放大 ${r}:${no} -> font-size: ${value}` +
          `（请改为 var(--fs-*) 或 calc(${value} * var(--fs-mul, 1))）`
        );
      }
    }
    const bMatch = BLACK_ON_SURFACE.exec(text);
    if (bMatch) {
      problems.push(
        `深色模式下 ${bMatch[1]} 用的裸黑会看不见 ${r}:${no} -> ${text.trim()}` +
        '（请改用 var(--line-deep) / var(--c-border) / var(--mut) 等会翻转的 token）'
      );
    }
  }
}

// ---- 10. require() 的目标文件必须存在 ----
// 相对路径写错一级（`../utils/x` 应为 `../../utils/x`）时，模块在 require 阶段就抛错：
// 页面整块空白、console 干净，若外面还包了 try/catch 则连错误都看不见。
// 另一个作用是把「被依赖的新文件忘了提交」挡在 CI：CI 只检出已提交内容，
// 漏 add 的文件在检出树里不存在，这一项会直接失败。
const REQUIRE_CALL = /require\(\s*['"]([^'"\s]+)['"]\s*\)/g;
const JS_COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/;
for (const file of files) {
  if (!file.endsWith('.js')) continue;
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (JS_COMMENT_LINE.test(line)) return;
    let m;
    REQUIRE_CALL.lastIndex = 0;
    while ((m = REQUIRE_CALL.exec(line))) {
      const spec = m[1];
      if (spec.indexOf('.') !== 0) continue; // 只校验相对路径，包名/根路径交给运行时
      if (spec.indexOf('${') !== -1) continue;
      const base = path.resolve(path.dirname(file), spec);
      const candidates = [base, base + '.js', base + '.json', path.join(base, 'index.js')];
      if (!candidates.some((c) => fs.existsSync(c))) {
        problems.push(`require 的目标不存在 ${rel(file)}:${i + 1} -> ${spec}（页面会在加载时整块白屏）`);
      }
    }
  });
}

// ---- 11. var(--token) 用的名字必须真的有人定义 ----
// 设计 token 全站靠 --xxx 传，深色档整套观感也靠覆盖这些变量实现。
// 拼错一个 token 名不会报错，只会静默丢掉颜色/间距：浅色档可能看着还行，
// 深色档直接变成"没有值"。带 fallback 的 var(--x, y) 不算错（它会退到 y），
// 只钉无 fallback 的裸引用——那才是真的渲染成无效值。
// token 定义来自两处：.wxss 里的 `--x: ...` 与 theme.json 的 light/dark 键。
const TOKEN_DEF = /(--[a-zA-Z0-9-]+)\s*:/g;
const TOKEN_USE = /var\(\s*(--[a-zA-Z0-9-]+)\s*([,)])/g;
const definedTokens = new Set();
const tokenUses = [];
for (const file of files) {
  if (file.endsWith('.json')) {
    // theme.json：light/dark 两档的键都会变成 --键名 供 $xxx / var() 使用
    let parsed = null;
    try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { continue; }
    ['light', 'dark'].forEach((mode) => {
      Object.keys((parsed && parsed[mode]) || {}).forEach((k) => definedTokens.add('--' + k));
    });
    continue;
  }
  if (!file.endsWith('.wxss')) continue;
  const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  let m;
  TOKEN_DEF.lastIndex = 0;
  while ((m = TOKEN_DEF.exec(src))) definedTokens.add(m[1]);
  TOKEN_USE.lastIndex = 0;
  while ((m = TOKEN_USE.exec(src))) {
    if (m[2] === ',') continue; // 有 fallback，不算未定义
    tokenUses.push([m[1], rel(file)]);
  }
}
const seenBadToken = new Set();
for (const [token, where] of tokenUses) {
  if (definedTokens.has(token)) continue;
  const key = token + '@' + where;
  if (seenBadToken.has(key)) continue;
  seenBadToken.add(key);
  problems.push(`var() 引用了没定义的 token ${where} -> ${token}（会静默丢掉该处样式，深色档尤其明显）`);
}

// ---- 12. 恒定暗底页（沉浸模式）上的配色必须在两档都成立 ----
// 烹饪模式这类页面的底色 --cook-bg 两档都是深色（#1a1410 / #111111），它不像普通页面
// 那样「底和字一起翻转」。所以这类页面上任何会翻转的 token 都会在深色档翻到暗底的
// 另一头：实测 --c-border-light 深色档 = #333333，压在 #111111 上对比度 1.6:1，
// 做菜正文直接看不见；--ink 深色档 = #efefef，暗底上会蹦出白卡片、白药丸、白按钮。
// 规则（只挡「看不见」这一级，不挡「略逊」）：
//   color:      与所在规则/页面底色在两档下的对比度都 ≥ 3.0
//   background: 两档取值必须稳定（|相对亮度差| ≤ 0.25），否则暗底上会翻出亮块
//   border(-color): 同上稳定（描边图标翻成暗色就等于没有）
const themePath = path.join(ROOT, 'theme.json');
if (fs.existsSync(themePath)) {
  const theme = JSON.parse(fs.readFileSync(themePath, 'utf8'));
  const lumOf = (hex) => {
    const h = hex.trim().replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    const ch = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const contrast = (a, b) => {
    const la = lumOf(a), lb = lumOf(b);
    if (la == null || lb == null) return null;
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  // token -> { light, dark }：app.wxss 里 --x: var(--themeX, #fallback) 的取 theme.json，
  // 写成常量 hex 的两档相同。
  const appWxss = stripComments(fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8'));
  const tokens = {};
  for (const m of appWxss.matchAll(/(--[\w-]+)\s*:\s*var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-fA-F]{3,6})\s*\)/g)) {
    const tk = m[2].slice(2);   // --themePaper -> themePaper（theme.json 里的键名）
    tokens[m[1]] = { light: theme.light[tk] || m[3], dark: theme.dark[tk] || m[3] };
  }
  for (const m of appWxss.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*(?:;|[;}])/g)) {
    if (!tokens[m[1]]) tokens[m[1]] = { light: m[2], dark: m[2] };
  }
  /** 解析一条声明值 -> {light,dark}；rgba/gradient/未知一律返回 null（不参与判定） */
  const resolve = (value) => {
    const v = value.trim();
    const tv = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/.exec(v);
    if (tv) {
      if (tokens[tv[1]]) return tokens[tv[1]];
      return /#[0-9a-fA-F]{3,6}/.test(tv[2] || '')
        ? { light: tv[2].trim(), dark: tv[2].trim() }
        : null;
    }
    if (/^#[0-9a-fA-F]{3,6}$/.test(v)) return { light: v, dark: v };
    return null;
  };
  // 两档都偏暗的 token = 恒定暗底；引用它的页面即「沉浸页」
  const fixedDark = Object.keys(tokens).filter(
    (t) => lumOf(tokens[t].light) < 0.25 && lumOf(tokens[t].dark) < 0.25
  );
  for (const file of files) {
    if (!file.endsWith('.wxss')) continue;
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    // 只有「页面根节点」铺恒定暗底的才算沉浸页。根节点类名取自同目录 WXML 的第一个元素，
    // 否则页内一枚深色小 badge 也会把整份文件误判成暗底页（vip/orders 的 --pine 徽章即如此）。
    const wxmlPath = file.replace(/\.wxss$/, '.wxml');
    const rootClasses = new Set();
    if (fs.existsSync(wxmlPath)) {
      const rootEl = /<(?:view|scroll-view|block)[^>]*class="([^"]+)"/.exec(fs.readFileSync(wxmlPath, 'utf8'));
      if (rootEl) rootEl[1].split(/\s+/).forEach((c) => c && rootClasses.add(c));
    }
    const surfaces = fixedDark.filter((t) => {
      if (!rootClasses.size) return false;
      for (const b of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sel = b[1].trim().replace(/\s+/g, ' ');
        if (!/^\.[\w-]+$/.test(sel)) continue;
        if (!rootClasses.has(sel.slice(1))) continue;
        if (new RegExp('background[^;]*var\\(\\s*' + t + '\\s*\\)').test(b[2])) return true;
      }
      return false;
    });
    if (!surfaces.length) continue;
    const r = rel(file);
    // 逐条规则块判定：块内自带 background 时用它当底色，否则用页面恒定暗底
    for (const block of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = block[1].trim().replace(/\s+/g, ' ');
      const body = block[2];
      const own = /(?:^|[;])\s*(?:background|background-color)\s*:\s*([^;]+)/.exec(body);
      const bg = own ? resolve(own[1].replace(/^(linear|radial)-gradient\([\s\S]*$/, 'x')) : null;
      const pageBg = resolve(`var(${surfaces[0]})`);
      const surf = bg || pageBg;
      for (const m of body.matchAll(/(^|[;])\s*(color|border-color|border)\s*:\s*([^;]+)/g)) {
        const prop = m[2];
        const raw = m[3].trim();
        if (prop !== 'color') {
          const pair = resolve(/var\([^)]*\)|#[0-9a-fA-F]{3,6}/.exec(raw)?.[0] || raw);
          if (pair && Math.abs(lumOf(pair.light) - lumOf(pair.dark)) > 0.25) {
            problems.push(
              `恒定暗底页的 ${prop} 两档翻转，深色档会看不见 ${r} -> ${selector} { ${prop}: ${raw} }` +
              `（${pair.light} → ${pair.dark}；请改用不随深色档翻转的 --cook-* 常量）`
            );
          }
          continue;
        }
        const fg = resolve(raw);
        if (!fg || !surf) continue;
        ['light', 'dark'].forEach((mode) => {
          const c = contrast(fg[mode], surf[mode]);
          if (c != null && c < 3) {
            problems.push(
              `恒定暗底页前景在${mode === 'dark' ? '深色' : '浅色'}档不可读 ${r} -> ${selector} ` +
              `{ color: ${raw} } 对比度 ${c.toFixed(2)}:1（底色 ${surf[mode]}，需 ≥3:1；请改用 --cook-* 常量）`
            );
          }
        });
      }
    }
  }
}

// ---- 13. 绑了动态文本的标题不许用「单行展示字」的紧凑行高 ----
// line-height < 1 是给一行大标题定的紧凑值。可一旦这个标题绑的是用户输入（菜名、家庭名），
// 长到换行时上下两行的字面会直接互相压上去。本轮实测抓到三处：登录页 hero 的硬换行
// （「今天吃什么 / 一家人说了算」贴在一起）、菜谱详情页 19 字菜名换三行、我的页长家庭名。
// 整屏截图里很难看出来，得放大才看得见，所以钉成检查项。
// 判定：规则里 line-height < 1，且该类在配套 WXML 里绑着 {{动态文本}}，
// 而规则自身既没有 white-space: nowrap 也没有 -webkit-line-clamp —— 有任一个都算安全。
const TIGHT_LINE_HEIGHT = /line-height\s*:\s*(0?\.\d+|\d+(?:\.\d+)?)\s*;/;
for (const file of files) {
  if (!file.endsWith('.wxss')) continue;
  const wxmlPath = file.replace(/\.wxss$/, '.wxml');
  if (!fs.existsSync(wxmlPath)) continue;
  const tmpl = fs.readFileSync(wxmlPath, 'utf8');
  const r = rel(file);
  for (const block of stripComments(fs.readFileSync(file, 'utf8')).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = block[2];
    const lh = TIGHT_LINE_HEIGHT.exec(body);
    if (!lh) continue;
    const v = parseFloat(lh[1]);
    if (!(v > 0 && v < 1)) continue;
    if (/white-space\s*:\s*nowrap|-webkit-line-clamp/.test(body)) continue;
    const classes = [];
    for (const c of block[1].matchAll(/\.([\w-]+)/g)) classes.push(c[1]);
    if (!classes.length) continue;
    const dyn = classes.filter((c) =>
      new RegExp('<[a-z-]+[^>]*class="[^"]*\\b' + c + '\\b[^"]*"[^>]*>[^<]*\\{\\{').test(tmpl))[0];
    if (!dyn) continue;
    problems.push(
      `紧凑行高的标题绑着动态文本，长名字一换行两行字会互压 ${r} -> .${dyn} { line-height: ${v} }` +
      '（请给到 line-height ≥ 1，或加 white-space: nowrap，或用 -webkit-line-clamp 限制行数）'
    );
  }
}

// ---- 14. 包体积：主包逼近微信上限时先说，超了才判失败 ----
// 微信主包上限 2MB（单个分包也是 2MB，整包 30MB）。实测按文件真实字节累加：
// 主包 1.36MB（68%）、分包 pkg-extra 0.53MB —— 还有余量，但没人盯着就没人知道什么时候顶穿，
// 而上传报错（"main package source size exceed max limit"）只说超限、不说谁占的。
// ⚠ 别用 `du -sk` 估包体积：它按磁盘块（4KB/文件）计，本项目两百多个小文件会让主包
// 从 1.36MB 虚报成 1.84MB（我本轮就这么错过一次，差点写出"再加两张图就顶穿"的错结论）。
// 只有真超过上限才判红；没超时判红会淹没真正的失败。
const MAIN_LIMIT_KB = 2 * 1024;
const WARN_KB = Math.round(MAIN_LIMIT_KB * 0.85);
const sizeKb = (dir) => {
  let total = 0;
  for (const f of walk(path.join(ROOT, dir))) {
    // packOptions.ignore 里列的目录不会被打包，别把它算进主包
    const r = rel(f);
    if (r.startsWith('test/')) continue;
    total += fs.statSync(f).size;
  }
  return Math.round(total / 1024);
};
const subRoots = (app.subpackages || []).map((sp) => sp.root);
const mainKb = walk(ROOT).reduce((acc, f) => {
  const r = rel(f);
  if (r.startsWith('test/') || f.includes('/test/')) return acc;
  if (subRoots.some((sr) => r.startsWith(sr + '/'))) return acc;
  return acc + fs.statSync(f).size;
}, 0) / 1024;
const sizeLines = [`主包 ${Math.round(mainKb / 10.24) / 100}MB / 2MB`];
for (const sr of subRoots) sizeLines.push(`分包 ${sr} ${Math.round(sizeKb(sr) / 10.24) / 100}MB / 2MB`);
console.log('包体积：' + sizeLines.join(' · '));
const sizeWarns = [];
if (mainKb > MAIN_LIMIT_KB) {
  problems.push(`主包已超微信 2MB 上限（实测 ${Math.round(mainKb / 10.24) / 100}MB），上传会直接失败` +
    '——把只被分包页面用到的资源挪进分包，或压掉 assets 里的占位图');
} else if (mainKb > WARN_KB) {
  sizeWarns.push(`主包已用掉微信 2MB 上限的 ${Math.round(mainKb * 100 / MAIN_LIMIT_KB)}%` +
    `（${Math.round(mainKb / 10.24) / 100}MB）——再加一两张 assets 图就可能顶穿，` +
    '新资源优先放分包或走远程图');
}


// ---- 15. 大字模式必须每页都接上（WXML 挂 .font-lg + JS 读档位，两者都要有）----
// app.wxss 里 .font-lg 的注释就写着「全站 36 页根节点挂 .font-lg」，但 2026-09-19 实测只有 29 页真挂了。
// 漏接的页面不会报错、不会白屏，只是「用户在设置页开了大字，这一页照样小字」——
// 而漏掉的恰好包括做菜模式（手机在一臂外、手上有油，最需要大字的一屏）和菜谱详情。
// 只绑类不读档 = 永远拿到 normal；只读档不绑类 = 白读。两种都判失败。
// 2026-09-19 把其余 7 页补齐（第 8 页 cook-mode 见上一个提交）后缺口清零，所以「整页没接」
// 也从只提醒升级为失败：
// 多顶层节点的页面（recipe-detail 的三个状态、recipe-edit 的 seg/body/footbar）每个可见根节点都要挂，
// 因为 .font-lg 只是重定义自定义属性，而自定义属性只向下继承。
const fontLgMissing = [];
const fontLgHalfWired = [];
for (const page of declaredPages) {
  const wxmlPath = path.join(ROOT, page + '.wxml');
  const jsPath = path.join(ROOT, page + '.js');
  if (!fs.existsSync(wxmlPath) || !fs.existsSync(jsPath)) continue;
  const wsrc = fs.readFileSync(wxmlPath, 'utf8');
  const jsrc = fs.readFileSync(jsPath, 'utf8');
  const hasBind = wsrc.indexOf('font-lg') >= 0;
  const hasRead = jsrc.indexOf('font_scale') >= 0 || jsrc.indexOf('fontScale') >= 0;
  if (hasBind !== hasRead) fontLgHalfWired.push(page + (hasBind ? '（只绑类没读档）' : '（只读档没绑类）'));
  else if (!hasBind && !hasRead) fontLgMissing.push(page);
}
for (const x of fontLgHalfWired) {
  problems.push('大字模式只接了一半 ' + x + ' -> 要么永远不放大、要么白读一次存储');
}
for (const x of fontLgMissing) {
  problems.push('大字模式整页没接 ' + x + ' -> 设置页开了大字、这一页照样小字' +
    "（WXML 每个可见根节点挂 {{fontScale === 'lg' ? 'font-lg' : ''}}，JS 读 storage 的 font_scale）");
}

// ---- 16. catch 里清列表必须同时置一个「加载失败」状态位 ----
// 同类缺陷一次查出 3 处（family/members、me/feedback、import 的死分支），根因是同一句写法：
// 失败时只 setData({ xxx: [] })，而 WXML 的空态分支只看 xxx.length / loaded，
// 于是「加载失败」被显示成「还没有 X」——用户以为自己的数据被删了。
// 判据：0/空 = 知道没有；失败 = 不知道。两者必须各占一个状态位。
// 只看 catch 之后 500 字符内的 setData，且只认「清成空数组」这一种写法，避免误伤。
const swallowFailPages = [];
for (const page of declaredPages) {
  const jsPath = path.join(ROOT, page + '.js');
  if (!fs.existsSync(jsPath)) continue;
  const src = fs.readFileSync(jsPath, 'utf8');
  let from = 0;
  for (;;) {
    const at = src.indexOf('catch', from);
    if (at < 0) break;
    from = at + 5;
    // 取「这一整个 catch 块」而不是固定 500 字符：
    // 固定窗口会溢到 catch 后面的成功分支，把 images: [] 之类的正常写法误判成吞错。
    let open = src.indexOf('{', at + 5);
    if (open < 0) break;
    let depth = 0;
    let end = open;
    for (let i = open; i < src.length && i < open + 4000; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    const body = src.slice(open, end + 1);
    if (!/setData\(\s*\{[^}]*[\w$]+\s*:\s*\[\]/.test(body)) continue;
    if (/(?:Failed|Error)\w*\s*:\s*true/.test(body)) continue;
    swallowFailPages.push(page + ' @catch 第 ' + (src.slice(0, at).split('\n').length) + ' 行');
  }
}
for (const x of swallowFailPages) {
  problems.push('加载失败被吞成空态 ' + x +
    ' -> catch 里清了列表却没置 *Failed/*Error 标记，' +
    'WXML 的空态分支会把它显示成「还没有 X」（另加一个状态位，文案分开）');
}

// ---- 17. 图标不许用系统 emoji：必须单色、可被 CSS color 着色 ----
// 社区动作行原来用 ♡ ☆  💬 当图标。不追加 FE0E（文字呈现）时，iOS/Android 常把这些
// 符号区字符渲染成彩色 emoji；而 💬（U+1F4AC）压根没有单色形态。彩色 emoji 吃不到 CSS color，
// 于是既不跟品牌色、也不跟深色档翻转，还把系统风格混进品牌界面。
// 成熟方案（iconfont / 单色 SVG，如 Vant Weapp、TDesign）一律单色描边，这里挡住两种回潮：
//   A. 非 BMP 码位（> U+FFFF）——没有单色形态，直接失败；
//   B. 默认就是 emoji 呈现的符号区（26xx / 27xx / 2Bxx）却没跟 \FE0E。
// 纯文字（如 "·"、"+ "）不含转义码位也不在高区，放过。
const CONTENT_DECL = /content\s*:\s*["']([^"']*)["']/;
const EMOJI_DEFAULT_BLOCK = (cp) => (cp >= 0x2600 && cp <= 0x27BF) || (cp >= 0x2B00 && cp <= 0x2BFF);
for (const file of files) {
  if (!file.endsWith('.wxss')) continue;
  const r = rel(file);
  for (const [no, text] of wxssCodeLines(file)) {
    const m = CONTENT_DECL.exec(text);
    if (!m) continue;
    const raw = m[1];
    const escaped = (raw.match(/\\[0-9A-Fa-f]{1,6}/g) || []).map((s) => parseInt(s.slice(1), 16));
    const literal = Array.from(raw.replace(/\\[0-9A-Fa-f]{1,6}\s?/g, '')).map((ch) => ch.codePointAt(0));
    const codes = escaped.concat(literal).filter((cp) => !Number.isNaN(cp));
    if (!codes.length) continue;
    const hasTextPresentation = codes.indexOf(0xFE0E) >= 0;
    for (const cp of codes) {
      if (cp === 0xFE0E || cp === 0xFE0F) continue;
      if (cp > 0xFFFF) {
        problems.push(`图标用了 emoji 码位 ${r}:${no} -> U+${cp.toString(16).toUpperCase()} 没有单色形态，` +
          '跨端渲染不一致且吃不到 CSS color（请换单色 SVG / iconfont，或像本页 .fab-plus 那样用 CSS 画）');
      } else if (EMOJI_DEFAULT_BLOCK(cp) && !hasTextPresentation) {
        problems.push(`符号图标没声明文字呈现 ${r}:${no} -> U+${cp.toString(16).toUpperCase()} 在 iOS/Android ` +
          '常被渲染成彩色 emoji，请在 content 里追加 \\FE0E（或换单色 SVG / iconfont）');
      }
    }
  }
}

// ---- 18. WXML 里用到的自定义组件必须在同页 index.json 声明 ----
// 周菜单的 <state-empty wx:if="{{loadError}}"> 就是这么漏在 index.json 之外的：
// 未声明的标签不会报错、也不会渲染，于是"加载失败"那一屏**什么都不显示**——
// 页面既不显示错误态也不显示空态，用户看到的是内容区凭空缺一块。
// 判据只认「带连字符的标签」（小程序内置标签里非连字符的占多数，自定义组件命名必须含连字符），
// BUILTIN 列出微信自带的连字符标签，避免把 scroll-view 当成漏声明。
const WXML_BUILTIN_HYPHENATED = new Set([
  'scroll-view', 'cover-view', 'cover-image', 'movable-area', 'movable-view',
  'match-media', 'page-container', 'root-portal', 'navigation-bar', 'keyboard-accessory',
  'page-meta', 'share-element', 'voip-room', 'snapshot', 'editor',
  'official-account', 'open-data', 'xr-frame-attention-blob', 'xr-frame-scene'
]);
const componentTplFiles = files.filter((f) => f.endsWith('.wxml'));
for (const file of componentTplFiles) {
  const jsonPath = file.replace(/\.wxml$/, '.json');
  const declared = fs.existsSync(jsonPath) ? fs.readFileSync(jsonPath, 'utf8') : '';
  // 注释里的示例标签不算（文档型 wxml 常举例子）
  const src = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const tags = new Set((src.match(/<([a-z][a-z0-9]*(?:-[a-z0-9]+)+)[\s/>]/g) || [])
    .map((s) => s.slice(1).split(/[\s/>]/)[0]));
  for (const tag of tags) {
    if (WXML_BUILTIN_HYPHENATED.has(tag)) continue;
    if (declared.indexOf(`"${tag}"`) < 0) {
      const line = (src.split('\n').findIndex((l) => l.indexOf('<' + tag) >= 0) + 1) || 1;
      problems.push(`自定义组件未声明 ${rel(file)}:${line} 用了 <${tag}>，但 ${rel(jsonPath)} 的 usingComponents 里没有它 ` +
        `-> 不报错也不渲染，这一屏直接空掉（补 "${tag}": "/components/${tag}/index"）`);
    }
  }
}

// ---- 19. JS 里置的「失败」状态位必须在 WXML 被读到 ----
// 第 16 项管的是"catch 里忘了置位"，这条管"置了却没人读"：冰箱页的 matchFailed
// 就是这么一个死位——catch 里认真 setData({ matchFailed: true })，WXML 只判
// matchResults.length，于是"匹配失败"照样被显示成"还没匹配到菜谱"。
// 判据：setData 里以 Failed / Error 结尾的键，必须在本页 WXML 出现过。
for (const file of componentTplFiles) {
  const jsPath = file.replace(/\.wxml$/, '.js');
  if (!fs.existsSync(jsPath)) continue;
  const jsSrc = fs.readFileSync(jsPath, 'utf8');
  const wxmlSrc = fs.readFileSync(file, 'utf8');
  const setKeys = new Set();
  for (const m of jsSrc.matchAll(/setData\(\s*\{([\s\S]{0,600}?)\}\s*\)/g)) {
    for (const k of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) setKeys.add(k[1]);
  }
  for (const key of setKeys) {
    if (!/(?:Failed|Error)$/.test(key)) continue;
    // 必须按词边界匹配：子串匹配下 WXML 里写错的 matchFailedZZZ 也会被判成"读到了"，
    // 而"改了名只改一头"恰恰是这条门禁要防的那类失误（反向验证时实测出来的）。
    const usedInWxml = new RegExp('\\b' + key.replace(/[$]/g, '\\$') + '\\b').test(wxmlSrc);
    if (!usedInWxml) {
      problems.push(`失败状态位没人读 ${rel(jsPath)} -> setData({ ${key} }) 置了位，但 ${rel(file)} 里没有一处引用它 ` +
        `-> 失败被显示成空态或成功态（要么绑到 wx:if 上，要么删掉这个位）`);
    }
  }
}

// ---- 20. 图标规则从 WXSS 的 content: 扩到 WXML（我们自己的渲染层）----
// 第 17 项只扫 WXSS，所以 WXML 里的 💡🎉 照样活了一整轮（实测：kitchen 两处）。
// 与第 17 项同一套判据，但两条收紧/放宽是有意为之：
//   A) 非 BMP 码位（>U+FFFF）：没有单色形态，一律失败——彩色 emoji 吃不到 CSS color，
//      既不跟品牌色也不跟深色档翻，iOS/Android 还各画各的。
//   B) BMP 里「默认就是 emoji 呈现」的码位（按 Unicode Emoji_Presentation=Yes 列，
//      不是整段 26xx/27xx）：必须紧跟 \uFE0E 才放过。
// 为什么 B 不用整段码位区间：✓(U+2713) ✕(U+2715) ★(U+2605) ✦(U+2726) ❝(U+275D) ⚑(U+2691)
// 这些**默认就是文字呈现**，本来就能被 CSS color 着色、跨端一致，全站 8 个文件在用；
// 按区间一刀切会把它们全判成缺陷，还会逼人往 WXML 里塞一个看不见的变体选择符。
const EMOJI_PRESENTATION_BMP = [
  [0x203c, 0x203c], [0x2049, 0x2049], [0x2122, 0x2122], [0x2139, 0x2139],
  [0x2194, 0x2199], [0x21a9, 0x21aa], [0x231a, 0x231b], [0x2328, 0x2328],
  [0x23cf, 0x23cf], [0x23e9, 0x23f3], [0x23f8, 0x23fa], [0x24c2, 0x24c2],
  [0x25aa, 0x25ab], [0x25b6, 0x25b6], [0x25b8, 0x25bc], [0x25c0, 0x25c0],
  [0x25c2, 0x25c4], [0x25e3, 0x25e3], [0x25ed, 0x25ee], [0x25f8, 0x25fb],
  [0x2600, 0x2604], [0x260e, 0x260e], [0x2611, 0x2611], [0x2614, 0x2615],
  [0x2618, 0x2618], [0x261d, 0x261d], [0x2620, 0x2620], [0x2622, 0x2623],
  [0x2626, 0x2626], [0x262a, 0x262a], [0x262e, 0x262f], [0x2638, 0x263a],
  [0x2640, 0x2640], [0x2642, 0x2642], [0x2648, 0x2653], [0x265f, 0x2660],
  [0x2663, 0x2663], [0x2665, 0x2666], [0x2668, 0x2668], [0x267b, 0x267b],
  [0x267e, 0x267e], [0x267f, 0x267f], [0x2692, 0x2692], [0x2694, 0x2697],
  [0x2699, 0x2699], [0x269b, 0x269f], [0x26a0, 0x26a1], [0x26a7, 0x26a7],
  [0x26aa, 0x26ab], [0x26b0, 0x26b1], [0x26b4, 0x26b7], [0x26bd, 0x26be],
  [0x26c2, 0x26c4], [0x26c8, 0x26c8], [0x26ce, 0x26d1], [0x26d3, 0x26d4],
  [0x26e9, 0x26ea], [0x26f0, 0x26f5], [0x26f7, 0x26fa], [0x26fd, 0x26fd],
  [0x2702, 0x2702], [0x2708, 0x270d], [0x270f, 0x270f], [0x2712, 0x2712],
  [0x2714, 0x2714], [0x2716, 0x2716], [0x271d, 0x271d], [0x2721, 0x2721],
  [0x2728, 0x2728], [0x2733, 0x2734], [0x2744, 0x2744], [0x2747, 0x2747],
  [0x274c, 0x274c], [0x274e, 0x274e], [0x2753, 0x2755], [0x2757, 0x2757],
  [0x2763, 0x2764], [0x2795, 0x2797], [0x27a1, 0x27a1], [0x27b0, 0x27b0],
  [0x27bf, 0x27bf], [0x2934, 0x2935], [0x2b05, 0x2b07], [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50], [0x2b55, 0x2b55]
];
const isEmojiPresentationBmp = (cp) =>
  EMOJI_PRESENTATION_BMP.some(([lo, hi]) => cp >= lo && cp <= hi);

const scanIconText = (r, text, kind) => {
  let offset = 0;
  let prevCp = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const line = text.slice(0, offset).split('\n').length;
    offset += ch.length;
    const skip = cp === 0xfe0e || cp === 0xfe0f;
    const hadTextSelector = prevCp === 0xfe0e;
    prevCp = cp;
    if (skip) continue;
    if (cp > 0xffff) {
      problems.push(`${kind}用了 emoji 码位 ${r}:${line} -> U+${cp.toString(16).toUpperCase()} 没有单色形态，` +
        '跨端渲染不一致且吃不到 CSS color（请换 app.wxss 的 .ico-* CSS 图标，或像社区动作行那样用 clip-path/border 画）');
    } else if (isEmojiPresentationBmp(cp) && !hadTextSelector) {
      problems.push(`${kind}的符号默认走 emoji 呈现 ${r}:${line} -> U+${cp.toString(16).toUpperCase()} ` +
        '在 iOS/Android 常被画成彩色，吃不到 CSS color（换 CSS 图标；WXML 里没法写 \\FE0E，所以这条只能靠换实现）');
    }
  }
};
// 只扫 WXML（我们自己的渲染层），不扫 JS 字面量。第一版连 JS 一起扫，实测报出 27 处
// U+2B50，全在 recipe-detail:292 / cook-mode:485 的 wx.showActionSheet itemList 里——
// 那是**原生面板**：CSS 到不了那里，"吃不到 currentColor、不跟深色档翻"这条危害根本不成立，
// 而评分选项除了星没有别的表达方式可放。我们自己的评分 UI 早就是 clip-path 画的 .rd-star，
// 不受影响。判"图标"要落在渲染层，不是所有字符串。
for (const file of files) {
  if (!file.endsWith('.wxml')) continue;
  scanIconText(rel(file), fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, ''), 'WXML');
}

// ---- 21. 图块（菜品缩略图/封面格）的边长必须走 token，不许写裸 rpx ----
// 台账实测全站 12 种正方形图块取值。逐个看过后**不是一件事**：行内菜图 / 紧凑行 /
// 行内小标记 / 灶台大卡 / 两列封面格 / 选择网格各有密度，强行并成一个数会改坏版面。
// 所以这条门禁不要求"同一个值"，只要求"同一个出处"——边长必须来自 app.wxss 的
// --dish-thumb / --tile-* 规格表。新页面要放图块，先在表里挑角色，别再随手写一个 150rpx。
// 圆形头像（border-radius:50%）不算图块角色，放过。
// 判据只认**类名里带 thumb 的图块**：这一族是"行里那道菜的缩略图"，最容易漂
// （实测同一角色曾出现 96/104/112/120/146 五种）。而 `*-img` / `*-hero-*` /
// `*-cover` / `*-skel-*` 这些命中 photo 格与整屏 hero 图，宽高本来就是 100% 或
// 各自的角色，不归这条管——第一版按 thumb|cover|pic|img 扫，48 条里 34 条是这类误报。
const TILE_DECL = /\.([a-z0-9_-]*thumb[a-z0-9_-]*)\b/i;
const TILE_TOKEN = /var\(\s*--(?:dish-thumb|tile-[a-z-]+)\s*\)/;
for (const file of files) {
  if (!file.endsWith('.wxss')) continue;
  const r = rel(file);
  if (r === 'app.wxss') continue;
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  for (const block of src.match(/[^{}]+\{[^{}]*\}/g) || []) {
    const sel = block.slice(0, block.indexOf('{')).trim();
    if (!TILE_DECL.test(sel)) continue;
    const body = block.slice(block.indexOf('{') + 1);
    const w = /(?:^|;)\s*width\s*:([^;]+)/.exec(body);
    const h = /(?:^|;)\s*height\s*:([^;]+)/.exec(body);
    if (!w || !h) continue;
    // 百分比 / calc / em 的是覆盖层或自适应块，不是一种"规格尺寸"
    if (/%|calc\(|\bem\b|vh|vw/.test(w[1] + h[1])) continue;
    if (/border-radius\s*:\s*50%/.test(body)) continue;   // 圆头像不是图块角色
    if (TILE_TOKEN.test(w[1]) && TILE_TOKEN.test(h[1])) continue;
    const line = src.slice(0, src.indexOf(block)).split('\n').length;
    problems.push(`图块边长写死 ${r}:${line} ${sel} -> width/height 是 ${w[1].trim()} / ${h[1].trim()}，`
      + '没走 app.wxss 的 --dish-thumb / --tile-* 规格表（要放新尺寸就先在表里加一个有名字的角色，别在页面里写裸数值）');
  }
}

// ---- 22. var(--token, 兜底) 的兜底值必须等于 token 的定义值 ----
// 兜底值平时永远看不见，所以它写错也不会被发现——直到某天 token 因为作用域/拼写/主题
// 没解析出来，那一处就**静默变成另一套设计**（实测抓到 --r-lg 兜底 28 而 token 是 24、
// --r-card 兜底 28 而 token 是 16、--pine 兜底写死色值绕过了主题变量）。
// --fs-mul 是唯一的合法例外：它的兜底 1 表示"没进大字档作用域"，本来就是另一个语义。
// --themeXxx 也是合法例外：它是 theme.json 的每档变量，兜底写浅色档值是微信要求的写法
// （themeLocation 解析不到时要有个落点），不是"另一套设计"。
const FALBACK_OK = new Set(['--fs-mul']);
const FALLBACK_OK_PREFIX = ['--theme'];
const tokenDefs = {};
{
  const src = blankComments(fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8'));
  for (const m of src.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)) {
    const v = m[2].trim();
    // 同名多处定义时取"首见值"作为基准；若某 token 在 .font-lg 里换档（只有 --fs-*），
    // 它的兜底本来就不该等于任何一档 —— 这类一律要求"不写兜底"，所以只比对唯一值 token
    if (tokenDefs[m[1]] === undefined) tokenDefs[m[1]] = v;
    else if (tokenDefs[m[1]] !== v) tokenDefs[m[1]] = null;   // 多档值，跳过比对
  }
}
for (const file of files) {
  if (!file.endsWith('.wxss')) continue;
  const r = rel(file);
  const src = blankComments(fs.readFileSync(file, 'utf8'));
  for (const m of src.matchAll(/var\((--[\w-]+)\s*,\s*([^)]+)\)/g)) {
    const [full, tok, fb] = [m[0], m[1], m[2].trim()];
    if (FALBACK_OK.has(tok) || FALLBACK_OK_PREFIX.some((pre) => tok.startsWith(pre))) continue;
    const def = tokenDefs[tok];
    if (def === undefined) {
      problems.push(`兜底引用了未定义的 token ${r}:${src.slice(0, m.index).split('\n').length} -> ${full}（app.wxss 里没有 ${tok}）`);
    } else if (def !== null && def.replace(/\s+/g, '') !== fb.replace(/\s+/g, '')) {
      problems.push(`var() 兜底值与 token 不一致 ${r}:${src.slice(0, m.index).split('\n').length} -> ${full}，`
        + `而 app.wxss 里 ${tok}: ${def}（token 一旦解析失败就静默变成另一套设计；要么去掉兜底，要么和 token 同值）`);
    }
  }
}

// ---- 23. tab 页的底部留白必须真的让开自定义 tabBar ----
// 自定义 tabBar 是独立图层，页面内容不会被它顶开，所以每个 tab 页都要自己留出
// calc(var(--tabbar-h) + 呼吸) 或至少含 env(safe-area-inset-bottom)。
// 实测五个 tab 页原本各写一套：186 / 186 / 220 / 340 / env+160rpx，其中三个不含安全区
// —— 刘海机上 tabBar 实高约 196rpx，最后一张卡就被压在下面。
const TAB_PAGES = (app.tabBar && app.tabBar.list ? app.tabBar.list.map((t) => t.pagePath) : []);
for (const page of TAB_PAGES) {
  const wxssPath = path.join(ROOT, page + '.wxss');
  if (!fs.existsSync(wxssPath)) continue;
  const src = blankComments(fs.readFileSync(wxssPath, 'utf8'));
  const blocks = src.match(/[^{}]+\{[^{}]*\}/g) || [];
  for (const b of blocks) {
    const body = b.slice(b.indexOf('{') + 1);
    const decls = [/(?:^|;)\s*padding-bottom\s*:([^;]+)/, /(?:^|;)\s*padding\s*:([^;]+)/]
      .map((re) => re.exec(body)).filter(Boolean).map((m) => m[1].trim());
    for (const val of decls) {
      // 只看"底边"是一个裸 rpx 且 ≥100rpx 的写法（小值是本侧内边距，不该管）
      const bottom = val.split(/\s+/).pop();
      if (!/^(\d{3,})rpx$/.test(bottom)) continue;
      if (Number(bottom.replace('rpx', '')) < 100) continue;
      if (/var\(--tabbar-h\)|env\(safe-area-inset-bottom\)/.test(val)) continue;
      problems.push(`tab 页底部留白写死裸值 ${rel(wxssPath)} -> padding 底边 ${bottom} 既不含 var(--tabbar-h) 也不含 env(safe-area-inset-bottom)，`
        + '刘海机上最后一屏会被自定义 tabBar 压住');
    }
  }
}

// ---- 24. 字号必须在 12 档刻度上；标尺外的显示级尺寸走冻结白名单 ----
// 设计规范第 63 行：「禁止使用标尺外的字号（历史遗留的 22/24/26rpx 只允许出现在
// 全局类 .tag/.section-desc/.chip 中）」。这条规则此前从没被执行：实测违规 296 处。
// 本轮把 ≤2rpx 的 241 处就近吸附回刻度（20→21、22→23、24→25、26→25…），
// 剩下 46 处是 40~442 的展示级尺寸（大数字、装饰字），一次性冻结：
// 出现**新的**标尺外值即失败，要加档就先把角色写进 app.wxss 的 token 表。
const FS_SCALE = new Set([96, 72, 56, 50, 36, 32, 29, 28, 25, 23, 21, 19]);
const FS_FROZEN = new Set([40, 42, 44, 46, 60, 62, 66, 76, 78, 84, 88, 92, 116, 119, 150, 250, 360, 420, 442]);
const FS_LEGACY_CTX = /(^|[\s,])(\.tag|\.chip|\.section-desc|\.sdesc)(\s|,|\{|\.|:|>|$)/;
for (const file of files) {
  if (!file.endsWith('.wxss')) continue;
  const r = rel(file);
  const src = blankComments(fs.readFileSync(file, 'utf8'));
  for (const b of src.match(/[^{}]+\{[^{}]*\}/g) || []) {
    const sel = b.slice(0, b.indexOf('{'));
    // 规范第 63 行点名允许的三档历史值
    if (FS_LEGACY_CTX.test(sel)) continue;
    for (const m of b.matchAll(/font-size\s*:\s*calc\(\s*(\d+(?:\.\d+)?)rpx/g)) {
      const v = Number(m[1]);
      if (FS_SCALE.has(v) || FS_FROZEN.has(v)) continue;
      const line = src.slice(0, src.indexOf(b)).split('\n').length;
      problems.push(`字号不在刻度上 ${r}:${line} ${sel.trim().slice(0, 34)} -> ${v}rpx（12 档见 docs/UI设计规范.md；`
        + '要放新的展示级尺寸，先在 app.wxss 里给它一个有名字的 token，别在页面里写裸值）');
    }
  }
}

// ---- 25. 每条声明必须写成 property: value ----
// 第 3 项只数花括号配不配平，查不出"括号都在、但声明本身是垃圾"的写法。
// 这条是被自己的事故逼出来的：一个批量脚本把 `background: var(--paper-2)` 改成
// `var(--skeleton)r(--paper-2)`（偏移量算错，覆盖了属性名前缀），
// 花括号照样配平、静态检查全绿，**模拟器整包 WXSS 编译失败、所有页面白屏**。
// 判据：块内以 `;` 分隔的每一段，必须是「标识符 : 值」的形状；
// 允许 @media/@keyframes 等 at-rule 与嵌套选择器，避免误伤。
const badDecls = new Set();
const DECL_OK_HEAD = /^(@|\*|\/\*|from|to|to\s*\{|%\s*$|[.#&a-zA-Z:_\[][^:]*\{\s*$)/;
for (const file of files) {
  if (!file.endsWith('.wxss')) continue;
  const r = rel(file);
  const src = blankComments(fs.readFileSync(file, 'utf8'));
  for (const b of src.match(/[^{}]+\{([^{}]*)\}/g) || []) {
    const body = b.slice(b.indexOf('{') + 1, b.lastIndexOf('}'));
    for (const raw of body.split(';')) {
      const decl = raw.trim();
      if (!decl || DECL_OK_HEAD.test(decl)) continue;
      if (/^[a-zA-Z-][a-zA-Z0-9-]*\s*:/.test(decl)) continue;      // 正常声明
      if (/^[a-zA-Z-][a-zA-Z0-9-]*\s*$/.test(decl)) continue;      // 只写属性名等着下一段（少见，放过）
      // 同一个坏声明往往出现在好几个块里（比如整页骨架样式），按「文件 + 内容」去重，
      // 否则一条错误刷屏四五遍，反而把别的问题埋掉
      const key = r + '::' + decl;
      if (badDecls.has(key)) continue;
      badDecls.add(key);
      const line = src.slice(0, src.indexOf(decl.slice(0, 24))).split('\n').length;
      problems.push(`非法声明 ${r}:${line} -> 「${decl.slice(0, 60)}」不是 property: value 的形状 `
        + '（花括号仍然配平，所以第 3 项查不出来，但 WXSS 编译会直接失败、全站白屏）');
    }
  }
}

// ---- 26. 大图角色（aspectFill 的照片框）：比例不许退回横长条，高度必须出自规格表 ----
// 实拍菜图以方图为主（assets/dishes 19 张里 16 张是 600×600，只有 3 张 3:2），
// 而旧版面把三种大图框拉成了横长条。aspectFill 是居中裁切，所以框越扁、菜被切得越多：
//   社区配图 588×322 → 1.83:1，方图纵向只剩 55%
//   菜谱步骤图 515×240 → 2.15:1，只剩 47%
//   做菜模式大图 658×400 → 1.65:1，只剩 61%
// —— 一条鱼、一盘面被拦腰裁掉就是这么来的，而且是"每个页面都在裁、没有一处一样"。
// 判据两条：
//  ① 规格表里每个 token 的「容器宽 ÷ 框高」≤ 1.45（方图至少留 69% 高度）。
//     容器宽是量出来的：rpx 已按 750 视口归一，所以任意机型上这个比例都成立。
//  ② 登记过的大图位置，height 必须写 var(--photo-*-h)，不许在页面里退回裸 rpx
//     ——顺带把"骨架块和真卡同高"钉住，否则加载完跳版。
const PHOTO_TABLE = {
  '--photo-feed-h': 588,    // 社区信息流配图（实测 308×167px，容器 588rpx）
  '--photo-step-h': 515,    // 菜谱详情步骤图（实测 266×124px，容器 515rpx）
  '--photo-focus-h': 658,   // 做菜模式步骤大图（750 - 左右各 46rpx）
  '--photo-head-h': 616,    // 帖子详情头图与其骨架
};
const PHOTO_MAX_RATIO = 1.45;
const PHOTO_SITES = [
  ['pages/community/index.wxss', '.pphoto'],
  ['pkg-extra/recipe-detail/index.wxss', '.rd-step-img'],
  ['pkg-extra/cook-mode/index.wxss', '.stepimg'],
  ['pkg-extra/community/post-detail/index.wxss', '.dish-img'],
  ['pkg-extra/community/post-detail/index.wxss', '.sk-img'],
];
const appCssSrc = stripComments(fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8'));
for (const tok of Object.keys(PHOTO_TABLE)) {
  const m = new RegExp(tok + '\\s*:\\s*(\\d+(?:\\.\\d+)?)rpx').exec(appCssSrc);
  if (!m) {
    problems.push(`大图规格失去出处 app.wxss -> ${tok} 没定义了（页面里 var(${tok}) 会静默失效，大图框退回各自写死）`);
    continue;
  }
  const ratio = PHOTO_TABLE[tok] / parseFloat(m[1]);
  if (ratio > PHOTO_MAX_RATIO) {
    problems.push(`大图框裁掉太多 app.wxss -> ${tok}: ${m[1]}rpx（容器 ${PHOTO_TABLE[tok]}rpx 宽 → ${ratio.toFixed(2)}:1，`
      + `方图纵向只剩 ${Math.round(100 / ratio)}%，一条鱼会被拦腰裁掉；上限 ${PHOTO_MAX_RATIO}:1）`);
  }
}
for (const [file, cls] of PHOTO_SITES) {
  const p = path.join(ROOT, file);
  const src = stripComments(fs.readFileSync(p, 'utf8'));
  const esc = cls.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');
  const bm = new RegExp(esc + '\\s*\\{([^{}]*)\\}').exec(src);
  if (!bm) {
    problems.push(`大图位置找不到 ${file} -> ${cls}（类名改了要同步改第 26 项的登记表，别默默把大图角色放养）`);
    continue;
  }
  const h = /(?:^|;)\s*height\s*:\s*([^;]+)/.exec(bm[1]);
  if (!h || !/var\(\s*--photo-[a-z-]+\s*\)/.test(h[1])) {
    problems.push(`大图高度写死 ${file} -> ${cls} -> height: ${h ? h[1].trim() : '（没有 height 声明）'}，`
      + '没走 app.wxss 的 --photo-*-h 规格表（要改裁切比例就改表，改一处四页同步）');
  }
}

// ---- 27. 大图位置必须有"确认失败才画出来"的兜底 ----
// 图挂不出来时那块地方不是"变灰"，是**留一个尺寸完好的空洞**——
// 实测把社区信息流第一条的 photo 指向不存在的文件，那张卡留下 440rpx 高的纯白，
// 和"这条帖子本来没图"长得一模一样。
// 上一版这里用 CSS-only（在 <image> 上直接出 ::before），**已回退并换成 binderror**：
// 同一个写法在 .pphoto 上画在图片之下、在 .rc-ph-img 上却画在图片之上，
// 菜谱网格 8 张真实照片被灰块整排盖掉——"遮住正常图片"比"留空洞"严重，而且 CSS 分不清
// "还没画"和"真挂了"。所以现在三样都要有：binderror 回调、data-err-key、img-broken 条件类。
// 这条门禁保证登记表里的大图不会哪天悄悄把其中一样摘掉——摘掉是静默的，好图坏图长得一样。
const IMG_FALLBACK_SITES = [
  ['pages/community/index.wxml', 'pphoto'],
  ['pkg-extra/recipe-detail/index.wxml', 'rd-step-img'],
  ['pkg-extra/cook-mode/index.wxml', 'stepimg-pic'],
  ['pkg-extra/community/post-detail/index.wxml', 'dish-img'],
  ['components/recipe-card/index.wxml', 'rc-ph-img'],
];
const appCssForBroken = fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8');
if (!/\.img-broken::before\s*\{[^}]*content\s*:/.test(appCssForBroken)) {
  problems.push('兜底失效 app.wxss -> .img-broken::before 没有 content（这个类只剩一层灰底，图挂了没有说明）');
}
for (const [file, cls] of IMG_FALLBACK_SITES) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const tags = src.match(/<image[^>]*>/g) || [];
  const hit = tags.filter((t) => new RegExp('class="[^"]*\\b' + cls + '\\b').test(t));
  if (!hit.length) {
    problems.push(`大图位置找不到 ${file} -> <image class="…${cls}…">（类名改了要同步改第 27 项的登记表）`);
    continue;
  }
  for (const t of hit) {
    const one = t.replace(/\s+/g, ' ');
    const miss = [];
    if (!/binderror="onPhotoError"/.test(one)) miss.push('binderror="onPhotoError"');
    if (!/data-err-key=/.test(one)) miss.push('data-err-key');
    if (!/\bimg-broken\b/.test(one)) miss.push("条件类 img-broken");
    if (miss.length) {
      problems.push(`大图兜底不完整 ${file} -> ${cls} 缺 ${miss.join(' + ')}`
        + '（三样缺一都静默：少了回调没人知道图挂了，少了条件类画不出占位，少了 key 回调不知道该置谁）');
    }
  }
}

// ---- 28. 卡表面的左右内边距必须出自 --pad-card* 规格表 ----
// 判据是"卡表面"这个视觉角色：border-radius 走 --r-card 的就是同一张卡。
// 只钉**左右**这一个轴——纵向留白跟内容节奏走（标题卡、输入框、弹窗各有各的），
// 左右才是并排看会对齐的那条边。实测首页「许愿池」白卡左右 28、下面那张深色主卡左右 40，
// 两张卡左边缘齐平、里面的文字却错开 6px。
// 确实要窄（多列并排的统计卡）就在同一行写「例外：原因」，让下一个读代码的人知道这不是漂移。
const PAD_TOKEN = /var\(\s*--pad-card(?:-sm)?\s*\)/;
// 圆角走 --r-card 不等于"卡表面"：按钮、标签、胶囊也用这个圆角，它们的左右留白跟字号走。
const NOT_A_CARD = /\b(btn|button|chip|tag|pill|badge|seg|tab)\b/i;
const PAD_SKIP = /^(0|auto|[\d.]+%|calc\(|var\(--pad)/;
for (const file of files) {
  if (!file.endsWith('.wxss')) continue;
  const r = rel(file);
  const raw = fs.readFileSync(file, 'utf8');
  // 直接按原文切块（保留注释），这样「例外：原因」和它要豁免的那条声明必然在同一段里
  for (const block of raw.match(/[^{}]+\{[^{}]*\}/g) || []) {
    const body = block.slice(block.indexOf('{') + 1);
    if (!/border-radius\s*:\s*var\(\s*--r-card\s*\)/.test(stripComments(body))) continue;
    const sel = block.slice(0, block.indexOf('{')).replace(/\/\*[\s\S]*?\*\//g, ' ').trim().replace(/\s+/g, ' ');
    if (NOT_A_CARD.test(sel)) continue;
    for (const line of body.split('\n')) {
      const pm = /(?:^|[;{\s])padding\s*:\s*([^;]+)/.exec(line);
      if (!pm || /例外/.test(line)) continue;
      const parts = pm[1].trim().split(/\s+/).filter(Boolean);
      if (!parts.length || parts.length > 4) continue;
      const horiz = parts.length === 1 ? [parts[0]]
        : parts.length === 4 ? [parts[1], parts[3]]
          : [parts[1]];
      const bad = horiz.filter((v) => !PAD_TOKEN.test(v) && !PAD_SKIP.test(v));
      if (bad.length) {
        problems.push(`卡表面左右内边距写死 ${r} -> ${sel} -> padding: ${pm[1].trim()}，`
          + `左右是 ${bad.join(' / ')}，没走 app.wxss 的 --pad-card / --pad-card-sm 规格表 `
          + '（同一屏两张卡的文字会错开；确实要窄就在这一行写「例外：原因」）');
      }
    }
  }
}

// ---- 29. 头像位的形状和字号必须由框宽推出（--r-ava / --ava-glyph）----
// 同一个人的头像在社区列表是 26rpx 圆角方、点进他那条帖子变成正圆；
// 同一个"阿"字占框宽从 36% 到 53% 都有。头像只有一个自由度（框宽），
// 所以圆角和字号都不该再各写一个数——写了就会漂，而且漂得很安静：没人会截图对比圆角。
// 判据：凡是 width 用了 --ava-* 档位的选择器，圆角必须是 calc(同一档 * var(--r-ava))，
// 字号必须含 var(--ava-glyph)（两者都只在"自己声明了"的时候才要求）。
const AVA_TOKEN = /var\(\s*(--ava-[a-z]+)\s*\)/;
for (const file of files) {
  if (!file.endsWith('.wxss')) continue;
  const r = rel(file);
  if (r === 'app.wxss') continue;
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  for (const block of src.match(/[^{}]+\{[^{}]*\}/g) || []) {
    const body = block.slice(block.indexOf('{') + 1);
    const w = /(?:^|;)\s*width\s*:([^;]+)/.exec(body);
    if (!w) continue;
    const wm = AVA_TOKEN.exec(w[1]);
    if (!wm) continue;
    const sel = block.slice(0, block.indexOf('{')).trim().replace(/\s+/g, ' ');
    const br = /(?:^|;)\s*border-radius\s*:\s*([^;]+)/.exec(body);
    if (br && !new RegExp('var\\(\\s*' + wm[1] + '\\s*\\)\\s*\\*\\s*var\\(\\s*--r-ava\\s*\\)').test(br[1])) {
      problems.push(`头像圆角写死 ${r} -> ${sel} -> border-radius: ${br[1].trim()}，`
        + `应为 calc(${wm[1]} * var(--r-ava))（同一个人不该在两个页面一个是方的是个圆的）`);
    }
    const fs2 = /(?:^|;)\s*font-size\s*:\s*([^;]+)/.exec(body);
    if (fs2 && !/var\(\s*--ava-glyph\s*\)/.test(fs2[1])) {
      problems.push(`头像字号写死 ${r} -> ${sel} -> font-size: ${fs2[1].trim()}，`
        + `应为 calc(${wm[1]} * var(--ava-glyph) * var(--fs-mul, 1))（同一个字在不同页占框宽差到 1.5 倍）`);
    }
  }
}

// ---- 30. 每个 .js 必须能通过语法解析 ----
// 这条是被自己连续两次事故逼出来的：一次是批量脚本把 WXSS 声明改成非法形状（全站白屏、门禁全绿），
// 一次是把解构改名写成 `const { a as b } = require(...)`（那是 ESM import 的写法，CommonJS 里是语法错误），
// 结果 recipe-card 组件模块"not defined"、菜谱网格整片消失，而 29 项检查照样全绿——
// 因为前面所有检查都是拿正则读源码，**从没有真正解析过这些文件**。
// 判据：拿跑这个脚本的同一个 node 对每个 .js 做 --check（只解析不执行，Page/wx 这类全局名不参与）。
const { spawnSync } = require('child_process');
let jsChecked = 0;
for (const file of files) {
  if (!file.endsWith('.js')) continue;
  jsChecked += 1;
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    const first = (r.stderr || '').split('\n').find((l) => l.trim()) || '（无 stderr）';
    problems.push(`JS 语法错误 ${rel(file)} -> ${first.trim().slice(0, 120)} `
      + '（这个文件在模拟器里会整个模块 not defined：页面空白或组件整片消失，而正则类门禁查不出来）');
  }
}

// ---- 提审前必须由部署方填写的项（只报告、不阻断）----
// 为什么不阻断：这两个值只有部署方能给（要等 ICP 备案下来的域名、以及运营者本人姓名/联系方式），
// 在拿到之前把 CI 判红只会淹没其它真正需要看的失败。所以每次运行都显式列出来，
// 免得"忘了填"这种低级原因把提审退回来一次、再等 1~7 天。
const preflight = [];
const legalPath = path.join(ROOT, 'utils/legal-config.js');
if (fs.existsSync(legalPath)) {
  const legal = fs.readFileSync(legalPath, 'utf8');
  ['operatorName', 'operatorContact'].forEach((key) => {
    const m = new RegExp(key + "\\s*:\\s*'([^']*)'").exec(legal);
    if (m && m[1].indexOf('【') !== -1) {
      preflight.push(`utils/legal-config.js -> ${key}: ${m[1]}（带占位符提交会被审核驳回）`);
    }
  });
}
const envPath = path.join(ROOT, 'utils/env.js');
if (fs.existsSync(envPath)) {
  const envSrc = fs.readFileSync(envPath, 'utf8');
  ['trial', 'release'].forEach((mode) => {
    const at = envSrc.indexOf(mode + ':');
    if (at < 0) return;
    const m = /apiBaseUrl:\s*'([^']*)'/.exec(envSrc.slice(at, at + 280));
    if (m && /example\.com/i.test(m[1])) {
      preflight.push(`utils/env.js -> ${mode}: ${m[1]}（换成已备案 HTTPS 域名，并同步小程序后台的服务器域名白名单）`);
    }
  });
}

console.log(`检查了 ${files.length} 个文件（其中 ${jsChecked} 个 .js 过了语法解析）`);
if (preflight.length) {
  console.log('\n⚠ 提审前需部署方填写（不阻断 CI，但缺了就等着被驳回）：');
  preflight.forEach((p) => console.log('  · ' + p));
}
if (sizeWarns.length) {
  console.log('\n⚠ 提醒（不阻断 CI，但都是上线前该知道的）：');
  sizeWarns.forEach((p) => console.log('  · ' + p));
}
if (problems.length) {
  console.error(`\n✘ 发现 ${problems.length} 个问题：`);
  problems.forEach((p) => console.error('  · ' + p));
  process.exit(1);
}
console.log('✔ 小程序静态检查通过');
