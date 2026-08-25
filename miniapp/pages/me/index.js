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

const memberTones = ['mavt-a', 'mavt-b', 'mavt-c', 'mavt-d', 'mavt-e'];

function formatCookedLabel(item) {
  const dateStr = item.cookedAt;
  let when = '';
  if (dateStr) {
    const d = new Date(String(dateStr).replace(' ', 'T'));
    if (!isNaN(d.getTime())) {
      const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
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

Page({
  data: {
    currentUser: {},
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
    loadError: ''
  },

  onShow() {
    withTabSelect(this, 3);
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
    this.loadProfile();
  },

  async loadProfile() {
    try {
      const [currentUser, vipStatus, familyProfile, todayMenu, cookHistory, preference, dashboard] = await Promise.all([
        getCurrentUser(),
        getVipStatus(),
        getFamilyProfile(),
        getTodayMenu(),
        getCookHistory(),
        getPreferenceProfile(),
        getDashboard()
      ]);

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
      });
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
    wx.navigateTo({ url: '/pages/family/members/index' });
  },

  goVip() { wx.navigateTo({ url: '/pages/vip/index' }); },
    goPhoneBind() { wx.navigateTo({ url: '/pages/auth/login-phone/index' }); },
  goWeekly() { wx.navigateTo({ url: '/pages/weekly-menu/index' }); },
  goMenu() { wx.navigateTo({ url: '/pages/menu/index' }); },
  goPantry() { wx.switchTab({ url: '/pages/pantry/index' }); },
  goShopping() { wx.navigateTo({ url: '/pages/shopping/index' }); },
  goCommunity() { wx.navigateTo({ url: '/pages/community/index' }); },
  goImport() { wx.navigateTo({ url: '/pages/import/index' }); },
  goRecipeEdit() { wx.navigateTo({ url: '/pages/recipe-edit/index' }); },
  goRecipes() { wx.switchTab({ url: '/pages/recipes/index' }); },
  goPreference() { wx.navigateTo({ url: '/pages/me/preference-profile/index' }); },
  goSettings() { wx.navigateTo({ url: '/pages/me/settings/index' }); },
  goCookLog() { wx.navigateTo({ url: '/pages/cook-log/index' }); },
  goProfileEdit() { wx.navigateTo({ url: '/pages/me/profile-edit/index' }); },
  goNotifications() { wx.navigateTo({ url: '/pages/me/notifications/index' }); },
  goFeedback() { wx.navigateTo({ url: '/pages/me/feedback/index' }); },
  goAbout() { wx.navigateTo({ url: '/pages/me/about/index' }); },
  goPrivacy() { wx.navigateTo({ url: '/pages/legal/privacy/index' }); },
  goTerms() { wx.navigateTo({ url: '/pages/legal/terms/index' }); },
  goFamilyMembers() { wx.navigateTo({ url: '/pages/family/members/index' }); },
  onShareAppMessage() {
    return {
      title: '家庭点菜 · 全家一起用',
      path: '/pages/me/index'
    };
  },
});
