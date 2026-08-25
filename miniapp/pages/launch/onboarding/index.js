// pages/launch/onboarding/index.js
// 启动引导：全屏 swiper hero + 进度点。游客直进，末屏去登录，跳过去首页。
Page({
  data: {
    current: 0,
    slides: [
      {
        num: '01',
        image: '/assets/dishes/mapo-tofu.jpg',
        tag: '欢迎加入',
        line1: '全家一起',
        line2a: '点', pop: '菜', line2b: '',
        slogan: '今天吃什么，不用再纠结。一家人各自挑，菜单自动凑齐，买菜清单一键生成。'
      },
      {
        num: '02',
        image: '/assets/dishes/hongshao-pork.jpg',
        tag: '一起点菜',
        line1: '各点各的',
        line2a: '一', pop: '锅', line2b: '端',
        slogan: '爸妈想吃硬菜，孩子要喝汤，每个人挑自己的，今日菜单帮你凑得明明白白。'
      },
      {
        num: '03',
        image: '/assets/dishes/tomato-egg.jpg',
        tag: '聪明买菜',
        line1: '买菜清单',
        line2a: '一键', pop: '齐', line2b: '',
        slogan: '选好的菜自动拆成食材，按品类归好，去超市照着买，不漏不重复。'
      }
    ]
  },

  onLoad() {
    // 游客直进，无强制登录拦截
  },

  onSwiperChange(e) {
    const idx = e && e.detail ? e.detail.current : 0;
    this.setData({ current: idx });
  },

  onNext() {
    const { current, slides } = this.data;
    if (current < slides.length - 1) {
      this.setData({ current: current + 1 });
    } else {
      // 末屏 → 登录页（二级页）
      this.goAuth();
    }
  },

  // 跳过 → 首页（tabbar）
  onSkip() {
    this.goHome();
  },

  // 先随便逛逛 → 首页（tabbar，游客模式）
  onGuest() {
    this.goHome();
  },

  goAuth() {
    wx.navigateTo({
      url: '/pages/auth/login/index',
      fail: () => {
        wx.showToast({ title: '登录页暂不可达', icon: 'none' });
        this.goHome();
      }
    });
  },

  goHome() {
    wx.switchTab({
      url: '/pages/home/index',
      fail: () => {
        wx.reLaunch({
          url: '/pages/home/index',
          fail: () => wx.showToast({ title: '首页暂不可达', icon: 'none' })
        });
      }
    });
  }
});
