/**
 * 全局常量 — 各页面共用的枚举/标签映射统一维护于此
 */

const mealTypeLabels = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐'
};

const sourceLabels = {
  owned: '自建',
  community: '社区',
  imported: '导入'
};

const cuisineLabels = {
  '川菜': 'chuancai',
  '粤菜': 'yuecai',
  '家常': 'jiachang',
  '湘菜': 'xiangcai',
  '鲁菜': 'lucai',
  '西餐': 'xican',
  '日料': 'riliao'
};

// 菜系 → 拼音 class（历史接口名，见 pages/home getCuisineClass）
const cuisinePinyin = cuisineLabels;

// 菜谱库 tab 的来源筛选 chips
const sourceTabs = [
  { key: 'all', label: '全部' },
  { key: 'owned', label: '自建' },
  { key: 'community', label: '社区' },
  { key: 'imported', label: '导入' },
  { key: 'favorites', label: '我的收藏' }
];

// 菜系筛选项（字符串列表）
const cuisineList = Object.keys(cuisineLabels);

// 餐次选项
const mealOptions = [
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' },
  { key: 'snack', label: '加餐' }
];

// 餐次顺序（菜单页分组渲染用）
const mealOrder = ['breakfast', 'lunch', 'dinner', 'snack'];

const SLOTS = [
  { key: 'breakfast', label: '早' },
  { key: 'lunch', label: '午' },
  { key: 'dinner', label: '晚' }
];

module.exports = {
  mealTypeLabels,
  sourceLabels,
  recipeSourceLabels: sourceLabels,
  cuisineLabels,
  cuisinePinyin,
  cuisineList,
  sourceTabs,
  mealOptions,
  mealOrder,
  SLOTS
};
