const {
  addCookHistory,
  addTodayMenuRecipe,
  addShoppingItem,
  getCommunityPosts,
  getPantryItems,
  getRecipeDetail,
  getTodayMenu,
  removeWish
} = require('../../utils/api');
const { runGuarded } = require('../../utils/interaction');
const { recipeDishImg, stepDishImg, onPhotoError: markPhotoBroken } = require('../../utils/image');
const { sourceLabels: baseSourceLabels } = require('../../utils/constants');
const features = require('../../utils/features');
const { composePostWithRecipe } = require('../../utils/post-share');
const { indexPantry, pantryHas } = require('../../utils/pantry-match');

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
  onPhotoError(e) { markPhotoBroken(e, this); },
  data: {
    // 大字模式：档位由设置页写进 storage，根节点挂 .font-lg 才会吃到 --fs-mul
    fontScale: 'normal',
    // 本页三处 nav-bar 都绑了 status-bar-height（骨架屏那处在 onLoad 之前就渲染了）。
    // 不给默认值会在首帧把 undefined 传进组件，控制台每进一次刷一条
    // 「expected <Number> but got non-number value」，高度也只能等组件自己回填。
    statusBarHeight: 0,
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
    // 「大家晒的」：这道菜的社区作品（最多 3 条；社区接口挂了就是空数组，不当错误处理）
    works: [],
    // COMMUNITY 关闭（个人主体）时：整块「大家晒的 + 晒我的作品」隐藏
    showCommunity: features.COMMUNITY,
    scrollTopTo: -1
  },

  onLoad(options) {
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
    let sbh = 0;
    let winH = 0;
    try {
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      sbh = win.statusBarHeight || 0;
      winH = win.windowHeight || 0;
    } catch (e) {
      sbh = 0;
      winH = 0;
    }
    // 滚动区就是 100vh 的 scroll-view，窗口高度即它的高度（悬浮键的收起判据要用）
    this._viewHeight = winH;
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
      // 禁用数组解构：该语法编译后依赖 @babel/runtime 辅助模块，未打包进小程序会整页白屏
      const loaded = await Promise.all([
        getRecipeDetail(id),
        getPantryItems(),
        // 今日菜单拉取失败不阻断详情展示，按钮回退为可点击态
        getTodayMenu().catch(() => null),
        // 「大家晒的」是锦上添花：社区挂了也只是这块空着，不能把整页拖进错误态
        // COMMUNITY 关闭时不发这个请求，用空数组占位（下游按「空」渲染）
        features.COMMUNITY ? getCommunityPosts(null, 1, 3, id).catch(() => []) : Promise.resolve([])
      ]);
      const recipe = loaded[0], pantryItems = loaded[1], todayMenu = loaded[2];
      const rawWorks = Array.isArray(loaded[3]) ? loaded[3] : [];
      const menuItems = (todayMenu && Array.isArray(todayMenu.items)) ? todayMenu.items : [];
      const inTodayMenu = menuItems.some((it) => String(it.recipeId) === String(id));
      if (!recipe) {
        this.setData({ recipe: null, loading: false });
        return;
      }
      const pantryIndex = indexPantry(pantryItems);
      const rawIngredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
      const ingredients = rawIngredients.map((ing) => {
        const name = String(ing.name || '').trim();
        return {
          ...ing,
          name,
          baseAmount: ing.amount,
          amountText: scaleAmount(ing.amount, 1),
          // 与服务端扣库存同一口径（utils/pantry-match）：名称+单位都对得上、用量能解析出数字才算"有"。
          // 只比名字会出现"页面说齐了、做完菜一项没扣"
          inStock: pantryHas(pantryIndex, name, ing.unit, ing.amount)
        };
      });
      const haveCount = ingredients.filter((ing) => ing.inStock).length;
      const totalCount = ingredients.length;
      const missCount = totalCount - haveCount;
      const rawSteps = Array.isArray(recipe.steps) ? recipe.steps : [];
      // 服务端已返回结构化步骤 {text,image,video}；教学视频仍只认第一个带 video 的步骤
      const videoStep = rawSteps.find((s) => s && s.video) || null;
      const videoUrl = (videoStep && videoStep.video) || recipe.videoUrl || '';
      const steps = rawSteps.map((s, i) => ({
        text: (s && s.text) || '',
        image: stepDishImg(recipe, i, s && s.image),
        tip: (rawSteps[i] && rawSteps[i].tip) || ''
      }));
      // 后端评价结构 {nickname, score, remark, cookedAt} → 视图结构 {author, when, score, content}
      const reviews = (Array.isArray(recipe.reviews) ? recipe.reviews : []).map((r) => ({
        author: r.nickname || '家人',
        when: r.cookedAt || '',
        score: r.score || 0,
        content: r.remark || ''
      }));
      const baseServings = Number(recipe.servings) > 0 ? Number(recipe.servings) : 2;
      const heroChar = (recipe.title || '菜').trim().charAt(0);
      // 「大家晒的」视图结构：封面取帖首图（没有就退成纯文字行），作者名截一位当头像
      const works = rawWorks.map((p) => {
        const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
        const author = p.author || '厨友';
        return {
          id: p.id,
          title: p.title || '',
          author,
          initial: author.trim().charAt(0),
          likeCount: p.likeCount || 0,
          cover: images[0] || '',
          pending: p.auditStatus === 'PENDING'
        };
      });

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
          cookCount: recipe.cookCount != null ? recipe.cookCount : reviews.length,
          rating: recipe.rating || '',
          summary: recipe.summary || '',
          difficulty: recipe.difficulty || 'medium',
          difficultyLabel: difficultyLabels[recipe.difficulty] || '中等',
          sourceLabel: sourceLabels[recipe.sourceType] || ''
        },
        servings: baseServings,
        baseServings,
        missCount,
        works,
        inTodayMenu,
        playingVideo: false,
        loadError: false,
        loading: false
      });
    } catch (err) {
      // 失败与"菜谱不存在"是两回事：都显示"可能已经删除"会让人以为菜没了
      this.setData({ recipe: null, loadError: true, loading: false });
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
        const wishId = this._wishId;
        // 尽力而为：主操作（加入菜单）已经成功，不该为一个收尾写挡住反馈；
        // 但失败必须留痕——否则这条心愿仍留在心愿单里，和「愿望达成」的提示对不上
        removeWish(wishId).catch((err) => {
          console.warn('[recipe-detail] 销愿失败，这条心愿仍会留在心愿单', wishId, err);
        });
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
    wx.navigateTo({ url: `/pkg-extra/recipe-edit/index?id=${this.data.recipe.id}` });
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
      url: `/pkg-extra/cook-mode/index?id=${recipe.id}&servings=${this.data.servings}`,
      fail: () => {
        // 真机导航失败兜底（cook-mode 页面存在，这里只报打开失败，不误报"未开发"）
        wx.showToast({ title: '页面打开失败，请重试', icon: 'none' });
      }
    });
  },

  writeReview() {
    if (!this.data.recipe) return;
    const recipe = this.data.recipe;
    // 先选真实评分（1~5 星），再写文字；不再默认写死 5 分
    wx.showActionSheet({
      itemList: ['⭐⭐⭐⭐⭐ 5 分', '⭐⭐⭐⭐ 4 分', '⭐⭐⭐ 3 分', '⭐⭐ 2 分', '⭐ 1 分'],
      success: (sheet) => {
        const score = 5 - sheet.tapIndex;
        wx.showModal({
          title: `写评价 · ${score} 分`,
          editable: true,
          placeholderText: '我也做了，写两句给家人看看…',
          success: async (res) => {
            if (!res.confirm) return;
            const content = (res.content || '').trim();
            if (!content) {
              wx.showToast({ title: '说点什么吧', icon: 'none' });
              return;
            }
            let published = false;
            let pantryDeducted = 0;
            // 与菜单页/厨房页同一套：runGuarded 挡连点，冰箱被扣了要说一句
            await runGuarded(this, 'review', () => addCookHistory({ recipeId: recipe.id, score, remark: content })
              .then((r) => {
                pantryDeducted = (r && r.pantryDeducted) || 0;
                published = true;
              }), {
              loading: '提交中',
              success: () => (pantryDeducted ? `已发布 · 冰箱扣了 ${pantryDeducted} 项` : '已发布'),
              fail: '提交失败'
            });
            if (!published) return;
            // 重新拉详情，拿到服务端权威的评价列表与做过次数
            this.loadRecipe(recipe.id);
          }
        });
      }
    });
  },

  // 帖子卡片 → 帖子详情（帖子详情里能再点回这道菜，动线成环）
  openWork(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pkg-extra/community/post-detail/index?postId=${id}` });
  },

  // 「晒我的作品」：带着这道菜去社区发帖（tab 页不能带 query，走 storage 交接）
  composeWork() {
    const recipe = this.data.recipe;
    if (!recipe || !recipe.id) return;
    if (!features.COMMUNITY) return; // 个人主体：社区入口整体下线（按钮也已隐藏，双保险）
    composePostWithRecipe(recipe.id, recipe.title).catch(() => {
      wx.showToast({ title: '社区没打开，稍后再试', icon: 'none' });
    });
  },

  // 空态按钮：加载失败时是"重新加载"，真·找不到时才是返回菜谱库
  onEmptyAction() {
    if (this.data.loadError) {
      this.loadRecipe(this.data.recipeId);
      return;
    }
    this.goBack();
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
    const d = (e && e.detail) || {};
    const top = d.scrollTop || 0;
    // 到底了就把悬浮键收起来：这一页最后一屏的右下角是「晒我的作品 / 去晒」，
    // 悬浮键正好压在上面（实测 390×844：悬浮键 y 520–623、那行 537–590，整行被盖住）。
    // 内容到底后一行已经不会再动，把悬浮键藏起来才是真的不挡；一键回顶在底部本来也用不着。
    const nearBottom = d.scrollHeight > 0 && this._viewHeight > 0
      && top + this._viewHeight >= d.scrollHeight - 40;
    const show = top > 600 && !nearBottom;
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
    // 「记录做过」不带评分（做了≠满分），评分走「写评价」流程
    wx.showModal({
      title: '记录做菜',
      content: `确认已做了「${recipe.title}」？`,
      success: async (res) => {
        if (res.confirm) {
          let recorded = false;
          let pantryDeducted = 0;
          // 连点模态框的「确定」原来会落两条做菜历史、扣两遍冰箱：这里挡页面级重复，
          // 服务端另有幂等兜底（MysqlKitchenStore.addCookHistory）
          await runGuarded(this, 'cooked', () => addCookHistory({ recipeId: recipe.id, remark: '' })
            .then((r) => {
              pantryDeducted = (r && r.pantryDeducted) || 0;
              recorded = true;
            }), {
            loading: '记录中',
            success: () => (pantryDeducted ? `已记录 · 冰箱扣了 ${pantryDeducted} 项` : '已记录'),
            fail: '记录失败'
          });
          if (!recorded) return;
          this.loadRecipe(recipe.id);
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
      path: '/pkg-extra/recipe-detail/index?id=' + id
    };
  },
});
