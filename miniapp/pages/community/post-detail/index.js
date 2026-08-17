// pages/community/post-detail · 帖子详情（全新页）
const api = require('../../../utils/api');

const FALLBACK_DISHES = [
  'beef-broccoli', 'chicken-congee', 'egg-drop-soup', 'fried-rice',
  'hongshao-pork', 'hot-sour-soup', 'kungpao-chicken', 'lo-mein',
  'long-beans', 'mapo-tofu', 'orange-chicken', 'shrimp-peas',
  'sichuan-eggplant', 'sweet-sour-chicken', 'tomato-egg', 'wontons'
];

// 根据 id/title 稳定挑一张本地菜图兜底
function pickDish(seed) {
  const s = String(seed || '');
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
  return '/assets/dishes/' + FALLBACK_DISHES[sum % FALLBACK_DISHES.length] + '.jpg';
}

// 头像底色循环（与设计稿一致的撞色梯度）
const AVA_THEMES = ['lin', 'lan', 'zhao', 'gold', 'pine'];
function avaTheme(seed) {
  const s = String(seed || '');
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
  return AVA_THEMES[sum % AVA_THEMES.length];
}
function avaText(name) {
  return name ? String(name).slice(0, 1) : '匿';
}

// 把帖子原始字段标准化为视图模型
function normalizePost(post) {
  if (!post) return null;
  const cover = (post.recipe && post.recipe.coverImage) || pickDish(post.id || post.title);
  const paragraphs = String(post.content || '')
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    id: post.id,
    title: post.title || '未命名分享',
    author: post.author || '匿名厨友',
    authorMeta: ((post.tags && post.tags[0]) ? post.tags[0] + ' · ' : '') + '美食分享',
    avaTheme: avaTheme(post.author),
    avaText: avaText(post.author),
    paragraphs: paragraphs.length ? paragraphs : [post.content || '暂无正文'],
    cover,
    likeCount: post.likeCount || 0,
    favoriteCount: post.favoriteCount || 0,
    commentCount: post.commentCount || 0,
    favorited: !!post.favorited,
    tags: Array.isArray(post.tags) ? post.tags : [],
    recipe: post.recipe || null
  };
}

function normalizeComment(c) {
  return {
    commentId: c.commentId || ('c-' + Math.random().toString(36).slice(2)),
    author: c.author || '匿名厨友',
    avaTheme: avaTheme(c.author),
    avaText: avaText(c.author),
    content: c.content || '',
    createdAt: c.createdAt || '刚刚'
  };
}

Page({
  data: {
    postId: '',
    loading: true,
    loadError: false,
    post: null,
    comments: [],
    commentText: '',
    submitting: false,
    favoriting: false,
    toast: { visible: false, text: '', type: 'top' }
  },

  onLoad(options) {
    const postId = (options && options.postId) || '';
    this.setData({ postId });
    this.loadAll(postId);
  },

  // 加载帖子 + 评论，带容错
  loadAll(postId) {
    this.setData({ loading: true, loadError: false });
    Promise.all([
      api.getCommunityPosts().catch(() => []),
      postId ? api.getCommunityComments(postId).catch(() => []) : Promise.resolve([])
    ])
      .then(([posts, comments]) => {
        const list = Array.isArray(posts) ? posts : [];
        const raw = list.find((p) => String(p.id) === String(postId)) || null;
        // 找不到 = 帖子已删除/链接失效 → 走 loadError 空态，禁止静默换第一条
        const post = normalizePost(raw);
        const cmts = (Array.isArray(comments) ? comments : []).map(normalizeComment);
        this.setData({
          loading: false,
          loadError: !post,
          post,
          comments: cmts,
          postId: post ? post.id : postId
        });
      })
      .catch(() => {
        this.setData({ loading: false, loadError: true });
      });
  },

  onRetry() {
    this.loadAll(this.data.postId);
  },

  onCommentInput(e) {
    this.setData({ commentText: e.detail.value });
  },

  // 提交评论
  onSubmitComment() {
    const text = (this.data.commentText || '').trim();
    if (!text) {
      this.showToast('说点什么再发送吧', 'error');
      return;
    }
    if (this.data.submitting || !this.data.postId) return;
    this.setData({ submitting: true });
    api
      .addCommunityComment(this.data.postId, { content: text })
      .then((res) => {
        const comment = normalizeComment(res || { author: '我', content: text });
        const post = this.data.post
          ? Object.assign({}, this.data.post, { commentCount: (this.data.post.commentCount || 0) + 1 })
          : this.data.post;
        this.setData({
          comments: [comment].concat(this.data.comments),
          commentText: '',
          submitting: false,
          post
        });
        this.showToast('评论已发布', 'top');
      })
      .catch(() => {
        this.setData({ submitting: false });
        this.showToast('发送失败，请重试', 'error');
      });
  },

  // 收藏切换
  onToggleFavorite() {
    if (this.data.favoriting || !this.data.postId || !this.data.post) return;
    this.setData({ favoriting: true });
    api
      .toggleCommunityFavorite(this.data.postId)
      .then((res) => {
        let favorited;
        let favoriteCount;
        if (res && typeof res.favorited === 'boolean') {
          favorited = res.favorited;
          favoriteCount = typeof res.favoriteCount === 'number' ? res.favoriteCount : this.data.post.favoriteCount;
        } else {
          favorited = !this.data.post.favorited;
          favoriteCount = Math.max(0, (this.data.post.favoriteCount || 0) + (favorited ? 1 : -1));
        }
        const post = Object.assign({}, this.data.post, { favorited, favoriteCount });
        this.setData({ post, favoriting: false });
        this.showToast(favorited ? '已收藏' : '已取消收藏', 'top');
      })
      .catch(() => {
        this.setData({ favoriting: false });
        this.showToast('操作失败，请重试', 'error');
      });
  },

  // 跳转关联菜谱详情
  onOpenRecipe() {
    const recipe = this.data.post && this.data.post.recipe;
    if (!recipe || !recipe.id) {
      this.showToast('暂无关联菜谱', 'top');
      return;
    }
    wx.navigateTo({
      url: '/pages/recipe-detail/index?id=' + encodeURIComponent(recipe.id),
      fail: () => this.showToast('暂无法打开菜谱', 'error')
    });
  },

  showToast(text, type) {
    this.setData({ toast: { visible: true, text, type: type || 'top' } });
  },
  onToastClose() {
    this.setData({ 'toast.visible': false });
  }
});
