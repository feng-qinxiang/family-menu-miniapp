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
      const index = e.currentTarget.dataset.index;
      const item = this.data.list[index];
      wx.switchTab({ url: item.pagePath });
    }
  }
});
