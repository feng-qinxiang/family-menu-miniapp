const {
  createCommunityPost,
  getCommunityPosts,
  getCommunityTopics,
  reportCommunityPost,
  toggleCommunityFavorite,
  toggleCommunityLike
} = require('../../utils/api');
const { runGuarded, guard, release } = require('../../utils/interaction');
const { chooseAndUpload } = require('../../utils/upload');
const { withTabSelect } = require('../../behaviors/tab-select');
const { withScrollReveal } = require('../../behaviors/scroll-reveal');

const reportReasons = ['内容不实', '步骤不全', '疑似搬运', '其他'];
// 信息流分页：后端 /api/community/posts 已支持 page/size（上限 50）
const FEED_PAGE_SIZE = 20;

// 头像撞色轮转（番茄红 / 深墨 / 松绿）
const AVATAR_COLORS = ['#e8472a', '#3a2e23', '#2f4a3a', '#b08949'];
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
    reportSubmitting: false,
    favoriting: false,
    reportReasons,
    activeReportReason: '内容不实',
    showReportSheet: false,
    reportTargetId: '',
    reportDesc: '',
    showPostForm: false,
    postForm: { title: '', content: '', tagsText: '', images: [] },
    hotTopics: HOT_TOPICS,
    hasMore: false,
    // 当前话题过滤（后端 feed tag 参数）；'' = 不限
    currentTag: ''
  },

  onLoad() {
    let sbh = 0;
    try {
      sbh = (wx.getWindowInfo ? wx.getWindowInfo().statusBarHeight : wx.getSystemInfoSync().statusBarHeight) || 0;
    } catch (e) {
      sbh = 0;
    }
    this.setData({ statusBarHeight: sbh });
    this.loadTopics();
  },

  onShow() {
      withTabSelect(this);
      // 大字模式（适老）：与其余 tab 页保持一致，onShow 读一次以便设置页切换后回来生效
      let fontScale = 'normal';
      try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
      if (fontScale !== this.data.fontScale) this.setData({ fontScale });
      Promise.resolve(this.loadPosts(this._hasLoaded === true)).then(() => { this._hasLoaded = true; });
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

    // silent=true：已有数据时的「回页刷新」，不显示整页骨架（避免切 tab 闪一下）
  async loadPosts(silent) {
    if (!silent) this.setData({ loading: true });
    this.setData({ loadError: false });
    this._page = 1;
    let posts = [];
    try {
      posts = this.normalizePosts(await getCommunityPosts(this.data.currentTag, 1, FEED_PAGE_SIZE) || []);
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
      hasMore: posts.length >= FEED_PAGE_SIZE,
      communitySummary: this.buildCommunitySummary(posts)
    }, () => withScrollReveal(this, { item: '.pcard' }));
  },

  // 滚到底再取下一页。后端按点赞数排序，翻页期间热度变化可能造成少量重复，用 id 去重兜住。
  async loadMorePosts() {
    if (!this.data.hasMore || this._loadingMore || this.data.loading) return;
    this._loadingMore = true;
    const next = (this._page || 1) + 1;
    try {
      const batch = this.normalizePosts(await getCommunityPosts(this.data.currentTag, next, FEED_PAGE_SIZE) || []);
      if (!batch.length) {
        this.setData({ hasMore: false });
        return;
      }
      const seen = new Set((this.data.posts || []).map((p) => p.id));
      const merged = (this.data.posts || []).concat(batch.filter((p) => !seen.has(p.id)));
      this._page = next;
      this.setData({
        posts: merged,
        hasMore: batch.length >= FEED_PAGE_SIZE,
        communitySummary: this.buildCommunitySummary(merged)
      });
    } catch (err) {
      // 保留 hasMore，用户再滚一次即可重试
      console.warn('community loadMore failed', err);
    } finally {
      this._loadingMore = false;
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
      const images = Array.isArray(post.images) ? post.images.filter(Boolean) : [];
      // 以前这里按 index 轮播本地菜品图：用户会把它当成邻居家的实拍，属于伪造内容。
      // 无图就交给 wxml 的占位块，只保留「本帖关联菜谱」自己的封面。
      return {
        ...post,
        authorInitial: post.author ? post.author.slice(0, 1) : '匿',
        avatarColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
        photo: images[0] || recipeImg || '',
        imageCount: images.length,
        recipeThumb: recipeImg,
        tags: Array.isArray(post.tags) ? post.tags : [],
        // 自己的待审帖子（只有作者本人看得到），加角标避免"为什么别人看不到"的困惑
        isPending: post.auditStatus === 'PENDING'
      };
    });
  },

  // 话题榜：服务端聚合近帖标签频次；拿不到/为空回退写死话题（老约定兜底）
  async loadTopics() {
    try {
      const topics = await getCommunityTopics();
      if (Array.isArray(topics) && topics.length) {
        this.setData({ hotTopics: topics.slice(0, 8).map((t) => ({ tag: t })) });
      }
    } catch (err) {
      // fallback：保留 HOT_TOPICS
    }
  },

  // 话题 chip → 站内过滤信息流（后端 tag 参数），再点「全部」解除
  onTopicTap(event) {
    const { tag } = event.currentTarget.dataset;
    if (!tag || tag === this.data.currentTag) return;
    this.setData({ currentTag: tag });
    this.loadPosts();
  },

  clearTopic() {
    if (!this.data.currentTag) return;
    this.setData({ currentTag: '' });
    this.loadPosts();
  },

  // state-empty 只发一个 action 事件，具体动作按当前状态分派：筛过的空态先清筛选，否则去发帖
  onEmptyAction() {
    if (this.data.currentTag) this.clearTopic();
    else this.setData({ showPostForm: true });
  },

  // 失败态的「重新加载」必须走这个包装：loadPosts 的第一参数是 silent 布尔，
  // 直接把 loadPosts 绑成 CTA 会把事件对象当成 silent 传进去。
  retryLoad() {
    this.loadPosts();
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
    wx.navigateTo({ url: `/pkg-extra/recipe-detail/index?id=${recipeId}` });
  },

  // 点赞：先本地乐观翻转（跟手），失败回滚；在途期间忽略重复点击
  async toggleLike(event) {
    const { id } = event.currentTarget.dataset;
    if (!id) return;
    const key = `like-${id}`;
    if (!guard(this, key)) return;
    const before = this.data.posts;
    const target = before.find((p) => String(p.id) === String(id));
    if (!target) {
      release(this, key);
      return;
    }
    const optimistic = before.map((p) => (
      String(p.id) === String(id)
        ? {
          ...p,
          liked: !p.liked,
          likeCount: Math.max(0, (p.likeCount || 0) + (p.liked ? -1 : 1))
        }
        : p
    ));
    this.setData({ posts: optimistic });
    try {
      const updated = await toggleCommunityLike(id);
      if (!updated) {
        // 服务端没返回可用数据时同样要回滚，否则本地与服务端不一致
        this.setData({ posts: before });
        return;
      }
      const normalizedUpdated = this.normalizePosts([updated])[0];
      this.setData({
        posts: this.data.posts.map((p) => (
          String(p.id) === String(normalizedUpdated.id) ? normalizedUpdated : p
        ))
      });
    } catch (err) {
      this.setData({ posts: before });
      wx.showToast({ title: '点赞失败，请重试', icon: 'none' });
    } finally {
      release(this, key);
    }
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
    // 防重：弹层到成功之间可反复点，此前会重复提交同一举报
    this.setData({ reportSubmitting: true });
    let ok = false;
    await runGuarded(this, `report-${postId}`, async () => {
      await reportCommunityPost(postId, {
        reason: this.data.activeReportReason,
        description: (this.data.reportDesc || '').trim()
      });
      ok = true;
    }, {
      loading: '提交中',
      success: '',
      fail: '举报失败，请重试'
    });
    this.setData({ reportSubmitting: false });
    if (!ok) return;
    this.setData({ showReportSheet: false, reportDesc: '' });
    wx.showToast({ title: '已提交举报，感谢反馈', icon: 'none' });
  },

  togglePostForm() {
    this.setData({ showPostForm: !this.data.showPostForm });
  },

  onPostInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`postForm.${field}`]: e.detail.value });
  },

  // 配图：最多 6 张，走全站上传通道（/api/upload，已压缩），传完存绝对 URL
  async addPostImages() {
    const current = this.data.postForm.images || [];
    const left = 6 - current.length;
    if (left <= 0) {
      wx.showToast({ title: '最多 6 张图片', icon: 'none' });
      return;
    }
    const uploaded = await chooseAndUpload(left);
    const picked = uploaded || [];
    const added = picked.filter(Boolean);
    if (!added.length) {
      // picked 非空说明用户确实选了图却一张都没传上去；空数组才是取消选图
      if (picked.length) wx.showToast({ title: '图片上传失败，请重试', icon: 'none' });
      return;
    }
    this.setData({ 'postForm.images': current.concat(added).slice(0, 6) });
  },

  removePostImage(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const images = (this.data.postForm.images || []).slice();
    if (idx >= 0 && idx < images.length) {
      images.splice(idx, 1);
      this.setData({ 'postForm.images': images });
    }
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
    let created = null;
    try {
      created = await createCommunityPost({
        title: title.trim(),
        content: content.trim(),
        tags,
        images: (this.data.postForm.images || []).filter(Boolean)
      });
    } catch (err) {
      this.setData({ postSubmitting: false });
      wx.showToast({ title: '发布失败，请重试', icon: 'none' });
      return;
    }
    this.setData({ showPostForm: false, postForm: { title: '', content: '', tagsText: '', images: [] }, postSubmitting: false });
    // 机审未过（PENDING）时先审后发：只有作者本人可见，文案要说清，别让用户以为发了没人理
    const pending = created && created.auditStatus === 'PENDING';
    await this.loadPosts();
    wx.showToast({ title: pending ? '已提交，审核通过后大家可见' : '发布成功', icon: 'none', duration: 2200 });
  }
});
