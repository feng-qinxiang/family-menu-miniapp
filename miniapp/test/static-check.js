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

console.log(`检查了 ${files.length} 个文件`);
if (problems.length) {
  console.error(`\n✘ 发现 ${problems.length} 个问题：`);
  problems.forEach((p) => console.error('  · ' + p));
  process.exit(1);
}
console.log('✔ 小程序静态检查通过');
