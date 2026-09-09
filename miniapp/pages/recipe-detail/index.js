const {
  addCookHistory,
  addTodayMenuRecipe,
  addShoppingItem,
  getPantryItems,
  getRecipeDetail,
  getTodayMenu,
  removeWish
} = require('../../utils/api');
const { decodeStep, hoistVideo } = require('../../utils/recipe-steps');
const { recipeDishImg, stepDishImg } = require('../../utils/image');
const { sourceLabels: baseSourceLabels } = require('../../utils/constants');

// 复用全局来源标签（社区开关关闭时 community 显示"精选"），本页额外支持 link/text
const sourceLabels = {
  ...baseSourceLabels,
  link: '链接',
  text: '文本'
};

const difficultyLabels = { easy: '简单', medium: '中等', hard: '困难' };

function pickCover(recipe) {
  return recipeDishImg(recipe);
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
    loading: true,
    playingVideo: false,
    // 今日菜单状态：页面加载时并行查好，点击加入时无需再查（省一个请求来回）
    inTodayMenu: false,
    addingToday: false,
    // 长页快捷导航：滚动超一屏显示"回顶/退出"悬浮键
    showQuickNav: false,
    scrollTopTo: -1
  },

  onLoad(options) {
    let sbh = 0;
    try {
      sbh = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).statusBarHeight || 0;
    } catch (e) {
      sbh = 0;
    }
    const recipeId = options.id || options.recipeId;
    // 从心愿「待挑菜」链路跳来：加菜成功后自动销愿，slot 用心愿的餐次
    this._wishId = options.wishId ? decodeURIComponent(options.wishId) : '';
    this._wishSlot = options.slot || '';
    this.setData({ statusBarHeight: sbh, recipeId });
    if (recipeId) {
      this.loadRecipe(recipeId);
    } else {
      this.setData({ loading: false });
    }
  },

  // 从 cook-mode / recipe-edit 返回后刷新：加菜态、评价、份量都可能已变
  onShow() {
    if (this._inited && this.data.recipeId && !this.data.loading) {
      this.loadRecipe(this.data.recipeId);
    }
    this._inited = true;
  },

  async loadRecipe(id) {
    try {
      const [recipe, pantryItems, todayMenu] = await Promise.all([
        getRecipeDetail(id),
        getPantryItems(),
        // 今日菜单拉取失败不阻断详情展示，按钮回退为可点击态
        getTodayMenu().catch(() => null)
      ]);
      const menuItems = (todayMenu && Array.isArray(todayMenu.items)) ? todayMenu.items : [];
      const inTodayMenu = menuItems.some((it) => String(it.recipeId) === String(id));
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
      const decodedSteps = rawSteps.map((s) => decodeStep(s));
      const videoUrl = hoistVideo(decodedSteps) || recipe.videoUrl || '';
      const steps = decodedSteps.map((decoded, i) => ({
        text: decoded.text,
        image: stepDishImg(recipe, i, decoded.image),
        tip: (rawSteps[i] && rawSteps[i].tip) || ''
      }));
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
          videoUrl,
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
        inTodayMenu,
        playingVideo: false,
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
    if (!this.data.recipe || this.data.addingToday) return;
    // 已加入：零请求即时反馈（状态在页面加载时并行查好，成功加入后本地置位）
    if (this.data.inTodayMenu) {
      wx.showToast({ title: '已经在今日菜单里啦', icon: 'none' });
      return;
    }
    this.setData({ addingToday: true });
    try {
      await addTodayMenuRecipe(this.data.recipe.id, this._wishSlot || 'dinner');
      this.setData({ inTodayMenu: true });
      // 心愿闭环：这道菜是为某条心愿挑的 → 加入菜单即愿望达成，自动销愿
      if (this._wishId) {
        removeWish(this._wishId).catch(() => {});
        this._wishId = '';
        wx.showToast({ title: '愿望达成，已入菜单', icon: 'success' });
      } else {
        wx.showToast({ title: '已加入今日菜单', icon: 'success' });
      }
    } catch (err) {
      wx.showToast({ title: '加入失败', icon: 'none' });
    } finally {
      this.setData({ addingToday: false });
    }
  },

  goEdit() {
    if (!this.data.recipe) return;
    wx.navigateTo({ url: `/pages/recipe-edit/index?id=${this.data.recipe.id}` });
  },

  onTapVideo() {
    if (!this.data.recipe) return;
    if (this.data.recipe.videoUrl) {
      this.setData({ playingVideo: true });
      return;
    }
    this.startCook();
  },

  // —— 开始做菜：进入烹饪模式 ——
  startCook() {
    if (!this.data.recipe) return;
    const recipe = this.data.recipe;
    wx.navigateTo({
      url: `/pages/cook-mode/index?id=${recipe.id}&servings=${this.data.servings}`,
      fail: () => {
        // 真机导航失败兜底（cook-mode 页面存在，这里只报打开失败，不误报"未开发"）
        wx.showToast({ title: '页面打开失败，请重试', icon: 'none' });
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

  // —— 长页快捷导航 ——
  onScrollBody(e) {
    const show = (e.detail && e.detail.scrollTop || 0) > 600;
    if (show !== this.data.showQuickNav) {
      this.setData({ showQuickNav: show });
    }
  },

  backToTop() {
    // scroll-top 同值不触发滚动：0 与 0.1 交替，视觉无差
    this.setData({ scrollTopTo: this.data.scrollTopTo === 0 ? 0.1 : 0 });
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
