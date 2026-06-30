Component({
  options: {
    multipleSlots: true,
    addGlobalClass: true
  },
  properties: {
    // 图标主题：pop(番茄红柔色) | gold(金) | gray(灰) | offline(无网络) | search(无结果)
    type: {
      type: String,
      value: 'pop'
    },
    title: {
      type: String,
      value: '这里还空着'
    },
    desc: {
      type: String,
      value: ''
    },
    // CTA 按钮文案，留空则不渲染按钮
    cta: {
      type: String,
      value: ''
    },
    // 按钮风格：pop(实心红) | ghost(描边)
    ctaStyle: {
      type: String,
      value: 'pop'
    }
  },
  data: {},
  methods: {
    onAction() {
      this.triggerEvent('action');
    }
  }
});
