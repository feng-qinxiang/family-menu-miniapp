Component({
  properties: {
    emoji: { type: String, value: '🍽️' },
    title: { type: String, value: '暂无内容' },
    desc: { type: String, value: '' },
    actionText: { type: String, value: '' }
  },
  methods: {
    onAction() {
      this.triggerEvent('action');
    }
  }
});