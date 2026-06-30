// pages/me/profile-edit · 编辑资料（二级页）
// 数据来源：getCurrentUser()。保存：updateProfile()（PATCH /api/auth/me）。
// 后端 user_account 仅支持 nickname/avatarUrl/phone 落库；性别/生日/口味/忌口暂无字段。
const { getCurrentUser, updateProfile } = require('../../../utils/api');
const { chooseAndUpload } = require('../../../utils/upload');

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
    avatarInitial: '家',
    today: todayStr(),
    birthdayLabel: '未填写',
    tasteOptions: TASTE_OPTIONS,
    form: {
      nickname: '',
      avatarUrl: '',
      gender: 'male',
      phone: '',
      birthday: '',
      tasteTags: [],
      avoid: ''
    },
    loading: true,
    saving: false,
    uploading: false
  },

  onLoad() {
    this.loadUser();
  },

  async loadUser() {
    try {
      const user = await getCurrentUser();
      const nickname = (user && user.nickname) || '';
      // 已有口味标签与 TASTE_OPTIONS 求交，避免脏数据
      const rawTags = (user && Array.isArray(user.tasteTags)) ? user.tasteTags : [];
      const tasteTags = rawTags.filter((t) => TASTE_OPTIONS.indexOf(t) >= 0);

      const form = {
        nickname,
        avatarUrl: (user && user.avatarUrl) || '',
        gender: (user && user.gender) || 'male',
        phone: (user && user.phone) || '',
        birthday: (user && user.birthday) || '',
        tasteTags,
        avoid: (user && user.avoid) || ''
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

  // 手机号由 OTP 登录绑定，当前页只展示后端已绑定号码
  onEditPhone() {
    wx.showToast({ title: this.data.form.phone ? '手机号已绑定' : '请用手机验证码登录绑定', icon: 'none' });
  },

  // 忌口目前保存在本页本地状态，后端偏好表接入后再落库
  onEditAvoid() {
    wx.showToast({ title: '忌口会随做菜记录生成画像', icon: 'none' });
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
      const payload = {
        nickname,
        avatarUrl: this.data.form.avatarUrl || '',
        phone: this.data.form.phone || ''
      };
      const user = await updateProfile(payload);
      try {
        if (user) wx.setStorageSync('user', user);
      } catch (e) {}
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
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
