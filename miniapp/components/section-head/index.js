/* components/section-head/index.js
 * 区块标题组件：左红竖线 + Georgia 斜体金色 eyebrow + 大标题(可含 .pop 红字) + 右侧 hint/更多链接
 * 复用 app.wxss 的 .shead 体系与全局 token。
 */
Component({
  options: {
    multipleSlots: true,
    addGlobalClass: true,
    virtualHost: true
  },
  externalClasses: ['ext-class'],
  properties: {
    // Georgia 斜体金色小标 eyebrow（如 "Family Favorites"）
    eyebrow: {
      type: String,
      value: ''
    },
    // 大标题主文本（pop 红字之前的部分，如 "家里"）
    title: {
      type: String,
      value: ''
    },
    // 大标题中的红字部分（如 "常做"），可空
    popPart: {
      type: String,
      value: ''
    },
    // 大标题红字之后的尾巴文本（如 "的菜"），可空
    titleTail: {
      type: String,
      value: ''
    },
    // 右侧提示文本（如 "全部"、"28 道家常菜"）
    hint: {
      type: String,
      value: ''
    },
    // 是否显示右侧"更多"链接箭头样式；为 true 时点击触发 tapmore 事件
    more: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    onMore: function () {
      // 仅在 more 为 true 时对外抛事件，页面自行决定跳转
      if (this.data.more) {
        this.triggerEvent('tapmore');
      }
    }
  }
});
