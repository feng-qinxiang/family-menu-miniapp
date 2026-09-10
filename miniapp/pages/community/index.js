const {
  createCommunityPost,
  getCommunityPosts,
  reportCommunityPost,
  toggleCommunityFavorite
} = require('../../utils/api');
const { withTabSelect } = require('../../behaviors/tab-select');

const reportReasons = ['内容不实', '步骤不全', '疑似搬运', '其他'];

// 头像撞色轮转（番茄红 / 深墨 / 松绿）
const AVATAR_COLORS = ['#e8472a', '#3a2e23', '#2f4a3a', '#b08949'];
// 帖子配图本地兜底池（无 recipe.coverImage 时使用）
const FALLBACK_PHOTOS = [
  'sweet-sour-chicken', 'hongshao-pork', 'tomato-egg', 'kungpao-chicken',
  'mapo-tofu', 'fried-rice', 'orange-chicken', 'beef-broccoli'
];
// 热门话题：后端暂无话题接口，点击直接带关键词跳菜谱搜索（复用搜索页 keyword 参数）
const HOT_TOPICS = [
  { tag: '今天吃什么' },
  { tag: '快手菜' },
  { tag: '宝宝辅食' },
  { tag: '一人食' },
  { tag: '光盘打卡' }
];

Page({
  data: {
      statusBarHeight: 0,
    fontScale: 'normal',
    // 信息流回顶键（滚深出现）
    showBackTop: false,
    scrollTopTo: -1,
    refreshing: false,
    posts: [],
    loading: true,
    loadError: false,
    communitySummary: { postCount: 0, commentCount: 0, favoriteCount: 0 },
    postSubmitting: false,
    favoriting: false,
    reportReasons,
    activeReportReason: '内容不实',
    showReportSheet: false,
    reportTargetId: '',
    reportDesc: '',
    showPostForm: false,
    postForm: { title: '', content: '', tagsText: '' },
    hotTopics: HOT_TOPICS
  },

  onLoad() {
    let sbh = 0;
    try {
      sbh = (wx.getWindowInfo ? wx.getWindowInfo().statusBarHeight : wx.getSystemInfoSync().statusBarHeight) || 0;
    } catch (e) {
      sbh = 0;
    }
    this.setData({ statusBarHeight: sbh });
  },

  onShow() {
      withTabSelect(this);
      // 大字模式（适老）：与其余 tab 页保持一致，onShow 读一次以便设置页切换后回来生效
      let fontScale = 'normal';
      try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
      if (fontScale !== this.data.fontScale) this.setData({ fontScale });
      this.loadPosts();
    },

    // 页面滚动在内层 scroll-view，页面级 onPullDownRefresh 不会触发；
    // 用 scroll-view 的 refresher 接管下拉刷新
    onRefresh() {
      this.setData({ refreshing: true });
      Promise.resolve(this.loadPosts())
        .catch(() => {})
        .then(() => setTimeout(() => this.setData({ refreshing: false }), 300));
    },

  // —— 回顶悬浮键 ——
  onScrollBody(e) {
    const show = ((e.detail && e.detail.scrollTop) || 0) > 600;
    if (show !== this.data.showBackTop) this.setData({ showBackTop: show });
  },

  backToTop() {
    // scroll-top 同值不触发滚动：0 与 0.1 交替，视觉无差
    this.setData({ scrollTopTo: this.data.scrollTopTo === 0 ? 0.1 : 0 });
  },

  async loadPosts() {
    this.setData({ loading: true, loadError: false });
    let posts = [];
    try {
      posts = this.normalizePosts(await getCommunityPosts() || []);
    } catch (err) {
      console.error('community loadPosts failed', err);
      this.setData({
        loadError: true,
        loading: false,
        posts: [],
        communitySummary: { postCount: 0, commentCount: 0, favoriteCount: 0 }
      });
      return;
    }
    this.setData({
      loadError: false,
      loading: false,
      posts,
      communitySummary: this.buildCommunitySummary(posts)
    });
  },

  buildCommunitySummary(posts) {
    return (posts || []).reduce((summary, post) => ({
      postCount: summary.postCount + 1,
      commentCount: summary.commentCount + (post.commentCount || 0),
      favoriteCount: summary.favoriteCount + (post.favoriteCount || 0)
    }), { postCount: 0, commentCount: 0, favoriteCount: 0 });
  },

  normalizePosts(posts) {
    return (posts || []).map((post, index) => {
      const recipe = post.recipe || null;
      const recipeImg = recipe && recipe.coverImage ? recipe.coverImage : '';
      const fallback = `/assets/dishes/${FALLBACK_PHOTOS[index % FALLBACK_PHOTOS.length]}.jpg`;
      return {
        ...post,
        authorInitial: post.author ? post.author.slice(0, 1) : '匿',
        avatarColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
        photo: recipeImg || fallback,
        recipeThumb: recipeImg || fallback,
        tags: Array.isArray(post.tags) ? post.tags : []
      };
    });
  },

  // 话题 chip → 菜谱搜索页（keyword 命中菜名/菜系/标签）
  onTopicTap(event) {
    const { tag } = event.currentTarget.dataset;
    if (!tag) return;
    wx.navigateTo({ url: `/pages/recipes/search/index?keyword=${encodeURIComponent(tag)}` });
  },

  // 帖子卡 → 详情页
  openPost(event) {
    const { id } = event.currentTarget.dataset;
    if (!id) {
      return;
    }
    wx.navigateTo({ url: `/pkg-extra/community/post-detail/index?postId=${id}` });
  },

  // 关联菜谱 → 菜谱详情
  openRecipe(event) {
    const { recipeId } = event.currentTarget.dataset;
    if (!recipeId) {
      return;
    }
    wx.navigateTo({ url: `/pages/recipe-detail/index?id=${recipeId}` });
  },

  async toggleFavorite(event) {
    if (this.data.favoriting) return;
    const { id } = event.currentTarget.dataset;
    let updated;
    try {
      this.setData({ favoriting: true });
      updated = await toggleCommunityFavorite(id);
    } catch (err) {
      this.setData({ favoriting: false });
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
      return;
    }
    this.setData({ favoriting: false });
    if (!updated) {
      return;
    }
    const normalizedUpdated = this.normalizePosts([updated])[0];
    const posts = this.data.posts.map((post) => (
      String(post.id) === String(normalizedUpdated.id) ? normalizedUpdated : post
    ));
    this.setData({ posts });
    wx.showToast({ title: updated.favorited ? '已收藏' : '已取消收藏', icon: 'none' });
  },

  setReportReason(event) {
    const { reason } = event.currentTarget.dataset;
    this.setData({
      activeReportReason: reason || '内容不实'
    });
  },

  openReportSheet(event) {
    const { id } = event.currentTarget.dataset;
    if (!id) {
      return;
    }
    this.setData({ reportTargetId: id, showReportSheet: true });
  },

  closeReportSheet() {
    this.setData({ showReportSheet: false });
  },

  onReportDescInput(event) {
    this.setData({ reportDesc: event.detail.value || '' });
  },

  async submitReport() {
    const postId = this.data.reportTargetId;
    if (!postId) {
      return;
    }
    try {
      await reportCommunityPost(postId, {
        reason: this.data.activeReportReason,
        description: (this.data.reportDesc || '').trim()
      });
      this.setData({ showReportSheet: false, reportDesc: '' });
      wx.showToast({ title: '已提交举报，感谢反馈', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: '举报失败，请重试', icon: 'none' });
    }
  },

  togglePostForm() {
    this.setData({ showPostForm: !this.data.showPostForm });
  },

  onPostInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`postForm.${field}`]: e.detail.value });
  },

  async submitPost() {
    if (this.data.postSubmitting) return;
    const { title, content, tagsText } = this.data.postForm;
    if (!title.trim()) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }
    if (!content.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    const tags = tagsText.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    this.setData({ postSubmitting: true });
    try {
      await createCommunityPost({ title: title.trim(), content: content.trim(), tags });
    } catch (err) {
      this.setData({ postSubmitting: false });
      wx.showToast({ title: '发布失败，请重试', icon: 'none' });
      return;
    }
    this.setData({ showPostForm: false, postForm: { title: '', content: '', tagsText: '' }, postSubmitting: false });
    await this.loadPosts();
    wx.showToast({ title: '发布成功', icon: 'success' });
  }
});
