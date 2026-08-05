const { getFamilyProfile, getFamilyInviteCode, removeFamilyMember, updateMemberAvoidTags } = require('../../../utils/api');

// 身份 → 展示文案 / badge 样式
const ROLE_MAP = {
  owner: { label: '管理员', badge: 'admin' },
  admin: { label: '管理员', badge: 'admin' },
  member: { label: '成员', badge: 'member' }
};

// 忌口标签池（菜谱筛选与成员编辑共用）
const AVOID_OPTIONS = ['辣', '香菜', '猪肉', '牛肉', '羊肉', '海鲜', '花生', '鸡蛋'];

// 文字头像配色循环（复用 token 配色，见 wxss .mavt-*）
const AVT_TONES = ['pine', 'gold', 'inkdeep', 'pop'];

Page({
  data: {
    statusBarHeight: 0,
    familyName: '',
    inviteCode: '',
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

  loadProfile() {
    getFamilyProfile()
      .then((profile) => {
        this.applyProfile(profile);
        // 若 profile 未带邀请码，主动拉取一次
        if (!profile || !profile.inviteCode) {
          return getFamilyInviteCode()
            .then((info) => {
              if (info && info.inviteCode) {
                this.setData({ inviteCode: info.inviteCode });
              }
            })
            .catch(() => {}); // 邀请码拉取失败不影响主流程
        }
      })
      .catch(() => {
        this.setData({ members: [], memberCount: 0, loaded: true });
        this.showToast('家庭信息加载失败');
      });
  },

  applyProfile(profile) {
    const data = profile || {};
    const rawMembers = Array.isArray(data.members) ? data.members : [];
    const ownerId = data.ownerUserId != null ? data.ownerUserId : (rawMembers[0] && rawMembers[0].userId);

    const members = rawMembers.map((m, idx) => {
      const role = (m.role || 'member').toLowerCase();
      const roleInfo = ROLE_MAP[role] || ROLE_MAP.member;
      const nickname = m.nickname || '家庭成员';
      const isSelf = ownerId != null && m.userId === ownerId;
      const avoidTags = Array.isArray(m.avoidTags) ? m.avoidTags.filter(Boolean) : [];
      return {
        userId: m.userId,
        nickname,
        initial: nickname.slice(0, 1),
        roleLabel: roleInfo.label,
        roleBadge: roleInfo.badge,
        tone: AVT_TONES[idx % AVT_TONES.length],
        sub: avoidTags.length ? '忌口：' + avoidTags.join('、') : (isSelf ? '家庭创建者' : '已加入这个家'),
        avoidTags,
        isSelf,
        removable: !isSelf
      };
    });

    // 邀请码：后端未下发则用 familyId 生成稳定占位码（演示）
    const baseId = data.familyId != null ? String(data.familyId) : '0';
    const inviteCode = (data.inviteCode || (100000 + (Number(baseId) || 0) * 7919).toString().slice(-6));

    this.setData({
      familyName: data.familyName || '我的家庭',
      inviteCode,
      members,
      memberCount: members.length,
      selfUserId: ownerId,
      loaded: true
    });
  },

  // 复制当前家庭邀请码
  onCopyCode() {
    const code = this.data.inviteCode;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => this.showToast('邀请码已复制'),
      fail: () => this.showToast('复制失败，请重试')
    });
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
    this.setData({ avoidSheetVisible: false });
    if (!member) return;
    const avoidTags = this.data.avoidDraft.slice();
    updateMemberAvoidTags(member.userId, avoidTags)
      .then((updated) => {
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
        this.setData({ editingMember: null });
        this.showToast('保存失败，请稍后再试');
      });
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
    this.setData({ removeDialogVisible: false });
    if (!target) return;
    removeFamilyMember(target.userId)
      .then(() => {
        const members = this.data.members.filter((m) => m.userId !== target.userId);
        this.setData({
          members,
          memberCount: members.length,
          pendingRemove: null
        });
        this.showToast('已移除「' + target.nickname + '」');
      })
      .catch(() => {
        this.setData({ pendingRemove: null });
        this.showToast('移除失败，请稍后再试');
      });
  },

  // 邀请新成员：跳转到邀请码页面，由对方扫码/输码加入
  onInvite() {
    wx.navigateTo({
      url: '/pages/family/invite/index',
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
