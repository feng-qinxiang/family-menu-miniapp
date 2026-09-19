/**
 * 食材分类 —— 全站唯一规则。
 *
 * 此前冰箱页、买菜清单的「待买」分组、买菜清单里的「家里已有」tab 各写了一张表，
 * 关键词与标签都不一致（同一份「调料」在三处分别是 `season/调料`、`seasoning/调味干货`），
 * 于是同一个「花椒」在冰箱里归蔬菜、在清单里归调味，两页对不上账。
 * 分类 key 只在展示层使用，后端不存，所以这里可以统一命名。
 */

// 先按强特征词判定：「花椒 / 胡椒」含「椒」会被蔬菜抢走，「姜」既是蔬菜又常出现在调料名里。
const STRONG = [
  { key: 'seasoning', words: ['花椒', '胡椒', '八角', '桂皮', '香叶', '豆瓣酱', '蚝油', '生抽', '老抽', '料酒', '鸡精', '味精', '淀粉'] },
  { key: 'meat', words: ['豆腐', '虾仁'] }
];

const INGREDIENT_CATEGORIES = [
  {
    key: 'veg',
    label: '蔬菜水果',
    icon: 'veg',
    words: ['菜', '番茄', '西红柿', '椒', '土豆', '葱', '蒜', '姜', '瓜', '茄', '萝卜', '豆角', '芹', '菇', '笋', '藕', '兰花', '生菜', '香菜', '西兰花']
  },
  {
    key: 'meat',
    label: '肉蛋水产',
    icon: 'meat',
    words: ['肉', '蛋', '鸡', '鸭', '鱼', '虾', '牛', '猪', '羊', '排骨', '五花']
  },
  {
    key: 'seasoning',
    label: '调味干货',
    icon: 'season',
    words: ['盐', '糖', '酱', '醋', '油', '辣', '粉', '味精']
  }
];

const OTHER_CATEGORY = { key: 'other', label: '其他', icon: 'other', words: [] };

function findCategory(name) {
  const n = String(name || '');
  if (!n) return null;
  for (const rule of STRONG) {
    if (rule.words.some((w) => n.includes(w))) {
      return INGREDIENT_CATEGORIES.find((c) => c.key === rule.key) || null;
    }
  }
  return INGREDIENT_CATEGORIES.find((c) => c.words.some((w) => n.includes(w))) || null;
}

/** 返回 { key, label, icon }，未命中归「其他」。 */
function categoryOf(name) {
  const cat = findCategory(name);
  return cat ? { key: cat.key, label: cat.label, icon: cat.icon } : { ...OTHER_CATEGORY };
}

module.exports = { INGREDIENT_CATEGORIES, OTHER_CATEGORY, categoryOf, findCategory };
