// pages/me/favorites/index.js
// 我的收藏：nav-bar + 计数 + Tab(菜谱/帖子) + 菜谱2列 recipe-card / 帖子 list + 空态
// 真实接口：getMyFavorites()（GET /api/me/favorites，读 community_post_favorite）
// 后端只有帖子收藏，帖子可关联菜谱：帖子 tab=收藏的帖子，菜谱 tab=这些帖子关联的菜谱。
const features = require('../../utils/features');
const { getMyFavorites, toggleCommunityFavorite } = require('../../utils/api');
const { recipesFromPosts } = require('../../utils/dish-logic');

// 帖子头像撞色轮转
const AVATAR_COLORS = ['#b08949', '#2f4a3a', '#e8472a', '#3a2e23'];

Page({
  data: {
    // 大字模式：档位由设置页写进 storage，根节点挂 .font-lg 才会吃到 --fs-mul
    fontScale: 'normal',
    statusBarHeight: 0,
    activeTab: 'recipe',
    recipes: [],
    posts: [],
    recipeCount: 0,
    postCount: 0,
    countText: '',
    loading: true,
    toast: { visible: false, text: '' }
  },

  onLoad() {
    // 收藏页的数据源是社区帖子（后端只有帖子收藏）：COMMUNITY 关闭时整页无名无实，
    // 入口已在「我的」页隐藏，这里挡住直达与历史栈。
    if (!features.COMMUNITY) { features.leaveToHome(); return; }
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
    let sbh = 0;
    try {
      sbh = (wx.getWindowInfo ? wx.getWindowInfo().statusBarHeight : wx.getSystemInfoSync().statusBarHeight) || 0;
    } catch (e) {
      sbh = 0;
    }
    this.setData({ statusBarHeight: sbh });
    this.loadData();
  },

  // 拉取我的收藏（帖子）。菜谱 = 帖子里关联的菜谱去重。
  retryLoad() {
    this.loadData();
  },

  // 从帖子详情/菜谱详情返回时补一次静默刷新：在那边取消或新增收藏，这里原来一直是旧列表。
  // 与 community/post-detail 同一个取舍：只在"不是第一次进"时补，首屏仍走 onLoad
  onShow() {
    if (!this._enteredOnce) {
      this._enteredOnce = true;
      return;
    }
    this.loadData(true);
  },

  loadData(quiet) {
    if (!quiet) this.setData({ loading: true });
    getMyFavorites().then((list) => {
      const arr = Array.isArray(list) ? list : [];
      const posts = this._buildPosts(arr);
      const recipes = this._buildRecipes(arr);
      this.setData({
        recipes,
        posts,
        recipeCount: recipes.length,
        postCount: posts.length,
        countText: '已收藏 ' + recipes.length + ' 道菜谱 · ' + posts.length + ' 篇帖子',
        loadError: false,
        loading: false
      });
    }).catch(() => {
      // 静默刷新失败就保留当前列表：刚返回就被清空 + 弹错，比看到旧数据更难理解
      if (quiet) {
        this.setData({ loading: false });
        return;
      }
      this.setData({
        recipes: [],
        posts: [],
        recipeCount: 0,
        postCount: 0,
        loading: false,
        countText: '已收藏 0 道菜谱 · 0 篇帖子',
        // 失败不能显示成"还没有收藏"——那会让人以为自己把收藏清光了
        loadError: true
      });
      this._toast('收藏加载失败，请稍后重试');
    });
  },

  // 菜谱：从收藏帖子里提取关联菜谱（共用 utils/dish-logic.recipesFromPosts 去重），
  // 标记 favorited 并回填 _postId（取消收藏要作用于关联帖子）
  _buildRecipes(posts) {
    const postByRecipeId = {};
    (Array.isArray(posts) ? posts : []).forEach((p) => {
      if (p && p.recipe && p.recipe.id != null) postByRecipeId[p.recipe.id] = p.id;
    });
    return recipesFromPosts(posts).map((r) =>
      Object.assign({}, r, { favorited: true, _postId: postByRecipeId[r.id] })
    );
  },

  // 帖子：补封面/头像底色
  _buildPosts(list) {
    const arr = Array.isArray(list) ? list : [];
    return arr.map((p, i) => {
      const recipe = p.recipe || {};
      // 封面口径与社区信息流一致：帖子自己的图 → 关联菜谱封面 → 没有就不放图。
      // 原来用本地菜图轮转兜底，「周末烤的面包」会被配上扬州炒饭的照片（实测 h5 日志里 picked 是 fried-rice.jpg）
      const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
      const cover = images[0] || recipe.coverImage || '';
      const author = p.author || '匿名厨友';
      const tag = (Array.isArray(p.tags) && p.tags[0]) || 'Family Kitchen';
      return {
        id: p.id,
        title: p.title || '未命名帖子',
        author,
        avatarText: author.slice(0, 1),
        avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
        likeCount: p.likeCount || 0,
        tag,
        cover
      };
    });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab && tab !== this.data.activeTab) {
      this.setData({ activeTab: tab });
    }
  },

  // 菜谱卡点击 → 详情页（二级页）
  onRecipeTap(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    wx.navigateTo({
      url: '/pkg-extra/recipe-detail/index?id=' + id,
      fail: () => this._toast('详情暂未开放')
    });
  },

  // 取消收藏：真调 toggleCommunityFavorite 作用于关联帖子，成功后整体刷新
  onRecipeFav(e) {
    const recipe = e.detail && e.detail.recipe;
    if (!recipe || e.detail.favorited) return;
    const postId = recipe._postId;
    if (!postId) {
      this._toast('无法定位收藏来源');
      return;
    }
    // 防重：连点会多次切换收藏态，本地状态来回漂
    if (this.__favBusy) return;
    this.__favBusy = true;
    wx.showLoading({ title: '处理中', mask: true });
    toggleCommunityFavorite(postId)
      .then(() => {
        wx.hideLoading();
        this._toast('已取消收藏');
        this.loadData();
      })
      .catch(() => {
        wx.hideLoading();
        this._toast('操作失败，请稍后重试');
      })
      .then(() => { this.__favBusy = false; });
  },

  // 帖子点击 → 帖子详情（二级页）
  onPostTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: '/pkg-extra/community/post-detail/index?postId=' + id,
      fail: () => this._toast('帖子详情暂未开放')
    });
  },

  // 空态 CTA：去逛菜谱（tabbar 页用 switchTab）
  goRecipes() {
    wx.switchTab({
      url: '/pages/recipes/index',
      fail: () => this._toast('菜谱页暂未开放')
    });
  },

  // 空态 CTA：去逛社区（社区非 tab 页，用 navigateTo）
  goCommunity() {
    // 社区已是 tabBar 页，必须 switchTab
    wx.switchTab({
      url: '/pages/community/index',
      fail: () => this._toast('社区页暂未开放')
    });
  },

  _toast(text) {
    this.setData({ toast: { visible: true, text } });
  },

  onToastClose() {
    this.setData({ 'toast.visible': false });
  }
});
