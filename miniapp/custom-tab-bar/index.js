const features = require('../utils/features');

Component({
  data: {
    selected: 0,
    // 社区 tab 随 COMMUNITY 开关显隐（app.json tabBar list 仍声明，关闭时仅不渲染）
    list: [
      {
        pagePath: '/pages/home/index',
        text: '今日',
        icon: '/assets/icons/tab-home.svg',
        activeIcon: '/assets/icons/tab-home-active.svg'
      },
      {
        pagePath: '/pages/recipes/index',
        text: '菜谱',
        icon: '/assets/icons/tab-recipe.svg',
        activeIcon: '/assets/icons/tab-recipe-active.svg'
      },
      ...(features.COMMUNITY ? [{
        pagePath: '/pages/community/index',
        text: '社区',
        icon: '/assets/icons/tab-community.svg',
        activeIcon: '/assets/icons/tab-community-active.svg'
      }] : []),
      {
        pagePath: '/pages/pantry/index',
        text: '冰箱',
        icon: '/assets/icons/tab-fridge.svg',
        activeIcon: '/assets/icons/tab-fridge-active.svg'
      },
      {
        pagePath: '/pages/me/index',
        text: '我的',
        icon: '/assets/icons/tab-profile.svg',
        activeIcon: '/assets/icons/tab-profile-active.svg'
      }
    ]
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