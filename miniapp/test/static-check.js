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
 *  15. 大字模式是否每页都接上（只接一半判失败；整页没接列入提醒）
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

/** 去掉 /* *\/ 注释，避免注释里的花括号干扰配平统计 */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');

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
// app.wxss 里 .font-lg 的注释就写着「全站 36 页根节点挂 .font-lg」，但实测只有 29 页真挂了。
// 漏接的页面不会报错、不会白屏，只是「用户在设置里开了大字，这一页照样小字」——
// 而漏掉的恰好包括做菜模式（手机在一臂外、手上有油，最需要大字的一屏）和菜谱详情。
// 只绑类不读档 = 永远拿到 normal；只读档不绑类 = 白读。两种都判失败。
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
if (fontLgMissing.length) {
  sizeWarns.push('这些页面没接大字模式（开了大字照样小字），共 ' + fontLgMissing.length + ' 个：' +
    fontLgMissing.join('、'));
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

console.log(`检查了 ${files.length} 个文件`);
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
