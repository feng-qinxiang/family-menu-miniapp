const { visibleTabs } = require('../utils/tabs');

Component({
  data: {
    selected: 0,
    // tab 定义统一在 utils/tabs.js（app.json 的 tabBar.list 由静态自检保证与之一致）。
    // 社区 tab 随 COMMUNITY 开关显隐：关闭时只是不渲染，app.json 仍声明。
    list: visibleTabs()
  },
  // ponytail: pageLifetimes.show 自动检测当前路由，页面无需手动 setData selected
  pageLifetimes: {
    show() {
      this._syncSelected();
    }
  },
  lifetimes: {
    attached() {
      this._syncSelected();
    }
  },
  methods: {
    _syncSelected() {
      const pages = getCurrentPages();
      if (!pages.length) return;
      const route = '/' + pages[pages.length - 1].route;
      const idx = this.data.list.findIndex(item => item.pagePath === route);
      if (idx >= 0 && idx !== this.data.selected) {
        this.setData({ selected: idx });
      }
    },
    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.list[index];
      if (!item) return;
      // 点当前 tab：不做重复跳转（重复 switchTab 会重建页面栈，用户看到闪一下）
      if (index === this.data.selected) return;
      // 防抖：切换动画期间连点会发出多次 switchTab
      if (this.__switching) return;
      this.__switching = true;
      const previous = this.data.selected;
      // 即时反馈：先置选中态，不等 pageLifetimes.show（否则点击到高亮之间有肉眼可见延迟）
      this.setData({ selected: index });
      wx.switchTab({
        url: item.pagePath,
        fail: () => {
          // 跳转失败要回退选中态，避免"高亮在新 tab 但页面没变"
          this.setData({ selected: previous });
        },
        complete: () => { this.__switching = false; }
      });
    }
  }
});
