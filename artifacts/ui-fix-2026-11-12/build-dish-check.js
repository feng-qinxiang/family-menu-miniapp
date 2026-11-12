// 生成「菜名—配图」对照页：内置菜（data.sql 的种子）按小程序真实的取图函数算出配图，逐格目检。
// 用法：node artifacts/ui-fix-2026-11-12/build-dish-check.js  →  同目录 dish-check.html
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
global.getApp = () => ({ globalData: { apiBaseUrl: 'https://api.invalid' } });
global.wx = { getStorageSync() {} };
const { recipeDishImg, DISH_PLACEHOLDER } = require(path.join(root, 'miniapp/utils/image'));

const sql = fs.readFileSync(path.join(root, 'server/src/main/resources/data.sql'), 'utf8');
const seeds = [...sql.matchAll(/^\s*\((\d+), '([^']+)', '(?:owned|community)',.*?, (NULL|'[^']*'), '[A-Z]+'\)[,;]/gm)]
  .map(([, id, title, cover]) => ({ id, title, coverImage: cover === 'NULL' ? '' : cover.slice(1, -1) }));
if (seeds.length !== 16) throw new Error(`期望 16 道内置菜，解析到 ${seeds.length} 道`);

const cells = seeds.map((r) => {
  const img = recipeDishImg(r);
  const none = img === DISH_PLACEHOLDER;
  const src = none ? '../../miniapp' + img : '../../server/src/main/resources/static' + img.replace('https://api.invalid', '');
  return `<figure><img src="${src}"><figcaption><b>${r.title}</b><span>${none ? '占位图（缺照片）' : path.basename(src)}</span></figcaption></figure>`;
});
fs.writeFileSync(path.join(__dirname, 'dish-check.html'), `<!doctype html><meta charset="utf-8"><title>菜名—配图对照</title>
<style>body{margin:16px;font:15px/1.3 -apple-system,"PingFang SC",sans-serif;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;background:#fbf8f3}
figure{margin:0;background:#fff;border-radius:8px;overflow:hidden}img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
figcaption{padding:8px 10px}b{display:block;font-size:17px}span{color:#7a6e5d;font-size:12px}</style>
${cells.join('\n')}`);
console.log('dish-check.html:', seeds.length, '道；缺照片：', seeds.filter(r => recipeDishImg(r) === DISH_PLACEHOLDER).map(r => r.title).join('、'));
