// state-dialog · 确认弹窗组件
Component({
  options: {
    multipleSlots: true,
    addGlobalClass: true,
  },

  properties: {
    // 是否显示
    visible: {
      type: Boolean,
      value: false,
      observer: function (val) {
        if (val) {
          // 进入：先挂载再触发动画
          this.setData({ showWrap: true });
        } else {
          // 退出：等动画结束再卸载
          if (this._hideTimer) clearTimeout(this._hideTimer);
          this._hideTimer = setTimeout(() => {
            this.setData({ showWrap: false });
          }, 220);
        }
      },
    },
    // 类型：danger(红) | warn(金)
    variant: {
      type: String,
      value: 'danger',
    },
    // 标题
    title: {
      type: String,
      value: '确认操作',
    },
    // 正文
    content: {
      type: String,
      value: '',
    },
    // 确认按钮文案
    confirmText: {
      type: String,
      value: '确定',
    },
    // 取消按钮文案
    cancelText: {
      type: String,
      value: '取消',
    },
  },

  data: {
    showWrap: false,
  },

  lifetimes: {
    detached: function () {
      if (this._hideTimer) clearTimeout(this._hideTimer);
    },
  },

  methods: {
    onConfirm: function () {
      this.triggerEvent('confirm');
    },
    onCancel: function () {
      this.triggerEvent('cancel');
    },
    // 阻止冒泡（点白卡不关闭）
    noop: function () {},
  },
});
