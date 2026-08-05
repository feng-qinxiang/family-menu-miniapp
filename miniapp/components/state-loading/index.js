// components/state-loading · 全屏加载态（spinner + 可选文案）
Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    text: {
      type: String,
      value: '加载中…'
    }
  }
});