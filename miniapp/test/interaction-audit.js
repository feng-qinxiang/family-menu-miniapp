#!/usr/bin/env node
/**
 * 交互体检（只报告，不阻断）
 *
 *   node miniapp/test/interaction-audit.js
 *
 * 为什么单独一个脚本：点击体验的问题（没反馈、热区太小、假可点）
 * 没法用「通过/失败」一刀切——文本链接本来就不该有 88rpx 热区。
 * 所以这里只做统计与定位，交给人判断，用于改动前后的对比与回归复查。
 *
 * 检查三类：
 *   A. 有事件绑定但没有按下反馈（本行或紧邻的父级都没有 tap-scale / hover-class）
 *   B. 长得可点却没有事件绑定（类名像按钮，检查到即列出；已确认的误报进 B_OK 白名单）
 *   C. 可点元素在 wxss 里的声明尺寸小于 88rpx（只统计 wxml 里直接绑了事件的类；
 *      已有 ::after ≥88rpx 热区扩展的、刻意小于 88 的进 C_OK 白名单）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'miniprogram_npm', '.git'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
};

const files = walk(ROOT);
const wxmlFiles = files.filter((f) => f.endsWith('.wxml'));
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

// 按下反馈的三种写法
const FEEDBACK = /tap-scale|tap-dim|hover-class/;
// 看起来可点的类名特征
const CLICKABLE_HINT = /(?:^|[\s-])(btn|button|cta|link|lk|more|entry|action|arrow|switch|check)/i;
// 明确是纯容器/装饰的类名（这些不该有事件，也不该算作可点元素）
const CONTAINER = /(mask|backdrop|actions|inner|row|list|group|wrap|bar|box|grid|skeleton|skel|shimmer|chips|header|foot|title|desc|text|dot|icon|img|photo|avatar|thumb|check|deco)/i;

/** 取出 wxml 里所有元素标签（支持跨行），并记录行号。 */
function extractTags(src) {
  const tags = [];
  const re = /<(view|button|navigator|image|text|input|textarea|scroll-view|swiper|picker|switch|label|form|icon|rich-text)\b([^>]*)>/g;
  let m;
  while ((m = re.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    tags.push({ tag: m[1], attrs: m[2], line, raw: m[0] });
  }
  return tags;
}

const reportA = [];
const reportB = [];
// 直接绑了事件（bind/catch）的类集合：C 类只统计真正的点击目标
const boundClasses = new Set();

for (const file of wxmlFiles) {
  const src = fs.readFileSync(file, 'utf8');
  for (const t of extractTags(src)) {
    const className = (t.attrs.match(/class="([^"]*)"/) || [])[1] || '';
    const hasEvent = /\b(?:bind|catch|mut-bind)(?::)?[a-zA-Z-]+\s*=/.test(t.attrs);
    if (hasEvent) className.split(/\s+/).forEach((c) => c && boundClasses.add(c));

    // 输入类控件与滚动容器不需要按下反馈（前者靠键盘反馈，后者靠滚动反馈）
    const INPUT_LIKE = ['input', 'textarea', 'scroll-view', 'swiper', 'picker'].includes(t.tag);
    // 遮罩层点击关闭是有意为之，加缩放反而怪
    const MASK = /(mask|backdrop)/i;
    // 元素内部的图标/文字/图片：点击目标由父级承担，不单独要求反馈
    const INNER = /(ic|icon|dot|img|photo|thumb|avatar|chev|arrow|num|text|label|desc|title|name|hint)$/i;
    const lastClass = (className.split(/\s+/).pop() || '');

    // A. 有事件但整标签都没有按下反馈
    //    以下为「有意为之的例外」，已在评审中确认，不算缺陷：
    //    · 弹层/遮罩容器：catchtap 只为阻止冒泡，加缩放反而怪
    //    · 加载遮罩：无交互
    //    · 禁用占位按钮：本身不可点
    //    · 输入区域：反馈由键盘给出
    //    · custom-tab-bar 的 .tab-item：反馈在子元素 .tab-icon-wrap:active 上
    const EXEMPT = /(dialog|sheet|modal|mask|backdrop|sl-root|loading|disabled)/i;
    const INPUT_AREA = /(input|agree|codebox|stx|editor)/i;
    if (hasEvent && !FEEDBACK.test(t.attrs) && !INPUT_LIKE
        && !MASK.test(className) && !INNER.test(lastClass)
        && !EXEMPT.test(className) && !INPUT_AREA.test(className)
        // tab-item 的按下反馈写在子元素 .tab-icon-wrap:active 上（整体缩放会和指示条动画打架）
        && !/custom-tab-bar/.test(rel(file)) && !/^tab-item/.test(lastClass)) {
      reportA.push(`${rel(file)}:${t.line}  class="${className.trim().slice(0, 46)}"`);
    }
    // B. 类名像按钮、但没有事件
    //    排除：条件分支/分享按钮/禁用占位（这些各有各的触发方式，不算缺陷）
    const shareLike = /open-type=|wx:else|wx:if|disabled/i.test(t.attrs) || /disabled/i.test(className);
    if (!hasEvent && !shareLike && CLICKABLE_HINT.test(className) && !CONTAINER.test(className)) {
      reportB.push(`${rel(file)}:${t.line}  <${t.tag} class="${className.trim().slice(0, 46)}">`);
    }
  }
}

// B 类已人工确认的误报（2026-09-12 逐条核实）：
const B_CONFIRMED = {
  // 纯 CSS 图标（.ic-link 是链接图形，非链接目标）
  'pkg-extra/import/index.wxml:26': '纯 CSS 装饰图标',
  'pkg-extra/import/index.wxml:140': '纯 CSS 装饰图标',
  // 包裹真实按钮的容器
  'pkg-extra/import/index.wxml:152': '容器，事件在子级 <button bindtap="saveImport">',
  'pkg-extra/vip/index.wxml:91': '容器，事件在子级 bindtap="goCheckout"',
};
const reportBReal = reportB.filter((r) => {
  const key = r.split('<')[0].trim();
  return !B_CONFIRMED[key];
});

// C. 尺寸过小的可点类（只看 wxml 里直接绑了事件的类）
//    注意：很多小图标是「视觉小、热区大」——用 ::after 撑到 88rpx。
//    同文件里 `类名::after { width/height: 88rpx }`（含多选择器合并写法）视作已有热区。
const reportC = [];
// C 类刻意小于 88rpx 的白名单（附理由）：
const C_CONFIRMED = {
  // 步进器 ± 按钮：紧邻成对，88rpx 热区会互相重叠误触
  'pkg-extra/recipe-detail/index.wxss.rd-sbtn': '步进器 ± 按钮 72rpx，刻意尺寸防重叠误触',
  'pkg-extra/recipe-edit/index.wxss.rc-sbtn': '步进器 ± 按钮 72rpx，刻意尺寸防重叠误触',
};
const SIZE_RE = /(min-)?(width|height):\s*(\d+)rpx/g;
for (const file of files.filter((f) => f.endsWith('.wxss'))) {
  const src = fs.readFileSync(file, 'utf8');
  const hotZone = new Set();
  const blocks = src.split('}');
  const headBody = [];
  for (const block of blocks) {
    const braceIdx = block.indexOf('{');
    if (braceIdx < 0) continue;
    const headFull = block.slice(0, braceIdx).trim();
    headBody.push([headFull, headFull.split('\n').pop().trim(), block.slice(braceIdx)]);
  }
  // 第一遍：收集全文件 ::after 热区（用完整 head，覆盖 `.a::after,\n.b::after { ... }` 跨行合并写法）
  for (const [headFull, , body] of headBody) {
    if (/::after/.test(headFull) && /(?:width|height):\s*(8[89]|9\d|\d{3,})rpx/.test(body)) {
      for (const hm of headFull.matchAll(/\.([\w-]+)::after/g)) hotZone.add(hm[1]);
    }
  }
  // 第二遍：测量声明尺寸（归因到选择器末端的类，修掉 `.chip .dot` 被误归为 `.chip` 的旧问题）
  for (const [, head, body] of headBody) {
    // 归因到选择器末端的类（修掉 `.chip .dot` 被误归为 `.chip` 的旧问题）
    const clsMatch = head.match(/\.([\w-]+)(?::{1,2}[\w-]+)?\s*$/);
    if (!clsMatch) continue;
    const cls = clsMatch[1];
    if (hotZone.has(cls)) continue;                // 已有 88rpx 热区，视觉小是故意的
    if (!boundClasses.has(cls)) continue;          // wxml 里没直接绑事件，不是点击目标
    if (!/(btn|ico|del|close|chip|tab|act|star|fav|arrow|add|more|toggle|switch|back|x)$/.test(cls)) continue;
    let small = null;
    for (const m of body.matchAll(SIZE_RE)) {
      const prop = m[2];
      const val = Number(m[3]);
      if ((prop === 'height' || prop === 'width') && val > 0 && val < 88) small = `${prop}: ${val}rpx`;
    }
    if (small) reportC.push(`${rel(file)}  .${cls}  ${small}`);
  }
}
const reportCReal = reportC.filter((r) => {
  const key = r.split(/\s+/).slice(0, 2).join('');
  return !C_CONFIRMED[key];
});

console.log(`交互体检：${wxmlFiles.length} 个页面模板 / ${files.length} 个文件\n`);
console.log(`A. 有事件但缺按下反馈：${reportA.length} 处`);
reportA.slice(0, 25).forEach((r) => console.log('   · ' + r));
if (reportA.length > 25) console.log(`   … 其余 ${reportA.length - 25} 处`);
console.log(`\nB. 疑似「可点但无事件」（已剔除 ${reportB.length - reportBReal.length} 处已确认误报）：${reportBReal.length} 处`);
reportBReal.slice(0, 20).forEach((r) => console.log('   · ' + r));
console.log(`\nC. 声明尺寸小于 88rpx 的可点类（已剔除 ${reportC.length - reportCReal.length} 处刻意尺寸）：${reportCReal.length} 处`);
reportCReal.slice(0, 20).forEach((r) => console.log('   · ' + r));
if (reportCReal.length > 20) console.log(`   … 其余 ${reportCReal.length - 20} 处`);
console.log('\n（本脚本只报告，不判定通过/失败；文本链接类小热区属正常，请按元素性质判断）');
