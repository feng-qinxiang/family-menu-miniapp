const {
  addCookHistory,
  addTodayMenuRecipe,
  addShoppingItem,
  getPantryItems,
  getRecipeDetail
} = require('../../utils/api');

const sourceLabels = {
  owned: '自建',
  community: '社区',
  imported: '导入',
  link: '链接',
  text: '文本'
};

const difficultyLabels = { easy: '简单', medium: '中等', hard: '困难' };

// 本地菜图兜底（与 recipe-card 一致的稳定 hash 映射）
const FALLBACK_DISHES = [
  'beef-broccoli', 'chicken-congee', 'egg-drop-soup', 'fried-rice',
  'hongshao-pork', 'hot-sour-soup', 'kungpao-chicken', 'lo-mein',
  'long-beans', 'mapo-tofu', 'orange-chicken', 'shrimp-peas',
  'sichuan-eggplant', 'sweet-sour-chicken', 'tomato-egg', 'wontons'
];

function pickCover(recipe) {
  if (recipe.coverImage) return recipe.coverImage;
  const seed = String(recipe.id || recipe.title || '');
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return '/assets/dishes/' + FALLBACK_DISHES[sum % FALLBACK_DISHES.length] + '.jpg';
}

// 把份量缩放比例应用到数值用量，非数值（适量/少许）原样保留
function scaleAmount(amount, ratio) {
  if (amount == null || amount === '') return '';
  const num = Number(amount);
  if (!isFinite(num) || String(amount).trim() === '') {
    return String(amount);
  }
  const scaled = num * ratio;
  // 保留至多 1 位小数，去掉无意义的 .0
  const rounded = Math.round(scaled * 10) / 10;
  return String(rounded);
}

Page({
  data: {
    recipe: null,
    servings: 2,
    baseServings: 2,
    missCount: 0,
    skeletonRows: [1, 2, 3],
    loading: true
  },

  onLoad(options) {
    let sbh = 0;
    try {
      sbh = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).statusBarHeight || 0;
    } catch (e) {
      sbh = 0;
    }
    const recipeId = options.id || options.recipeId;
    this.setData({ statusBarHeight: sbh, recipeId });
    if (recipeId) {
      this.loadRecipe(recipeId);
    } else {
      this.setData({ loading: false });
    }
  },

  async loadRecipe(id) {
    try {
      const [recipe, pantryItems] = await Promise.all([getRecipeDetail(id), getPantryItems()]);
      if (!recipe) {
        this.setData({ recipe: null, loading: false });
        return;
      }
      const stockNames = new Set(
        (pantryItems || [])
          .filter((item) => (item.quantity == null) || Number(item.quantity) > 0)
          .map((item) => String(item.name || item.ingredientName || '').trim())
          .filter(Boolean)
      );
      const rawIngredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
      const ingredients = rawIngredients.map((ing) => {
        const name = String(ing.name || '').trim();
        return {
          ...ing,
          name,
          baseAmount: ing.amount,
          amountText: scaleAmount(ing.amount, 1),
          inStock: name ? stockNames.has(name) : false
        };
      });
      const haveCount = ingredients.filter((ing) => ing.inStock).length;
      const totalCount = ingredients.length;
      const missCount = totalCount - haveCount;
      const rawSteps = Array.isArray(recipe.steps) ? recipe.steps : [];
      const steps = rawSteps.map((s) => {
        if (typeof s === 'string') return { text: s, image: '', tip: '' };
        return { text: s.text || '', image: s.image || '', tip: s.tip || '' };
      });
      const reviews = Array.isArray(recipe.reviews) ? recipe.reviews : [];
      const baseServings = Number(recipe.servings) > 0 ? Number(recipe.servings) : 2;
      const heroChar = (recipe.title || '菜').trim().charAt(0);

      this.setData({
        recipe: {
          ...recipe,
          title: recipe.title || '未命名菜谱',
          heroChar,
          cover: pickCover(recipe),
          tasteTags: Array.isArray(recipe.tasteTags) ? recipe.tasteTags : [],
          ingredients,
          haveCount,
          totalCount,
          steps,
          reviews,
          cookCount: recipe.cookCount || reviews.length,
          rating: recipe.rating || '',
          summary: recipe.summary || '',
          difficulty: recipe.difficulty || 'medium',
          difficultyLabel: difficultyLabels[recipe.difficulty] || '中等',
          sourceLabel: sourceLabels[recipe.sourceType] || ''
        },
        servings: baseServings,
        baseServings,
        missCount,
        loading: false
      });
    } catch (err) {
      this.setData({ recipe: null, loading: false });
      wx.showToast({ title: '加载详情失败', icon: 'none' });
    }
  },

  // —— 份量 stepper：±1 重算用量 ——
  changeServings(e) {
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    const next = Math.max(1, Math.min(20, this.data.servings + delta));
    if (next === this.data.servings) return;
    const ratio = next / this.data.baseServings;
    const ingredients = this.data.recipe.ingredients.map((ing) => ({
      ...ing,
      amountText: scaleAmount(ing.baseAmount, ratio)
    }));
    this.setData({
      servings: next,
      'recipe.ingredients': ingredients
    });
  },

  previewStepImage(e) {
    const { url } = e.currentTarget.dataset;
    if (!url) return;
    const urls = (this.data.recipe.steps || []).map((s) => s.image).filter(Boolean);
    wx.previewImage({ current: url, urls });
  },

  // —— 把缺的食材加入买菜清单 ——
  async addMissingToCart() {
    if (!this.data.recipe) return;
    const missing = this.data.recipe.ingredients.filter((ing) => !ing.inStock);
    if (!missing.length) {
      wx.showToast({ title: '食材都齐了', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '加入中', mask: true });
    // 并发下单（不因单个失败中断整体），完成后统一汇报
    const results = await Promise.allSettled(missing.map((ing) => addShoppingItem({
      ingredientName: ing.name,
      amount: ing.amountText || ing.baseAmount || '',
      unit: ing.unit || ''
    })));
    wx.hideLoading();
    const added = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - added;
    if (!added) {
      wx.showToast({ title: '加入失败，请重试', icon: 'none' });
      return;
    }
    wx.showToast({
      title: failed ? `已加 ${added} 样，失败 ${failed} 样` : `已加 ${added} 样`,
      icon: failed ? 'none' : 'success'
    });
  },

  async addToToday() {
    if (!this.data.recipe) return;
    try {
      await addTodayMenuRecipe(this.data.recipe.id, 'dinner');
      wx.showToast({ title: '已加入今日菜单', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: '加入失败', icon: 'none' });
    }
  },

  goEdit() {
    if (!this.data.recipe) return;
    wx.navigateTo({ url: `/pages/recipe-edit/index?id=${this.data.recipe.id}` });
  },

  // —— 开始做菜：进入烹饪模式 ——
  startCook() {
    if (!this.data.recipe) return;
    const recipe = this.data.recipe;
    wx.navigateTo({
      url: `/pages/cook-mode/index?id=${recipe.id}&servings=${this.data.servings}`,
      fail: () => {
        // cook-mode 尚未上线时的兜底：记录做菜
        wx.showToast({ title: '烹饪模式开发中', icon: 'none' });
      }
    });
  },

  writeReview() {
    if (!this.data.recipe) return;
    const recipe = this.data.recipe;
    wx.showModal({
      title: '写评价',
      editable: true,
      placeholderText: '我也做了，写两句给家人看看…',
      success: async (res) => {
        if (!res.confirm) return;
        const content = (res.content || '').trim();
        if (!content) {
          wx.showToast({ title: '说点什么吧', icon: 'none' });
          return;
        }
        wx.showLoading({ title: '提交中', mask: true });
        try {
          await addCookHistory({ recipeId: recipe.id, score: 5, remark: content });
          wx.hideLoading();
          // 乐观更新本地评价列表
          const reviews = (this.data.recipe.reviews || []).slice();
          reviews.unshift({ author: '我', when: '刚刚', score: 5, content });
          this.setData({
            'recipe.reviews': reviews,
            'recipe.cookCount': (this.data.recipe.cookCount || 0) + 1
          });
          wx.showToast({ title: '已发布', icon: 'success' });
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '提交失败', icon: 'none' });
        }
      }
    });
  },

  goBack() {
    wx.navigateBack({
      fail() {
        wx.switchTab({ url: '/pages/recipes/index' });
      }
    });
  },

  recordCook() {
    if (!this.data.recipe) return;
    const recipe = this.data.recipe;
    wx.showModal({
      title: '记录做菜',
      content: `确认已做了「${recipe.title}」？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await addCookHistory({ recipeId: recipe.id, score: 5, remark: '' });
            wx.showToast({ title: '已记录', icon: 'success' });
          } catch (err) {
            wx.showToast({ title: '记录失败', icon: 'none' });
          }
        }
      }
    });
  },

  onShareAppMessage() {
    const r = this.data.recipe || {};
    // 分享路径携带真实 id（onLoad 已 setData recipeId），打开直达原菜谱
    const id = this.data.recipeId || r.id || '';
    return {
      title: r.title ? '分享一道菜：' + r.title : '一道好菜，分享给你',
      path: '/pages/recipe-detail/index?id=' + id
    };
  },
});
