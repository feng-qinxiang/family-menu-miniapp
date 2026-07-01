Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/home/index',
        text: '首页',
        icon: '/assets/icons/tab-home.svg',
        activeIcon: '/assets/icons/tab-home-active.svg'
      },
      {
        pagePath: '/pages/menu/index',
        text: '菜单',
        icon: '/assets/icons/tab-cart.svg',
        activeIcon: '/assets/icons/tab-cart-active.svg'
      },
      {
        pagePath: '/pages/recipes/index',
        text: '菜谱',
        icon: '/assets/icons/tab-recipe.svg',
        activeIcon: '/assets/icons/tab-recipe-active.svg'
      },
      {
        pagePath: '/pages/me/index',
        text: '我的',
        icon: '/assets/icons/tab-profile.svg',
        activeIcon: '/assets/icons/tab-profile-active.svg'
      }
    ]
  },
  methods: {
    switchTab(e) {
      const index = e.currentTarget.dataset.index;
      const item = this.data.list[index];
      wx.switchTab({ url: item.pagePath });
    }
  }
});