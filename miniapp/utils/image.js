/**
 * 图片工具 — 按菜名落到本地图；unsplash 外链不当封面
 */

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
  return `/assets/dishes/${file}.jpg`;
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

const INGREDIENT_RULES = [
  { kw: ['土豆', '马铃薯'], file: 'potato-shreds' },
  { kw: ['时蔬', '青菜', '生菜', '空心菜', '西兰花'], file: 'stir-fry-veg' },
  { kw: ['番茄', '西红柿'], file: 'tomato-egg' },
  { kw: ['豆角'], file: 'long-beans' },
  { kw: ['茄子'], file: 'sichuan-eggplant' },
  { kw: ['鸡蛋'], file: 'tomato-egg' },
  { kw: ['豆腐'], file: 'mapo-tofu' },
  { kw: ['紫菜'], file: 'egg-drop-soup' }
];

/** 食材名落到本地菜图。对不上就空，不用哈希乱配。 */
function localDishByIngredient(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  const byTitle = localDishByTitle(n);
  if (byTitle) return byTitle;
  for (let i = 0; i < INGREDIENT_RULES.length; i++) {
    const rule = INGREDIENT_RULES[i];
    for (let j = 0; j < rule.kw.length; j++) {
      if (n.indexOf(rule.kw[j]) >= 0) return localPath(rule.file);
    }
  }
  return '';
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
  const byTitle = localDishByTitle(title);
  if (byTitle) return byTitle;
  const cover = recipe.coverImage || recipe.cover || recipe.dishImg || '';
  if (cover && !isRemoteStock(cover)) return cover;
  return fallbackDishImg(recipe.id || title);
}

function stepDishImg(recipe, index, explicit) {
  if (explicit) return explicit;
  return recipeDishImg(recipe);
}

function onImgError(e, pageCtx, dataPath, seed) {
  const fallback = localDishByTitle(seed) || fallbackDishImg(seed || dataPath);
  pageCtx.setData({ [dataPath]: fallback });
}

module.exports = {
  LOCAL_DISHES,
  fallbackDishImg,
  recipeDishImg,
  localDishByTitle,
  localDishByIngredient,
  stepDishImg,
  onImgError
};
