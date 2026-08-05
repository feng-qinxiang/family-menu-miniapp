// components/state-sheet · 底部弹层（mask + 圆角 sheet + 滚动穿透锁）
Component({
  options: {
    multipleSlots: true,
    addGlobalClass: true
  },
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: ''
    },
    // 是否显示顶部拖拽条
    showBar: {
      type: Boolean,
      value: true
    }
  },
  methods: {
    onClose() {
      this.triggerEvent('close');
    },
    // catchtouchmove 空实现：阻止背景滚动穿透
    noop() {}
  }
});