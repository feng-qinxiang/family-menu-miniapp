// pages/me/profile-edit · 编辑资料（二级页）
// 数据来源：getCurrentUser()（昵称/头像/性别/生日/口味偏好）+ getFamilyProfile()（本人在家庭里的忌口标签）。
// 保存：昵称/头像/性别/生日/口味 → PATCH /api/auth/me；
//       忌口 → PUT /api/family/members/{自己}/avoid（与「家庭 → 成员」页改的是同一份数据，不另存一份）。
const { getCurrentUser, getFamilyProfile, updateProfile, updateMemberAvoidTags } = require('../../../utils/api');
const { chooseAndUpload } = require('../../../utils/upload');
const { AVOID_TAGS } = require('../../../utils/constants');
const features = require('../../../utils/features');

const TASTE_OPTIONS = ['微辣', '中辣', '重辣', '少油', '少盐', '清淡', '香甜', '酸爽'];

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function birthdayDisplay(value) {
  if (!value) return '未填写';
  const parts = String(value).split('-');
  if (parts.length === 3) return `${parts[0]} / ${parts[1]} / ${parts[2]}`;
  return value;
}

Page({
  data: {
    features,
    avatarInitial: '家',
    today: todayStr(),
    birthdayLabel: '未填写',
    tasteOptions: TASTE_OPTIONS,
    avoidOptions: AVOID_TAGS,
    form: {
      nickname: '',
      avatarUrl: '',
      gender: 'male',
      phone: '',
      birthday: '',
      tasteTags: [],
      avoid: []
    },
    loading: true,
    saving: false,
    uploading: false
  },

  onLoad() {
    // 大字模式档位：onShow 读取，设置页改完回来立即生效
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
    this.loadUser();
  },

  async loadUser() {
    try {
      const user = await getCurrentUser();
      const selfId = (user && user.userId) || null;
      this.selfId = selfId;

      const nickname = (user && user.nickname) || '';
      // 口味标签与 TASTE_OPTIONS 求交，避免历史脏数据在页面上显示成"已选中但不认识"
      const rawTags = (user && Array.isArray(user.tasteTags)) ? user.tasteTags : [];
      const tasteTags = rawTags.filter((t) => TASTE_OPTIONS.indexOf(t) >= 0);

      // 忌口存在家庭成员记录里；家庭信息拿不到时按空处理，不影响本页其它字段的编辑
      let avoid = [];
      if (selfId != null) {
        try {
          const profile = await getFamilyProfile();
          const members = (profile && profile.members) || [];
          const me = members.find((m) => m.userId === selfId);
          if (me && Array.isArray(me.avoidTags)) avoid = me.avoidTags.filter(Boolean);
        } catch (e) {
          // 家庭信息属于附加项：失败不阻断资料编辑
        }
      }

      const form = {
        nickname,
        avatarUrl: (user && user.avatarUrl) || '',
        gender: (user && user.gender) || 'male',
        phone: (user && user.phone) || '',
        birthday: (user && user.birthday) || '',
        tasteTags,
        avoid
      };

      this.setData({
        form,
        avatarInitial: (nickname || '家').slice(0, 1),
        birthdayLabel: birthdayDisplay(form.birthday),
        loading: false
      });
    } catch (err) {
      console.error('profile-edit loadUser failed', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onNickname(e) {
    const nickname = e.detail.value || '';
    this.setData({
      'form.nickname': nickname,
      avatarInitial: (nickname || '家').slice(0, 1)
    });
  },

  onGender(e) {
    const g = e.currentTarget.dataset.g;
    if (g && g !== this.data.form.gender) {
      this.setData({ 'form.gender': g });
    }
  },

  onBirthday(e) {
    const value = e.detail.value || '';
    this.setData({
      'form.birthday': value,
      birthdayLabel: birthdayDisplay(value)
    });
  },

  onToggleTaste(e) {
    const tag = e.currentTarget.dataset.tag;
    if (!tag) return;
    const tags = this.data.form.tasteTags.slice();
    const idx = tags.indexOf(tag);
    if (idx >= 0) tags.splice(idx, 1);
    else tags.push(tag);
    this.setData({ 'form.tasteTags': tags });
  },

  onToggleAvoid(e) {
    const tag = e.currentTarget.dataset.tag;
    if (!tag) return;
    const tags = this.data.form.avoid.slice();
    const idx = tags.indexOf(tag);
    if (idx >= 0) tags.splice(idx, 1);
    else tags.push(tag);
    this.setData({ 'form.avoid': tags });
  },

  // 手机号由 OTP 登录绑定（当前版本手机号登录未开放），此处仅展示
  onEditPhone() {
    wx.showToast({ title: this.data.form.phone ? '手机号已绑定' : '当前版本暂不支持绑定手机号', icon: 'none' });
  },

  async onChangeAvatar() {
    if (this.data.uploading) return;
    this.setData({ uploading: true });
    try {
      const urls = await chooseAndUpload(1);
      if (urls && urls[0]) {
        this.setData({ 'form.avatarUrl': urls[0] });
        wx.showToast({ title: '头像已更新', icon: 'success' });
      }
    } catch (err) {
      console.error('avatar upload failed', err);
      wx.showToast({ title: '上传失败', icon: 'none' });
    } finally {
      this.setData({ uploading: false });
    }
  },

  async onSave() {
    if (this.data.saving) return;
    const nickname = (this.data.form.nickname || '').trim();
    if (!nickname) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中', mask: true });
    try {
      const form = this.data.form;
      const user = await updateProfile({
        nickname,
        avatarUrl: form.avatarUrl || '',
        phone: form.phone || '',
        gender: form.gender || '',
        birthday: form.birthday || '',
        tasteTags: (form.tasteTags || []).slice()
      });
      try {
        if (user) wx.setStorageSync('user', user);
      } catch (e) {}

      // 忌口写的是家庭成员记录，接口不同；失败要如实告诉用户，不能只报"已保存"
      let avoidFailed = false;
      if (this.selfId != null) {
        try {
          await updateMemberAvoidTags(this.selfId, (form.avoid || []).slice());
        } catch (e) {
          avoidFailed = true;
        }
      }

      wx.hideLoading();
      wx.showToast({ title: avoidFailed ? '资料已保存，忌口未保存' : '已保存', icon: avoidFailed ? 'none' : 'success' });
      if (avoidFailed) {
        this.setData({ saving: false });
        return;
      }
      setTimeout(() => {
        const pages = getCurrentPages();
        if (pages && pages.length > 1) {
          wx.navigateBack({ delta: 1 });
        } else {
          wx.switchTab({ url: '/pages/me/index', fail() {} });
        }
      }, 700);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  }
});
