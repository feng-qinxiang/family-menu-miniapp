/**
 * 图片工具 — 内置菜图由现有后端提供；unsplash 外链不当封面
 */
const { resolveBaseUrl } = require('./env');
const DISH_PLACEHOLDER = '/assets/dish-placeholder.svg';

// 站内菜图和上传图显示时才补域名；上传链接的签名参数原样保留。
function dishImageUrl(path) {
  return typeof path === 'string' && (path.startsWith('/assets/dishes/') || path.startsWith('/uploads/'))
    ? resolveBaseUrl().replace(/\/+$/, '') + path
    : path;
}

function dishImagePath(url) {
  const prefix = resolveBaseUrl().replace(/\/+$/, '');
  return typeof url === 'string' && url.startsWith(prefix + '/assets/dishes/')
    ? url.slice(prefix.length)
    : url;
}

const LOCAL_DISHES = [
  'mapo-tofu', 'tomato-egg', 'hongshao-pork', 'kungpao-chicken', 'long-beans',
  'shrimp-peas', 'egg-drop-soup', 'hot-sour-soup', 'fried-rice', 'lo-mein',
  'beef-broccoli', 'chicken-congee', 'orange-chicken', 'sichuan-eggplant',
  'sweet-sour-chicken', 'wontons', 'potato-shreds', 'stir-fry-veg',
  'mushroom-chicken'
];

const TITLE_RULES = [
  { kw: ['番茄炒蛋', '西红柿炒鸡', '西红柿炒蛋'], file: 'tomato-egg' },
  { kw: ['红烧肉'], file: 'hongshao-pork' },
  { kw: ['麻婆'], file: 'mapo-tofu' },
  { kw: ['宫保'], file: 'kungpao-chicken' },
  { kw: ['糖醋'], file: 'sweet-sour-chicken' },
  { kw: ['西兰花', '清炒时蔬', '空心菜', '青菜', '蒜蓉'], file: 'stir-fry-veg' },
  { kw: ['香菇滑鸡'], file: 'mushroom-chicken' },
  { kw: ['炒饭'], file: 'fried-rice' },
  { kw: ['拌面', '捞面'], file: 'lo-mein' },
  { kw: ['馄饨'], file: 'wontons' },
  { kw: ['酸辣汤'], file: 'hot-sour-soup' },
  { kw: ['紫菜', '蛋花'], file: 'egg-drop-soup' },
  { kw: ['可乐鸡', '鸡翅'], file: 'orange-chicken' },
  { kw: ['豆角'], file: 'long-beans' },
  { kw: ['土豆丝', '酸辣土豆', '青椒土豆'], file: 'potato-shreds' },
  { kw: ['茄子'], file: 'sichuan-eggplant' },
  { kw: ['牛肉炒'], file: 'beef-broccoli' },
  { kw: ['虾', '豌豆'], file: 'shrimp-peas' }
];

function localPath(file) {
  return dishImageUrl(`/assets/dishes/${file}.jpg`);
}

function localDishByTitle(title) {
  const t = String(title || '');
  if (!t) return '';
  for (let i = 0; i < TITLE_RULES.length; i++) {
    const rule = TITLE_RULES[i];
    for (let j = 0; j < rule.kw.length; j++) {
      if (t.indexOf(rule.kw[j]) >= 0) return localPath(rule.file);
    }
  }
  return '';
}

// 食材只显示用户上传的照片；未上传的名称交给页面文字兜底。
function ingredientImage(item, photos) {
  if (!item) return '';
  const explicit = item.coverImage || item.imageUrl;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const name = String(item.ingredientName || item.name || '').trim();
  return photos && Object.prototype.hasOwnProperty.call(photos, name) ? photos[name] || '' : '';
}

function fallbackDishImg(seed) {
  const byTitle = localDishByTitle(seed);
  if (byTitle) return byTitle;
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return localPath(LOCAL_DISHES[h % LOCAL_DISHES.length]);
}

function isRemoteStock(url) {
  return /unsplash\.com|images\.unsplash/i.test(String(url || ''));
}

function recipeDishImg(recipe) {
  if (!recipe) return fallbackDishImg('');
  const title = recipe.title || recipe.recipeTitle || recipe.name || '';
  const cover = recipe.coverImage || recipe.cover || recipe.dishImg || '';
  // 真实封面优先。以前"按菜名匹配本地图"排在它前面，结果是：用户传了自家实拍，
  // 只要菜名里带"番茄/紫菜/土豆"这类词，页面永远显示一张库存图而不是他传的那张。
  if (cover && !isRemoteStock(cover)) return dishImageUrl(cover);
  const byTitle = localDishByTitle(title);
  if (byTitle) return byTitle;
  return fallbackDishImg(recipe.id || title);
}

function stepDishImg(recipe, index, explicit) {
  if (explicit) return dishImageUrl(explicit);
  return recipeDishImg(recipe);
}

function onImgError(e, pageCtx, dataPath) {
  // 网络图片失败后落到包内中性图，不再请求另一张网络菜图，避免断网时反复触发 error。
  pageCtx.setData({ [dataPath]: DISH_PLACEHOLDER });
}

/* 用户上传的照片挂了**不能**换成库存菜图——那等于拿别人家的菜冒充邻居的实拍
   （社区页早就为这件事写过一条注释）。这里只把"这张图坏了"记进 data，
   由 WXML 挂 .img-broken 画出中性占位。
   data-err-key 传的就是要置真的那条 data 路径，例如 "posts[3].photoBroken"。
   和上面的 onImgError 一样收 ctx：调用方是页面方法，写法 onPhotoError(e) { markPhotoBroken(e, this); }。 */
function onPhotoError(e, ctx) {
  const key = e.currentTarget.dataset.errKey;
  if (key && ctx) ctx.setData({ [key]: true });
}

module.exports = {
  LOCAL_DISHES,
  fallbackDishImg,
  recipeDishImg,
  localPath,
  dishImageUrl,
  dishImagePath,
  DISH_PLACEHOLDER,
  ingredientImage,
  stepDishImg,
  onImgError,
  onPhotoError
};
