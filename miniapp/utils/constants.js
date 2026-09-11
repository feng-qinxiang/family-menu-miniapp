/**
 * 全局常量 — 各页面共用的枚举/标签映射统一维护于此
 */

const features = require('./features');

const mealTypeLabels = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐'
};

const sourceLabels = {
  owned: '自建',
  // 社区功能隐藏时来源标签改用中性词，避免出现无处可去的"社区"字样
  community: features.COMMUNITY ? '社区' : '精选',
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
// "社区"与"我的收藏"（数据源是社区帖子收藏）随 COMMUNITY 开关隐藏
const sourceTabs = [
  { key: 'all', label: '全部' },
  { key: 'owned', label: '自建' },
  ...(features.COMMUNITY ? [{ key: 'community', label: '社区' }] : []),
  { key: 'imported', label: '导入' },
  ...(features.COMMUNITY ? [{ key: 'favorites', label: '我的收藏' }] : [])
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

// 忌口标签 → 匹配关键词（按菜名/菜系/口味标签匹配）。
// 这里是忌口的唯一定义：标签池直接由 key 派生（见 AVOID_TAGS），
// 家庭页的标签池、菜谱页的筛选、资料页的偏好三处都从这里取，避免各写一份导致漂移。
const AVOID_KEYWORDS = {
  '辣': ['辣', '麻婆', '水煮', '川菜', '香辣', '麻辣'],
  '香菜': ['香菜', '芫荽'],
  '猪肉': ['猪', '红烧肉', '回锅肉', '小炒肉', '肉末', '排骨', '五花'],
  '牛肉': ['牛'],
  '羊肉': ['羊'],
  '海鲜': ['虾', '鱼', '蟹', '贝', '海鲜', '鱿鱼', '蚝'],
  '花生': ['花生', '宫保'],
  '鸡蛋': ['蛋']
};

// 忌口标签池（供成员编辑、个人资料选择用）
const AVOID_TAGS = Object.keys(AVOID_KEYWORDS);

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
  AVOID_KEYWORDS,
  AVOID_TAGS,
  SLOTS
};
