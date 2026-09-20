const { getCapsule } = require('../../utils/capsule');
const {
  getCookHistory,
  getCurrentUser,
  getDashboard,
  getFamilyProfile,
  getPreferenceProfile,
  getTodayMenu,
  getVipStatus
} = require('../../utils/api');

const { recipeDishImg } = require('../../utils/image');
const { withTabSelect } = require('../../behaviors/tab-select');
const { withScrollReveal } = require('../../behaviors/scroll-reveal');
const features = require('../../utils/features');

const memberTones = ['mavt-a', 'mavt-b', 'mavt-c', 'mavt-d', 'mavt-e'];

function formatCookedLabel(item) {
  const dateStr = item.cookedAt;
  let when = '';
  if (dateStr) {
    const d = new Date(String(dateStr).replace(' ', 'T'));
    if (!isNaN(d.getTime())) {
      // 按「日历日」差算，不是「过了多少个 24 小时」：
      // 昨晚 22:00 做的菜，今天早上看会算出 diff=0 → 标成「今天」，其实是昨天。
      const day0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const today0 = new Date();
      today0.setHours(0, 0, 0, 0);
      const diff = Math.round((today0.getTime() - day0.getTime()) / 86400000);
      if (diff <= 0) when = '今天';
      else if (diff === 1) when = '昨天';
      else if (diff === 2) when = '前天';
      else if (diff < 7) when = `${diff}天前`;
      else when = `${d.getMonth() + 1}月${d.getDate()}日`;
    }
  }
  const remark = (item.remark || '').trim();
  return [when, remark].filter(Boolean).join(' · ') || '最近做过';
}

/**
 * 身份引导卡：只对"还没有稳定身份"的人显示（微信登录过的账号不显示）。
 *
 * 个人主体上线时 PHONE_LOGIN 关闭、微信登录是唯一稳定身份，这张卡是它**唯一可见的入口**
 * （其余入口在"设置 → 微信绑定"，普通用户找不到）。两件事都靠它解决：
 *  1) 游客账号只跟着本机 device_id 走，清一次缓存/换台手机就是另一个账号，家庭、菜单、
 *     菜谱、做菜记录全找不回来；微信登录后 openid 稳定，换设备还是同一个账号。
 *  2) 游客 openid 是 guest- 自造标识，微信内容机审（msgSecCheck）不认 → 发的帖子/评论
 *     只能落人工队列（其他人看不见）。登录后经机器审核即时公开。
 */
function buildBindCard(user) {
  if (user && user.wechatBound) return { show: false };
  if (features.PHONE_LOGIN) {
    return {
      show: true,
      title: '绑定手机号，换设备不丢数据',
      desc: '菜谱、菜单、做菜记录云端保存',
      cta: '去绑定',
      target: '/pkg-extra/auth/login-phone/index'
    };
  }
  return {
    show: true,
    title: '微信登录，内容立刻公开',
    desc: '游客发的帖子要人工审核；登录后经机器审核即时发布，换设备也不丢数据',
    cta: '去登录',
    target: '/pkg-extra/auth/login/index'
  };
}

Page({
  data: {
    features,
    currentUser: {},
    bindCard: { show: false },
    vipStatus: { vip: false, planName: '' },
    familyProfile: { familyId: 1, familyName: '', members: [] },
    memberCount: 0,
    profileInitial: '',
    monthCookCount: 0,
    savedCount: 0,
    streakDays: 0,
    cookHistory: [],
    prefBars: [],
    favoriteCuisine: '',
    appVersion: 'v1.0.0',
    loading: true,
    loadError: '',
    // 兜底必须含安全区：写死 51px 在刘海机上会让标题顶进状态栏
    capsuleTop: 'calc(env(safe-area-inset-top) + 90rpx)'
  },

  onLoad() {
    this.setData({ capsuleTop: getCapsule().top });
  },

  onShow() {
    withTabSelect(this, 3);
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
    // 首次进页面给骨架；之后切回来静默刷新即可
    Promise.resolve(this.loadProfile(this._hasLoaded === true)).then(() => { this._hasLoaded = true; });
  },

  async loadProfile(silent) {
    if (!silent) this.setData({ loading: true, loadError: '' });
    try {
      // 禁用数组解构：该语法编译后依赖 @babel/runtime 辅助模块，未打包进小程序会整页白屏
      const loaded = await Promise.all([
        getCurrentUser(),
        // 支付关闭时跳过会员状态请求
        features.PAYMENT ? getVipStatus() : Promise.resolve({ vip: false }),
        getFamilyProfile(),
        getTodayMenu(),
        getCookHistory(),
        getPreferenceProfile(),
        getDashboard()
      ]);
      const currentUser = loaded[0], vipStatus = loaded[1], familyProfile = loaded[2];
      const todayMenu = loaded[3], cookHistory = loaded[4];
      const preference = loaded[5], dashboard = loaded[6];

      const rawMembers = (familyProfile && Array.isArray(familyProfile.members)) ? familyProfile.members : [];
      const members = rawMembers.map((m, i) => ({
        ...m,
        initial: (m.nickname || '家').slice(0, 1),
        tone: memberTones[i % memberTones.length]
      }));

      const history = Array.isArray(cookHistory) ? cookHistory : [];
      const enrichedHistory = history.slice(0, 3).map((h, i) => ({
        ...h,
        cover: recipeDishImg({ title: h.recipeTitle, coverImage: h.coverImage }),
        whenLabel: formatCookedLabel(h),
        score: Math.max(0, Math.min(5, Number(h.score) || 0))
      }));

      // 收藏/菜谱库存数：dashboard 优先
      let savedCount = 0;
      if (dashboard) {
        savedCount = (Array.isArray(dashboard.ownedRecipes) ? dashboard.ownedRecipes.length : 0)
          + (Array.isArray(dashboard.importedRecipes) ? dashboard.importedRecipes.length : 0);
      }

      const monthCookCount = (preference && preference.totalCooks) || history.length;
      const favoriteCuisine = (preference && preference.favoriteCuisine) || '';

      // 口味偏好进度条：菜系偏好 + 口味标签偏好合并取前 3
      const cuisineBars = (preference && Array.isArray(preference.cuisinePrefs) ? preference.cuisinePrefs : [])
        .map((c) => ({
          label: c.name,
          isCuisine: true,
          right: `做了 ${c.count} 次`,
          pct: Math.round((c.weight || 0) * 100),
          alt: false
        }));
      const tagBars = (preference && Array.isArray(preference.tagPrefs) ? preference.tagPrefs : [])
        .map((t) => ({
          label: t.name,
          isCuisine: false,
          right: `偏好 ${t.count} 次`,
          pct: Math.round((t.weight || 0) * 100),
          alt: true
        }));
      const prefBars = [...cuisineBars, ...tagBars].slice(0, 3);

      this.setData({
        currentUser: currentUser || {},
        vipStatus: vipStatus || { vip: false },
        bindCard: buildBindCard(currentUser),
        familyProfile: {
          ...(familyProfile || { familyName: '' }),
          members
        },
        memberCount: members.length,
        profileInitial: ((currentUser && currentUser.nickname) || '家').slice(0, 1),
        monthCookCount,
        savedCount,
        streakDays: (preference && preference.streakDays) || enrichedHistory.length,
        cookHistory: enrichedHistory,
        prefBars,
        favoriteCuisine,
        loading: false,
        loadError: ''
      }, () => withScrollReveal(this, { item: '.mag-hrow' }));
    } catch (err) {
      console.error('me loadProfile failed', err);
      this.setData({ loading: false, loadError: (err && err.message) || '网络不太好，稍后再试' });
    }
  },

  retryLoad() {
    this.setData({ loading: true, loadError: '' });
    this.loadProfile();
  },

  goMemberManage() {
    wx.navigateTo({ url: '/pkg-extra/family/members/index' });
  },

  goVip() { wx.navigateTo({ url: '/pkg-extra/vip/index' }); },
  goBind() {
    const target = this.data.bindCard && this.data.bindCard.target;
    if (target) wx.navigateTo({ url: target, fail: () => {} });
  },
  goWeekly() { wx.navigateTo({ url: '/pkg-extra/weekly-menu/index' }); },
  goImport() { wx.navigateTo({ url: '/pkg-extra/import/index' }); },
  goFavorites() { wx.navigateTo({ url: '/pkg-extra/favorites/index' }); },
  goRecipes() { wx.switchTab({ url: '/pages/recipes/index' }); },
  goPreference() { wx.navigateTo({ url: '/pkg-extra/me/preference-profile/index' }); },
  goSettings() { wx.navigateTo({ url: '/pkg-extra/me/settings/index' }); },
  goCookLog() { wx.navigateTo({ url: '/pkg-extra/cook-log/index' }); },
  goProfileEdit() { wx.navigateTo({ url: '/pkg-extra/me/profile-edit/index' }); },
  goNotifications() { wx.navigateTo({ url: '/pkg-extra/me/notifications/index' }); },
  goFeedback() { wx.navigateTo({ url: '/pkg-extra/me/feedback/index' }); },
  goAbout() { wx.navigateTo({ url: '/pkg-extra/me/about/index' }); },
  goPrivacy() { wx.navigateTo({ url: '/pkg-extra/legal/privacy/index' }); },
  goTerms() { wx.navigateTo({ url: '/pkg-extra/legal/terms/index' }); },
  goFamilyMembers() { wx.navigateTo({ url: '/pkg-extra/family/members/index' }); },
  onShareAppMessage() {
    return {
      title: '家庭点菜 · 全家一起用',
      path: '/pages/me/index'
    };
  },
});
