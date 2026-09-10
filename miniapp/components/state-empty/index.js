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
    // 底色主题：light(默认，浅色页) | dark(深色页，如烹饪模式)——dark 下文字转浅，避免深字压深底
    theme: {
      type: String,
      value: 'light'
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
