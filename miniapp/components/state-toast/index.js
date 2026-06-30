Component({
  options: {
    multipleSlots: true,
    addGlobalClass: true
  },

  /**
   * properties
   * - visible:  是否显示
   * - type:     变体 'top' | 'center' | 'error' | 'bottom'
   * - text:     主文案
   * - subText:  副文案（top / bottom 变体可用）
   * - actionText: 操作按钮文案（error=重试 / bottom=撤销）
   * - duration: 自动隐藏毫秒数，<=0 表示不自动隐藏
   */
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer: function (val) {
        this._handleVisible(val);
      }
    },
    type: {
      type: String,
      value: 'top'
    },
    text: {
      type: String,
      value: ''
    },
    subText: {
      type: String,
      value: ''
    },
    actionText: {
      type: String,
      value: ''
    },
    duration: {
      type: Number,
      value: 2400
    }
  },

  data: {
    show: false
  },

  lifetimes: {
    attached: function () {
      if (this.properties.visible) {
        this._handleVisible(true);
      }
    },
    detached: function () {
      this._clearTimer();
    }
  },

  methods: {
    _clearTimer: function () {
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
    },

    _handleVisible: function (val) {
      this._clearTimer();
      if (val) {
        this.setData({ show: true });
        var dur = Number(this.properties.duration) || 0;
        if (dur > 0) {
          var that = this;
          this._timer = setTimeout(function () {
            that._close('timeout');
          }, dur);
        }
      } else {
        this.setData({ show: false });
      }
    },

    _close: function (reason) {
      this._clearTimer();
      this.setData({ show: false });
      this.triggerEvent('close', { reason: reason || 'auto' });
    },

    // 点击关闭图标（top 变体）
    onClose: function () {
      this._close('close');
    },

    // 点击操作按钮（error=重试 / bottom=撤销）
    onAction: function () {
      this._clearTimer();
      this.triggerEvent('action', { type: this.properties.type });
    },

    // 对外：手动隐藏
    hide: function () {
      this._close('manual');
    }
  }
});
