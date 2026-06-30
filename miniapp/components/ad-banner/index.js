const adPool = [
  { title: '排今晚的菜', desc: '把晚餐加入今日菜单，购物清单会跟着算。' },
  { title: '录冰箱里的菜', desc: '挑菜时能看到哪些菜食材已经齐了。' },
  { title: '家人一起看', desc: '同步后，菜单和购物清单大家都能改。' },
  { title: '保存常做菜', desc: '下次排菜不用重新找。' }
];

Component({
  properties: {},
  data: {
    isVip: false,
    adTitle: '',
    adDesc: ''
  },
  lifetimes: {
    attached() {
      const app = getApp();
      const isVip = (app && app.globalData && app.globalData.isVip)
        || wx.getStorageSync('vip_status') === true;
      const ad = adPool[Math.floor(Math.random() * adPool.length)];
      this.setData({ isVip, adTitle: ad.title, adDesc: ad.desc });
    }
  },
  methods: {
    goVip() {
      wx.navigateTo({ url: '/pages/vip/index' });
    }
  }
});
