const { getFamilyProfile, getFamilyInviteCode, removeFamilyMember, updateMemberAvoidTags, getCurrentUser } = require('../../../utils/api');
const { copyText } = require('../../../utils/privacy');
const { AVOID_TAGS } = require('../../../utils/constants');

// 身份 → 展示文案 / badge 样式
const ROLE_MAP = {
  owner: { label: '管理员', badge: 'admin' },
  admin: { label: '管理员', badge: 'admin' },
  member: { label: '成员', badge: 'member' }
};

// 忌口标签池（唯一定义在 utils/constants.js，与菜谱页的关键词映射同源）
const AVOID_OPTIONS = AVOID_TAGS;

// 文字头像配色循环（复用 token 配色，见 wxss .mavt-*）
const AVT_TONES = ['pine', 'gold', 'inkdeep', 'pop'];

Page({
  data: {
    statusBarHeight: 0,
    familyName: '',
    inviteCode: '',
    codeFailed: false,
    members: [],
    memberCount: 0,
    selfUserId: null,
    loaded: false,
    // 移除确认弹窗
    removeDialogVisible: false,
    pendingRemove: null,
    // 忌口编辑弹层
    avoidSheetVisible: false,
    editingMember: null,
    avoidDraft: [],
    avoidOptions: AVOID_OPTIONS,
    // toast
    toastVisible: false,
    toastText: ''
  },

  onLoad() {
    let sbh = 0;
    try {
      if (typeof wx.getWindowInfo === 'function') {
        sbh = wx.getWindowInfo().statusBarHeight || 0;
      } else if (typeof wx.getSystemInfoSync === 'function') {
        sbh = wx.getSystemInfoSync().statusBarHeight || 0;
      }
    } catch (e) {
      sbh = 0;
    }
    this.setData({ statusBarHeight: sbh });
    this.loadProfile();
  },

  // 从邀请页返回后新成员/邀请码可能已变，重新拉取
  onShow() {
    // 大字模式档位：onShow 读取，设置页改完回来立即生效
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
    if (this._loaded) this.loadProfile();
    this._loaded = true;
  },

  loadProfile() {
    // 当前登录用户 id 必须单独取：FamilyProfile 的 ownerUserId 是家庭创建者，
    // 拿它判「本人」会把非创建者自己标成可删除（曾经的 bug）。
    getCurrentUser()
      .then((me) => {
        this._selfUserId = me && me.userId != null ? me.userId : null;
      })
      .catch(() => {})
      .then(() => this.loadFamilyProfile());
  },

  loadFamilyProfile() {
    getFamilyProfile()
      .then((profile) => {
        this.applyProfile(profile);
        // 若 profile 未带邀请码，主动拉取一次真实码；失败留 codeFailed 态可重试
        if (!profile || !profile.inviteCode) {
          this.retryInviteCode();
        }
      })
      .catch(() => {
        this.setData({ members: [], memberCount: 0, loaded: true, codeFailed: true });
        this.showToast('家庭信息加载失败');
      });
  },

  applyProfile(profile) {
    const data = profile || {};
    const rawMembers = Array.isArray(data.members) ? data.members : [];
    const ownerId = data.ownerUserId != null ? data.ownerUserId : (rawMembers[0] && rawMembers[0].userId);
    // 「本人」认当前登录用户；取不到时退化为创建者，至少不会把自己标成可删
    const selfId = this._selfUserId != null ? this._selfUserId : ownerId;

    const members = rawMembers.map((m, idx) => {
      const role = (m.role || 'member').toLowerCase();
      const roleInfo = ROLE_MAP[role] || ROLE_MAP.member;
      const nickname = m.nickname || '家庭成员';
      const isSelf = selfId != null && m.userId === selfId;
      const isOwner = ownerId != null && m.userId === ownerId;
      const avoidTags = Array.isArray(m.avoidTags) ? m.avoidTags.filter(Boolean) : [];
      return {
        userId: m.userId,
        nickname,
        initial: nickname.slice(0, 1),
        roleLabel: roleInfo.label,
        roleBadge: roleInfo.badge,
        tone: AVT_TONES[idx % AVT_TONES.length],
        sub: avoidTags.length ? '忌口：' + avoidTags.join('、') : (isOwner ? '家庭创建者' : '已加入这个家'),
        avoidTags,
        isSelf,
        isOwner,
        removable: !isSelf && !isOwner
      };
    });

    // 邀请码：只用后端下发的真实码；未下发/拉取失败 = 空（禁止伪造占位码）
    this.setData({
      familyName: data.familyName || '我的家庭',
      inviteCode: data.inviteCode || '',
      members,
      memberCount: members.length,
      selfUserId: selfId,
      loaded: true
    });
  },

  // 主动拉取真实邀请码；失败进入 codeFailed 态，可点击重试
  retryInviteCode() {
    return getFamilyInviteCode()
      .then((info) => {
        if (info && info.inviteCode) {
          this.setData({ inviteCode: info.inviteCode, codeFailed: false });
        } else {
          this.setData({ codeFailed: true });
        }
      })
      .catch(() => {
        this.setData({ codeFailed: true });
        this.showToast('邀请码获取失败，请重试');
      });
  },

  // 复制当前家庭邀请码
  onCopyCode() {
    const code = this.data.inviteCode;
    if (!code) {
      // 无真实码时禁止复制占位内容，点击即重试拉取
      this.showToast('邀请码还没拿到，正在重试');
      this.retryInviteCode();
      return;
    }
    copyText(code, () => this.showToast('邀请码已复制'), () => this.showToast('复制失败，请重试'));
  },

  // 点击成员行 → 打开忌口编辑
  onMemberTap(e) {
    const userId = e.currentTarget.dataset.id;
    const member = this.data.members.find((m) => m.userId === userId);
    if (!member) return;
    this.setData({
      editingMember: member,
      avoidDraft: (member.avoidTags || []).slice(),
      avoidSheetVisible: true
    });
  },

  toggleAvoidTag(e) {
    const tag = e.currentTarget.dataset.tag;
    if (!tag) return;
    const draft = this.data.avoidDraft.slice();
    const idx = draft.indexOf(tag);
    if (idx >= 0) draft.splice(idx, 1);
    else draft.push(tag);
    this.setData({ avoidDraft: draft });
  },

  closeAvoidSheet() {
    this.setData({ avoidSheetVisible: false, editingMember: null });
  },

  saveAvoid() {
    const member = this.data.editingMember;
    if (!member) return;
    // 保存期间保持弹层并给出 loading：此前先关弹层再发请求，慢网络下像没保存成功
    if (this.__avoidBusy) return;
    this.__avoidBusy = true;
    wx.showLoading({ title: '保存中', mask: true });
    const avoidTags = this.data.avoidDraft.slice();
    updateMemberAvoidTags(member.userId, avoidTags)
      .then((updated) => {
        wx.hideLoading();
        this.setData({ avoidSheetVisible: false });
        const tags = updated && Array.isArray(updated.avoidTags) ? updated.avoidTags : avoidTags;
        const members = this.data.members.map((m) =>
          m.userId === member.userId
            ? { ...m, avoidTags: tags, sub: tags.length ? '忌口：' + tags.join('、') : (m.isSelf ? '家庭创建者' : '已加入这个家') }
            : m
        );
        this.setData({ members, editingMember: null });
        this.showToast(tags.length ? '忌口已保存，点菜时会避开' : '已清除忌口');
      })
      .catch(() => {
        wx.hideLoading();
        this.showToast('保存失败，请稍后再试');
      })
      .then(() => { this.__avoidBusy = false; });
  },

  // 点击移除 → 打开确认弹窗
  onRemoveTap(e) {
    const userId = e.currentTarget.dataset.id;
    const member = this.data.members.find((m) => m.userId === userId);
    if (!member) return;
    this.setData({
      pendingRemove: member,
      removeDialogVisible: true
    });
  },

  onRemoveCancel() {
    this.setData({ removeDialogVisible: false, pendingRemove: null });
  },

  onRemoveConfirm() {
    const target = this.data.pendingRemove;
    if (!target) return;
    if (this.__removeBusy) return;
    this.__removeBusy = true;
    this.setData({ removeDialogVisible: false });
    wx.showLoading({ title: '移除中', mask: true });
    removeFamilyMember(target.userId)
      .then(() => {
        wx.hideLoading();
        const members = this.data.members.filter((m) => m.userId !== target.userId);
        this.setData({
          members,
          memberCount: members.length,
          pendingRemove: null
        });
        this.showToast('已移除「' + target.nickname + '」');
      })
      .catch(() => {
        wx.hideLoading();
        this.setData({ pendingRemove: null });
        this.showToast('移除失败，请稍后再试');
      })
      .then(() => { this.__removeBusy = false; });
  },

  // 邀请新成员：跳转到邀请码页面，由对方扫码/输码加入
  onInvite() {
    wx.navigateTo({
      url: '/pkg-extra/family/invite/index',
      fail: () => this.showToast('页面跳转失败，请重试'),
    });
  },

  showToast(text) {
    this.setData({ toastVisible: false }, () => {
      this.setData({ toastVisible: true, toastText: text });
    });
  },

  onToastClose() {
    this.setData({ toastVisible: false });
  }
});
