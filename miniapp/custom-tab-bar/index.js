const { getShoppingList } = require('../utils/api');

Component({
  data: {
    selected: 0,
    badge: 0,
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
      this._syncBadge();
    }
  },
  lifetimes: {
    attached() {
      this._syncSelected();
      this._syncBadge();
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
    _syncBadge() {
      // 待买角标：未采购的购物清单项数量，失败静默
      getShoppingList()
        .then((list) => {
          const items = list && Array.isArray(list.items) ? list.items : [];
          const badge = items.filter((item) => !item.purchased).length;
          if (badge !== this.data.badge) this.setData({ badge });
        })
        .catch(() => {});
    },
    switchTab(e) {
      const index = e.currentTarget.dataset.index;
      const item = this.data.list[index];
      wx.switchTab({ url: item.pagePath });
    }
  }
});