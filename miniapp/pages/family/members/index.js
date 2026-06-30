const { getFamilyProfile, addFamilyMember, removeFamilyMember } = require('../../../utils/api');

// 身份 → 展示文案 / badge 样式
const ROLE_MAP = {
  owner: { label: '管理员', badge: 'admin' },
  admin: { label: '管理员', badge: 'admin' },
  member: { label: '成员', badge: 'member' }
};

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
      .then((profile) => this.applyProfile(profile))
      .catch(() => {
        // 容错：拉取失败也给出空态而非白屏
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
      return {
        userId: m.userId,
        nickname,
        initial: nickname.slice(0, 1),
        roleLabel: roleInfo.label,
        roleBadge: roleInfo.badge,
        tone: AVT_TONES[idx % AVT_TONES.length],
        sub: isSelf ? '家庭创建者' : '已加入这个家',
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

  // 邀请新成员：调用真实 addFamilyMember 添加占位成员
  onInvite() {
    const seq = this.data.memberCount + 1;
    addFamilyMember({ nickname: '家人' + seq, role: 'member' })
      .then((member) => {
        const role = (member.role || 'member').toLowerCase();
        const roleInfo = ROLE_MAP[role] || ROLE_MAP.member;
        const nickname = member.nickname || ('家人' + seq);
        const idx = this.data.members.length;
        const next = this.data.members.concat([{
          userId: member.userId,
          nickname,
          initial: nickname.slice(0, 1),
          roleLabel: roleInfo.label,
          roleBadge: roleInfo.badge,
          tone: AVT_TONES[idx % AVT_TONES.length],
          sub: '刚刚加入',
          isSelf: false,
          removable: true
        }]);
        this.setData({ members: next, memberCount: next.length });
        this.showToast('已添加新成员');
      })
      .catch(() => this.showToast('邀请失败，请稍后再试'));
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
