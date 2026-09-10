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
 *   1. app.json 声明的页面，四件套（js/json/wxml/wxss）是否齐全
 *   2. 所有 .json 能否解析
 *   3. 所有 .wxss 花括号是否配平、是否误用了 // 注释（WXSS 不支持）
 *   4. .wxml 里引用的本地图片是否存在
 *   5. .json 里 usingComponents 指向的组件是否存在
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

// ---- 1. app.json 页面文件齐全 ----
const appJsonPath = path.join(ROOT, 'app.json');
if (!fs.existsSync(appJsonPath)) {
  console.error('✘ 找不到 app.json');
  process.exit(1);
}
const app = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
for (const page of app.pages || []) {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) {
    if (!fs.existsSync(path.join(ROOT, page + '.' + ext))) {
      problems.push(`页面文件缺失: ${page}.${ext}`);
    }
  }
}

const files = walk(ROOT);

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
