// 偏好画像页 · 我们家的口味（二级页，游客直进）
// 数据源：getPreferenceProfile() + getCookHistory()
const api = require('../../../utils/api');

// 本地菜图兜底库（标题关键词 → 本地图）
const LOCAL_DISH_IMAGES = [
  { keys: ['麻婆', '豆腐'], img: '/assets/dishes/mapo-tofu.jpg' },
  { keys: ['番茄', '西红柿', '炒蛋'], img: '/assets/dishes/tomato-egg.jpg' },
  { keys: ['红烧肉', '红烧'], img: '/assets/dishes/hongshao-pork.jpg' },
  { keys: ['宫保', '鸡丁'], img: '/assets/dishes/kungpao-chicken.jpg' },
  { keys: ['蛋花', '紫菜', '蛋汤'], img: '/assets/dishes/egg-drop-soup.jpg' },
  { keys: ['酸辣'], img: '/assets/dishes/hot-sour-soup.jpg' },
  { keys: ['炒饭'], img: '/assets/dishes/fried-rice.jpg' },
  { keys: ['牛', '西兰花'], img: '/assets/dishes/beef-broccoli.jpg' },
  { keys: ['粥'], img: '/assets/dishes/chicken-congee.jpg' },
  { keys: ['茄子'], img: '/assets/dishes/sichuan-eggplant.jpg' },
  { keys: ['虾'], img: '/assets/dishes/shrimp-peas.jpg' },
  { keys: ['馄饨'], img: '/assets/dishes/wontons.jpg' },
  { keys: ['面'], img: '/assets/dishes/lo-mein.jpg' },
  { keys: ['豆角', '长豆'], img: '/assets/dishes/long-beans.jpg' }
];
const DEFAULT_DISH_IMG = '/assets/dishes/hongshao-pork.jpg';
const HERO_IMG = '/assets/dishes/sichuan-eggplant.jpg';

// 条形图配色（套用全局 token，渐变收尾用柔色）
const BAR_GRADIENTS = [
  'linear-gradient(90deg,#e8472a,#f4794f)',
  'linear-gradient(90deg,#b08949,#e0c389)',
  'linear-gradient(90deg,#2f4a3a,#5a7d66)',
  'linear-gradient(90deg,#7a6e5d,#b3a795)'
];

// 标签云尺寸档位类名
const CLOUD_SIZES = ['xl', 'lg', 'md', 'sm'];

function pickLocalImage(title) {
  const name = String(title || '');
  for (const entry of LOCAL_DISH_IMAGES) {
    if (entry.keys.some((k) => name.indexOf(k) >= 0)) {
      return entry.img;
    }
  }
  return DEFAULT_DISH_IMG;
}

Page({
  data: {
    statusBarHeight: 0,
    loading: true,
    failed: false,
    heroImg: HERO_IMG,
    // Hero 统计
    totalCooks: 0,
    favoriteCuisine: '—',
    favoriteTaste: '—',
    // 菜系分布条形图
    bars: [],
    // 口味标签云
    cloud: [],
    // 最常做 TOP5
    topList: [],
    // 提示卡累计次数
    historyTotal: 0,
    toast: { visible: false, text: '' }
  },

  onLoad() {
    let sbh = 0;
    try {
      if (typeof wx.getWindowInfo === 'function') {
        sbh = wx.getWindowInfo().statusBarHeight || 0;
      } else if (typeof wx.getSystemInfoSync === 'function') {
        sbh = wx.getSystemInfoSync().statusBarHeight || 0;
      }
    } catch (e) {
      sbh = 0;
    }
    this.setData({ statusBarHeight: sbh });
    this.loadData();
  },

  loadData() {
    this.setData({ loading: true, failed: false });
    Promise.all([
      api.getPreferenceProfile().catch(() => null),
      api.getCookHistory().catch(() => [])
    ])
      .then(([profile, history]) => {
        if (!profile) {
          this.setData({ loading: false, failed: true });
          return;
        }
        this.applyData(profile, Array.isArray(history) ? history : []);
        this.setData({ loading: false, failed: false });
      })
      .catch(() => {
        this.setData({ loading: false, failed: true });
      });
  },

  applyData(profile, history) {
    const cuisinePrefs = Array.isArray(profile.cuisinePrefs) ? profile.cuisinePrefs : [];
    const tagPrefs = Array.isArray(profile.tagPrefs) ? profile.tagPrefs : [];

    // —— 菜系分布：count 归一化为百分比，按 count 降序 ——
    const sortedCuisine = cuisinePrefs.slice().sort((a, b) => (b.count || 0) - (a.count || 0));
    const cuisineMax = sortedCuisine.reduce((m, c) => Math.max(m, c.count || 0), 0) || 1;
    const cuisineTotal = sortedCuisine.reduce((s, c) => s + (c.count || 0), 0) || 1;
    const bars = sortedCuisine.map((c, i) => {
      const pct = Math.round(((c.count || 0) / cuisineTotal) * 100);
      const width = Math.max(8, Math.round(((c.count || 0) / cuisineMax) * 100));
      return {
        name: c.name || '其他',
        pct,
        width,
        grad: BAR_GRADIENTS[i % BAR_GRADIENTS.length]
      };
    });

    // —— 标签云：按 count 降序映射 4 档尺寸 ——
    const sortedTags = tagPrefs.slice().sort((a, b) => (b.count || 0) - (a.count || 0));
    const cloud = sortedTags.map((t, i) => ({
      name: t.name || '口味',
      count: t.count || 0,
      size: CLOUD_SIZES[Math.min(i, CLOUD_SIZES.length - 1)]
    }));

    // —— 最常做 TOP5：聚合做菜记录 ——
    const counter = {};
    history.forEach((h) => {
      const title = h.recipeTitle || '家常菜';
      if (!counter[title]) {
        counter[title] = {
          title,
          count: 0,
          recipeId: h.recipeId,
          cuisine: h.cuisine || '',
          tasteTags: h.tasteTags || ''
        };
      }
      counter[title].count += 1;
      if (!counter[title].recipeId && h.recipeId) counter[title].recipeId = h.recipeId;
    });
    const topList = Object.keys(counter)
      .map((k) => counter[k])
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((item, idx) => {
        const sub = [item.cuisine, item.tasteTags].filter(Boolean).join(' · ') || '家常下饭';
        return {
          rank: idx + 1,
          recipeId: item.recipeId,
          title: item.title,
          sub,
          count: item.count,
          img: pickLocalImage(item.title)
        };
      });

    this.setData({
      totalCooks: profile.totalCooks || 0,
      favoriteCuisine: profile.favoriteCuisine || (bars[0] && bars[0].name) || '—',
      favoriteTaste: (cloud[0] && cloud[0].name) || '—',
      bars,
      cloud,
      topList,
      historyTotal: history.length
    });
  },

  onRetry() {
    this.loadData();
  },

  onTapDish(e) {
    const id = e.currentTarget.dataset.id;
    const title = e.currentTarget.dataset.title || '';
    if (id || id === 0) {
      wx.navigateTo({ url: `/pages/recipe-detail/index?id=${id}` });
      return;
    }
    wx.navigateTo({
      url: `/pages/recipes/search/index?keyword=${encodeURIComponent(title)}`,
      fail: () => this.showToast(`${title} · 可在菜谱搜索中查看`)
    });
  },

  showToast(text) {
    this.setData({ toast: { visible: true, text } });
  },

  onToastHide() {
    this.setData({ 'toast.visible': false });
  }
});
