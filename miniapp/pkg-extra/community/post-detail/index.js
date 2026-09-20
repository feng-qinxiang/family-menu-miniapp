// pages/community/post-detail · 帖子详情（全新页）
const api = require('../../../utils/api');
const { onPhotoError: markPhotoBroken } = require('../../../utils/image');

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
  // 只认「本帖关联菜谱的封面」。之前没菜谱的帖子会按 id 稳定挑一张本地库存菜图当大图，
  // 邻居的分享就被显示成了不相干的一道菜——列表页已因同样的理由去掉过这个兜底
  // （见 pages/community/index.js 的 photo 注释），详情页漏改了。
  // 帖子自己上传的实拍图走 images 画廊渲染，不在这里冒充。
  const cover = (post.recipe && post.recipe.coverImage) || '';
  const paragraphs = String(post.content || '')
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const images = Array.isArray(post.images) ? post.images.filter(Boolean) : [];
  return {
    id: post.id,
    title: post.title || '未命名分享',
    author: post.author || '匿名厨友',
    authorMeta: ((post.tags && post.tags[0]) ? post.tags[0] + ' · ' : '') + '美食分享',
    avaTheme: avaTheme(post.author),
    avaText: avaText(post.author),
    paragraphs: paragraphs.length ? paragraphs : [post.content || '暂无正文'],
    cover,
    images,
    likeCount: post.likeCount || 0,
    liked: !!post.liked,
    favoriteCount: post.favoriteCount || 0,
    commentCount: post.commentCount || 0,
    favorited: !!post.favorited,
    tags: Array.isArray(post.tags) ? post.tags : [],
    recipe: post.recipe || null,
    // 是否作者本人（作者才显示删帖入口）
    mine: !!post.mine,
    // 待审核中（仅作者本人可见阶段），标题旁加角标
    isPending: post.auditStatus === 'PENDING'
  };
}

function normalizeComment(c) {
  return {
    // 无真实 commentId 的兜底数据不可删（mine 也不会为 true）
    commentId: c.commentId || ('c-' + Math.random().toString(36).slice(2)),
    author: c.author || '匿名厨友',
    avaTheme: avaTheme(c.author),
    avaText: avaText(c.author),
    content: c.content || '',
    createdAt: c.createdAt || '刚刚',
    mine: !!c.mine,
    // 待审核评论：只有评论者本人可见
    isPending: c.auditStatus === 'PENDING'
  };
}

Page({
  onPhotoError(e) { markPhotoBroken(e, this); },
  data: {
    postId: '',
    // 评论区回顶键（滚深出现）
    showBackTop: false,
    scrollTopTo: -1,
    loading: true,
    loadError: false,
    loadErrorDesc: '',
    post: null,
    comments: [],
    commentText: '',
    submitting: false,
    favoriting: false,
    toast: { visible: false, text: '', type: 'top' }
  },

  onLoad(options) {
  // 大字模式档位：进页读取（设置页改完回来重进生效）
  let fontScale = 'normal';
  try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
  if (fontScale !== this.data.fontScale) this.setData({ fontScale });
    const postId = (options && options.postId) || '';
    this.setData({ postId });
    this.loadAll(postId);
  },

  onShow() {
    // 只在"不是第一次进"时静默补一次：本页原来只在 onLoad 拉数据，
    // 去别处点了赞、别人补了评论再回来看，赞数/评论数/评论列表全是旧的，
    // 而且没有任何提示——看着像自己的操作丢了。
    if (!this._enteredOnce) {
      this._enteredOnce = true;
      return;
    }
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
    if (this.data.postId && !this.data.loading) this.refreshQuietly();
  },

  // 与 loadAll 的区别：不置 loading（否则每次回来看见一次骨架屏），失败也保持原状
  refreshQuietly() {
    const postId = this.data.postId;
    Promise.all([
      api.getCommunityPost(postId).catch(() => null),
      api.getCommunityComments(postId).catch(() => null)
    ])
      .then((loaded) => {
        const raw = loaded[0];
        const comments = loaded[1];
        const patch = {};
        // 帖子恰好被下架/删除时不清空整屏——用户可能正看着它，
        // 交给下一次显式操作（回复/点赞）的失败回执处理。
        if (raw) patch.post = normalizePost(raw);
        if (Array.isArray(comments)) patch.comments = comments.map(normalizeComment);
        if (Object.keys(patch).length) this.setData(patch);
      })
      .catch(() => {});
  },

  // 加载帖子 + 评论，带容错
  loadAll(postId) {
    this.setData({ loading: true, loadError: false, loadErrorDesc: '' });
    Promise.all([
      // 详情端点直取单帖；拉不到（已删/未过审/失效）与列表兜底失败同语义 → loadError。
      // 服务端对"作者看自己被下架的帖"会给出明确原因（该分享因违规已被下架），透传展示
      postId ? api.getCommunityPost(postId).catch((err) => ({ _err: err })) : Promise.resolve(null),
      postId ? api.getCommunityComments(postId).catch(() => []) : Promise.resolve([])
    ])
      // 禁用回调参数数组解构：编译依赖 @babel/runtime 辅助模块，未打包会整页白屏
      .then((loaded) => {
        const first = loaded[0];
        const comments = loaded[1];
        const err = first && first._err;
        const raw = err ? null : first;
        // 拿不到帖子 = 帖子已删除/链接失效 → 走 loadError 空态，禁止静默换第一条
        const post = normalizePost(raw);
        const cmts = (Array.isArray(comments) ? comments : []).map(normalizeComment);
        this.setData({
          loading: false,
          loadError: !post,
          loadErrorDesc: (err && err.message) || '',
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

  // —— 回顶悬浮键 ——
  onScrollBody(e) {
    const show = ((e.detail && e.detail.scrollTop) || 0) > 600;
    if (show !== this.data.showBackTop) this.setData({ showBackTop: show });
  },

  backToTop() {
    // scroll-top 同值不触发滚动：0 与 0.1 交替，视觉无差
    this.setData({ scrollTopTo: this.data.scrollTopTo === 0 ? 0.1 : 0 });
  },

  // 详情页可被分享出去，必须自带举报入口（微信对 UGC 页面的硬性要求）；
  // 原因枚举与列表页 pages/community 保持一致，处置仍在 /admin 举报审核
  onReport() {
    const post = this.data.post;
    const postId = (post && post.id) || this.data.postId;
    if (!postId) return;
    const reasons = ['内容不实', '步骤不全', '疑似搬运', '其他'];
    wx.showActionSheet({
      itemList: reasons,
      success: async (res) => {
        const key = `report-${postId}`;
        if (this._reporting) return;
        this._reporting = true;
        wx.showLoading({ title: '提交中', mask: true });
        try {
          await api.reportCommunityPost(postId, { reason: reasons[res.tapIndex], description: '' });
          wx.hideLoading();
          wx.showToast({ title: '已举报，我们会尽快处理', icon: 'none' });
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '举报失败，请重试', icon: 'none' });
        } finally {
          this._reporting = false;
        }
      },
      fail: () => {}
    });
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
  // 点赞：先本地翻转，失败回滚（与列表页一致）
  onToggleLike() {
    if (!this.data.postId || !this.data.post) return;
    const before = this.data.post;
    const liked = !before.liked;
    const likeCount = Math.max(0, (before.likeCount || 0) + (liked ? 1 : -1));
    this.setData({ post: Object.assign({}, before, { liked, likeCount }) });
    api
      .toggleCommunityLike(this.data.postId)
      .then((res) => {
        if (res && typeof res.liked === 'boolean') {
          const post = Object.assign({}, this.data.post, {
            liked: res.liked,
            likeCount: typeof res.likeCount === 'number' ? res.likeCount : this.data.post.likeCount
          });
          this.setData({ post });
        }
        this.showToast(liked ? '已点赞' : '已取消点赞', 'top');
      })
      .catch(() => {
        this.setData({ post: before });
        this.showToast('点赞失败，请重试', 'error');
      });
  },

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

  // 九宫格图预览大图
  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url;
    const urls = (this.data.post && this.data.post.images) || [];
    if (!urls.length) return;
    wx.previewImage({ current: url || urls[0], urls });
  },

  // 微信分享卡片：路径直达详情端点（匿名可看），卡片图用帖首图
  onShareAppMessage() {
    const post = this.data.post || {};
    return {
      title: `${post.author || '厨友'}：${post.title || '家常分享'}`,
      path: `/pkg-extra/community/post-detail/index?postId=${this.data.postId || post.id || ''}`,
      imageUrl: post.cover || ''
    };
  },

  // 跳转关联菜谱详情
  onOpenRecipe() {
    const recipe = this.data.post && this.data.post.recipe;
    if (!recipe || !recipe.id) {
      this.showToast('暂无关联菜谱', 'top');
      return;
    }
    wx.navigateTo({
      url: '/pkg-extra/recipe-detail/index?id=' + encodeURIComponent(recipe.id),
      fail: () => this.showToast('暂无法打开菜谱', 'error')
    });
  },

  // 作者删自己的帖子：确认后软删，返回上一页（列表页 onShow 会自动刷新）
  onDeletePost() {
    if (!this.data.postId) return;
    wx.showModal({
      title: '删除这篇分享？',
      content: '删除后其他人将无法看到，自己也不能恢复',
      confirmText: '删除',
      confirmColor: '#e8472a',
      success: (res) => {
        if (!res.confirm) return;
        api
          .deleteCommunityPost(this.data.postId)
          .then(() => {
            this.showToast('已删除', 'top');
            setTimeout(() => {
              const pages = getCurrentPages();
              if (pages && pages.length > 1) {
                wx.navigateBack({ delta: 1, fail: () => {} });
              } else {
                wx.switchTab({ url: '/pages/community/index', fail: () => {} });
              }
            }, 600);
          })
          .catch(() => this.showToast('删除失败，请重试', 'error'));
      }
    });
  },

  // 评论者删自己的评论：确认后软删，本地同步移除并回补计数
  onDeleteComment(event) {
    const commentId = event.currentTarget.dataset.commentId;
    if (!commentId || /^c-/.test(String(commentId))) return;
    wx.showModal({
      title: '删除这条评论？',
      content: '删除后不可恢复',
      confirmText: '删除',
      confirmColor: '#e8472a',
      success: (res) => {
        if (!res.confirm) return;
        api
          .deleteCommunityComment(this.data.postId, commentId)
          .then(() => {
            const post = this.data.post
              ? Object.assign({}, this.data.post, {
                  commentCount: Math.max(0, (this.data.post.commentCount || 0) - 1)
                })
              : this.data.post;
            this.setData({
              comments: this.data.comments.filter((c) => String(c.commentId) !== String(commentId)),
              post
            });
            this.showToast('评论已删除', 'top');
          })
          .catch(() => this.showToast('删除失败，请重试', 'error'));
      }
    });
  },

  // 下架内容空态的「返回」按钮（不可重试）
  noop() {
    const pages = getCurrentPages();
    if (pages && pages.length > 1) {
      wx.navigateBack({ delta: 1, fail: () => {} });
    } else {
      wx.switchTab({ url: '/pages/community/index', fail: () => {} });
    }
  },

  showToast(text, type) {
    this.setData({ toast: { visible: true, text, type: type || 'top' } });
  },
  onToastClose() {
    this.setData({ 'toast.visible': false });
  }
});
