// pages/me/favorites/index.js
// 我的收藏：nav-bar + 计数 + Tab(菜谱/帖子) + 菜谱2列 recipe-card / 帖子 list + 空态
// 真实接口：getMyFavorites()（GET /api/me/favorites，读 community_post_favorite）
// 后端只有帖子收藏，帖子可关联菜谱：帖子 tab=收藏的帖子，菜谱 tab=这些帖子关联的菜谱。
const { getMyFavorites, toggleCommunityFavorite } = require('../../../utils/api');

// 帖子头像撞色轮转
const AVATAR_COLORS = ['#b08949', '#2f4a3a', '#e8472a', '#3a2e23'];
// 帖子配图本地兜底池（无 recipe.coverImage 时使用）
const FALLBACK_PHOTOS = [
  'fried-rice', 'hot-sour-soup', 'lo-mein', 'orange-chicken',
  'tomato-egg', 'kungpao-chicken', 'mapo-tofu', 'wontons'
];

Page({
  data: {
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
  loadData() {
    this.setData({ loading: true });
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
        loading: false
      });
    }).catch(() => {
      this.setData({
        recipes: [],
        posts: [],
        recipeCount: 0,
        postCount: 0,
        loading: false,
        countText: '已收藏 0 道菜谱 · 0 篇帖子'
      });
      this._toast('收藏加载失败，请稍后重试');
    });
  },

  // 菜谱：从收藏帖子里提取关联菜谱，按 recipeId 去重，标记 favorited
  _buildRecipes(posts) {
    const seen = {};
    const recipes = [];
    posts.forEach((p) => {
      const r = p.recipe;
      if (r && r.id && !seen[r.id]) {
        seen[r.id] = true;
        recipes.push(Object.assign({}, r, { favorited: true, _postId: p.id }));
      }
    });
    return recipes;
  },

  // 帖子：补封面/头像底色
  _buildPosts(list) {
    const arr = Array.isArray(list) ? list : [];
    return arr.map((p, i) => {
      const recipe = p.recipe || {};
      let cover = recipe.coverImage;
      if (!cover) {
        cover = '/assets/dishes/' + FALLBACK_PHOTOS[i % FALLBACK_PHOTOS.length] + '.jpg';
      }
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
      url: '/pages/recipe-detail/index?recipeId=' + id,
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
    toggleCommunityFavorite(postId)
      .then(() => {
        this._toast('已取消收藏');
        this.loadData();
      })
      .catch(() => this._toast('操作失败，请稍后重试'));
  },

  // 帖子点击 → 帖子详情（二级页）
  onPostTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/community/post-detail/index?postId=' + id,
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
    wx.navigateTo({
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
