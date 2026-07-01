const {
  addCommunityComment,
  createCommunityPost,
  getCommunityComments,
  getCommunityPosts,
  reportCommunityPost,
  toggleCommunityFavorite
} = require('../../utils/api');

const reportReasons = ['内容不实', '步骤不全', '疑似搬运', '其他'];

// 头像撞色轮转（番茄红 / 深墨 / 松绿）
const AVATAR_COLORS = ['#e8472a', '#3a2e23', '#2f4a3a', '#b08949'];
// 帖子配图本地兜底池（无 recipe.coverImage 时使用）
const FALLBACK_PHOTOS = [
  'sweet-sour-chicken', 'hongshao-pork', 'tomato-egg', 'kungpao-chicken',
  'mapo-tofu', 'fried-rice', 'orange-chicken', 'beef-broccoli'
];
// 热门话题（演示数据，后端暂无对应接口）
const HOT_TOPICS = [
  { tag: '今天吃什么', heat: '2.4万' },
  { tag: '快手菜', heat: '1.1万' },
  { tag: '宝宝辅食', heat: '8732' },
  { tag: '一人食', heat: '5610' },
  { tag: '光盘打卡', heat: '3408' }
];

Page({
  data: {
    statusBarHeight: 0,
    posts: [],
    communitySummary: { postCount: 0, commentCount: 0, favoriteCount: 0 },
    selectedPostId: '',
    selectedPost: null,
    comments: [],
    commentDraft: '',
    reportReasons,
    activeReportReason: '内容不实',
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
    this.loadPosts();
  },

  async loadPosts() {
    let posts = [];
    try {
      posts = this.normalizePosts(await getCommunityPosts() || []);
    } catch (err) {
      console.error('community loadPosts failed', err);
      wx.showToast({ title: '社区加载失败', icon: 'none' });
      this.setData({
        posts: [],
        communitySummary: { postCount: 0, commentCount: 0, favoriteCount: 0 }
      });
      return;
    }
    const selectedPostId = this.data.selectedPostId || (posts[0] ? posts[0].id : '');
    const selectedPost = posts.find((post) => String(post.id) === String(selectedPostId)) || null;
    this.setData({
      posts,
      communitySummary: this.buildCommunitySummary(posts),
      selectedPostId,
      selectedPost
    });
    if (selectedPostId) {
      await this.loadComments(selectedPostId);
    }
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

  async loadComments(postId) {
    if (!postId) {
      this.setData({ comments: [], selectedPost: null });
      return;
    }
    let comments = [];
    try {
      comments = await getCommunityComments(postId) || [];
    } catch (err) {
      console.error('community loadComments failed', err);
      comments = [];
    }
    const selectedPost = this.data.posts.find((post) => String(post.id) === String(postId)) || null;
    this.setData({
      selectedPostId: postId,
      selectedPost,
      comments
    });
  },

  selectPost(event) {
    const { id } = event.currentTarget.dataset;
    this.loadComments(id);
  },

  // 帖子卡 → 详情页
  openPost(event) {
    const { id } = event.currentTarget.dataset;
    if (!id) {
      return;
    }
    wx.navigateTo({ url: `/pages/community/post-detail/index?postId=${id}` });
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
    const { id } = event.currentTarget.dataset;
    let updated;
    try {
      updated = await toggleCommunityFavorite(id);
    } catch (err) {
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
      return;
    }
    if (!updated) {
      return;
    }
    const normalizedUpdated = this.normalizePosts([updated])[0];
    const posts = this.data.posts.map((post) => (
      String(post.id) === String(normalizedUpdated.id) ? normalizedUpdated : post
    ));
    const selectedPost = String(this.data.selectedPostId) === String(normalizedUpdated.id)
      ? normalizedUpdated
      : this.data.selectedPost;
    this.setData({
      posts,
      selectedPost
    });
    wx.showToast({ title: updated.favorited ? '已收藏' : '已取消收藏', icon: 'none' });
  },

  onCommentInput(event) {
    this.setData({
      commentDraft: event.detail.value || ''
    });
  },

  async submitComment() {
    const content = (this.data.commentDraft || '').trim();
    if (!this.data.selectedPostId) {
      wx.showToast({ title: '先选一条帖子', icon: 'none' });
      return;
    }
    if (!content) {
      wx.showToast({ title: '先写评论内容', icon: 'none' });
      return;
    }
    try {
      await addCommunityComment(this.data.selectedPostId, { content });
    } catch (err) {
      wx.showToast({ title: '评论失败，请重试', icon: 'none' });
      return;
    }
    this.setData({ commentDraft: '' });
    await this.loadPosts();
    wx.showToast({ title: '评论已发布', icon: 'success' });
  },

  setReportReason(event) {
    const { reason } = event.currentTarget.dataset;
    this.setData({
      activeReportReason: reason || '内容不实'
    });
  },

  async reportPost(event) {
    const { id } = event.currentTarget.dataset;
    const postId = id || this.data.selectedPostId;
    if (!postId) {
      return;
    }
    try {
      await reportCommunityPost(postId, { reason: this.data.activeReportReason });
      wx.showToast({ title: '已提交举报', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: '举报失败，请重试', icon: 'none' });
    }
  },

  togglePostForm() {
    this.setData({ showPostForm: !this.data.showPostForm });
  },

  // 阻止弹层内部点击穿透到遮罩
  noop() {},

  onPostInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`postForm.${field}`]: e.detail.value });
  },

  async submitPost() {
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
    try {
      await createCommunityPost({ title: title.trim(), content: content.trim(), tags });
    } catch (err) {
      wx.showToast({ title: '发布失败，请重试', icon: 'none' });
      return;
    }
    this.setData({ showPostForm: false, postForm: { title: '', content: '', tagsText: '' } });
    await this.loadPosts();
    wx.showToast({ title: '发布成功', icon: 'success' });
  }
});
