/**
 * 图片工具 — 统一的加载失败兜底逻辑
 */

// 本地菜图兜底池（16 张）
const LOCAL_DISHES = [
  'mapo-tofu', 'tomato-egg', 'hongshao-pork', 'kungpao-chicken', 'long-beans',
  'shrimp-peas', 'egg-dropsoup', 'hot-sour-soup', 'fried-rice', 'lo-mein',
  'beef-broccoli', 'chicken-congee', 'orange-chicken', 'sichuan-eggplant',
  'sweet-sour-chicken', 'wontons'
];

/**
 * 根据种子字符串稳定映射到一张本地兜底图片
 * @param {string} seed - 通常是 recipeId 或 title
 * @returns {string} 本地图片路径
 */
function fallbackDishImg(seed) {
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return `/assets/dishes/${LOCAL_DISHES[h % LOCAL_DISHES.length]}.jpg`;
}

/**
 * 通用图片加载错误处理器 — 在 Page 方法中使用
 * 用法: onImgError(e, this, 'coverImage') 或带列表: onImgError(e, this, 'recipes[0].cover')
 * 
 * @param {Event} e - 微信 image 组件 error 事件
 * @param {Page} pageCtx - 页面实例 (this)
 * @param {string} dataPath - setData 的路径，如 'heroRecipe.coverImage'
 * @param {string} [seed] - 用于生成兜底图的种子，默认用 dataPath
 */
function onImgError(e, pageCtx, dataPath, seed) {
  const fallback = fallbackDishImg(seed || dataPath);
  pageCtx.setData({ [dataPath]: fallback });
}

module.exports = {
  LOCAL_DISHES,
  fallbackDishImg,
  onImgError
};
