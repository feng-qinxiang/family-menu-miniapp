// pages/recipes/search/index · 菜谱搜索结果页（二级页）
// sticky 搜索栏 + 排序 chip 横滑 + 2 列网格（关键词 .pop 高亮）
// 数据：getRecipes('all') 本地过滤，禁用臆造 api
const api = require('../../../utils/api');
const { recipeDishImg } = require('../../../utils/image');

// 排序/筛选 chip：综合 / 最快 / 川菜 / 家常 / 做过的
const SORTS = [
  { key: 'all', label: '综合' },
  { key: 'fast', label: '最快' },
  { key: 'sichuan', label: '川菜' },
  { key: 'home', label: '家常' },
  { key: 'cooked', label: '做过的' }
];

Page({
  data: {
    statusBarHeight: 0,
    keyword: '',
    sorts: SORTS,
    activeSort: 'all',
    allRecipes: [],
    list: [],
    total: 0,
    loaded: false,
    capsuleRight: 96
  },

  onLoad(options) {
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
    let capsuleRight = 96;
    try {
      const mb = wx.getMenuButtonBoundingClientRect();
      const sys = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
      if (mb && sys && mb.left) capsuleRight = sys.windowWidth - mb.left + 8;
    } catch (e) {}
    const kw = (options && options.keyword) ? decodeURIComponent(options.keyword) : '';
    this.setData({ statusBarHeight: sbh, keyword: kw, capsuleRight });
    this._fetch(kw);
  },

  // 拉全量菜谱，失败兜底空数组
  _fetch(kw) {
    api.getRecipes('all')
      .then((res) => {
        const all = Array.isArray(res) ? res : (res && res.list) || [];
        this.setData({ allRecipes: all, loaded: true });
        this._apply(kw, this.data.activeSort);
      })
      .catch(() => {
        this.setData({ allRecipes: [], loaded: true, list: [], total: 0 });
      });
  },

  // 关键词过滤 + 排序/筛选 + 高亮分段
  _apply(keyword, sortKey) {
    const kw = String(keyword || '').trim();
    let list = this.data.allRecipes.slice();

    if (kw) {
      const low = kw.toLowerCase();
      list = list.filter((r) => {
        const hay = [r.title, r.cuisine, r.summary]
          .concat(Array.isArray(r.tasteTags) ? r.tasteTags : [])
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.indexOf(low) !== -1;
      });
    }

    // 筛选/排序
    if (sortKey === 'fast') {
      list.sort((a, b) => (a.timeCost || 999) - (b.timeCost || 999));
    } else if (sortKey === 'sichuan') {
      list = list.filter((r) => (r.cuisine || '').indexOf('川') !== -1);
    } else if (sortKey === 'home') {
      list = list.filter((r) => {
        const tags = Array.isArray(r.tasteTags) ? r.tasteTags.join('') : '';
        return (r.cuisine || '').indexOf('家常') !== -1 || tags.indexOf('家常') !== -1;
      });
    } else if (sortKey === 'cooked') {
      list = list.filter((r) => r.cooked || r.cookCount > 0 || r.lastCookedAt);
    }

    const view = list.map((r) => this._buildCard(r, kw));
    this.setData({ list: view, total: view.length });
  },

  // 构建卡片视图：封面兜底 + 标题高亮分段
  _buildCard(recipe, kw) {
    const r = recipe || {};
    const cover = recipeDishImg(r);
    const tags = Array.isArray(r.tasteTags) ? r.tasteTags : [];
    return {
      id: r.id,
      cover: cover,
      label: r.cuisine || tags[0] || '家常',
      cuisine: r.cuisine || tags[0] || '家常',
      timeText: r.timeCost ? r.timeCost + ' 分钟' : '',
      favorited: !!r.favorited,
      titleParts: this._highlight(r.title || '未命名菜谱', kw)
    };
  },

  // 把标题按关键词切成 [{ t, hl }] 分段，命中段 hl=true 上 .pop
  _highlight(title, kw) {
    const t = String(title);
    const k = String(kw || '').trim();
    if (!k) return [{ t: t, hl: false }];
    const parts = [];
    const low = t.toLowerCase();
    const lowK = k.toLowerCase();
    let idx = 0;
    let pos = low.indexOf(lowK, idx);
    if (pos === -1) return [{ t: t, hl: false }];
    while (pos !== -1) {
      if (pos > idx) parts.push({ t: t.slice(idx, pos), hl: false });
      parts.push({ t: t.slice(pos, pos + k.length), hl: true });
      idx = pos + k.length;
      pos = low.indexOf(lowK, idx);
    }
    if (idx < t.length) parts.push({ t: t.slice(idx), hl: false });
    return parts;
  },

  // 输入框实时过滤
  onInput(e) {
    const kw = e.detail.value || '';
    this.setData({ keyword: kw });
    this._apply(kw, this.data.activeSort);
  },

  onClear() {
    this.setData({ keyword: '' });
    this._apply('', this.data.activeSort);
  },

  onCancel() {
    wx.navigateBack({
      delta: 1,
      fail() {
        wx.switchTab({ url: '/pages/home/index', fail() {} });
      }
    });
  },

  onBack() {
    this.onCancel();
  },

  onSortTap(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeSort) return;
    this.setData({ activeSort: key });
    this._apply(this.data.keyword, key);
  },

  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id && id !== 0) return;
    wx.navigateTo({ url: '/pages/recipe-detail/index?id=' + id });
  },

  onFavTap(e) {
    const id = e.currentTarget.dataset.id;
    const list = this.data.list.map((it) => {
      if (it.id === id) it.favorited = !it.favorited;
      return it;
    });
    this.setData({ list });
    wx.showToast({ title: '已更新稍后做', icon: 'none' });
  }
});
